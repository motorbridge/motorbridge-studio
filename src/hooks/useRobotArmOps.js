import { useState } from 'react';
import { bulkOp, sleep } from '../lib/async';
import { DAMIAO_ARM_PARAM_DEFS, ROBSTRIDE_ARM_PARAM_DEFS } from '../lib/appConfig';
import { modelForHit } from '../lib/motorStudioOps';
import {
  toRobstrideCliType,
  canRobstrideRead,
  canRobstrideWrite,
  robstrideParamPriority,
  parseRobstrideParamsTsv,
  ROBSTRIDE_PARAM_CATALOG,
} from '../lib/robstrideParamCatalog';
import { damiaoParamPriority, parseDamiaoParamsTsv } from '../lib/damiaoParamCatalog';
import { armVendorForProfile } from '../lib/robotArm';
import { defaultControlsForHit, getResponseValue, motorKey } from '../lib/utils';
import { useRobotArmStudio } from './useRobotArmStudio';

// Matches errors that indicate the motor is no longer reachable on the bus
// (gateway command timeout, no CAN ack, or the ws link itself dropped). Used
// by importArmParams to abort early and name the offending motor.
const isOfflineTimeout = (err) => {
  const msg = String(err?.message || err || '');
  return /timeout|timed[-\s]?out|no (?:response|ack|reply)|ws not connected/i.test(msg);
};

// Tagged error thrown from inside the import loop to break out across the
// nested try/catch blocks. Carries the identity of the motor that dropped.
class ImportAbort extends Error {
  constructor(payload) {
    super(payload?.message || 'import aborted');
    this.name = 'ImportAbort';
    this.aborted = payload;
  }
}

