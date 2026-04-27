import {
  defaultControlsForHit,
  getResponseValue,
  mergeHitsByVendor,
  motorKey,
  normalizeHits,
  parseNum,
  toHex,
} from './utils';
import { SET_ID_VENDORS } from './constants';
import { CMD_TIMEOUTS, DAMIAO_REGISTER_SNAPSHOT_FIELDS, DAMIAO_RW_REGISTER_DEFS } from './appConfig';
import { buildProbePayload, buildSetIdPayload } from './vendors';
import { REBOT_ARM_JOINT_LIMITS } from './robotArm';

const lastMitSentAtByMotor = new Map();
const DAMIAO_REFRESH_REGISTERS = Object.freeze(
  DAMIAO_RW_REGISTER_DEFS.filter((def) => def.common).map((def) => ({
    rid: def.rid,
    key: DAMIAO_REGISTER_SNAPSHOT_FIELDS[def.rid],
    dataType: def.dataType,
  })),
);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function modelForHit(h, vendors) {
  return h?.model || vendors?.[h?.vendor]?.model || h?.vendor;
}

export function mapResponseToHit(h, data, extra = {}) {
  const d = data || {};
  const flags = d.flags && typeof d.flags === 'object' ? d.flags : undefined;
  return {
    ...h,
    status: Number(d.status_code ?? h.status ?? Number.NaN),
    status_name: String(d.status_name ?? h.status_name ?? ''),
    pos: Number(d.pos ?? h.pos ?? Number.NaN),
    vel: Number(d.vel ?? h.vel ?? Number.NaN),
    torq: Number(d.torq ?? h.torq ?? Number.NaN),
    t_mos: Number(d.t_mos ?? h.t_mos ?? Number.NaN),
    t_rotor: Number(d.t_rotor ?? h.t_rotor ?? Number.NaN),
    has_value: Boolean(d.has_value ?? h.has_value),
    arbitration_id: Number(d.arbitration_id ?? h.arbitration_id ?? Number.NaN),
    can_id: Number(d.can_id ?? h.can_id ?? Number.NaN),
    device_id: Number(d.device_id ?? h.device_id ?? Number.NaN),
    motor_id: Number(d.motor_id ?? h.motor_id ?? Number.NaN),
    flags: flags ?? h.flags,
    ...extra,
    online: true,
    last_check_ms: Date.now(),
    updated_at_ms: Date.now(),
  };
}

function clampMitForSafety(h, mode, target, kp, kd, tau) {
  if (String(mode) !== 'mit') {
    return { target, kp, kd, tau, notes: [] };
  }

  const notes = [];
  let safeTarget = target;
  let safeKp = Math.max(0, kp);
  let safeKd = Math.max(0, kd);
  let safeTau = tau;

  const joint = Number(h?.joint);
  const lim = REBOT_ARM_JOINT_LIMITS[joint];
  if (lim && Number.isFinite(lim.min) && Number.isFinite(lim.max)) {
    const clipped = clamp(safeTarget, lim.min, lim.max);
    if (Math.abs(clipped - safeTarget) > 1e-9) {
      notes.push(`target clipped by joint limit ${lim.min.toFixed(3)}..${lim.max.toFixed(3)}`);
      safeTarget = clipped;
    }
  }

  if (String(h?.vendor) === 'damiao' && joint === 7) {
    const prev = { kp: safeKp, kd: safeKd, tau: safeTau };
    safeKp = clamp(safeKp, 0, 8);
    safeKd = clamp(safeKd, 0, 0.25);
    safeTau = clamp(safeTau, -0.8, 0.8);
    if (
      Math.abs(prev.kp - safeKp) > 1e-9 ||
      Math.abs(prev.kd - safeKd) > 1e-9 ||
      Math.abs(prev.tau - safeTau) > 1e-9
    ) {
      notes.push('joint7 MIT safety clamp applied (kp<=8, kd<=0.25, |tau|<=0.8)');
    }
  }

  if (String(h?.vendor) === 'damiao' && Number.isFinite(Number(h?.pos))) {
    const currentPos = Number(h.pos);
    const maxStep = joint === 7 ? 0.12 : 0.2;
    const prevTarget = safeTarget;
    safeTarget = clamp(safeTarget, currentPos - maxStep, currentPos + maxStep);
    if (Math.abs(prevTarget - safeTarget) > 1e-9) {
      notes.push(
        `MIT step clamp applied around current pos=${currentPos.toFixed(3)} with max_step=${maxStep.toFixed(3)}`,
      );
    }
  }

  return {
    target: safeTarget,
    kp: safeKp,
    kd: safeKd,
    tau: safeTau,
    notes,
  };
}

