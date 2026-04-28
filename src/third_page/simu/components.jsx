import React from 'react';
import { ArmUrdfViewer } from '../../components/ArmUrdfViewer';

const NAV_ITEMS = [
  { key: 'joint', label: 'Joint Control' },
  { key: 'trajectory', label: 'Trajectory' },
  { key: 'scene', label: 'Scene & View' },
  { key: 'bridge', label: 'WS Bridge' },
];

function waypointColor(id) {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 78% 54%)`;
}

function hslToRgbInt(h, s, l) {
  const hp = h / 360;
  const sp = s / 100;
  const lp = l / 100;
  const hue2rgb = (p, q, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r = lp;
  let g = lp;
  let b = lp;
  if (sp !== 0) {
    const q = lp < 0.5 ? lp * (1 + sp) : lp + sp - lp * sp;
    const p = 2 * lp - q;
    r = hue2rgb(p, q, hp + 1 / 3);
    g = hue2rgb(p, q, hp);
    b = hue2rgb(p, q, hp - 1 / 3);
  }
  return ((Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255)) >>> 0;
}

const VIEWER_Y_OFFSET = 0.02;

function backendToViewerPose(p) {
  const x = Number(p?.x || 0);
  const y = Number(p?.y || 0);
  const z = Number(p?.z || 0);
  return {
    ...p,
    x,
    y: z + VIEWER_Y_OFFSET,
    z: -y,
  };
}

function viewerToBackendPose(p) {
  const x = Number(p?.x || 0);
  const y = Number(p?.y || 0);
  const z = Number(p?.z || 0);
  return {
    ...p,
    x,
    y: -z,
    z: y - VIEWER_Y_OFFSET,
  };
}

export function SimuLeftNav({ state }) {
  return (
    <aside className="simu-left-nav">
      <div className="simu-brand">motorbridge-arm</div>
      <div className="simu-sub">Simulation Workbench</div>
      <div className="simu-nav-list">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`simu-nav-btn ${state.activeSection === item.key ? 'active' : ''}`}
            onClick={() => state.setActiveSection(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </aside>
  );
}

export function SimuViewport({ state }) {
  const normalizedMarkers = state.waypointList.map((wp) => {
    const s = String(wp.id || '');
    let hash = 0;
    for (let i = 0; i < s.length; i += 1) hash = (hash * 33 + s.charCodeAt(i)) >>> 0;
    const hue = hash % 360;
    const pv = backendToViewerPose(wp);
    return { id: wp.id, x: pv.x, y: pv.y, z: pv.z, color: hslToRgbInt(hue, 78, 54) };
  });
  return (
    <main className="simu-center">
      <div className="simu-center-toolbar">
        <span className="simu-chip">/simu</span>
        <span className="simu-tip">independent page for arm simulation only</span>
      </div>
      <div className="simu-view-host">
        <div className="simu-view-fill">
          <ArmUrdfViewer
            jointTargets={state.targets}
            simMode="trajectory"
            resetViewSeq={state.resetViewSeq}
            clearTrailSeq={state.clearTrailSeq}
            exportTrailSeq={state.exportTrailSeq}
            replaySeq={state.replaySeq}
            replayStopSeq={state.replayStopSeq}
            replayFinishSeq={state.replayFinishSeq}
            replaySpeed={state.replaySpeed}
            importedTrail={state.importedTrail}
            trailColor={state.trailColor}
            trailVisible={state.trailVisible}
            waypointMarkers={normalizedMarkers}
          />
        </div>
      </div>
    </main>
  );
}

export function SimuTopRightBridge({ state, bridge }) {
  return (
    <div className="simu-top-right-bridge">
      <input
        className="simu-ws-input"
        value={bridge.url}
        onChange={(e) => bridge.setUrl(e.target.value)}
        placeholder="ws://127.0.0.1:9011/ws"
      />
      <button className="ghostBtn small" onClick={bridge.connectWs}>Connect</button>
      <button className="ghostBtn small" onClick={bridge.disconnectWs}>Disconnect</button>
      <button className="ghostBtn small" onClick={bridge.ping}>Ping</button>
      <button className="ghostBtn small" onClick={bridge.fetchBusSnapshot}>Bus</button>
      <label className="simu-field-check">
        <input type="checkbox" checked={state.syncToWs} onChange={(e) => state.setSyncToWs(e.target.checked)} />
        <span>Sync Drag to WS</span>
      </label>
      <label className="simu-field-check">
        <input type="checkbox" checked={state.followWsState} onChange={(e) => state.setFollowWsState(e.target.checked)} />
        <span>Follow WS State</span>
      </label>
      <span className="simu-bridge-status">{bridge.phaseLabel}</span>
    </div>
  );
}

function JointPanel({ state }) {
  const jointValues = Array.from({ length: 7 }, (_, i) => Number(state.targets[`joint${i + 1}`] || 0));
  return (
    <>
      <div className="simu-panel-title">Joint Control</div>
      <div className="simu-card">
      <div className="simu-panel-actions">
        <button className="ghostBtn" onClick={state.setHome}>Home</button>
        <button className="ghostBtn" onClick={state.randomPose}>Random</button>
        <button className="ghostBtn" onClick={state.savePreset}>Save Preset</button>
        <button className="ghostBtn" onClick={state.resetWorkspace}>Reset Workspace</button>
        <button className="ghostBtn" onClick={state.clearPresets}>Clear Presets</button>
      </div>
      {state.presets.length > 0 && (
        <div className="simu-preset-list">
          {state.presets.map((p, i) => (
            <div className="simu-preset-item" key={`${p.name}-${i}`}>
              <button className="ghostBtn small" onClick={() => state.loadPreset(i)}>{p.name}</button>
              <button className="ghostBtn small" onClick={() => state.deletePreset(i)}>Del</button>
            </div>
          ))}
        </div>
      )}
      </div>
      {jointValues.map((v, i) => (
        <div key={`j-${i + 1}`} className="simu-joint-row simu-card">
          <div className="simu-joint-head">
            <span>J{i + 1}</span>
            <span>{v.toFixed(3)} rad</span>
          </div>
          <input
            className="simu-range"
            type="range"
            min={-3.14}
            max={3.14}
            step={0.001}
            value={v}
            onChange={(e) => state.setJoint(i, e.target.value)}
          />
          <div className="simu-inline-actions">
            <button className="ghostBtn small" onClick={() => state.nudgeJoint(i, -0.05)}>-0.05</button>
            <button className="ghostBtn small" onClick={() => state.nudgeJoint(i, 0.05)}>+0.05</button>
          </div>
        </div>
      ))}
    </>
  );
}

function TrajectoryPanel({ state }) {
  return (
    <>
      <div className="simu-panel-title">Trajectory</div>
      <div className="simu-card">
      <div className="simu-panel-actions">
        <button className="ghostBtn" onClick={() => state.setReplaySeq((x) => x + 1)}>Replay</button>
        <button className="ghostBtn" onClick={() => state.setReplayStopSeq((x) => x + 1)}>Stop</button>
        <button className="ghostBtn" onClick={() => state.setReplayFinishSeq((x) => x + 1)}>Jump End</button>
        <button className="ghostBtn" onClick={() => state.setClearTrailSeq((x) => x + 1)}>Clear Trail</button>
        <button className="ghostBtn" onClick={() => state.setExportTrailSeq((x) => x + 1)}>Export Trail</button>
      </div>
      <label className="simu-field">
        <span>Replay Speed ({state.replaySpeed.toFixed(2)}x)</span>
        <input
          className="simu-range"
          type="range"
          min={0.2}
          max={3}
          step={0.05}
          value={state.replaySpeed}
          onChange={(e) => state.setReplaySpeed(Number(e.target.value))}
        />
      </label>
      <label className="simu-field">
        <span>Import Trail JSON</span>
        <input type="file" accept=".json,application/json" onChange={(e) => state.importTrailFile(e.target.files?.[0])} />
      </label>
      <label className="simu-field">
        <span>Trail Color</span>
        <input type="color" value={state.trailColor} onChange={(e) => state.setTrailColor(e.target.value)} />
      </label>
      <label className="simu-field-check">
        <input type="checkbox" checked={state.trailVisible} onChange={(e) => state.setTrailVisible(e.target.checked)} />
        <span>Trail Visible</span>
      </label>
      </div>
    </>
  );
}

function ScenePanel({ state }) {
  return (
    <>
      <div className="simu-panel-title">Scene & View</div>
      <div className="simu-card">
      <div className="simu-panel-actions">
        <button className="ghostBtn" onClick={() => state.setResetViewSeq((x) => x + 1)}>Reset View</button>
        <button className="ghostBtn" onClick={() => state.setClearTrailSeq((x) => x + 1)}>Clear Trail</button>
        <button className="ghostBtn" onClick={state.captureScreenshot}>Screenshot</button>
      </div>
      <div className="simu-note">Use mouse in center viewport: rotate / pan / zoom.</div>
      </div>
    </>
  );
}

function BridgePanel({ state, bridge }) {
  const [busy, setBusy] = React.useState(false);
  const waypoints = bridge.latestState?.waypoints || {};
  const motion = bridge.latestState?.motion || {};
  const pose = bridge.latestState?.pose || {};
  const poseViewer = backendToViewerPose(pose);

  const addCurrentPoseWaypoint = async () => {
    const id = String(state.waypointId || '').trim();
    if (!id) return;
    setBusy(true);
    try {
      await bridge.addWaypoint(id, {
        x: Number(pose.x || 0),
        y: Number(pose.y || 0),
        z: Number(pose.z || 0),
        roll: Number(pose.roll || 0),
        pitch: Number(pose.pitch || 0),
        yaw: Number(pose.yaw || 0),
      });
      state.setSelectedWaypointId(id);
    } finally {
      setBusy(false);
    }
  };

  const updateWaypoint = async () => {
    const id = String(state.waypointId || '').trim();
    if (!id) return;
    setBusy(true);
    try {
      await bridge.updateWaypoint(id, viewerToBackendPose(state.editPose));
    } finally {
      setBusy(false);
    }
  };

  const runFromTo = async () => {
    setBusy(true);
    try {
      await bridge.runWaypoints(
        state.runFromId,
        state.runToId,
        Number(state.runDuration || 2.0),
        state.runProfile || 'min_jerk',
      );
    } finally {
      setBusy(false);
    }
  };

  const loadTestWaypoints = async () => {
    setBusy(true);
    try {
      const base = {
        x: Number(pose.x || 0.30),
        y: Number(pose.y || 0.00),
        z: Number(pose.z || 0.22),
        roll: Number(pose.roll || 0),
        pitch: Number(pose.pitch || 0),
        yaw: Number(pose.yaw || 0),
      };
      const pts = [
        ['P1', { ...base }],
        ['P2', { ...base, y: base.y + 0.10, z: base.z + 0.02 }],
        ['P3', { ...base, y: base.y - 0.10, z: base.z + 0.03 }],
        ['P4', { ...base, x: base.x + 0.08, z: base.z + 0.01 }],
        ['P5', { ...base, x: base.x - 0.08, z: base.z + 0.01 }],
      ];
      for (const [id, p] of pts) {
        // sequential on purpose, keeps server state/events ordered for debug
        // eslint-disable-next-line no-await-in-loop
        await bridge.addWaypoint(id, p);
      }
      state.setRunFromId('P1');
      state.setRunToId('P2');
      state.setWaypointId('P1');
      state.setSelectedWaypointId('P1');
    } finally {
      setBusy(false);
    }
  };

  const stopNow = async () => {
    setBusy(true);
    try {
      await bridge.stopMotion();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="simu-panel-title">WS Bridge</div>
      <div className="simu-card">
      <div className="simu-note">Top-right bar controls WS connect/sync.</div>
      <div className="simu-note">Status: {bridge.phaseLabel}</div>
      <div className="simu-note">Message: {bridge.bridgeMsg}</div>
      <div className="simu-note">Task Event: {bridge.taskEvent ? JSON.stringify(bridge.taskEvent.data) : 'none'}</div>
      <div className="simu-note">Motion: {motion?.running ? `running (${motion?.name || 'task'})` : (motion?.name || 'idle')}</div>
      <div className="simu-note">Coord: viewer(Y-up) ↔ backend(robot)</div>
      <div className="simu-panel-actions">
        <button className="ghostBtn small" onClick={bridge.clearHistory}>Clear WS History</button>
      </div>
      </div>

      <div className="simu-card">
      <div className="simu-panel-title">Waypoints</div>
      <label className="simu-field">
        <span>Waypoint ID</span>
        <input
          className="simu-ws-input"
          value={state.waypointId}
          onChange={(e) => state.setWaypointId(e.target.value)}
          placeholder="P1"
        />
      </label>
      <div className="simu-panel-actions">
        <button className="ghostBtn small" disabled={busy} onClick={addCurrentPoseWaypoint}>Add From Current Pose</button>
        <button className="ghostBtn small" disabled={busy} onClick={updateWaypoint}>Update Pose</button>
        <button className="ghostBtn small" disabled={busy} onClick={() => bridge.removeWaypoint(state.waypointId)}>Remove</button>
        <button className="ghostBtn small" disabled={busy} onClick={bridge.clearWaypoints}>Clear All</button>
        <button className="ghostBtn small" disabled={busy} onClick={loadTestWaypoints}>Load Test Set</button>
      </div>
      <div className="simu-panel-actions">
        <button className="ghostBtn small" disabled={busy} onClick={() => state.setEditPoseFromCurrent(poseViewer)}>Use Current Pose</button>
      </div>
      <div className="simu-grid6">
        {['x', 'y', 'z', 'roll', 'pitch', 'yaw'].map((k) => (
          <label className="simu-field" key={k}>
            <span>{k}</span>
            <input className="simu-ws-input" type="number" step="0.001" value={state.editPose[k]} onChange={(e) => state.setEditPoseField(k, Number(e.target.value))} />
          </label>
        ))}
      </div>
      <div className="simu-note">Current waypoints: {Object.keys(waypoints).length}</div>
      <div className="simu-waypoint-list">
        {state.waypointList.map((wp) => (
          <button
            key={wp.id}
            className={`simu-waypoint-item ${state.selectedWaypointId === wp.id ? 'active' : ''}`}
            onClick={() => state.selectWaypoint(wp)}
          >
            <span className="simu-waypoint-dot" style={{ background: waypointColor(wp.id) }} />
            <span>{wp.id}</span>
            <span>{wp.x.toFixed(3)}, {wp.y.toFixed(3)}, {wp.z.toFixed(3)}</span>
          </button>
        ))}
      </div>
      {Object.keys(waypoints).length > 0 && <pre className="simu-state-box">{JSON.stringify(waypoints, null, 2)}</pre>}
      </div>

      <div className="simu-card">
      <div className="simu-panel-title">Run From-To</div>
      <label className="simu-field">
        <span>From ID</span>
        <input className="simu-ws-input" value={state.runFromId} onChange={(e) => state.setRunFromId(e.target.value)} />
      </label>
      <label className="simu-field">
        <span>To ID</span>
        <input className="simu-ws-input" value={state.runToId} onChange={(e) => state.setRunToId(e.target.value)} />
      </label>
      <label className="simu-field">
        <span>Duration (s)</span>
        <input
          className="simu-ws-input"
          type="number"
          min={0.2}
          step={0.1}
          value={state.runDuration}
          onChange={(e) => state.setRunDuration(Number(e.target.value))}
        />
      </label>
      <label className="simu-field">
        <span>Interpolation</span>
        <select className="simu-ws-input" value={state.runProfile} onChange={(e) => state.setRunProfile(e.target.value)}>
          <option value="min_jerk">min_jerk</option>
          <option value="linear">linear</option>
          <option value="geodesic">geodesic</option>
        </select>
      </label>
      <div className="simu-panel-actions">
        <button className="ghostBtn small" disabled={busy} onClick={runFromTo}>Run Path</button>
        <button className="ghostBtn small" disabled={busy} onClick={stopNow}>Emergency Stop</button>
      </div>
      {Array.isArray(bridge.history) && bridge.history.length > 0 && (
        <pre className="simu-state-box">
          {JSON.stringify(bridge.history.slice(-20), null, 2)}
        </pre>
      )}
      {bridge.latestState && <pre className="simu-state-box">{JSON.stringify(bridge.latestState, null, 2)}</pre>}
      {bridge.busSnapshot && <pre className="simu-state-box">{JSON.stringify(bridge.busSnapshot, null, 2)}</pre>}
      </div>
    </>
  );
}

export function SimuRightPanel({ state, bridge }) {
  return (
    <aside className="simu-right-panel">
      {state.activeSection === 'joint' && <JointPanel state={state} />}
      {state.activeSection === 'trajectory' && <TrajectoryPanel state={state} />}
      {state.activeSection === 'scene' && <ScenePanel state={state} />}
      {state.activeSection === 'bridge' && <BridgePanel state={state} bridge={bridge} />}
    </aside>
  );
}