export function useRobotArmOps({
  connected,
  vendors,
  hits,
  setHits,
  controls,
  setControls,
  activeMotorKey,
  setActiveMotorKey,
  pushLog,
  controlMotor,
  zeroMotor,
  probeMotor,
  setTargetFor,
  sendCmd,
  closeBusQuietly,
}) {
  const [armBulkBusy, setArmBulkBusy] = useState(false);
  const [armParamOpBusy, setArmParamOpBusy] = useState(false);
  const [armSelfCheckBusy, setArmSelfCheckBusy] = useState(false);
  const [armSelfCheckProgress, setArmSelfCheckProgress] = useState({
    active: false,
    done: 0,
    total: 4,
    label: '',
    percent: 0,
  });
  const [armSelfCheckReport, setArmSelfCheckReport] = useState(null);

  const {
    robotArmModel,
    armScanBusy,
    armScanProgress,
    setRobotArmModel,
    robotArmJointRows,
    ensureRobotArmCards,
    scanRobotArmJoint,
    scanRobotArmAll,
    detectRobotArmModel,
  } = useRobotArmStudio({
    hits,
    setHits,
    controls,
    setControls,
    activeMotorKey,
    setActiveMotorKey,
    probeMotor,
    pushLog,
  });

  const runRobotArmBulk = async (name, fn) => {
    if (armBulkBusy) {
      pushLog(`robot-arm ${name} blocked: bulk operation in progress`, 'info');
      return false;
    }
    setArmBulkBusy(true);
    try {
      return await fn();
    } finally {
      setArmBulkBusy(false);
    }
  };

  const activeParamVendor = armVendorForProfile(robotArmModel);
  const readDefs =
    activeParamVendor === 'robstride' ? ROBSTRIDE_ARM_PARAM_DEFS : DAMIAO_ARM_PARAM_DEFS;
  const writeDefs = readDefs.filter((x) => x.writable !== false);

  const readDamiaoControlParams = async (h, timeoutMs = 1000, { closeBusAfter = true } = {}) => {
    if (!h || String(h.vendor) !== 'damiao') {
      throw new Error('read control params is damiao-only');
    }

    await setTargetFor(h.vendor, modelForHit(h, vendors), h.esc_id, h.mst_id, {
      enableStreams: false,
    });
    try {
      const values = {};
      for (const def of readDefs) {
        const op = def.dataType === 'u32' ? 'get_register_u32' : 'get_register_f32';
        const ret = await sendCmd(op, { rid: def.rid, timeout_ms: timeoutMs }, 3000);
        if (!ret?.ok) throw new Error(`${def.variable}: ${ret?.error || 'read register failed'}`);
        values[def.key] = Number(getResponseValue(ret) ?? Number.NaN);
      }
      return values;
    } finally {
      if (closeBusAfter) await closeBusQuietly();
    }
  };

  const damiaoModeName = (modeValue) => {
    switch (Math.round(Number(modeValue) || 0)) {
      case 1:
        return 'mit';
      case 2:
        return 'pos_vel';
      case 3:
        return 'vel';
      case 4:
        return 'force_pos';
      default:
        return null;
    }
  };

  const writeDamiaoControlParams = async (
    h,
    values,
    { store = true, closeBusAfter = true } = {}
  ) => {
    if (!h || String(h.vendor) !== 'damiao') {
      throw new Error('write control params is damiao-only');
    }
    await setTargetFor(h.vendor, modelForHit(h, vendors), h.esc_id, h.mst_id, {
      enableStreams: false,
    });
    try {
      const modeValue = Object.prototype.hasOwnProperty.call(values, 'ctrlMode')
        ? Math.round(Number(values.ctrlMode) || 0)
        : null;
      const modeName = modeValue == null ? null : damiaoModeName(modeValue);

      for (const def of writeDefs) {
        if (def.key === 'ctrlMode' || !(def.key in values)) continue;
        const op = def.dataType === 'u32' ? 'write_register_u32' : 'write_register_f32';
        const value =
          def.dataType === 'u32'
            ? Math.round(Number(values[def.key]) || 0)
            : Number(values[def.key]) || 0;
        const ret = await sendCmd(op, { rid: def.rid, verify: true, value }, 3000);
        if (!ret?.ok) throw new Error(ret?.error || `${op} failed`);
      }

      if (modeName) {
        pushLog(`ensuring Damiao ctrlMode ${modeName}...`, 'info');
        const ret = await sendCmd('ensure_mode', { mode: modeName, timeout_ms: 2000 }, 3000);
        if (!ret?.ok) throw new Error(ret?.error || 'ensure_mode failed');
      } else if (modeValue != null) {
        throw new Error(`unsupported Damiao ctrlMode: ${modeValue}`);
      }

      if (store) {
        pushLog('storing parameters...', 'info');
        const stored = await sendCmd(
          'store_parameters',
          { vendor: h.vendor, motor_id: h.esc_id, feedback_id: h.mst_id },
          4000
        );
        if (!stored?.ok) throw new Error(stored?.error || 'store_parameters failed');
      }
    } finally {
      if (closeBusAfter) await closeBusQuietly();
    }
  };

  const readRobstrideControlParams = async (h, timeoutMs = 1000, { closeBusAfter = true } = {}) => {
    if (!h || String(h.vendor) !== 'robstride') {
      throw new Error('read control params is robstride-only');
    }

    await setTargetFor(h.vendor, modelForHit(h, vendors), h.esc_id, h.mst_id, {
      enableStreams: false,
    });
    try {
      const values = {};
      for (const def of ROBSTRIDE_ARM_PARAM_DEFS) {
        const type = toRobstrideCliType(def.dataType);
        const ret = await sendCmd(
          'robstride_read_param',
          { param_id: def.paramId, type, timeout_ms: timeoutMs },
          3000
        );
        if (!ret?.ok) throw new Error(`${def.variable}: ${ret?.error || 'read param failed'}`);
        values[def.key] = Number(getResponseValue(ret) ?? Number.NaN);
      }
      return values;
    } finally {
      if (closeBusAfter) await closeBusQuietly();
    }
  };

  const writeRobstrideControlParams = async (
    h,
    values,
    { store = true, closeBusAfter = true } = {}
  ) => {
    if (!h || String(h.vendor) !== 'robstride') {
      throw new Error('write control params is robstride-only');
    }
    await setTargetFor(h.vendor, modelForHit(h, vendors), h.esc_id, h.mst_id, {
      enableStreams: false,
    });
    try {
      let written = 0;
      for (const def of ROBSTRIDE_ARM_PARAM_DEFS.filter((x) => x.writable !== false)) {
        if (!(def.key in values)) continue;
        const type = toRobstrideCliType(def.dataType);
        const value = Number(values[def.key]) || 0;
        // Read the current value first and skip the write when it already
        // matches. This mirrors the import diff-write path: fewer write frames
        // means fewer CAN ack losses and fewer spurious post-write mismatches
        // (the "had to write twice" symptom). A read failure falls through to
        // write so the operator's intent still applies.
        let cur;
        try {
          const rret = await sendCmd(
            'robstride_read_param',
            { param_id: def.paramId, type, timeout_ms: 1000 },
            3000
          );
          if (rret?.ok) cur = Number(getResponseValue(rret));
        } catch {
          /* read failed — fall through and write */
        }
        const same = Number.isFinite(cur)
          ? def.dataType === 'Float32'
            ? Math.abs(cur - value) < 1e-4
            : cur === value
          : false;
        if (same) continue;
        const ret = await sendCmd(
          'robstride_write_param',
          { param_id: def.paramId, type, value, timeout_ms: 1000 },
          3000
        );
        if (!ret?.ok) throw new Error(ret?.error || `${def.variable} write failed`);
        written += 1;
      }

      // Persist to Flash only when something actually changed, matching the
      // import path; storing an unchanged joint is unnecessary Flash wear.
      if (store && written > 0) {
        const stored = await sendCmd(
          'store_parameters',
          { vendor: h.vendor, motor_id: h.esc_id, feedback_id: h.mst_id },
          4000
        );
        if (!stored?.ok) throw new Error(stored?.error || 'store_parameters failed');
      }
    } finally {
      if (closeBusAfter) await closeBusQuietly();
    }
  };

  const readRobotArmControlParams = async ({ onProgress } = {}) => {
    const vendor = activeParamVendor;
    const rows = robotArmJointRows.filter((x) => String(x.hit?.vendor) === vendor);
    if (rows.length === 0) {
      pushLog(`robot-arm read params skipped: no ${vendor} joints`, 'err');
      return {};
    }
    onProgress?.({
      active: true,
      done: 0,
      total: rows.length,
      label: 'reading params...',
      percent: 0,
    });
    const result = {};
    try {
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        try {
          const values =
            vendor === 'robstride'
              ? await readRobstrideControlParams(row.hit, 1000, { closeBusAfter: false })
              : await readDamiaoControlParams(row.hit, 1000, { closeBusAfter: false });
          result[row.key] = { ok: true, values };
          pushLog(`robot-arm read params ok joint=${row.joint}`, 'ok');
        } catch (e) {
          result[row.key] = { ok: false, error: e.message || String(e) };
          pushLog(`robot-arm read params failed joint=${row.joint}: ${e.message || e}`, 'err');
        }
        const done = i + 1;
        onProgress?.({
          active: true,
          done,
          total: rows.length,
          label: `reading params joint ${row.joint} (${done}/${rows.length})`,
          percent: Math.floor((done / rows.length) * 100),
        });
        await sleep(10);
      }
      onProgress?.({
        active: false,
        done: rows.length,
        total: rows.length,
        label: 'read done',
        percent: 100,
      });
      return result;
    } finally {
      await closeBusQuietly();
    }
  };

  const writeRobotArmControlParams = async (rowsWithValues = [], { onProgress } = {}) => {
    const vendor = activeParamVendor;
    const rows = rowsWithValues.filter((x) => x?.hit && String(x.hit.vendor) === vendor);
    if (rows.length === 0) {
      pushLog(`robot-arm write params skipped: no ${vendor} joints`, 'err');
      return {};
    }
    onProgress?.({
      active: true,
      done: 0,
      total: rows.length,
      label: 'writing params...',
      percent: 0,
    });
    const result = {};
    try {
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        try {
          const writeValues = Object.fromEntries(
            writeDefs
              .filter(
                (def) => row?.values && Object.prototype.hasOwnProperty.call(row.values, def.key)
              )
              .map((def) => [def.key, row.values[def.key]])
          );
          if (vendor === 'robstride') {
            await writeRobstrideControlParams(row.hit, writeValues, {
              store: true,
              // Close + reopen the bus per joint (matching the import path)
              // so each joint starts from a clean bus session instead of
              // retargeting on a shared one — shared sessions lost frames
              // for later joints (the "some joints won't write" symptom).
              closeBusAfter: true,
            });
          } else {
            await writeDamiaoControlParams(row.hit, writeValues, {
              store: true,
              closeBusAfter: false,
            });
          }
          pushLog(`robot-arm write params ok joint=${row.joint}`, 'ok');
          result[row.key] = { ok: true };
        } catch (e) {
          pushLog(`robot-arm write params failed joint=${row.joint}: ${e.message || e}`, 'err');
          result[row.key] = { ok: false, error: e.message || String(e) };
        }
        const done = i + 1;
        onProgress?.({
          active: true,
          done,
          total: rows.length,
          label: `writing params joint ${row.joint} (${done}/${rows.length})`,
          percent: Math.floor((done / rows.length) * 100),
        });
        await sleep(10);
      }
      onProgress?.({
        active: false,
        done: rows.length,
        total: rows.length,
        label: 'write done',
        percent: 100,
      });
      return result;
    } finally {
      await closeBusQuietly();
    }
  };

  const enableAllRobotArm = async () =>
    runRobotArmBulk('enable-all', async () => {
      pushLog('robot-arm enable-all start', 'info');
      const { okCount, failCount } = await bulkOp(
        robotArmJointRows,
        (row) => controlMotor(row.hit, 'enable', null, { allowDuringBulk: true }),
        60
      );
      pushLog(
        `robot-arm enable-all done ok=${okCount} fail=${failCount}`,
        failCount > 0 ? 'err' : 'ok'
      );
      return failCount === 0;
    });

  const disableAllRobotArm = async () =>
    runRobotArmBulk('disable-all', async () => {
      pushLog('robot-arm disable-all start', 'info');
      // Skip joints already known to be offline: sending a disable frame to a
      // motor that isn't there just burns a full controlMs (6s) timeout each.
      const onlineRows = robotArmJointRows.filter((r) => r?.hit?.online);
      const offlineRows = robotArmJointRows.filter((r) => !r?.hit?.online);
      if (offlineRows.length > 0) {
        pushLog(
          `robot-arm disable-all skip ${offlineRows.length} offline joint(s): ${offlineRows
            .map((r) => `J${r.joint}`)
            .join(', ')}`,
          'info'
        );
      }
      const { okCount, failCount } = await bulkOp(
        onlineRows,
        (row) => controlMotor(row.hit, 'disable', null, { allowDuringBulk: true }),
        60
      );
      pushLog(
        `robot-arm disable-all done ok=${okCount} fail=${failCount}`,
        failCount > 0 ? 'err' : 'ok'
      );
      return failCount === 0;
    });

  const zeroAllRobotArm = async () =>
    runRobotArmBulk('zero-all', async () => {
      pushLog('robot-arm zero-all start', 'info');
      const { okCount, failCount } = await bulkOp(
        robotArmJointRows,
        (row) => zeroMotor(row.hit),
        70
      );
      pushLog(
        `robot-arm zero-all done ok=${okCount} fail=${failCount}`,
        failCount > 0 ? 'err' : 'ok'
      );
      return failCount === 0;
    });

  // TODO: reset-pose has known gaps; revise against real hardware before enabling (vlim / mode switch / disable / readback verify).
  const resetPoseRobotArm = async () =>
    runRobotArmBulk('reset-pose', async () => {
      pushLog('robot-arm reset-pose start target=0.0rad', 'info');
      let okCount = 0;
      for (const row of robotArmJointRows) {
        const key = motorKey(row.hit);
        const mode = 'pos_vel';
        setControls((prev) => ({
          ...prev,
          [key]: {
            ...(prev[key] || defaultControlsForHit(row.hit)),
            mode,
            target: 0,
          },
        }));
        const ok = await controlMotor(
          row.hit,
          'move',
          { mode, target: 0 },
          { allowDuringBulk: true }
        );
        if (ok) okCount += 1;
        await sleep(60);
      }
      const failCount = robotArmJointRows.length - okCount;
      pushLog(
        `robot-arm reset-pose done ok=${okCount} fail=${failCount}`,
        failCount > 0 ? 'err' : 'ok'
      );
      return failCount === 0;
    });

  const runRobotArmSelfCheck = async () => {
    if (armSelfCheckBusy) return;
    setArmSelfCheckBusy(true);
    setArmSelfCheckReport(null);
    const steps = [];
    const updateStep = (done, label) =>
      setArmSelfCheckProgress({
        active: true,
        done,
        total: 4,
        label,
        percent: Math.floor((done / 4) * 100),
      });

    try {
      updateStep(0, 'self-check: start');
      const connOk = Boolean(connected);
      steps.push({ step: 'connection', ok: connOk, reason: connOk ? '' : 'ws disconnected' });
      if (!connOk) {
        setArmSelfCheckReport({
          ok: false,
          summary: 'FAILED',
          reason: 'ws disconnected',
          onlineCount: 0,
          total: 7,
          paramOkCount: 0,
          paramFailCount: 0,
          steps,
          at: Date.now(),
        });
        return;
      }
      updateStep(1, 'self-check: scan joints');
      const scan = await scanRobotArmAll();
      const onlineCount = Number(scan?.onlineCount ?? 0);
      const total = Number(scan?.total ?? 7);
      const scanOk = onlineCount === total;
      steps.push({
        step: 'scan',
        ok: scanOk,
        reason: scanOk ? '' : `online ${onlineCount}/${total}`,
      });
      updateStep(2, 'self-check: summarize online');
      await sleep(80);
      const onlineOk = onlineCount > 0;
      steps.push({
        step: 'online-summary',
        ok: onlineOk,
        reason: onlineOk ? `online ${onlineCount}/${total}` : 'no online joints',
      });
      updateStep(3, 'self-check: read params');
      const paramRet = await readRobotArmControlParams();
      let paramOkCount = 0;
      let paramFailCount = 0;
      Object.values(paramRet || {}).forEach((x) => {
        if (x?.ok) paramOkCount += 1;
        else paramFailCount += 1;
      });
      const paramOk = paramFailCount === 0 && paramOkCount > 0;
      steps.push({
        step: 'param-readback',
        ok: paramOk,
        reason: `ok=${paramOkCount}, fail=${paramFailCount}`,
      });
      updateStep(4, 'self-check: done');
      const allOk = steps.every((x) => x.ok);
      setArmSelfCheckReport({
        ok: allOk,
        summary: allOk ? 'PASSED' : 'FAILED',
        reason: allOk
          ? 'all checks passed'
          : steps
              .filter((x) => !x.ok)
              .map((x) => x.reason)
              .join('; '),
        onlineCount,
        total,
        paramOkCount,
        paramFailCount,
        steps,
        at: Date.now(),
      });
      pushLog(
        `robot-arm self-check ${allOk ? 'passed' : 'failed'} online=${onlineCount}/${total} params_ok=${paramOkCount} params_fail=${paramFailCount}`,
        allOk ? 'ok' : 'err'
      );
    } finally {
      setArmSelfCheckBusy(false);
      setTimeout(() => {
        setArmSelfCheckProgress((prev) => ({ ...prev, active: false }));
      }, 700);
    }
  };

  // Read every writable arm parameter from each arm joint (all joints,
  // including offline ones) and download the result as a tab-separated .tsv:
  // columns are joints (J1..J7), rows are registers, cells are raw values. If
  // the gateway cannot read an individual register, that cell is recorded as
  // "ERR" and the rest of the joint's params are still read.
  //
  // Vendor differences are branched via the isDamiao flag: RobStride addresses
  // params by hex param_id and reads via robstride_read_param; Damiao addresses
  // registers by decimal rid and reads via get_register_u32/f32, and excludes
  // the four identity params (mstId/escId/timeout/canBr) so a re-import cannot
  // change a motor's CAN address. The joint loop, progress, ERR/offline
  // handling, and download are shared.
  const exportArmParams = async ({ onProgress } = {}) => {
    const vendor = activeParamVendor;
    const isDamiao = vendor === 'damiao';
    const rows = robotArmJointRows.filter((r) => String(r?.hit?.vendor) === vendor);
    if (rows.length === 0) {
      pushLog(`robot-arm export params skipped: no ${vendor} joints`, 'err');
      return { error: `no ${vendor} joints`, okCount: 0, total: 0 };
    }
    // Describe a joint row for abort logs/alerts: "J<n> esc=0x.. mst=0x..".
    // The offline alert modal strips to the J<n> token; the esc/mst detail
    // stays in the event log.
    const hexId = (id) =>
      isDamiao ? `0x${id.toString(16).padStart(2, '0')}` : `0x${id.toString(16).padStart(4, '0')}`;
    const describeExportHit = (r) =>
      `J${r.joint} esc=${hexId(r.hit.esc_id)} mst=${hexId(r.hit.mst_id)}`;

    // Pre-check: abort before reading or downloading anything if any joint is
    // offline (hit.online === false). Mirrors importArmParams' gate.
    const offlineAtStart = rows.filter((r) => !r?.hit?.online);
    if (offlineAtStart.length > 0) {
      const jointsList = offlineAtStart.map(describeExportHit);
      pushLog(`robot-arm export params aborted: offline at start: ${jointsList.join(', ')}`, 'err');
      return {
        aborted: { reason: 'offline_at_start', kind: 'export', joints: jointsList },
        okCount: 0,
        total: rows.length,
      };
    }
    // Writable (and, for Damiao, non-identity) only. RobStride's catalog marks
    // read-only params via access='ro'; Damiao's param defs mark identity params
    // via group='identity' and never round-trip them through export.
    const exportDefs = isDamiao
      ? DAMIAO_ARM_PARAM_DEFS.filter((d) => d.writable !== false && d.group !== 'identity')
      : ROBSTRIDE_PARAM_CATALOG.filter(
          (d) => canRobstrideRead(d.access) && canRobstrideWrite(d.access)
        );
    // RS catalog defs key on .name; DM param defs key on .rid. Use whichever
    // field exists so the values map is keyed consistently per vendor.
    const valueKey = (def) => (isDamiao ? def.rid : def.name);
    const total = rows.length;
    onProgress?.({ active: true, done: 0, total, label: 'exporting params...', percent: 0 });

    const result = {};
    let done = 0;
    let aborted = null;
    // If a read returns an offline/timeout error mid-export, the motor is
    // unreachable even though its card still showed online (stale state).
    // Abort immediately — like importArmParams does on a read timeout —
    // instead of filling the TSV with ERR cells and downloading a useless
    // file. A post-loop okCount===0 backstop catches non-timeout total
    // failures (e.g. an unexpected gateway error on every read) the same way.
    jointLoop: for (const row of rows) {
      const h = row.hit;
      const values = {};
      const online = Boolean(h?.online);
      if (!online) {
        for (const def of exportDefs) values[valueKey(def)] = 'ERR:offline';
      } else {
        try {
          await setTargetFor(h.vendor, modelForHit(h, vendors), h.esc_id, h.mst_id, {
            enableStreams: false,
          });
          for (const def of exportDefs) {
            const ret = isDamiao
              ? await sendCmd(
                  def.dataType === 'u32' ? 'get_register_u32' : 'get_register_f32',
                  { rid: def.rid, timeout_ms: 1000 },
                  3000
                )
              : await sendCmd(
                  'robstride_read_param',
                  {
                    param_id: def.id,
                    type: toRobstrideCliType(def.dataType),
                    timeout_ms: 1000,
                  },
                  3000
                );
            if (ret?.ok) {
              values[valueKey(def)] = Number(getResponseValue(ret));
            } else {
              if (isOfflineTimeout(ret?.error)) {
                aborted = {
                  reason: 'timeout',
                  kind: 'export',
                  motor: describeExportHit(row),
                  joints: [describeExportHit(row)],
                };
                break jointLoop;
              }
              values[valueKey(def)] = `ERR:${ret?.error || 'read failed'}`;
            }
          }
        } catch (e) {
          if (isOfflineTimeout(e)) {
            aborted = {
              reason: 'timeout',
              kind: 'export',
              motor: describeExportHit(row),
              joints: [describeExportHit(row)],
            };
            break jointLoop;
          }
          // Bus-level failure (e.g. setTargetFor/open failed): mark every
          // remaining cell so the joint still appears in the export.
          const busError = e.message || String(e);
          for (const def of exportDefs) {
            const k = valueKey(def);
            if (!(k in values)) values[k] = `ERR:${busError}`;
          }
        } finally {
          await closeBusQuietly();
        }
      }
      const failCount = exportDefs.filter((d) =>
        String(values[valueKey(d)]).startsWith('ERR')
      ).length;
      result[row.joint] = {
        ok: online && failCount === 0,
        online,
        values,
        failCount,
        total: exportDefs.length,
      };
      done += 1;
      onProgress?.({
        active: true,
        done,
        total,
        label: `export params joint ${row.joint} (${done}/${total})`,
        percent: Math.floor((done / total) * 100),
      });
      await sleep(10);
    }
    if (aborted) {
      pushLog(`robot-arm export params aborted: ${aborted.motor} offline mid-export`, 'err');
      onProgress?.({ active: false, done, total, label: 'export aborted', percent: 0 });
      return { aborted, okCount: 0, total: rows.length };
    }
    // Backstop: every joint failed to read (motors unreachable but not flagged
    // offline, or a non-timeout gateway error on every read). Don't download
    // an all-ERR TSV — abort with the offline alert listing every joint.
    const okCount = Object.values(result).filter((x) => x.ok).length;
    if (okCount === 0) {
      const jointsList = rows.map(describeExportHit);
      pushLog('robot-arm export params aborted: all joints failed to read', 'err');
      onProgress?.({ active: false, done, total, label: 'export aborted', percent: 0 });
      return {
        aborted: { reason: 'all_failed', kind: 'export', joints: jointsList },
        okCount: 0,
        total: rows.length,
      };
    }
    onProgress?.({ active: false, done: total, total, label: 'export done', percent: 100 });

    // --- Build a TSV: header + one row per register, columns = joints. ---
    const joints = rows.map((r) => r.joint);
    // Numeric values are emitted raw; read failures collapse to "ERR" and
    // offline joints to "offline" so an importer can skip non-numeric cells.
    const cellFmt = (v) => {
      if (Number.isFinite(v)) return String(v);
      if (typeof v === 'string') {
        if (v === 'ERR:offline') return 'offline';
        if (v.startsWith('ERR:')) return 'ERR';
      }
      return '';
    };
    const hex = (id) => `0x${id.toString(16).padStart(4, '0')}`;
    const lines = isDamiao
      ? [
          '# Damiao arm parameters export (TSV)',
          '# vendor: damiao',
          `# joints: ${joints.join(', ')}`,
          `# writable params: ${exportDefs.length}`,
          '# cell values: numeric | "ERR" (read failed) | "offline" (joint offline)',
          '# priority: high = safety/motion/tuning-critical, review before import.',
          '# identity params (mstId/escId/timeout/canBr) are excluded and cannot be imported.',
          '# import: split each non-"#" line by tab; skip cells that are not numeric.',
          '',
          [
            'rid',
            'type',
            'name',
            'desc_zh',
            'group',
            'priority',
            ...joints.map((j) => `J${j}`),
          ].join('\t'),
          ...exportDefs.map((d) =>
            [
              String(d.rid),
              d.dataType === 'u32' ? 'u32' : 'f32',
              d.variable,
              d.descZh || '',
              d.group,
              damiaoParamPriority(d),
              ...joints.map((j) => cellFmt(result[j]?.values?.[d.rid])),
            ].join('\t')
          ),
        ]
      : [
          '# RobStride arm parameters export (TSV)',
          '# vendor: robstride',
          `# joints: ${joints.join(', ')}`,
          `# writable params: ${exportDefs.length}`,
          '# cell values: numeric | "ERR" (read failed) | "offline" (joint offline)',
          '# priority: high = safety/motion/tuning-critical, review before import.',
          '# import: split each non-"#" line by tab; skip cells that are not numeric.',
          '',
          [
            'param_id',
            'type',
            'name',
            'desc_zh',
            'access',
            'priority',
            ...joints.map((j) => `J${j}`),
          ].join('\t'),
          ...exportDefs.map((d) =>
            [
              hex(d.id),
              toRobstrideCliType(d.dataType),
              d.name,
              d.descZh || '',
              d.access,
              robstrideParamPriority(d),
              ...joints.map((j) => cellFmt(result[j]?.values?.[d.name])),
            ].join('\t')
          ),
        ];

    try {
      const blob = new Blob([`${lines.join('\n')}\n`], {
        type: 'text/tab-separated-values;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Local-time readable stamp: YYYYMMDD-HHmm (date + hour + minute).
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date();
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
        d.getHours()
      )}${pad(d.getMinutes())}`;
      a.download = `${vendor}-params-${stamp}.tsv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      pushLog(`robot-arm export params download failed: ${e.message || e}`, 'err');
    }

    const doneOkCount = Object.values(result).filter((x) => x.ok).length;
    pushLog(
      `robot-arm export params done ok=${doneOkCount}/${total}`,
      doneOkCount === total ? 'ok' : 'err'
    );
    return { okCount: doneOkCount, total, result };
  };

  // Import a TSV file OR a pre-parsed { joints, rows } structure back into the
  // arm. The file form parses a TSV produced by exportArmParams (same format);
  // the parsed form is built from the default template by build*TemplateParsed,
  // so apply-default-template reuses this path without a TSV file. For each
  // online joint the current value of every writable row is read and compared;
  // only differing cells are written, and the joint is persisted to Flash when
  // anything changed. An unchanged set is a no-op; offline joints are skipped
  // (no bus open). Read-only / identity / non-numeric cells are skipped by the
  // vendor TSV parser. Result per joint:
  // { ok, online, read, written, skipped, saved, errors }.
  //
  // Vendor differences are branched via isDamiao: RobStride addresses params by
  // hex param_id via robstride_read/write_param; Damiao addresses registers by
  // decimal rid via get/write_register_u32/f32 (with verify), routes ctrlMode
  // through ensure_mode instead of write_register, and relies on the Damiao TSV
  // parser to drop the four identity params so they never reach this loop. The
  // pre-check, disable-all, diff-write, store, and abort flow are shared.
  const importArmParams = async ({ file, parsed: parsedIn, onProgress } = {}) => {
    const vendor = activeParamVendor;
    const isDamiao = vendor === 'damiao';
    const rows = robotArmJointRows.filter((r) => String(r?.hit?.vendor) === vendor);
    if (rows.length === 0) {
      pushLog(`robot-arm import params skipped: no ${vendor} joints`, 'err');
      return { error: `no ${vendor} joints` };
    }

    let parsed = parsedIn;
    let fileErrors;
    if (!parsed) {
      let text;
      try {
        text = await file.text();
      } catch (e) {
        pushLog(`robot-arm import params read failed: ${e.message || e}`, 'err');
        return { error: `read file failed: ${e.message || e}` };
      }
      parsed = isDamiao ? parseDamiaoParamsTsv(text) : parseRobstrideParamsTsv(text);
      if (!parsed.ok) {
        pushLog(`robot-arm import params rejected: ${parsed.errors.length} format error(s)`, 'err');
        return { error: 'format invalid', errors: parsed.errors };
      }
      fileErrors = parsed.errors;
    }

    const byJoint = new Map(rows.map((r) => [r.joint, r]));
    const jointsToImport = parsed.joints.filter((j) => byJoint.has(j));
    if (jointsToImport.length === 0) {
      pushLog('robot-arm import params skipped: no matching joints in arm', 'err');
      return { error: 'no matching joints', errors: fileErrors };
    }

    const hex = (id) =>
      isDamiao ? `0x${id.toString(16).padStart(2, '0')}` : `0x${id.toString(16).padStart(4, '0')}`;
    const describeHit = (joint, h) => `J${joint} esc=${hex(h.esc_id)} mst=${hex(h.mst_id)}`;

    // Per-vendor branched accessors over a parsed row { def, paramId|rid, type }.
    const rowId = (pr) => (isDamiao ? pr.rid : pr.paramId);
    const paramName = (def) => (isDamiao ? def.variable : def.name);
    const isFloatType = (def) => (isDamiao ? def.dataType === 'f32' : def.dataType === 'Float32');
    const readCurrent = async (pr) => {
      const def = pr.def;
      if (isDamiao) {
        const op = def.dataType === 'u32' ? 'get_register_u32' : 'get_register_f32';
        return sendCmd(op, { rid: rowId(pr), timeout_ms: 1000 }, 3000);
      }
      const type = toRobstrideCliType(def.dataType);
      return sendCmd('robstride_read_param', { param_id: rowId(pr), type, timeout_ms: 1000 }, 3000);
    };
    const writeValue = async (pr, fileVal) => {
      const def = pr.def;
      if (isDamiao) {
        const op = def.dataType === 'u32' ? 'write_register_u32' : 'write_register_f32';
        const value = def.dataType === 'u32' ? Math.round(fileVal) : Number(fileVal) || 0;
        return sendCmd(op, { rid: rowId(pr), verify: true, value, timeout_ms: 1000 }, 3000);
      }
      const type = toRobstrideCliType(def.dataType);
      return sendCmd(
        'robstride_write_param',
        { param_id: rowId(pr), type, value: fileVal, timeout_ms: 1000 },
        3000
      );
    };

    // Pre-check: any joint already offline at start -> abort immediately,
    // before disabling or writing anything. List every offline joint so the
    // operator knows exactly what to fix; nothing is written.
    const offlineAtStart = jointsToImport
      .map((j) => ({ joint: j, row: byJoint.get(j) }))
      .filter(({ row }) => !row?.hit?.online);
    if (offlineAtStart.length > 0) {
      const jointsList = offlineAtStart.map(({ joint, row }) => describeHit(joint, row.hit));
      pushLog(`robot-arm import aborted: offline at start: ${jointsList.join(', ')}`, 'err');
      return {
        aborted: { reason: 'offline_at_start', joints: jointsList },
        total: jointsToImport.length,
        okCount: 0,
        read: 0,
        written: 0,
        skipped: 0,
        saved: 0,
      };
    }

    // Disable every arm motor before touching any parameter. Writing a mode
    // register (RobStride run_mode / Damiao ctrlMode) to an enabled motor can
    // move it or be silently ignored by some firmware (see the host
    // ensure_control_mode note). Disabling first keeps the arm still and makes
    // the writes reliable. We do NOT re-enable afterwards — the operator
    // re-enables manually after verifying the result.
    pushLog('robot-arm import: disabling all motors before write', 'info');
    try {
      await disableAllRobotArm();
    } catch (e) {
      pushLog(`robot-arm import: disable-all failed: ${e.message || e}`, 'err');
    }

    const total = jointsToImport.length;
    onProgress?.({ active: true, done: 0, total, label: 'importing params...', percent: 0 });

    const result = {};
    const writtenLog = []; // { joint, id, name, from, to }
    let done = 0;
    let aborted = null;
    jointLoop: for (const joint of jointsToImport) {
      const row = byJoint.get(joint);
      const h = row.hit;
      const online = Boolean(h?.online);
      const tally = { ok: false, online, read: 0, written: 0, skipped: 0, saved: 0, errors: [] };
      if (!online) {
        tally.errors.push('joint offline');
      } else {
        // Damiao ctrlMode is handled out-of-band via ensure_mode, not
        // write_register. If the parsed plan carries a ctrlMode row whose value
        // differs from the current mode, capture it here and apply it after the
        // other registers are written (matching writeDamiaoControlParams). For
        // RobStride run_mode there is no such special path — it goes through
        // the normal read/compare/write loop below.
        let pendingModeName = null;
        let pendingModeFrom = null;
        let pendingModeTo = null;
        try {
          await setTargetFor(h.vendor, modelForHit(h, vendors), h.esc_id, h.mst_id, {
            enableStreams: false,
          });
          for (const pr of parsed.rows) {
            const fileVal = pr.values[joint];
            if (fileVal == null) continue; // this joint had no value for this row
            const def = pr.def;

            // Read the current value once (shared across ctrlMode and normal
            // params). A read timeout/no-ack means the motor just dropped:
            // abort the whole import and name this motor. Other read failures
            // are tallied and the row is skipped.
            let cur;
            try {
              const rret = await readCurrent(pr);
              if (rret?.ok) {
                cur = Number(getResponseValue(rret));
              } else {
                if (isOfflineTimeout(rret?.error)) {
                  throw new ImportAbort({
                    reason: 'timeout',
                    stage: 'read',
                    motor: describeHit(joint, h),
                    param: paramName(def),
                    message: rret?.error || 'read failed',
                  });
                }
                tally.errors.push(`${paramName(def)} read: ${rret?.error || 'failed'}`);
                tally.read += 1;
                continue;
              }
            } catch (e) {
              if (e instanceof ImportAbort) throw e;
              if (isOfflineTimeout(e)) {
                throw new ImportAbort({
                  reason: 'timeout',
                  stage: 'read',
                  motor: describeHit(joint, h),
                  param: paramName(def),
                  message: e.message || String(e),
                });
              }
              tally.errors.push(`${paramName(def)} read: ${e.message || e}`);
              continue;
            }
            tally.read += 1;
            // ctrlMode (Damiao u32 integer) compares by rounded integer; float
            // types use a small epsilon; other u32/integer params compare
            // strictly. RobStride defs have no .key, so the ctrlMode clause
            // never matches on the RS path and it goes through the normal
            // float/strict branches like before.
            const same =
              isDamiao && def.key === 'ctrlMode'
                ? Math.round(cur) === Math.round(fileVal)
                : isFloatType(def)
                  ? Math.abs(cur - fileVal) < 1e-4
                  : isDamiao
                    ? Math.round(cur) === Math.round(fileVal)
                    : cur === fileVal;
            if (same) {
              tally.skipped += 1;
              continue;
            }
            // ctrlMode is not writable via write_register — defer it to
            // ensure_mode after the other registers are written.
            if (isDamiao && def.key === 'ctrlMode') {
              pendingModeName = damiaoModeName(fileVal);
              pendingModeFrom = cur;
              pendingModeTo = Math.round(fileVal);
              continue;
            }
            try {
              const wret = await writeValue(pr, fileVal);
              if (!wret?.ok) {
                throw new Error(wret?.error || 'write failed');
              }
              tally.written += 1;
              writtenLog.push({
                joint,
                id: rowId(pr),
                name: paramName(def),
                from: cur,
                to: fileVal,
              });
              pushLog(
                `robot-arm import J${joint} ${isDamiao ? `rid=${rowId(pr)}` : hex(rowId(pr))} ${paramName(def)}: ${cur} -> ${fileVal}`,
                'info'
              );
            } catch (e) {
              if (e instanceof ImportAbort) throw e;
              if (isOfflineTimeout(e)) {
                throw new ImportAbort({
                  reason: 'timeout',
                  stage: 'write',
                  motor: describeHit(joint, h),
                  param: paramName(def),
                  message: e.message || String(e),
                });
              }
              tally.errors.push(`${paramName(def)} write: ${e.message || e}`);
            }
          }
          // Apply the deferred Damiao mode switch after the other registers
          // are written. ensure_mode is the DM equivalent of writing run_mode
          // on RobStride (which went through the normal loop above).
          if (pendingModeName) {
            try {
              pushLog(`ensuring Damiao ctrlMode ${pendingModeName}...`, 'info');
              const ret = await sendCmd(
                'ensure_mode',
                { mode: pendingModeName, timeout_ms: 2000 },
                3000
              );
              if (!ret?.ok) throw new Error(ret?.error || 'ensure_mode failed');
              tally.written += 1;
              writtenLog.push({
                joint,
                id: 10,
                name: 'CTRL_MODE',
                from: pendingModeFrom,
                to: pendingModeTo,
              });
            } catch (e) {
              if (e instanceof ImportAbort) throw e;
              if (isOfflineTimeout(e)) {
                throw new ImportAbort({
                  reason: 'timeout',
                  stage: 'write',
                  motor: describeHit(joint, h),
                  param: 'CTRL_MODE',
                  message: e.message || String(e),
                });
              }
              tally.errors.push(`CTRL_MODE ensure_mode: ${e.message || e}`);
            }
          }
          // Persist the writes for this joint to Flash so they survive
          // power-cycle. Only store when at least one param changed; storing
          // an unchanged joint is unnecessary wear on the Flash.
          if (tally.written > 0) {
            try {
              const stored = await sendCmd(
                'store_parameters',
                { vendor: h.vendor, motor_id: h.esc_id, feedback_id: h.mst_id },
                4000
              );
              if (!stored?.ok) {
                throw new Error(stored?.error || 'store_parameters failed');
              }
              tally.saved += 1;
              pushLog(`robot-arm import J${joint} stored ${tally.written} param(s)`, 'ok');
            } catch (e) {
              if (e instanceof ImportAbort) throw e;
              if (isOfflineTimeout(e)) {
                throw new ImportAbort({
                  reason: 'timeout',
                  stage: 'store',
                  motor: describeHit(joint, h),
                  param: 'store_parameters',
                  message: e.message || String(e),
                });
              }
              tally.errors.push(`store: ${e.message || e}`);
              pushLog(`robot-arm import J${joint} store failed: ${e.message || e}`, 'err');
            }
          }
        } catch (e) {
          if (e instanceof ImportAbort) {
            // A motor dropped mid-import (read/write/store timed out). Capture
            // which one and break out of the joint loop; the finally still
            // closes the bus before we leave.
            aborted = e.aborted;
            break jointLoop;
          }
          const busError = e.message || String(e);
          tally.errors.push(`bus: ${busError}`);
        } finally {
          await closeBusQuietly();
        }
      }
      tally.ok = online && tally.errors.length === 0;
      result[joint] = tally;
      done += 1;
      onProgress?.({
        active: true,
        done,
        total,
        label: `import joint ${joint} (${done}/${total}) r=${tally.read} w=${tally.written} s=${tally.skipped} saved=${tally.saved}`,
        percent: Math.floor((done / total) * 100),
      });
      await sleep(10);
    }
    onProgress?.({
      active: false,
      done: total,
      total,
      label: aborted ? 'import aborted' : 'import done',
      percent: aborted ? Math.floor((done / total) * 100) : 100,
    });

    const readTotal = Object.values(result).reduce((s, x) => s + x.read, 0);
    const writtenTotal = Object.values(result).reduce((s, x) => s + x.written, 0);
    const skippedTotal = Object.values(result).reduce((s, x) => s + x.skipped, 0);
    const savedTotal = Object.values(result).reduce((s, x) => s + x.saved, 0);
    const okCount = Object.values(result).filter((x) => x.ok).length;

    // Consolidated log of every parameter that was actually written, grouped
    // by joint, so the operator can audit what the import changed.
    if (writtenLog.length > 0) {
      const byJ = new Map();
      for (const w of writtenLog) {
        if (!byJ.has(w.joint)) byJ.set(w.joint, []);
        byJ.get(w.joint).push(`${isDamiao ? `rid=${w.id}` : hex(w.id)} ${w.name}=${w.to}`);
      }
      const detail = [...byJ.entries()].map(([j, arr]) => `J${j}:[${arr.join(', ')}]`).join(' ');
      pushLog(`robot-arm import written ${writtenTotal} cell(s): ${detail}`, 'ok');
    }
    if (aborted) {
      pushLog(
        `robot-arm import aborted at ${aborted.motor} (${aborted.stage}${
          aborted.param ? `:${aborted.param}` : ''
        }): ${aborted.message}. ${okCount}/${total} joint(s) completed before abort.`,
        'err'
      );
    } else {
      pushLog(
        `robot-arm import params done joints=${okCount}/${total} read=${readTotal} written=${writtenTotal} skipped=${skippedTotal} saved=${savedTotal}`,
        okCount === total ? 'ok' : 'err'
      );
    }
    return {
      okCount,
      total,
      read: readTotal,
      written: writtenTotal,
      skipped: skippedTotal,
      saved: savedTotal,
      writtenLog,
      result,
      aborted,
    };
  };

  return {
    robotArmModel,
    armScanBusy,
    armScanProgress,
    setRobotArmModel,
    robotArmJointRows,
    ensureRobotArmCards,
    scanRobotArmJoint,
    scanRobotArmAll,
    detectRobotArmModel,
    armBulkBusy,
    armParamOpBusy,
    setArmParamOpBusy,
    armSelfCheckBusy,
    armSelfCheckProgress,
    armSelfCheckReport,
    runRobotArmSelfCheck,
    enableAllRobotArm,
    disableAllRobotArm,
    zeroAllRobotArm,
    resetPoseRobotArm,
    readRobotArmControlParams,
    writeRobotArmControlParams,
    exportArmParams,
    importArmParams,
  };
}
