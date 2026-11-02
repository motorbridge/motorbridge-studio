import React from 'react';
import { useI18n } from '../../../i18n';
import { ConfirmDialog } from '../../ConfirmDialog';
import { ArmUrdfViewer } from '../../ArmUrdfViewer';
import { sleep } from '../../../lib/async';
import { clampByLimit, jointLimit } from './armMotionUtils';

const ZERO_REFERENCE_TARGETS = {
  joint1: 0,
  joint2: 0,
  joint3: 0,
  joint4: 0,
  joint5: 0,
  joint6: 0,
  joint7: 0,
  gripper_joint1: 0,
  gripper_joint2: 0,
};

export function ZeroDialogManager({
  profile,
  robotArmJointRows,
  refreshMotorState,
  zeroAllRobotArm,
  limits,
  children,
}) {
  const { t } = useI18n();
  const [zeroReadStatus, setZeroReadStatus] = React.useState(null);
  const [zeroCheckBusy, setZeroCheckBusy] = React.useState(false);
  const [zeroConfirm, setZeroConfirm] = React.useState({
    open: false,
    title: '',
    message: '',
    danger: false,
  });
  const zeroConfirmResolverRef = React.useRef(null);
  const zeroCheckBusyRef = React.useRef(false);

  const askZeroConfirm = React.useCallback((cfg) => {
    return new Promise((resolve) => {
      zeroConfirmResolverRef.current = resolve;
      setZeroConfirm({
        open: true,
        title: cfg?.title || '',
        message: cfg?.message || '',
        danger: Boolean(cfg?.danger),
      });
    });
  }, []);

  const closeZeroConfirm = React.useCallback((accepted) => {
    const done = zeroConfirmResolverRef.current;
    zeroConfirmResolverRef.current = null;
    setZeroConfirm((prev) => ({ ...prev, open: false }));
    if (done) done(Boolean(accepted));
  }, []);

  React.useEffect(() => {
    return () => {
      if (zeroConfirmResolverRef.current) {
        zeroConfirmResolverRef.current(false);
        zeroConfirmResolverRef.current = null;
      }
    };
  }, []);

  const onZeroAllSafe = React.useCallback(async () => {
    if (zeroCheckBusyRef.current) return;
    zeroCheckBusyRef.current = true;
    setZeroCheckBusy(true);
    try {
      const rows = robotArmJointRows || [];
      let done = 0;
      const failed = [];
      setZeroReadStatus({ reading: true, done, total: rows.length, failed: [] });
      for (const row of rows) {
        let hit;
        try {
          if (row.hit) hit = await refreshMotorState(row.hit);
        } catch {
          // Report this joint as unread and continue checking the remaining joints.
        }
        if (hit?.online && hit.pos != null && Number.isFinite(Number(hit.pos))) done += 1;
        else failed.push(`J${row.joint}`);
        setZeroReadStatus({ reading: true, done, total: rows.length, failed: [...failed] });
        await sleep(20);
      }
      setZeroReadStatus({ reading: false, done, total: rows.length, failed });
      if (!rows.length || failed.length) return;
      const c1 = await askZeroConfirm({
        title: t('arm_zero_all_confirm_title'),
        message: t('arm_zero_all_confirm_1'),
        danger: true,
      });
      if (!c1) return;
      const c2 = await askZeroConfirm({
        title: t('arm_zero_all_confirm_title'),
        message: t('arm_zero_all_confirm_2'),
        danger: true,
      });
      if (!c2) return;
      await zeroAllRobotArm();
    } finally {
      zeroCheckBusyRef.current = false;
      setZeroCheckBusy(false);
    }
  }, [askZeroConfirm, t, zeroAllRobotArm, robotArmJointRows, refreshMotorState]);

  return (
    <>
      <ConfirmDialog
        open={zeroConfirm.open}
        title={zeroConfirm.title}
        message={zeroConfirm.message}
        danger={zeroConfirm.danger}
        onCancel={() => closeZeroConfirm(false)}
        onConfirm={() => closeZeroConfirm(true)}
      >
        {zeroReadStatus && (
          <p role="status">{t('arm_zero_read_complete', { total: zeroReadStatus.total })}</p>
        )}
        <figure className="armZeroReference">
          <figcaption>{t('arm_zero_reference')}</figcaption>
          <ArmUrdfViewer
            profile={profile}
            jointTargets={ZERO_REFERENCE_TARGETS}
            trailVisible={false}
          />
        </figure>
      </ConfirmDialog>
      {children({
        askZeroConfirm,
        zeroCheckBusy,
        zeroReadStatus,
        onZeroAllSafe,
        jointLimit: (joint) => jointLimit(joint, limits),
        clampByLimit,
      })}
    </>
  );
}