export async function verifyHitOp({ h, vendors, setTargetFor, sendCmd, setHits, closeBusQuietly, pushLog }) {
  try {
    await setTargetFor(h.vendor, modelForHit(h, vendors), h.esc_id, h.mst_id);
    const ret = await sendCmd(
      'verify',
      {
        vendor: h.vendor,
        motor_id: h.esc_id,
        feedback_id: h.mst_id,
        timeout_ms: 1200,
      },
      CMD_TIMEOUTS.verifyMs,
    );

    if (!ret.ok) {
      pushLog(`verify ${h.vendor} ${toHex(h.esc_id)} failed: ${ret.error || 'unknown'}`, 'err');
    } else {
      pushLog(`verify ${h.vendor} ${toHex(h.esc_id)} ok`, 'ok');
      setHits((prev) =>
        mergeHitsByVendor(prev, [
          {
            ...h,
            updated_at_ms: Date.now(),
            verify_ok: true,
            verified_esc_id: Number(ret?.data?.esc_id ?? Number.NaN),
            verified_mst_id: Number(ret?.data?.mst_id ?? Number.NaN),
          },
        ]),
      );
    }
    await closeBusQuietly();
  } catch (e) {
    pushLog(`verify error: ${e.message || e}`, 'err');
  }
}

export async function setIdForOp({ h, controls, vendors, setTargetFor, sendCmd, closeBusQuietly, pushLog }) {
  const c = controls[motorKey(h)] || defaultControlsForHit(h);
  const newEsc = parseNum(c.newEsc, h.esc_id);
  const newMst = parseNum(c.newMst, h.mst_id);

  if (!SET_ID_VENDORS.has(h.vendor)) {
    pushLog(`set-id skipped: ${h.vendor} not supported`, 'err');
    return;
  }

  try {
    await setTargetFor(h.vendor, modelForHit(h, vendors), h.esc_id, h.mst_id);
    const payload = buildSetIdPayload(h.vendor, h, newEsc, newMst);
    const ret = await sendCmd('set_id', payload, CMD_TIMEOUTS.setIdMs);
    if (!ret.ok) {
      pushLog(`set-id ${h.vendor} failed: ${ret.error || 'unknown'}`, 'err');
    } else {
      pushLog(`set-id ${h.vendor} ok: ${toHex(newEsc)} / ${toHex(newMst)}`, 'ok');
    }
    await closeBusQuietly();
  } catch (e) {
    pushLog(`set-id error: ${e.message || e}`, 'err');
  }
}

