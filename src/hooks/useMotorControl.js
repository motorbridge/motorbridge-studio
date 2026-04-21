import { defaultControlsForHit, motorKey, toHex } from '../lib/utils';
import {
  controlMotorOp,
  probeMotorOp,
  refreshMotorStateOp,
  setIdForOp,
  verifyHitOp,
  zeroMotorOp,
} from '../lib/motorStudioOps';

export function useMotorControl({
  t,
  vendors,
  controls,
  setHits,
  setControls,
  pushLog,
  setTargetFor,
  sendCmd,
  closeBusQuietly,
  armBulkBusy,
}) {
  const patchControl = (k, patch) => {
    setControls((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), ...patch } }));
  };

  const verifyHit = (h) =>
    verifyHitOp({ h, vendors, setTargetFor, sendCmd, setHits, closeBusQuietly, pushLog });

  const setIdFor = (h) => {
    const ok =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            t('confirm_set_id', { vendor: h.vendor, esc: toHex(h.esc_id), mst: toHex(h.mst_id) })
          );
    if (!ok) return Promise.resolve(false);
    return setIdForOp({ h, controls, vendors, setTargetFor, sendCmd, closeBusQuietly, pushLog });
  };

  const controlMotor = (h, action, controlOverride = null, options = {}) => {
    if (armBulkBusy && !options.allowDuringBulk) {
      pushLog(`control ${action} blocked: robot-arm bulk operation in progress`, 'info');
      return Promise.resolve(false);
    }
    return controlMotorOp({
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
    });
  };

  const zeroMotor = (h) =>
    zeroMotorOp({
      h,
      controls,
      vendors,
      setTargetFor,
      sendCmd,
      setHits,
      closeBusQuietly,
      pushLog,
    });

  const refreshMotorState = (h) =>
    refreshMotorStateOp({ h, vendors, setTargetFor, sendCmd, setHits, pushLog });

  const probeMotor = (h) =>
    probeMotorOp({ h, vendors, setTargetFor, sendCmd, setHits, closeBusQuietly, pushLog });

  const resetControlFor = (h) => {
    const key = motorKey(h);
    setControls((prev) => ({ ...prev, [key]: defaultControlsForHit(h) }));
  };

  const runMotorOp = async (
    h,
    op,
    payload = {},
    timeoutMs = 4000,
    options = { setTarget: true, closeBusAfter: true },
  ) => {
    try {
      if (options?.setTarget !== false) {
        await setTargetFor(h.vendor, h.model || vendors[h.vendor].model, h.esc_id, h.mst_id);
      }
      const ret = await sendCmd(op, payload, timeoutMs);
      if (!ret?.ok) throw new Error(ret?.error || `${op} failed`);
      pushLog(`${op} ${h.vendor} ${toHex(h.esc_id)} ok`, 'ok');
      return ret;
    } catch (e) {
      pushLog(`${op} ${h.vendor} ${toHex(h.esc_id)} failed: ${e.message || e}`, 'err');
      throw e;
    } finally {
      if (options?.closeBusAfter !== false) {
        await closeBusQuietly();
      }
    }
  };

  return {
    patchControl,
    verifyHit,
    setIdFor,
    controlMotor,
    zeroMotor,
    refreshMotorState,
    probeMotor,
    resetControlFor,
    runMotorOp,
  };
}
