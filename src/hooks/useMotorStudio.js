import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mergeHitsByVendor, motorKey, normalizeControlForHit, ts } from '../lib/utils';
import { mapParamStreamToHit, mapResponseToHit, modelForHit } from '../lib/motorStudioOps';
import { usePersistedState } from './usePersistedState';
import { useI18n } from '../i18n';
import { useConnectionState } from './useConnectionState';
import { usePreferences } from './usePreferences';
import { useScanState } from './useScanState';
import { useMotorControl } from './useMotorControl';
import { useRobotArmOps } from './useRobotArmOps';

const LS_HITS_KEY = 'motorbridge_studio_hits_v1';
const LS_CONTROLS_KEY = 'motorbridge_studio_controls_v1';
const LS_ACTIVE_MOTOR_KEY = 'motorbridge_studio_active_motor_v1';

function streamFrameMotorId(data) {
  const motorId = Number(data?.motor_id);
  if (Number.isFinite(motorId)) return motorId;
  if (String(data?.vendor) === 'robstride') {
    const deviceId = Number(data?.device_id);
    if (Number.isFinite(deviceId)) return deviceId;
  }
  return Number.NaN;
}

function streamFrameMatchesHit(data, hit) {
  if (!data || !hit) return false;
  if (data.vendor && String(data.vendor) !== String(hit.vendor)) return false;
  const motorId = streamFrameMotorId(data);
  const feedbackId = Number(data.feedback_id);
  if (!Number.isFinite(motorId) || !Number.isFinite(feedbackId)) return false;
  return Number(hit.esc_id) === motorId && Number(hit.mst_id) === feedbackId;
}

function findStreamHitIndex(prev, data, activeMotorKey) {
  const exact = prev.findIndex((h) => streamFrameMatchesHit(data, h));
  if (exact >= 0) return exact;

  const vendor = String(data?.vendor || '');
  const motorId = streamFrameMotorId(data);
  const candidates = vendor ? prev.filter((h) => String(h.vendor) === vendor) : prev;
  if (Number.isFinite(motorId)) {
    const byMotorId = candidates.filter((h) => Number(h.esc_id) === motorId);
    if (byMotorId.length === 1) {
      const key = motorKey(byMotorId[0]);
      return prev.findIndex((h) => motorKey(h) === key);
    }
  }

  // Legacy gateway state frames may omit ids. Only use the active-card fallback
  // when the stream cannot be confused with another card.
  if (activeMotorKey && candidates.length === 1) {
    return prev.findIndex((h) => motorKey(h) === activeMotorKey);
  }
  return -1;
}

function preserveParamStreamFields(hit, next) {
  if (!hit?.param_stream_values) return next;
  const preservedKeys =
    String(hit.vendor) === 'robstride'
      ? ['pos', 'vel', 'torq', 'iqf', 'vbus', 'status', 'status_name', 'feedback_source']
      : String(hit.vendor) === 'damiao'
        ? ['motor_pos', 'output_pos', 'vbus', 'status', 'pmax', 'vmax', 'tmax']
        : [];
  const preserved = {};
  preservedKeys.forEach((key) => {
    if (hit[key] !== undefined) preserved[key] = hit[key];
  });
  return { ...next, ...preserved, param_stream_values: hit.param_stream_values };
}

