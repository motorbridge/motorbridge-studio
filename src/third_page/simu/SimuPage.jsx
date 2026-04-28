import React from 'react';
import './simu.css';
import { SimuLeftNav, SimuRightPanel, SimuTopRightBridge, SimuViewport } from './components';
import { useSimuBridge, useSimuState } from './hooks';

const VIEWER_Y_OFFSET = 0.02;
function backendToViewerPose(p) {
  const x = Number(p?.x || 0);
  const y = Number(p?.y || 0);
  const z = Number(p?.z || 0);
  return { ...p, x, y: z + VIEWER_Y_OFFSET, z: -y };
}

export function SimuPage() {
  const state = useSimuState();
  const bridge = useSimuBridge();
  const waypointList = React.useMemo(() => {
    const w = bridge.latestState?.waypoints || {};
    return Object.entries(w).map(([id, p]) => ({
      id,
      x: Number(p?.x || 0),
      y: Number(p?.y || 0),
      z: Number(p?.z || 0),
      roll: Number(p?.roll || 0),
      pitch: Number(p?.pitch || 0),
      yaw: Number(p?.yaw || 0),
    }));
  }, [bridge.latestState]);
  const enhancedState = {
    ...state,
    waypointList,
    selectWaypoint: (wp) => {
      state.setSelectedWaypointId(wp.id);
      state.setWaypointId(wp.id);
      const pv = backendToViewerPose(wp);
      state.setEditPose({
        x: pv.x, y: pv.y, z: pv.z, roll: wp.roll, pitch: wp.pitch, yaw: wp.yaw,
      });
    },
  };

  React.useEffect(() => {
    if (!state.syncToWs || !bridge.connected) return;
    const t = setTimeout(() => {
      bridge.send('sim_set_joint_targets', { targets: state.targets }, 1200).catch(() => {});
    }, 80);
    return () => clearTimeout(t);
  }, [state.syncToWs, state.targets, bridge.connected, bridge.send]);

  React.useEffect(() => {
    if (!state.followWsState || !bridge.latestState?.joint_targets) return;
    const jt = bridge.latestState.joint_targets;
    state.setTargets((prev) => ({
      ...prev,
      joint1: Number(jt.joint1 ?? prev.joint1),
      joint2: Number(jt.joint2 ?? prev.joint2),
      joint3: Number(jt.joint3 ?? prev.joint3),
      joint4: Number(jt.joint4 ?? prev.joint4),
      joint5: Number(jt.joint5 ?? prev.joint5),
      joint6: Number(jt.joint6 ?? prev.joint6),
      joint7: Number(jt.joint7 ?? prev.joint7),
    }));
  }, [state.followWsState, bridge.latestState]);

  return (
    <div className="simu-root">
      <SimuLeftNav state={state} />
      <SimuViewport state={enhancedState} />
      <SimuRightPanel state={enhancedState} bridge={bridge} />
      <SimuTopRightBridge state={state} bridge={bridge} />
    </div>
  );
}
