import { useState } from 'react';
import { bulkOp, sleep } from '../lib/async';
import { DAMIAO_ARM_PARAM_DEFS, ROBSTRIDE_ARM_PARAM_DEFS } from '../lib/appConfig';
import { modelForHit } from '../lib/motorStudioOps';
import { toRobstrideCliType } from '../lib/robstrideParamCatalog';
import { armVendorForProfile } from '../lib/robotArm';
import { defaultControlsForHit, getResponseValue, motorKey } from '../lib/utils';
import { useRobotArmStudio } from './useRobotArmStudio';

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
      for (const def of writeDefs) {
        if (!(def.key in values)) continue;
        const op = def.dataType === 'u32' ? 'write_register_u32' : 'write_register_f32';
        const value =
          def.dataType === 'u32'
            ? Math.round(Number(values[def.key]) || 0)
            : Number(values[def.key]) || 0;
        const ret = await sendCmd(op, { rid: def.rid, value }, 3000);
        if (!ret?.ok) throw new Error(ret?.error || `${op} failed`);
      }

      if (store) {
        const stored = await sendCmd('store_parameters', { vendor: h.vendor }, 4000);
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
      for (const def of ROBSTRIDE_ARM_PARAM_DEFS.filter((x) => x.writable !== false)) {
        if (!(def.key in values)) continue;
        const type = toRobstrideCliType(def.dataType);
        const value = Number(values[def.key]) || 0;
        const ret = await sendCmd(
          'robstride_write_param',
          { param_id: def.paramId, type, value, timeout_ms: 1000 },
          3000
        );
        if (!ret?.ok) throw new Error(ret?.error || `${def.variable} write failed`);
      }

      if (store) {
        const stored = await sendCmd('store_parameters', { vendor: h.vendor }, 4000);
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
              closeBusAfter: false,
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
      const { okCount, failCount } = await bulkOp(
        robotArmJointRows,
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

  return {
    robotArmModel,
    armScanBusy,
    armScanProgress,
    setRobotArmModel,
    robotArmJointRows,
    ensureRobotArmCards,
    scanRobotArmJoint,
    scanRobotArmAll,
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
  };
}
