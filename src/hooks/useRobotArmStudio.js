import { useMemo, useState } from 'react';
import { motorKey, normalizeControlForHit } from '../lib/utils';
import { sleep } from '../lib/async';
import {
  ROBOT_ARM_JOINTS,
  ROBOT_ARM_MODELS,
  ROBSTRIDE_FEEDBACK_IDS,
  armMotorModelForProfile,
  armVendorForProfile,
  buildRobotArmHit,
  isProfileJointHit,
  normalizeRobotArmModel,
} from '../lib/robotArm';
import { usePersistedState } from './usePersistedState';

const LS_ROBOT_ARM_MODEL_KEY = 'motorbridge_studio_robot_arm_model_v1';

// Probe options for a profile. RobStride needs explicit feedback ids; Damiao fast-probes only.
function probeOptionsForProfile(profile, hit) {
  const vendor = armVendorForProfile(profile);
  if (vendor !== 'robstride') return { fastProbe: true };
  return {
    fastProbe: true,
    acceptAnyFeedbackId: true,
    feedbackIds: [hit.mst_id, ...ROBSTRIDE_FEEDBACK_IDS],
  };
}

export function useRobotArmStudio({
  hits,
  setHits,
  controls,
  setControls,
  activeMotorKey,
  setActiveMotorKey,
  probeMotor,
  pushLog,
}) {
  const [armScanBusy, setArmScanBusy] = useState(false);
  const [armScanProgress, setArmScanProgress] = useState({
    active: false,
    done: 0,
    total: 7,
    label: '',
    percent: 0,
  });
  const [robotArmModel, setRobotArmModelState] = usePersistedState(
    LS_ROBOT_ARM_MODEL_KEY,
    ROBOT_ARM_MODELS[0].key,
    (cached, fallback) => normalizeRobotArmModel(cached || fallback)
  );

  const setRobotArmModel = (nextRaw) => {
    const next = normalizeRobotArmModel(nextRaw);
    setRobotArmModelState(next);
    setHits((prev) =>
      prev.map((h) => {
        const j = ROBOT_ARM_JOINTS.find((x) => isProfileJointHit(h, next, x));
        if (!j) return h;
        return { ...h, arm_profile: next, joint: j.joint };
      })
    );
  };

  const ensureRobotArmCards = () => {
    const profile = normalizeRobotArmModel(robotArmModel);
    const defaultMotorModel = armMotorModelForProfile(profile);
    const armHits = ROBOT_ARM_JOINTS.map((j) => buildRobotArmHit(j, profile));

    setHits((prev) => {
      const merged = [...prev];
      for (const h of armHits) {
        const jointCfg = ROBOT_ARM_JOINTS.find((j) => Number(j.esc_id) === Number(h.esc_id));
        const idx = merged.findIndex((x) => jointCfg && isProfileJointHit(x, profile, jointCfg));
        if (idx >= 0) {
          const old = merged[idx];
          const keepModel = String(old.model || '').trim();
          const resolvedModel = keepModel && keepModel !== 'auto' ? keepModel : defaultMotorModel;
          merged[idx] = {
            ...old,
            ...h,
            model: resolvedModel,
            model_guess: old.model_guess || resolvedModel,
            arm_profile: profile,
            online: old.online ?? false,
          };
        } else {
          merged.push({
            ...h,
            model: defaultMotorModel,
            model_guess: defaultMotorModel,
            arm_profile: profile,
          });
        }
      }
      return merged;
    });

    setControls((prev) => {
      const next = { ...prev };
      for (const h of armHits) {
        const key = motorKey(h);
        next[key] = normalizeControlForHit(h, next[key]);
      }
      return next;
    });

    if (!activeMotorKey && armHits[0]) setActiveMotorKey(motorKey(armHits[0]));
  };

  const robotArmJointRows = useMemo(
    () =>
      ROBOT_ARM_JOINTS.map((j) => {
        const found = hits.find((h) => isProfileJointHit(h, robotArmModel, j));
        const hit = found || buildRobotArmHit(j, robotArmModel);
        const key = motorKey(hit);
        const control = normalizeControlForHit(hit, controls[key]);
        return { joint: j.joint, hit, control, key };
      }),
    [hits, controls, robotArmModel]
  );

  const finishScan = () => {
    setArmScanBusy(false);
    setTimeout(() => setArmScanProgress((prev) => ({ ...prev, active: false })), 500);
  };

  const markScanDone = (label) =>
    setArmScanProgress({
      active: true,
      done: ROBOT_ARM_JOINTS.length,
      total: ROBOT_ARM_JOINTS.length,
      label,
      percent: 100,
    });

  // Probe one joint for a profile with the shared progress animation.
  const runJointProbe = async ({ hit, profile, index, total, labelFor }) => {
    const step = index + 1;
    let tick = 0;
    const basePercent = Math.floor((index / total) * 100);
    const progressTimer = setInterval(() => {
      tick += 1;
      setArmScanProgress({
        active: true,
        done: index,
        total,
        label: labelFor(step),
        percent: Math.min(99, basePercent + Math.min(12, tick)),
      });
    }, 120);

    const ok = await probeMotor(hit, probeOptionsForProfile(profile, hit));
    clearInterval(progressTimer);
    setArmScanProgress({
      active: true,
      done: step,
      total,
      label: labelFor(step),
      percent: Math.floor((step / total) * 100),
    });
    await sleep(10);
    return ok;
  };

  const scanRobotArmJoint = async (jointNumber) => {
    const row = robotArmJointRows.find((x) => x.joint === jointNumber);
    if (!row) return false;
    const profile = normalizeRobotArmModel(robotArmModel);
    return probeMotor(row.hit, probeOptionsForProfile(profile, row.hit));
  };

  const scanRobotArmAll = async () => {
    if (armScanBusy) {
      pushLog('robot-arm scan ignored: previous scan still running', 'err');
      return null;
    }

    const total = ROBOT_ARM_JOINTS.length;
    setArmScanBusy(true);
    setArmScanProgress({
      active: true,
      done: 0,
      total,
      label: 'robot-arm scanning...',
      percent: 0,
    });

    ensureRobotArmCards();
    const profile = normalizeRobotArmModel(robotArmModel);
    pushLog(`robot-arm scan start profile=${profile} joints=1..7`, 'info');
    let onlineCount = 0;
    try {
      for (let i = 0; i < ROBOT_ARM_JOINTS.length; i += 1) {
        const j = ROBOT_ARM_JOINTS[i];
        const row = robotArmJointRows.find((x) => x.joint === j.joint);
        const ok = await runJointProbe({
          hit: row?.hit || buildRobotArmHit(j, profile),
          profile,
          index: i,
          total,
          labelFor: (s) => `robot-arm scanning joint ${j.joint} (${s}/${total})`,
        });
        if (ok) onlineCount += 1;
      }
      pushLog(`robot-arm scan done online=${onlineCount}/${total}`, 'ok');
      markScanDone('robot-arm scan done');
      return { total, onlineCount };
    } finally {
      finishScan();
    }
  };

  // Auto-detect: probe id0 (joint 1) against both vendors to pick the vendor,
  // then require joints 2..7 to all be online with that vendor (online ==>
  // same vendor + exists) before switching the dropdown. Any mismatch fails
  // without changing the model.
  const detectRobotArmModel = async () => {
    if (armScanBusy) {
      pushLog('robot-arm detect ignored: previous scan still running', 'err');
      return null;
    }

    const profiles = ROBOT_ARM_MODELS.map((m) => m.key);
    const total = ROBOT_ARM_JOINTS.length;
    const firstJoint = ROBOT_ARM_JOINTS[0];

    setArmScanBusy(true);
    setArmScanProgress({
      active: true,
      done: 0,
      total,
      label: 'robot-arm auto-detecting...',
      percent: 0,
    });

    try {
      pushLog(
        `robot-arm detect: probing joint ${firstJoint.joint} (esc_id=${firstJoint.esc_id}) against ${profiles
          .map(armVendorForProfile)
          .join(',')}`,
        'info'
      );
      // Probe each vendor SEQUENTIALLY, not in parallel. Both probes share one
      // CAN bus: each does set_target (+ stream enable) -> scan -> close_bus.
      // Run concurrently, the faster RobStride probe (fast 120ms scan) would
      // finish first and close_bus, tearing down the bus mid-scan for the
      // slower Damiao probe (300ms scan) — so parallel probing reliably
      // misses a DM arm even when its motor is present at joint 1. Sequential
      // probing (like scanRobotArmAll does per joint) avoids the contention.
      const results = [];
      for (const p of profiles) {
        const hit = buildRobotArmHit(firstJoint, p);
        results.push(await probeMotor(hit, probeOptionsForProfile(p, hit)));
      }
      const onlineProfiles = profiles.filter((_, i) => results[i]);

      setArmScanProgress({
        active: true,
        done: 1,
        total,
        label: 'robot-arm detect: vendor probe done',
        percent: Math.floor((1 / total) * 100),
      });

      // None or multiple vendors at id0 -> abort, keep model.
      if (onlineProfiles.length !== 1) {
        pushLog(
          onlineProfiles.length === 0
            ? 'robot-arm detect: no motor found at joint 1, aborting (model unchanged)'
            : `robot-arm detect: multiple vendors responded at joint 1 (${onlineProfiles
                .map(armVendorForProfile)
                .join(',')}), aborting (model unchanged)`,
          'err'
        );
        return { vendor: null, changed: false };
      }

      const winnerProfile = onlineProfiles[0];
      const winnerVendor = armVendorForProfile(winnerProfile);
      const current = normalizeRobotArmModel(robotArmModel);
      pushLog(
        `robot-arm detect: joint 1 is ${winnerVendor}, scanning remaining joints to confirm vendor consistency`,
        'info'
      );

      const offlineJoints = [];
      for (let i = 1; i < ROBOT_ARM_JOINTS.length; i += 1) {
        const j = ROBOT_ARM_JOINTS[i];
        const ok = await runJointProbe({
          hit: buildRobotArmHit(j, winnerProfile),
          profile: winnerProfile,
          index: i,
          total,
          labelFor: () => `detecting joint ${j.joint} (${winnerVendor})`,
        });
        if (!ok) offlineJoints.push(j.joint);
      }

      if (offlineJoints.length > 0) {
        pushLog(
          `robot-arm detect failed: joints ${offlineJoints.join(',')} not online / vendor mismatch with id0 (${winnerVendor}); model unchanged`,
          'err'
        );
        markScanDone('robot-arm detect failed');
        return { vendor: winnerVendor, changed: false, failed: true, offlineJoints };
      }

      if (winnerProfile !== current) setRobotArmModel(winnerProfile);
      pushLog(
        `robot-arm detect done: vendor=${winnerVendor} online=${ROBOT_ARM_JOINTS.length}/${ROBOT_ARM_JOINTS.length}, ${
          winnerProfile === current ? 'profile already set' : `switched to ${winnerProfile}`
        }`,
        'ok'
      );
      markScanDone('robot-arm detect done');
      return {
        vendor: winnerVendor,
        profile: winnerProfile,
        onlineCount: ROBOT_ARM_JOINTS.length,
        changed: winnerProfile !== current,
      };
    } finally {
      finishScan();
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
    detectRobotArmModel,
  };
}
