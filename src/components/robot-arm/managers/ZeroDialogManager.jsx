import React from 'react';
import { useI18n } from '../../../i18n';
import { ConfirmDialog } from '../../ConfirmDialog';
import { ArmUrdfViewer } from '../../ArmUrdfViewer';
import { sleep } from '../../../lib/async';
import { useConfirmDialog } from './useConfirmDialog';
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
  // This dialog belongs to the zero-calibration flow only; ParamManager holds
  // its own useConfirmDialog instance, so the URDF reference below can render
  // unconditionally without leaking into param-write confirmations.
  const {
    confirmState: zeroConfirm,
    ask: askZeroConfirm,
    close: closeZeroConfirm,
  } = useConfirmDialog();
  const zeroCheckBusyRef = React.useRef(false);

  // Zero-read results describe one specific arm profile/joint set; drop them when
  // that set changes so a stale "read all N" or "unread Jx" cannot outlive it.
  // The signature covers joint identity, not just count, so a same-length swap
  // of which joints are present also counts as a change.
  const rowsSignature = `${profile || ''}|${(robotArmJointRows || [])
    .map((r) => r.joint)
    .join(',')}`;
  const rowsSignatureRef = React.useRef(rowsSignature);
  React.useEffect(() => {
    rowsSignatureRef.current = rowsSignature;
    setZeroReadStatus(null);
  }, [rowsSignature]);

  const onZeroAllSafe = React.useCallback(async () => {
    if (zeroCheckBusyRef.current) return;
    zeroCheckBusyRef.current = true;
    setZeroCheckBusy(true);
    // The profile/joint set captured at flow start. If it changes mid-flow
    // (arm model switched, joints rescaned), the read results and the user's
    // confirmations no longer describe the arm zeroAllRobotArm would act on —
    // abort instead of calibrating the wrong configuration.
    const flowSignature = rowsSignatureRef.current;
    const stillCurrent = () => rowsSignatureRef.current === flowSignature;
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
      if (!stillCurrent()) {
        setZeroReadStatus(null);
        return;
      }
      if (!rows.length || failed.length) return;
      const c1 = await askZeroConfirm({
        title: t('arm_zero_all_confirm_title'),
        message: t('arm_zero_all_confirm_1'),
        danger: true,
      });
      // Plain cancel keeps the read results — the reads genuinely succeeded.
      if (!c1) return;
      if (!stillCurrent()) {
        setZeroReadStatus(null);
        return;
      }
      const c2 = await askZeroConfirm({
        title: t('arm_zero_all_confirm_title'),
        message: t('arm_zero_all_confirm_2'),
        danger: true,
      });
      if (!c2) return;
      if (!stillCurrent()) {
        setZeroReadStatus(null);
        return;
      }
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
        zeroCheckBusy,
        zeroReadStatus,
        onZeroAllSafe,
        jointLimit: (joint) => jointLimit(joint, limits),
        clampByLimit,
      })}
    </>
  );
}