export async function controlMotorOp({
  h,
  action,
  controls,
  controlOverride,
  vendors,
  setTargetFor,
  sendCmd,
  setHits,
  setControls,
  closeBusQuietly,
  pushLog,
}) {
  const c = { ...(controls[motorKey(h)] || defaultControlsForHit(h)), ...(controlOverride || {}) };
  let target = parseNum(c.target, 0);
  const vlim = parseNum(c.vlim, 1);
  let kp = parseNum(c.kp, 30);
  let kd = parseNum(c.kd, 1);
  let tau = parseNum(c.tau, 0);
  const ratio = parseNum(c.ratio, 0.1);

  try {
    await setTargetFor(h.vendor, modelForHit(h, vendors), h.esc_id, h.mst_id);

    if (action === 'enable' || action === 'disable' || action === 'stop' || action === 'clear_error') {
      const ret = await sendCmd(action, { vendor: h.vendor }, CMD_TIMEOUTS.controlMs);
      if (!ret.ok) throw new Error(ret.error || `${action} failed`);
      pushLog(`${action} ${h.vendor} ${toHex(h.esc_id)} ok`, 'ok');
      if (action === 'enable' || action === 'disable') {
        const enabled = action === 'enable';
        setControls((prev) => ({ ...prev, [motorKey(h)]: { ...(prev[motorKey(h)] || c), enabled } }));
      }
      if (action === 'clear_error') {
        pushLog(`hint: re-enable ${h.vendor} ${toHex(h.esc_id)} after clear_error`, 'info');
      }
      await closeBusQuietly();
      return true;
    }

    if (c.mode === 'mit') {
      const safe = clampMitForSafety(h, c.mode, target, kp, kd, tau);
      target = safe.target;
      kp = safe.kp;
      kd = safe.kd;
      tau = safe.tau;
      safe.notes.forEach((line) => pushLog(`${h.vendor} ${toHex(h.esc_id)} ${line}`, 'info'));

      if (String(h.vendor) === 'damiao') {
        const mk = motorKey(h);
        const now = Date.now();
        const last = Number(lastMitSentAtByMotor.get(mk) || 0);
        const minGapMs = 120;
        if (now - last < minGapMs) {
          await sleepMs(minGapMs - (now - last));
        }
        lastMitSentAtByMotor.set(mk, Date.now());
      }
    }

    let op = 'pos_vel';
    let payload = { vendor: h.vendor, continuous: false, pos: target, vlim, ensure_timeout_ms: 2000 };

    if (c.mode === 'mit') {
      op = 'mit';
      payload = { vendor: h.vendor, continuous: false, pos: target, vel: 0, kp, kd, tau, ensure_timeout_ms: 2000 };
    } else if (c.mode === 'vel') {
      op = 'vel';
      payload = { vendor: h.vendor, continuous: false, vel: target, ensure_timeout_ms: 2000 };
    } else if (c.mode === 'force_pos') {
      op = 'force_pos';
      payload = { vendor: h.vendor, continuous: false, pos: target, vlim, ratio, ensure_timeout_ms: 2000 };
    }

    const ret = await sendCmd(op, payload, CMD_TIMEOUTS.verifyMs);
    if (!ret.ok) throw new Error(ret.error || `${op} failed`);

    if (c.mode === 'mit') {
      pushLog(
        `move ${h.vendor} ${toHex(h.esc_id)} mode=mit target=${target.toFixed(3)} kp=${kp.toFixed(3)} kd=${kd.toFixed(3)} tau=${tau.toFixed(3)} ok`,
        'ok',
      );
    } else {
      pushLog(`move ${h.vendor} ${toHex(h.esc_id)} mode=${c.mode} target=${target.toFixed(3)} ok`, 'ok');
    }
    setHits((prev) => mergeHitsByVendor(prev, [{ ...h, updated_at_ms: Date.now() }]));
    await closeBusQuietly();
    return true;
  } catch (e) {
    pushLog(`control ${action} error: ${e.message || e}`, 'err');
    return false;
  }
}

export async function zeroMotorOp({
  h,
  controls,
  vendors,
  setTargetFor,
  sendCmd,
  setHits,
  closeBusQuietly,
  pushLog,
}) {
  const c = controls[motorKey(h)] || defaultControlsForHit(h);
  if (!c.enabled) {
    pushLog(`zero blocked ${h.vendor} ${toHex(h.esc_id)}: enable first`, 'err');
    return false;
  }

  try {
    await setTargetFor(h.vendor, modelForHit(h, vendors), h.esc_id, h.mst_id);

    const zeroRet = await sendCmd('set_zero_position', { vendor: h.vendor }, CMD_TIMEOUTS.controlMs);
    if (!zeroRet.ok) throw new Error(zeroRet.error || 'set_zero_position failed');

    const storeRet = await sendCmd('store_parameters', { vendor: h.vendor }, CMD_TIMEOUTS.controlMs);
    if (!storeRet.ok) {
      pushLog(
        `zero ${h.vendor} ${toHex(h.esc_id)} ok, but store failed: ${storeRet.error || 'unknown'}`,
        'err',
      );
    } else {
      pushLog(`zero+store ${h.vendor} ${toHex(h.esc_id)} ok`, 'ok');
    }

    setHits((prev) => mergeHitsByVendor(prev, [{ ...h, updated_at_ms: Date.now() }]));
    await closeBusQuietly();
    return true;
  } catch (e) {
    pushLog(`zero error: ${e.message || e}`, 'err');
    return false;
  }
}

