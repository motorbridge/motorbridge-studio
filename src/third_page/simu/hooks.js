import React from 'react';
import { SimuWsBridge } from './wsBridge';

const LS_PRESETS_KEY = 'motorbridge_simu_joint_presets_v1';

export function useSimuState() {
  const [targets, setTargets] = React.useState(() =>
    Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`joint${i + 1}`, 0])),
  );
  const [resetViewSeq, setResetViewSeq] = React.useState(0);
  const [clearTrailSeq, setClearTrailSeq] = React.useState(0);
  const [replaySeq, setReplaySeq] = React.useState(0);
  const [replayStopSeq, setReplayStopSeq] = React.useState(0);
  const [trailColor, setTrailColor] = React.useState('#ff3b30');
  const [trailVisible, setTrailVisible] = React.useState(true);
  const [activeSection, setActiveSection] = React.useState('joint');
  const [replaySpeed, setReplaySpeed] = React.useState(1);
  const [exportTrailSeq, setExportTrailSeq] = React.useState(0);
  const [replayFinishSeq, setReplayFinishSeq] = React.useState(0);
  const [importedTrail, setImportedTrail] = React.useState(null);
  const [syncToWs, setSyncToWs] = React.useState(false);
  const [followWsState, setFollowWsState] = React.useState(true);
  const [waypointId, setWaypointId] = React.useState('P1');
  const [runFromId, setRunFromId] = React.useState('P1');
  const [runToId, setRunToId] = React.useState('P2');
  const [runDuration, setRunDuration] = React.useState(2.0);
  const [runProfile, setRunProfile] = React.useState('min_jerk');
  const [selectedWaypointId, setSelectedWaypointId] = React.useState('');
  const [editPose, setEditPose] = React.useState({ x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 });
  const [presets, setPresets] = React.useState(() => {
    try {
      const raw = localStorage.getItem(LS_PRESETS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });

  const setJoint = React.useCallback((idx, value) => {
    const key = `joint${idx + 1}`;
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    setTargets((prev) => ({ ...prev, [key]: v }));
  }, []);

  const setHome = React.useCallback(() => {
    setTargets(Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`joint${i + 1}`, 0])));
  }, []);

  const nudgeJoint = React.useCallback((idx, delta) => {
    const key = `joint${idx + 1}`;
    setTargets((prev) => {
      const cur = Number(prev[key] || 0);
      const next = Math.max(-3.14, Math.min(3.14, cur + delta));
      return { ...prev, [key]: next };
    });
  }, []);

  const randomPose = React.useCallback(() => {
    const next = {};
    for (let i = 0; i < 7; i += 1) next[`joint${i + 1}`] = (Math.random() * 2 - 1) * Math.PI;
    setTargets(next);
  }, []);

  const savePreset = React.useCallback(() => {
    const name = `Preset ${presets.length + 1}`;
    const next = [...presets, { name, targets }];
    setPresets(next);
    try {
      localStorage.setItem(LS_PRESETS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, [presets, targets]);

  const loadPreset = React.useCallback((idx) => {
    const p = presets[idx];
    if (!p?.targets) return;
    setTargets(p.targets);
  }, [presets]);

  const deletePreset = React.useCallback((idx) => {
    const next = presets.filter((_, i) => i !== idx);
    setPresets(next);
    try {
      localStorage.setItem(LS_PRESETS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, [presets]);

  const importTrailFile = React.useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(String(reader.result || '{}'));
        if (Array.isArray(json?.points)) {
          setImportedTrail({ points: json.points });
        }
      } catch {
        // ignore malformed file
      }
    };
    reader.readAsText(file);
  }, []);

  const resetWorkspace = React.useCallback(() => {
    setTargets(Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`joint${i + 1}`, 0])));
    setResetViewSeq((x) => x + 1);
    setClearTrailSeq((x) => x + 1);
    setReplaySeq(0);
    setReplayStopSeq(0);
    setReplayFinishSeq(0);
    setImportedTrail(null);
    setReplaySpeed(1);
    setTrailVisible(true);
    setTrailColor('#ff3b30');
  }, []);

  const clearPresets = React.useCallback(() => {
    setPresets([]);
    try {
      localStorage.removeItem(LS_PRESETS_KEY);
    } catch {
      // ignore
    }
  }, []);

  const captureScreenshot = React.useCallback(() => {
    const canvas = document.querySelector('.simu-view-fill canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    a.download = `simu_screenshot_${ts}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  }, []);

  return {
    targets,
    setTargets,
    setJoint,
    setHome,
    randomPose,
    resetViewSeq,
    setResetViewSeq,
    clearTrailSeq,
    setClearTrailSeq,
    replaySeq,
    setReplaySeq,
    replayStopSeq,
    setReplayStopSeq,
    trailColor,
    setTrailColor,
    trailVisible,
    setTrailVisible,
    activeSection,
    setActiveSection,
    replaySpeed,
    setReplaySpeed,
    exportTrailSeq,
    setExportTrailSeq,
    replayFinishSeq,
    setReplayFinishSeq,
    importedTrail,
    setImportedTrail,
    nudgeJoint,
    presets,
    savePreset,
    loadPreset,
    deletePreset,
    importTrailFile,
    syncToWs,
    setSyncToWs,
    resetWorkspace,
    clearPresets,
    followWsState,
    setFollowWsState,
    captureScreenshot,
    waypointId,
    setWaypointId,
    runFromId,
    setRunFromId,
    runToId,
    setRunToId,
    runDuration,
    setRunDuration,
    runProfile,
    setRunProfile,
    selectedWaypointId,
    setSelectedWaypointId,
    editPose,
    setEditPose,
    setEditPoseField: (k, v) => setEditPose((prev) => ({ ...prev, [k]: Number(v) || 0 })),
    setEditPoseFromCurrent: (p) => setEditPose({
      x: Number(p?.x || 0), y: Number(p?.y || 0), z: Number(p?.z || 0),
      roll: Number(p?.roll || 0), pitch: Number(p?.pitch || 0), yaw: Number(p?.yaw || 0),
    }),
    waypointList: [],
    selectWaypoint: () => {},
  };
}

export function useSimuBridge() {
  const [url, setUrl] = React.useState('ws://127.0.0.1:9011/ws');
  const [bridgeMsg, setBridgeMsg] = React.useState('waiting');
  const [status, setStatus] = React.useState({ connected: false, phase: 'idle' });
  const bridgeRef = React.useRef(null);
  const [latestState, setLatestState] = React.useState(null);
  const [history, setHistory] = React.useState([]);
  const [busSnapshot, setBusSnapshot] = React.useState(null);
  const [taskEvent, setTaskEvent] = React.useState(null);

  React.useEffect(() => {
    const bridge = new SimuWsBridge({
      url,
      onStatus: setStatus,
      onState: setLatestState,
      onLog: setBridgeMsg,
      onPacket: (item) => {
        setHistory((prev) => [...prev.slice(-199), item]);
      },
      onTask: setTaskEvent,
    });
    bridgeRef.current = bridge;
    bridge.autoReconnect = true;
    // auto connect by default, this page is intended for ws-assisted simulation.
    bridge.connect();
    return () => {
      bridge.disconnect(true);
      bridgeRef.current = null;
    };
  }, []);

  const connectWs = React.useCallback(() => {
    const b = bridgeRef.current;
    if (!b) return;
    b.autoReconnect = true;
    b.setUrl(url);
    b.connect();
  }, [url]);

  const disconnectWs = React.useCallback(() => {
    bridgeRef.current?.disconnect(true);
  }, []);

  const send = React.useCallback((op, payload = {}, timeoutMs = 2500) => {
    const b = bridgeRef.current;
    if (!b) return Promise.reject(new Error('bridge unavailable'));
    return b.send(op, payload, timeoutMs);
  }, []);

  const ping = React.useCallback(async () => {
    try {
      const ret = await send('ping', {}, 2000);
      setBridgeMsg(ret?.ok ? 'ws ready' : `ws reply err: ${ret?.error || 'unknown'}`);
    } catch (e) {
      setBridgeMsg(`ws error: ${e?.message || e}`);
    }
  }, [send]);

  const addWaypoint = React.useCallback(async (id, pose) => {
    return send('waypoint_add', { id, pose }, 2000);
  }, [send]);
  const removeWaypoint = React.useCallback(async (id) => {
    return send('waypoint_remove', { id }, 2000);
  }, [send]);
  const clearWaypoints = React.useCallback(async () => {
    return send('waypoint_clear', {}, 2000);
  }, [send]);
  const updateWaypoint = React.useCallback(async (id, pose) => {
    return send('waypoint_update', { id, pose }, 2000);
  }, [send]);
  const runWaypoints = React.useCallback(async (fromId, toId, durationS, profile = 'min_jerk') => {
    return send('sim_run_waypoints', { from_id: fromId, to_id: toId, duration_s: durationS, profile }, 2500);
  }, [send]);
  const stopMotion = React.useCallback(async () => {
    return send('sim_stop', {}, 1200);
  }, [send]);

  const fetchBusSnapshot = React.useCallback(async () => {
    try {
      const ret = await send('bus_snapshot', { limit: 30 }, 2200);
      if (ret?.ok) setBusSnapshot(ret.data || null);
      else setBridgeMsg(`bus snapshot err: ${ret?.error || 'unknown'}`);
    } catch (e) {
      setBridgeMsg(`bus snapshot ws error: ${e?.message || e}`);
    }
  }, [send]);

  return {
    connected: Boolean(status?.connected),
    phase: status?.phase || 'idle',
    phaseLabel:
      status?.phase === 'connected'
        ? 'Connected'
        : status?.phase === 'connecting'
          ? 'Connecting'
          : status?.phase === 'reconnecting'
            ? `Reconnecting (${Math.ceil((status?.delayMs || 0) / 1000)}s)`
            : 'Disconnected',
    url,
    setUrl,
    connectWs,
    disconnectWs,
    send,
    latestState,
    history,
    busSnapshot,
    fetchBusSnapshot,
    addWaypoint,
    removeWaypoint,
    clearWaypoints,
    updateWaypoint,
    runWaypoints,
    stopMotion,
    clearHistory: () => setHistory([]),
    bridgeMsg,
    ping,
    taskEvent,
  };
}
