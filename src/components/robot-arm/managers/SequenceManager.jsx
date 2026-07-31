import React from 'react';
import { useI18n } from '../../../i18n';
import { sleep } from '../../../lib/async';
import { modesForVendor } from '../../../lib/wsCapabilities';
import { armPreferredMode, clampByLimit, jointLimit } from './armMotionUtils';

const SAFE_DEMO_TARGETS = {
  1: 0.4,
  2: -0.3,
  3: -0.4,
  4: -0.2,
  5: -0.5,
  6: 0.5,
  7: -2.0,
};

export function SequenceManager({
  rowsRef,
  demoToast,
  setDemoToast,
  scanRobotArmAll,
  enableAllRobotArm,
  patchControl,
  controlMotor,
  limits,
  gatewayCapabilities,
  children,
}) {
  const { t } = useI18n();
  const [demoAction, setDemoAction] = React.useState('safe_seq');
  const [demoBusy, setDemoBusy] = React.useState(false);
  const demoBusyRef = React.useRef(false);
  const demoAbortRef = React.useRef({ cancelled: false });

  React.useEffect(() => {
    return () => {
      demoAbortRef.current.cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!demoToast.visible || demoBusy) return undefined;
    const timer = setTimeout(() => {
      setDemoToast((prev) => ({ ...prev, visible: false }));
    }, 2600);
    return () => clearTimeout(timer);
  }, [demoToast, demoBusy, setDemoToast]);

  const showDemoToast = React.useCallback(
    (tone, title, detail = '') => {
      setDemoToast((prev) => ({
        visible: true,
        seq: prev.seq + 1,
        tone,
        title,
        detail,
      }));
    },
    [setDemoToast]
  );

  const stopDemo = React.useCallback(() => {
    demoAbortRef.current.cancelled = true;
    showDemoToast('warn', t('arm_demo_stopped'));
  }, [showDemoToast, t]);

  const throwIfStopped = React.useCallback(() => {
    if (demoAbortRef.current.cancelled) {
      throw new Error('demo stopped');
    }
  }, []);

  const runDemo = React.useCallback(async () => {
    if (demoBusyRef.current) return;
    demoBusyRef.current = true;
    demoAbortRef.current = { cancelled: false };

    const getOnlineRows = () => {
      const rows = rowsRef.current || [];
      const onlineRows = rows.filter((row) => Boolean(row?.hit?.online));
      return onlineRows.length > 0 ? onlineRows : [];
    };

    setDemoBusy(true);
    try {
      if (demoAction === 'safe_seq_scan') {
        showDemoToast(
          'info',
          t('arm_demo_running', { name: t('arm_demo_safe_seq_scan') }),
          t('arm_demo_scan')
        );
        throwIfStopped();
        await scanRobotArmAll();
        throwIfStopped();
        await sleep(120);
        throwIfStopped();
        await enableAllRobotArm();
        throwIfStopped();
      }

      const onlineRows = getOnlineRows();
      if (onlineRows.length === 0) {
        showDemoToast('warn', t('arm_demo_failed'), t('arm_demo_no_online'));
        return;
      }
      const targets = [...onlineRows].sort((a, b) => Number(a.joint) - Number(b.joint)).slice(0, 7);
      const seq = [];
      targets.forEach((row) => {
        seq.push({
          row,
          target: Number(SAFE_DEMO_TARGETS[row.joint] ?? 0.25),
          phase: 'forward',
        });
      });
      [...targets].reverse().forEach((row) => {
        seq.push({ row, target: 0, phase: 'reset' });
      });

      const namedSeq = seq.map((step, idx) => ({
        ...step,
        note: t(`arm_demo_phase_${step.phase}`),
        index: idx + 1,
      }));
      let okCount = 0;
      const demoName =
        demoAction === 'safe_seq_scan' ? t('arm_demo_safe_seq_scan') : t('arm_demo_safe_seq');
      for (const step of namedSeq) {
        throwIfStopped();
        const lim = jointLimit(step.row.joint, limits);
        const target = clampByLimit(Number(step.target), lim);
        const vendor = String(step.row.hit?.vendor || '').toLowerCase();
        const mode = armPreferredMode(vendor, modesForVendor(gatewayCapabilities, vendor));
        patchControl(step.row.key, { mode, target });
        showDemoToast(
          'info',
          t('arm_demo_running', { name: demoName }),
          t('arm_demo_step_phase', {
            step: step.index,
            total: namedSeq.length,
            joint: `J${step.row.joint}`,
            phase: step.note,
            target: target.toFixed(3),
          })
        );
        const ok = await controlMotor(step.row.hit, 'move', {
          mode,
          target,
        });
        throwIfStopped();
        if (ok) okCount += 1;
        await sleep(300);
        throwIfStopped();
      }

      showDemoToast(
        okCount === namedSeq.length ? 'ok' : 'warn',
        okCount === namedSeq.length ? t('arm_demo_done') : t('arm_demo_failed'),
        t('arm_demo_result', { ok: okCount, total: namedSeq.length })
      );
    } catch (e) {
      if (e?.message === 'demo stopped') {
        showDemoToast('warn', t('arm_demo_stopped'));
        return;
      }
      showDemoToast('warn', t('arm_demo_failed'), e?.message || String(e));
    } finally {
      demoBusyRef.current = false;
      setDemoBusy(false);
    }
  }, [
    controlMotor,
    demoAction,
    enableAllRobotArm,
    gatewayCapabilities,
    throwIfStopped,
    limits,
    patchControl,
    rowsRef,
    scanRobotArmAll,
    showDemoToast,
    t,
  ]);

  return children({ demoAction, setDemoAction, demoBusy, runDemo, stopDemo });
}