export async function refreshMotorStateOp({ h, vendors, setTargetFor, sendCmd, setHits, pushLog }) {
  try {
    await setTargetFor(h.vendor, modelForHit(h, vendors), h.esc_id, h.mst_id);
    const ret = await sendCmd('state_once', {}, CMD_TIMEOUTS.stateMs);
    if (!ret.ok) throw new Error(ret.error || 'state_once failed');

    const damiaoParamPatch = {};

    if (String(h.vendor) === 'damiao') {
      for (const def of DAMIAO_REFRESH_REGISTERS) {
        try {
          const op = def.dataType === 'u32' ? 'get_register_u32' : 'get_register_f32';
          const regRet = await sendCmd(op, { rid: def.rid, timeout_ms: 1000 }, CMD_TIMEOUTS.registerMs);
          if (!regRet?.ok) continue;
          const rawValue = getResponseValue(regRet);
          const value = Number(rawValue ?? Number.NaN);
          damiaoParamPatch[def.key] = Number.isFinite(value) ? value : rawValue;
        } catch {
          // Keep refresh resilient: runtime state should still update even if one register read fails.
        }
      }
    }

    const nextHit = mapResponseToHit(h, ret.data, damiaoParamPatch);
    setHits((prev) => mergeHitsByVendor(prev, [nextHit]));

    pushLog(`state refreshed ${h.vendor} ${toHex(h.esc_id)}${String(h.vendor) === 'damiao' ? ' + params' : ''}`, 'ok');
    return nextHit;
  } catch (e) {
    const nextHit = {
      ...h,
      pos: Number.NaN,
      online: false,
      last_check_ms: Date.now(),
      updated_at_ms: Date.now(),
    };
    setHits((prev) => mergeHitsByVendor(prev, [nextHit]));
    pushLog(`state refresh failed: ${e.message || e}`, 'err');
    return nextHit;
  }
}

export async function checkOnlineOnceOp({
  h,
  vendors,
  setTargetFor,
  sendCmd,
  setHits,
  pushLog,
  silent = true,
}) {
  try {
    await setTargetFor(h.vendor, modelForHit(h, vendors), h.esc_id, h.mst_id);
    const ret = await sendCmd('state_once', {}, 1200);
    if (!ret.ok) throw new Error(ret.error || 'state_once failed');

    setHits((prev) =>
      mergeHitsByVendor(prev, [
        mapResponseToHit(h, ret.data),
      ]),
    );

    if (!silent) pushLog(`online check ${h.vendor} ${toHex(h.esc_id)} online`, 'ok');
    return true;
  } catch {
    setHits((prev) =>
      mergeHitsByVendor(prev, [
        {
          ...h,
          online: false,
          last_check_ms: Date.now(),
          updated_at_ms: Date.now(),
        },
      ]),
    );
    if (!silent) pushLog(`online check ${h.vendor} ${toHex(h.esc_id)} offline`, 'err');
    return false;
  }
}

export async function probeMotorOp({
  h,
  vendors,
  setTargetFor,
  sendCmd,
  setHits,
  closeBusQuietly,
  pushLog,
  options = {},
}) {
  try {
    const model = modelForHit(h, vendors);
    await setTargetFor(h.vendor, model, h.esc_id, h.mst_id);

    const payload = buildProbePayload(h.vendor, h.esc_id, h.mst_id);
    const fastProbe = Boolean(options?.fastProbe);
    const isRobstride = String(h?.vendor) === 'robstride';
    const requestTimeoutMs = fastProbe && isRobstride ? 1000 : CMD_TIMEOUTS.verifyMs;
    if (fastProbe && isRobstride) {
      payload.timeout_ms = Math.max(60, Math.min(Number(payload.timeout_ms) || 120, 120));
    }
    const ret = await sendCmd('scan', payload, requestTimeoutMs);
    if (!ret.ok) throw new Error(ret.error || 'probe scan failed');

    const list = normalizeHits(h.vendor, ret.data, model);
    const found = list.find((x) => Number(x.esc_id) === Number(h.esc_id));
    const online = Boolean(found);

    setHits((prev) =>
      mergeHitsByVendor(prev, [
        {
          ...h,
          ...(found || {}),
          model,
          online,
          last_check_ms: Date.now(),
          updated_at_ms: Date.now(),
        },
      ]),
    );

    pushLog(
      `probe ${h.vendor} ${toHex(h.esc_id)} ${online ? 'online' : 'offline'}`,
      online ? 'ok' : 'err',
    );
    if (options?.closeBusAfter !== false) {
      await closeBusQuietly();
    }
    return online;
  } catch (e) {
    setHits((prev) =>
      mergeHitsByVendor(prev, [
        {
          ...h,
          online: false,
          last_check_ms: Date.now(),
        },
      ]),
    );
    pushLog(`probe failed: ${e.message || e}`, 'err');
    if (options?.closeBusAfter !== false) {
      await closeBusQuietly();
    }
    return false;
  }
}