export function useMotorStudio() {
  const { t } = useI18n();
  const armParamOpBusyRef = useRef(false);

  const [hits, setHits] = usePersistedState(LS_HITS_KEY, [], (cached) =>
    Array.isArray(cached) ? cached : []
  );
  const [controls, setControls] = usePersistedState(LS_CONTROLS_KEY, {}, (cached) =>
    cached && typeof cached === 'object' ? cached : {}
  );
  const [activeMotorKey, setActiveMotorKey] = usePersistedState(
    LS_ACTIVE_MOTOR_KEY,
    '',
    (cached) => (typeof cached === 'string' ? cached : '')
  );

  const [selected, setSelected] = useState(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [stateSnapshot, setStateSnapshot] = useState('(no state yet)');
  const [logs, setLogs] = useState([]);
  const telemetryTargetRef = useRef('');
  const setTargetForRef = useRef(null);

  const pushLog = (msg, level = 'info') => {
    setLogs((prev) => [...prev, { t: ts(), msg, level }].slice(-500));
  };
  const pushLogRef = useRef(pushLog);
  pushLogRef.current = pushLog;

  const handleGatewayState = useCallback(
    (state) => {
      if (armParamOpBusyRef.current) return;
      setHits((prev) => {
        const index = findStreamHitIndex(prev, state, activeMotorKey);
        if (index < 0) return prev;
        const current = prev[index];
        if (state?.vendor && String(state.vendor) !== String(current.vendor)) return prev;
        const next = [...prev];
        next[index] = preserveParamStreamFields(current, mapResponseToHit(current, state));
        return next;
      });
    },
    [activeMotorKey, setHits]
  );

  const handleGatewayParams = useCallback(
    (data) => {
      if (armParamOpBusyRef.current) return;
      setHits((prev) => {
        const index = findStreamHitIndex(prev, data, activeMotorKey);
        if (index < 0) return prev;
        const current = prev[index];
        if (data?.vendor && String(data.vendor) !== String(current.vendor)) return prev;
        const next = [...prev];
        next[index] = mapParamStreamToHit(current, data);
        return next;
      });
    },
    [activeMotorKey, setHits]
  );

  const connectionState = useConnectionState({
    pushLog,
    setStateSnapshot,
    onGatewayState: handleGatewayState,
    onGatewayParams: handleGatewayParams,
  });
  useEffect(() => {
    setTargetForRef.current = connectionState.setTargetFor;
  }, [connectionState.setTargetFor]);
  const preferences = usePreferences();

  const scanState = useScanState({
    t,
    connected: connectionState.connected,
    scanTimeoutMs: connectionState.scanTimeoutMs,
    activeMotorKey,
    setActiveMotorKey,
    setHits,
    setControls,
    pushLog,
    closeBusQuietly: connectionState.closeBusQuietly,
    setTargetFor: connectionState.setTargetFor,
    sendCmd: connectionState.sendCmd,
  });

  const [armBulkBusyForControl, setArmBulkBusyForControl] = useState(false);
  const motorControl = useMotorControl({
    t,
    vendors: scanState.vendors,
    controls,
    setHits,
    setControls,
    pushLog,
    setTargetFor: connectionState.setTargetFor,
    sendCmd: connectionState.sendCmd,
    closeBusQuietly: connectionState.closeBusQuietly,
    armBulkBusy: armBulkBusyForControl,
    askConfirm: scanState.askConfirm,
  });

  const robotArmState = useRobotArmOps({
    connected: connectionState.connected,
    vendors: scanState.vendors,
    hits,
    setHits,
    controls,
    setControls,
    activeMotorKey,
    setActiveMotorKey,
    pushLog,
    controlMotor: motorControl.controlMotor,
    zeroMotor: motorControl.zeroMotor,
    probeMotor: motorControl.probeMotor,
    setTargetFor: connectionState.setTargetFor,
    sendCmd: connectionState.sendCmd,
    closeBusQuietly: connectionState.closeBusQuietly,
  });

  const damiaoArmTelemetryUnsupportedRef = useRef(false);
  const damiaoArmTelemetryItems = useMemo(
    () =>
      robotArmState.robotArmJointRows
        .filter((row) => String(row.hit?.vendor) === 'damiao' && row.hit?.online !== false)
        .map((row) => ({
          motor_id: Number(row.hit.esc_id),
          feedback_id: Number(row.hit.mst_id),
          model: modelForHit(row.hit, scanState.vendors),
        }))
        .filter((x) => Number.isFinite(x.motor_id) && Number.isFinite(x.feedback_id)),
    [robotArmState.robotArmJointRows, scanState.vendors]
  );
  const damiaoArmTelemetryItemsRef = useRef([]);
  damiaoArmTelemetryItemsRef.current = damiaoArmTelemetryItems;
  const damiaoArmTelemetrySignature = useMemo(
    () => damiaoArmTelemetryItems.map((x) => `${x.motor_id}:${x.feedback_id}:${x.model}`).join('|'),
    [damiaoArmTelemetryItems]
  );
  const gatewayConnected = connectionState.connected;
  const sendGatewayCmd = connectionState.sendCmd;
  const damiaoArmTelemetryPaused =
    scanState.scanBusy ||
    robotArmState.armBulkBusy ||
    robotArmState.armParamOpBusy ||
    robotArmState.armSelfCheckBusy;

  useEffect(() => {
    armParamOpBusyRef.current = Boolean(robotArmState.armParamOpBusy);
  }, [robotArmState.armParamOpBusy]);

  useEffect(() => {
    damiaoArmTelemetryUnsupportedRef.current = false;
  }, [damiaoArmTelemetrySignature, gatewayConnected]);

  useEffect(() => {
    if (
      !gatewayConnected ||
      !damiaoArmTelemetrySignature ||
      damiaoArmTelemetryPaused ||
      damiaoArmTelemetryUnsupportedRef.current
    ) {
      return undefined;
    }
    let cancelled = false;
    let running = false;

    const tick = async () => {
      if (cancelled || running || damiaoArmTelemetryUnsupportedRef.current) return;
      running = true;
      try {
        const ret = await sendGatewayCmd(
          'damiao_state_many',
          {
            vendor: 'damiao',
            items: damiaoArmTelemetryItemsRef.current.map(({ motor_id, feedback_id, model }) => ({
              motor_id,
              feedback_id,
              model,
            })),
            timeout_ms: 80,
          },
          5000
        );
        if (cancelled) return;
        if (!ret?.ok) {
          const err = ret?.error || 'damiao_state_many failed';
          if (String(err).includes('unsupported op')) {
            damiaoArmTelemetryUnsupportedRef.current = true;
            pushLogRef.current?.('damiao arm telemetry unavailable in current gateway', 'info');
          } else {
            pushLogRef.current?.(`damiao arm telemetry failed: ${err}`, 'err');
          }
          return;
        }
        const states = Array.isArray(ret?.data?.states) ? ret.data.states : [];
        if (states.length === 0) return;
        setHits((prev) => {
          const patches = [];
          for (const state of states) {
            if (!state?.has_value) continue;
            const hit = prev.find((h) => streamFrameMatchesHit(state, h));
            if (!hit) continue;
            patches.push(mapResponseToHit(hit, state));
          }
          return patches.length > 0 ? mergeHitsByVendor(prev, patches) : prev;
        });
      } catch (e) {
        pushLogRef.current?.(`damiao arm telemetry failed: ${e.message || e}`, 'err');
      } finally {
        running = false;
      }
    };

    tick();
    const timer = window.setInterval(tick, 700);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    damiaoArmTelemetryPaused,
    damiaoArmTelemetrySignature,
    gatewayConnected,
    sendGatewayCmd,
    setHits,
  ]);

  useEffect(() => {
    setArmBulkBusyForControl(robotArmState.armBulkBusy);
  }, [robotArmState.armBulkBusy]);

  useEffect(() => {
    if (!activeMotorKey) return;
    const exists = hits.some((h) => motorKey(h) === activeMotorKey);
    if (!exists) setActiveMotorKey('');
  }, [hits, activeMotorKey, setActiveMotorKey]);

  const selectedHits = useMemo(
    () => hits.filter((h) => selected.has(motorKey(h))),
    [hits, selected]
  );
  const activeMotor = useMemo(
    () => hits.find((h) => motorKey(h) === activeMotorKey) || null,
    [hits, activeMotorKey]
  );
  const activeControl = activeMotor
    ? normalizeControlForHit(activeMotor, controls[motorKey(activeMotor)])
    : null;
  const activeTelemetryKey = activeMotor ? motorKey(activeMotor) : '';
  const activeTelemetryVendor = String(activeMotor?.vendor || '');
  const activeTelemetryModel =
    activeMotor?.model ||
    scanState.vendors?.[activeMotor?.vendor]?.model ||
    activeMotor?.vendor ||
    '';
  const activeTelemetryEsc = Number(activeMotor?.esc_id ?? Number.NaN);
  const activeTelemetryMst = Number(activeMotor?.mst_id ?? Number.NaN);

  useEffect(() => {
    if (!connectionState.connected) {
      telemetryTargetRef.current = '';
      return;
    }
    if (!activeTelemetryKey) return;
    const key = `${activeTelemetryKey}:${activeTelemetryModel}`;
    if (telemetryTargetRef.current === key) return;
    telemetryTargetRef.current = key;
    setTargetForRef
      .current?.(
        activeTelemetryVendor,
        activeTelemetryModel,
        activeTelemetryEsc,
        activeTelemetryMst
      )
      .catch((e) => {
        telemetryTargetRef.current = '';
        pushLog(`telemetry target setup failed: ${e.message || e}`, 'err');
      });
  }, [
    activeTelemetryEsc,
    activeTelemetryKey,
    activeTelemetryModel,
    activeTelemetryMst,
    activeTelemetryVendor,
    connectionState.connected,
  ]);

  const clearLogs = () => setLogs([]);
  const clearOfflineMotors = useCallback(
    () => scanState.clearOfflineMotors(hits, setSelected),
    [hits, scanState]
  );
  const removeMotorCard = useCallback(
    (hit) => scanState.removeMotorCard(hit, setSelected),
    [scanState]
  );
  const clearDevices = useCallback(async () => {
    const cleared = await scanState.clearDevices();
    if (cleared) setSelected(new Set());
  }, [scanState]);

  const canAction = connectionState.connected && !scanState.scanBusy && !robotArmState.armBulkBusy;

  const connection = useMemo(
    () => ({
      wsUrl: connectionState.wsUrl,
      setWsUrl: connectionState.setWsUrl,
      channel: connectionState.channel,
      setChannel: connectionState.setChannel,
      scanTimeoutMs: connectionState.scanTimeoutMs,
      setScanTimeoutMs: connectionState.setScanTimeoutMs,
      connText: connectionState.connText,
      connected: connectionState.connected,
      targetTransport: connectionState.targetTransport,
      targetSerialPort: connectionState.targetSerialPort,
      gatewayCapabilities: connectionState.gatewayCapabilities,
      capabilitiesSource: connectionState.capabilitiesSource,
      connectWs: connectionState.connectWs,
      disconnectWs: connectionState.disconnectWs,
      sendCmd: connectionState.sendCmd,
      canAction,
    }),
    [connectionState, canAction]
  );

  const scan = useMemo(
    () => ({
      scanBusy: scanState.scanBusy,
      scanProgress: scanState.scanProgress,
      scanFoundFx: scanState.scanFoundFx,
      vendors: scanState.vendors,
      setVendors: scanState.setVendors,
      hits,
      selectedHits,
      activeMotor,
      activeControl,
      activeMotorKey,
      setActiveMotorKey,
      newCardKeys: scanState.newCardKeys,
      manualDraft: scanState.manualDraft,
      setManualDraft: scanState.setManualDraft,
      cardRefs: scanState.cardRefs,
      confirmDialog: scanState.confirmDialog,
      closeConfirmDialog: scanState.closeConfirmDialog,
      runScan: scanState.runScan,
      removeMotorCard,
      moveMotorCard: scanState.moveMotorCard,
      addManualCard: scanState.addManualCard,
      clearDevices,
      clearOfflineMotors,
    }),
    [
      activeControl,
      activeMotor,
      activeMotorKey,
      clearDevices,
      clearOfflineMotors,
      hits,
      removeMotorCard,
      scanState,
      selectedHits,
      setActiveMotorKey,
    ]
  );

  const control = useMemo(
    () => ({
      controls,
      patchControl: motorControl.patchControl,
      controlMotor: motorControl.controlMotor,
      zeroMotor: motorControl.zeroMotor,
      verifyHit: motorControl.verifyHit,
      setIdFor: motorControl.setIdFor,
      refreshMotorState: motorControl.refreshMotorState,
      runMotorOp: motorControl.runMotorOp,
      probeMotor: motorControl.probeMotor,
    }),
    [controls, motorControl]
  );

  const robotArm = useMemo(
    () => ({
      robotArmModel: robotArmState.robotArmModel,
      armScanBusy: robotArmState.armScanBusy,
      armScanProgress: robotArmState.armScanProgress,
      armBulkBusy: robotArmState.armBulkBusy,
      armParamOpBusy: robotArmState.armParamOpBusy,
      setArmParamOpBusy: robotArmState.setArmParamOpBusy,
      armSelfCheckBusy: robotArmState.armSelfCheckBusy,
      armSelfCheckProgress: robotArmState.armSelfCheckProgress,
      armSelfCheckReport: robotArmState.armSelfCheckReport,
      setRobotArmModel: robotArmState.setRobotArmModel,
      robotArmJointRows: robotArmState.robotArmJointRows,
      ensureRobotArmCards: robotArmState.ensureRobotArmCards,
      scanRobotArmJoint: robotArmState.scanRobotArmJoint,
      scanRobotArmAll: robotArmState.scanRobotArmAll,
      runRobotArmSelfCheck: robotArmState.runRobotArmSelfCheck,
      enableAllRobotArm: robotArmState.enableAllRobotArm,
      disableAllRobotArm: robotArmState.disableAllRobotArm,
      zeroAllRobotArm: robotArmState.zeroAllRobotArm,
      resetPoseRobotArm: robotArmState.resetPoseRobotArm,
      readRobotArmControlParams: robotArmState.readRobotArmControlParams,
      writeRobotArmControlParams: robotArmState.writeRobotArmControlParams,
    }),
    [robotArmState]
  );

  const logsDomain = useMemo(
    () => ({
      stateSnapshot,
      logs,
      clearLogs,
    }),
    [stateSnapshot, logs]
  );

  const workspace = useMemo(
    () => ({
      menuOpen,
      setMenuOpen,
    }),
    [menuOpen]
  );

  return useMemo(
    () => ({
      connection,
      scan,
      control,
      robotArm,
      preferences,
      logs: logsDomain,
      workspace,
    }),
    [connection, control, logsDomain, preferences, robotArm, scan, workspace]
  );
}
