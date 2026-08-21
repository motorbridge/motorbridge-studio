import React from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';
import {
  ROBOT_ARM_MODELS,
  ZERO_SAFE_EPS_RAD,
  jointLimitsForProfile,
  armVendorForProfile,
} from '../lib/robotArm';
import { parseNum } from '../lib/utils';
import { ArmUrdfViewer } from './ArmUrdfViewer';
import { ProgressBar } from './ProgressBar';
import {
  useConnectionContext,
  useControlContext,
  useDevContext,
  usePreferencesContext,
  useRobotArmContext,
} from '../hooks/useMotorStudioContext';
import { JointList } from './robot-arm/JointList';
import { JointControlPanel } from './robot-arm/JointControlPanel';
import { SelfCheckReport } from './robot-arm/SelfCheckReport';
import {
  armPreferredMode,
  clampByLimit,
  LiveMoveScheduler,
  ParamManager,
  SequenceManager,
  ToastManager,
  TrailManager,
  ZeroDialogManager,
} from './robot-arm/managers';

function FirstUseDialog({ open, onClose }) {
  const { t } = useI18n();
  if (!open) return null;
  return createPortal(
    <div className="armDialogMask" role="dialog" aria-modal="true">
      <div className="armDialogCard">
        <h3>{t('arm_first_use_title')}</h3>
        <p>{t('arm_first_use_intro')}</p>
        <ol className="armGuideList">
          <li>{t('arm_first_use_step_1')}</li>
          <li>{t('arm_first_use_step_2')}</li>
          <li>{t('arm_first_use_step_3')}</li>
          <li>{t('arm_first_use_step_4')}</li>
          <li>{t('arm_first_use_step_5')}</li>
        </ol>
        <div className="row toolbar compactToolbar">
          <button className="ghostBtn" onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function RobotArmToolbar({
  canAction,
  armToolbarBusy,
  robotArmModel,
  setRobotArmModel,
  scanRobotArmAll,
  detectRobotArmModel,
  runRobotArmSelfCheck,
  enableAllRobotArm,
  disableAllRobotArm,
  onZeroAllSafe,
  applyDefaultTemplate,
  exportParams,
  importParams,
  paramSupported,
  paramVendor,
  runDemo,
  stopDemo,
  demoAction,
  setDemoAction,
  demoBusy,
  onOpenFirstUse,
}) {
  const { t } = useI18n();
  const importFileRef = React.useRef(null);
  const onImportFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (f) importParams?.(f);
  };
  return (
    <>
      <div className="row toolbar compactToolbar armTopToolbar">
        <div className="field miniField">
          <label>{t('arm_model')}</label>
          <select value={robotArmModel} onChange={(e) => setRobotArmModel(e.target.value)}>
            {ROBOT_ARM_MODELS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <button
          className="ghostBtn"
          disabled={!canAction || armToolbarBusy}
          onClick={detectRobotArmModel}
          title={t('arm_auto_detect_hint')}
        >
          {t('arm_auto_detect')}
        </button>
        <button className="firstUseBtn" onClick={onOpenFirstUse}>
          {t('arm_first_use_btn')}
        </button>
        <button
          className="primary"
          disabled={!canAction || armToolbarBusy}
          onClick={scanRobotArmAll}
        >
          {t('arm_scan_all')}
        </button>
        <button
          className="ghostBtn"
          disabled={!canAction || armToolbarBusy}
          onClick={runRobotArmSelfCheck}
        >
          {t('arm_self_check')}
        </button>
        <button disabled={!canAction || armToolbarBusy} onClick={enableAllRobotArm}>
          {t('arm_enable_all')}
        </button>
        <button disabled={!canAction || armToolbarBusy} onClick={disableAllRobotArm}>
          {t('arm_disable_all')}
        </button>
        <button
          disabled={!canAction || armToolbarBusy}
          onClick={onZeroAllSafe}
          title={t('arm_zero_all_guard_hint')}
        >
          {t('arm_zero_all')}
        </button>
        <button
          disabled={!canAction || armToolbarBusy || !paramSupported}
          onClick={applyDefaultTemplate}
          title={paramSupported ? '' : t('arm_params_vendor_unsupported')}
        >
          {t('arm_apply_default_template')}
        </button>
        {paramVendor === 'robstride' && (
          <button
            disabled={!canAction || armToolbarBusy || !paramSupported}
            onClick={exportParams}
            title={paramSupported ? '' : t('arm_params_vendor_unsupported')}
          >
            {t('arm_export_params')}
          </button>
        )}
        {paramVendor === 'robstride' && (
          <>
            <button
              disabled={!canAction || armToolbarBusy || !paramSupported}
              onClick={() => importFileRef.current?.click()}
              title={
                paramSupported ? t('arm_import_params_hint') : t('arm_params_vendor_unsupported')
              }
            >
              {t('arm_import_params')}
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept=".tsv,.txt,text/tab-separated-values,text/plain"
              style={{ display: 'none' }}
              onChange={onImportFile}
            />
          </>
        )}
        <button
          style={{ display: 'none' }}
          disabled={!canAction || armToolbarBusy}
          onClick={runDemo}
        >
          {t('arm_demo_btn')}
        </button>
        <button
          style={{ display: 'none' }}
          className="ghostBtn"
          disabled={!demoBusy}
          onClick={stopDemo}
        >
          {t('stop')}
        </button>
        <div className="field miniField" style={{ display: 'none' }}>
          <label>{t('arm_demo_list')}</label>
          <select
            value={demoAction}
            disabled={!canAction || armToolbarBusy}
            onChange={(e) => setDemoAction(e.target.value)}
          >
            <option value="safe_seq">{t('arm_demo_safe_seq')}</option>
            <option value="safe_seq_scan">{t('arm_demo_safe_seq_scan')}</option>
          </select>
        </div>
      </div>
      <div className="tip warnText">{t('arm_demo_beta_warn')}</div>
    </>
  );
}

function ArmSimPanel({ jointTargets, trail, gripperOpening, setGripperOpening, profile }) {
  const { t } = useI18n();
  return (
    <div className="armSimPanel">
      <div className="sectionTitle armPaneTitle">
        <h2>{t('arm_sim_title')}</h2>
      </div>
      <div className="armSimControls">
        <div className="armSimStatusRow">
          <span className="armModeChip">
            {t('arm_sim_mode_current', {
              mode: t('arm_sim_mode_trajectory'),
            })}
          </span>
          <div className="row compactToolbar">
            <button
              className="ghostBtn small"
              disabled={trail.urdfReplayBusy}
              onClick={() => trail.setUrdfClearTrailSeq((v) => v + 1)}
            >
              {t('arm_clear_traj')}
            </button>
            <button
              className="ghostBtn small"
              disabled={trail.urdfReplayBusy}
              onClick={() => trail.setUrdfExportTrailSeq((v) => v + 1)}
            >
              {t('arm_export_traj')}
            </button>
            <button
              className="ghostBtn small"
              disabled={trail.urdfReplayBusy}
              onClick={trail.openImportTrailDialog}
            >
              {t('arm_import_traj')}
            </button>
            <button
              className="ghostBtn small"
              disabled={!trail.urdfImportedTrail?.points?.length || trail.urdfReplayBusy}
              onClick={trail.replayImportedTrail}
            >
              {t('arm_replay_traj')}
            </button>
            <button
              className="ghostBtn small"
              disabled={trail.urdfReplayBusy}
              onClick={trail.saveCurrentSequenceToLibrary}
            >
              {t('arm_seq_save_current')}
            </button>
            <button
              className="ghostBtn small"
              disabled={trail.urdfReplayBusy || !trail.urdfSeqLibrary.length}
              onClick={() => trail.loadSelectedSequence({ replay: false })}
            >
              {t('arm_seq_load')}
            </button>
            <button
              className="ghostBtn small"
              disabled={trail.urdfReplayBusy || !trail.urdfSeqLibrary.length}
              onClick={() => trail.loadSelectedSequence({ replay: true })}
            >
              {t('arm_seq_replay_selected')}
            </button>
            <button
              className="ghostBtn small"
              disabled={trail.urdfReplayBusy || !trail.urdfSeqLibrary.length}
              onClick={trail.deleteSelectedSequence}
            >
              {t('arm_seq_delete')}
            </button>
            <button
              className="ghostBtn small"
              disabled={!trail.urdfReplayBusy}
              onClick={() => trail.setUrdfReplayStopSeq((v) => v + 1)}
            >
              {t('arm_replay_stop')}
            </button>
            <button
              className="ghostBtn small"
              disabled={!trail.urdfReplayBusy}
              onClick={() => trail.setUrdfReplayFinishSeq((v) => v + 1)}
            >
              {t('arm_replay_finish')}
            </button>
            <button
              className="ghostBtn small"
              disabled={trail.urdfReplayBusy}
              onClick={() => trail.setUrdfResetSeq((v) => v + 1)}
            >
              {t('arm_reset_view')}
            </button>
          </div>
        </div>
        <div className="armSimFieldRow">
          <label className="armSimField">
            <span>Gripper</span>
            <div className="armColorField">
              <input
                type="range"
                min="0"
                max="0.0515"
                step="0.0005"
                disabled={trail.urdfReplayBusy}
                value={gripperOpening}
                onChange={(e) =>
                  setGripperOpening(Math.max(0, Math.min(0.0515, Number(e.target.value) || 0)))
                }
              />
              <code>{Number(gripperOpening || 0).toFixed(4)} m</code>
            </div>
          </label>
          <label className="armSimField">
            <span>{t('arm_traj_visible')}</span>
            <select
              disabled={trail.urdfReplayBusy}
              value={trail.urdfTrailVisible ? 'show' : 'hide'}
              onChange={(e) => trail.setUrdfTrailVisible(e.target.value === 'show')}
            >
              <option value="show">{t('arm_traj_show')}</option>
              <option value="hide">{t('arm_traj_hide')}</option>
            </select>
          </label>
          <label className="armSimField">
            <span>{t('arm_seq_library')}</span>
            <select
              disabled={trail.urdfReplayBusy || !trail.urdfSeqLibrary.length}
              value={trail.urdfSeqPick}
              onChange={(e) => trail.setUrdfSeqPick(e.target.value)}
            >
              {!trail.urdfSeqLibrary.length && <option value="">{t('arm_seq_none')}</option>}
              {trail.urdfSeqLibrary.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label className="armSimField">
            <span>{t('arm_traj_style')}</span>
            <select
              disabled={trail.urdfReplayBusy}
              value={trail.urdfTrailStyle}
              onChange={(e) => trail.setUrdfTrailStyle(e.target.value)}
            >
              <option value="multi">{t('arm_traj_style_multi')}</option>
              <option value="mono">{t('arm_traj_style_mono')}</option>
            </select>
          </label>
          <label className="armSimField">
            <span>{t('arm_traj_color')}</span>
            <div className="armColorField">
              <input
                type="color"
                disabled={trail.urdfReplayBusy}
                value={trail.urdfTrailColor}
                title={t('arm_traj_color')}
                onChange={(e) => trail.setUrdfTrailColor(e.target.value)}
              />
              <code>{String(trail.urdfTrailColor || '').toUpperCase()}</code>
            </div>
          </label>
          <label className="armSimField">
            <span>{t('arm_replay_speed')}</span>
            <div className="armColorField">
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.1"
                value={trail.urdfReplaySpeed}
                onChange={(e) => trail.setUrdfReplaySpeed(Number(e.target.value) || 1)}
              />
              <code>{trail.urdfReplaySpeed.toFixed(1)}x</code>
            </div>
          </label>
        </div>
      </div>
      <p className="tip armSimDesc">{t('arm_sim_desc')}</p>
      {trail.urdfImportInfo && <p className="tip">{trail.urdfImportInfo}</p>}
      <ArmUrdfViewer
        jointTargets={jointTargets}
        profile={profile}
        resetViewSeq={trail.urdfResetSeq}
        clearTrailSeq={trail.urdfClearTrailSeq}
        exportTrailSeq={trail.urdfExportTrailSeq}
        replaySeq={trail.urdfReplaySeq}
        replayStopSeq={trail.urdfReplayStopSeq}
        replayFinishSeq={trail.urdfReplayFinishSeq}
        replaySpeed={trail.urdfReplaySpeed}
        importedTrail={trail.urdfImportedTrail}
        simMode={trail.urdfSimMode}
        trailStyle={trail.urdfTrailStyle}
        trailColor={trail.urdfTrailColor}
        trailVisible={trail.urdfTrailVisible}
        onReplayStateChange={trail.setUrdfReplayBusy}
      />
    </div>
  );
}

// Per-profile joint7(rad) -> gripper opening(m) mapping.
// dm:  joint7 in [-5.7, 0]   -> 0 ~ 0.0515 m (0 = open, -5.7 = closed)
// rs:  joint7 in [0, 4.71]   -> 0 ~ 0.05   m (0 = closed, 4.71 = open)
const GRIPPER_MAP = {
  damiao: { joint7Min: -5.7, joint7Max: 0, openingMax: 0.0515 },
  robstride: { joint7Min: 0, joint7Max: 4.71, openingMax: 0.05 },
};

function mapJoint7ToGripperOpening(joint7Raw, { joint7Min, joint7Max, openingMax }) {
  const joint7 = Number(joint7Raw);
  if (!Number.isFinite(joint7)) return 0;
  const span = joint7Max - joint7Min;
  if (!span) return 0;
  const t = (Math.max(joint7Min, Math.min(joint7Max, joint7)) - joint7Min) / span;
  return t * openingMax;
}

export function RobotArmPage() {
  const { t } = useI18n();
  const { devMode } = useDevContext();
  const { connected, canAction, sendCmd } = useConnectionContext();
  const { uiPrefs, setUiPref } = usePreferencesContext();
  const { patchControl, controlMotor, zeroMotor, refreshMotorState } = useControlContext();
  const {
    robotArmModel,
    armScanBusy,
    armScanProgress,
    armBulkBusy,
    setArmParamOpBusy,
    armSelfCheckBusy,
    armSelfCheckProgress,
    armSelfCheckReport,
    setRobotArmModel,
    robotArmJointRows,
    scanRobotArmJoint,
    scanRobotArmAll,
    detectRobotArmModel,
    runRobotArmSelfCheck,
    enableAllRobotArm,
    disableAllRobotArm,
    zeroAllRobotArm,
    resetPoseRobotArm,
    readRobotArmControlParams,
    writeRobotArmControlParams,
    exportRobstrideParams,
    importRobstrideParams,
  } = useRobotArmContext();
  const [activeJointKey, setActiveJointKey] = React.useState('');
  const [limitWarn, setLimitWarn] = React.useState('');
  const [limitToast, setLimitToast] = React.useState({ visible: false, message: '', seq: 0 });
  const [demoToast, setDemoToast] = React.useState({
    visible: false,
    seq: 0,
    tone: 'info',
    title: '',
    detail: '',
  });
  const [firstUseOpen, setFirstUseOpen] = React.useState(false);
  const [gripperOpening, setGripperOpening] = React.useState(0);
  const rowsRef = React.useRef(robotArmJointRows);
  const controlSyncSignatureRef = React.useRef('');
  const jointLimits = React.useMemo(() => jointLimitsForProfile(robotArmModel), [robotArmModel]);

  React.useEffect(() => {
    rowsRef.current = robotArmJointRows;
  }, [robotArmJointRows]);

  React.useEffect(() => {
    if (!robotArmJointRows.length) return;
    const syncSignature = `${robotArmModel}:${robotArmJointRows.map((row) => row.key).join('|')}`;
    if (controlSyncSignatureRef.current === syncSignature) return;
    robotArmJointRows.forEach((row) => {
      const lim = jointLimits[Number(row.joint)] || { min: -3.14, max: 3.14 };
      const rawPos = Number(row?.hit?.pos);
      const synced = row?.hit?.online && Number.isFinite(rawPos) ? clampByLimit(rawPos, lim) : 0;
      patchControl(row.key, {
        mode: armPreferredMode(),
        vlim: 1,
        tau: 0,
        kp: 30,
        kd: 1,
        target: synced,
      });
    });
    controlSyncSignatureRef.current = syncSignature;
  }, [jointLimits, robotArmJointRows, patchControl, robotArmModel]);

  React.useEffect(() => {
    if (robotArmJointRows.length === 0) return;
    if (!activeJointKey) {
      setActiveJointKey(robotArmJointRows[0].key);
      return;
    }
    const exists = robotArmJointRows.some((x) => x.key === activeJointKey);
    if (!exists) setActiveJointKey(robotArmJointRows[0].key);
  }, [robotArmJointRows, activeJointKey]);

  React.useEffect(() => {
    setLimitWarn('');
  }, [activeJointKey]);

  React.useEffect(() => {
    if (!limitToast.visible) return undefined;
    const timer = setTimeout(() => {
      setLimitToast((prev) => ({ ...prev, visible: false }));
    }, 2600);
    return () => clearTimeout(timer);
  }, [limitToast]);

  const showLimitToast = React.useCallback((message) => {
    setLimitToast((prev) => ({ visible: true, message, seq: prev.seq + 1 }));
  }, []);

  const activeRow = React.useMemo(
    () => robotArmJointRows.find((x) => x.key === activeJointKey) || robotArmJointRows[0] || null,
    [robotArmJointRows, activeJointKey]
  );

  const liveMove = Boolean(uiPrefs?.armSliderLiveMove);
  const onlineCount = React.useMemo(
    () => robotArmJointRows.filter((row) => Boolean(row?.hit?.online)).length,
    [robotArmJointRows]
  );

  return (
    <section className="card glass">
      <ToastManager limitToast={limitToast} demoToast={demoToast}>
        <FirstUseDialog open={firstUseOpen} onClose={() => setFirstUseOpen(false)} />
        <div className="sectionTitle">
          <h2>{t('robot_arm_title')}</h2>
          <span className="tip">{t('robot_arm_desc')}</span>
        </div>

        {!connected && <div className="offlineBanner">{t('ws_disconnected_motor')}</div>}

        <ZeroDialogManager
          robotArmJointRows={robotArmJointRows}
          refreshMotorState={refreshMotorState}
          zeroAllRobotArm={zeroAllRobotArm}
          setLimitWarn={setLimitWarn}
          showLimitToast={showLimitToast}
          limits={jointLimits}
        >
          {(zero) => (
            <TrailManager>
              {(trail) => (
                <SequenceManager
                  rowsRef={rowsRef}
                  demoToast={demoToast}
                  setDemoToast={setDemoToast}
                  scanRobotArmAll={scanRobotArmAll}
                  enableAllRobotArm={enableAllRobotArm}
                  patchControl={patchControl}
                  controlMotor={controlMotor}
                  limits={jointLimits}
                >
                  {(sequence) => {
                    const armToolbarBusy =
                      armBulkBusy ||
                      armScanBusy ||
                      armSelfCheckBusy ||
                      trail.urdfReplayBusy ||
                      zero.zeroCheckBusy ||
                      sequence.demoBusy;
                    return (
                      <ParamManager
                        robotArmModel={robotArmModel}
                        robotArmJointRows={robotArmJointRows}
                        readRobotArmControlParams={readRobotArmControlParams}
                        writeRobotArmControlParams={writeRobotArmControlParams}
                        exportRobstrideParams={exportRobstrideParams}
                        importRobstrideParams={importRobstrideParams}
                        devMode={devMode}
                        sendCmd={sendCmd}
                        setArmParamOpBusy={setArmParamOpBusy}
                        askZeroConfirm={zero.askZeroConfirm}
                        canAction={canAction}
                        armToolbarBusy={armToolbarBusy}
                      >
                        {(params) => {
                          const toolbarBusy = armToolbarBusy || params.paramBusy;
                          const perJointBusy =
                            armBulkBusy || params.paramBusy || trail.urdfReplayBusy;
                          const sliderValue = activeRow
                            ? clampByLimit(
                                parseNum(activeRow.control.target, 0),
                                zero.jointLimit(activeRow.joint)
                              )
                            : 0;
                          const jointTargets = {};
                          robotArmJointRows.forEach((row) => {
                            jointTargets[`joint${row.joint}`] = clampByLimit(
                              parseNum(row.control.target, 0),
                              zero.jointLimit(row.joint)
                            );
                          });
                          const joint7Target = Number(jointTargets.joint7);
                          const gripperMap =
                            GRIPPER_MAP[armVendorForProfile(robotArmModel)] || GRIPPER_MAP.damiao;
                          const linkedGripperOpening = mapJoint7ToGripperOpening(
                            joint7Target,
                            gripperMap
                          );
                          const effectiveGripperOpening = Number.isFinite(joint7Target)
                            ? linkedGripperOpening
                            : Number(gripperOpening) || 0;
                          jointTargets.gripper_joint1 = effectiveGripperOpening;
                          jointTargets.gripper_joint2 = effectiveGripperOpening;

                          return (
                            <>
                              <RobotArmToolbar
                                canAction={canAction}
                                armToolbarBusy={toolbarBusy}
                                robotArmModel={robotArmModel}
                                setRobotArmModel={setRobotArmModel}
                                scanRobotArmAll={scanRobotArmAll}
                                detectRobotArmModel={detectRobotArmModel}
                                runRobotArmSelfCheck={runRobotArmSelfCheck}
                                enableAllRobotArm={enableAllRobotArm}
                                disableAllRobotArm={disableAllRobotArm}
                                resetPoseRobotArm={resetPoseRobotArm}
                                onZeroAllSafe={zero.onZeroAllSafe}
                                applyDefaultTemplate={params.applyDefaultTemplate}
                                exportParams={params.exportParams}
                                importParams={params.importParams}
                                paramSupported={params.paramSupported}
                                paramVendor={params.paramVendor}
                                runDemo={sequence.runDemo}
                                stopDemo={sequence.stopDemo}
                                demoAction={sequence.demoAction}
                                setDemoAction={sequence.setDemoAction}
                                demoBusy={sequence.demoBusy}
                                onOpenFirstUse={() => setFirstUseOpen(true)}
                              />
                              {params.paramProgressBar}
                              {params.paramTable}

                              <ProgressBar
                                active={armScanBusy || armScanProgress?.active}
                                progress={armScanProgress}
                              />

                              {armBulkBusy && <div className="tip">{t('arm_bulk_busy')}</div>}
                              <ProgressBar
                                active={armSelfCheckBusy || armSelfCheckProgress?.active}
                                progress={armSelfCheckProgress}
                                fallbackLabel={t('arm_self_check_running')}
                              />
                              <SelfCheckReport report={armSelfCheckReport} />
                              {onlineCount > 0 && onlineCount < robotArmJointRows.length && (
                                <div className="tip">
                                  {t('arm_demo_online_hint', {
                                    online: onlineCount,
                                    total: robotArmJointRows.length,
                                  })}
                                </div>
                              )}
                              {!zero.zeroSafety.ok && (
                                <div className="tip warnText">
                                  {t('arm_zero_all_guard_hint')} -{' '}
                                  {t('arm_zero_all_blocked', {
                                    joints: zero.zeroSafety.notReady
                                      .map((x) => `J${x.joint}`)
                                      .join(', '),
                                    eps: ZERO_SAFE_EPS_RAD.toFixed(2),
                                  })}
                                </div>
                              )}

                              <div className="armStudio">
                                <JointList
                                  robotArmJointRows={robotArmJointRows}
                                  activeRowKey={activeRow?.key}
                                  onSelect={setActiveJointKey}
                                  connected={connected}
                                  scanRobotArmJoint={scanRobotArmJoint}
                                  refreshMotorState={refreshMotorState}
                                  zeroMotor={zeroMotor}
                                />

                                <LiveMoveScheduler
                                  activeRow={activeRow}
                                  liveMove={liveMove}
                                  connected={connected}
                                  armBulkBusy={armBulkBusy}
                                  controlMotor={controlMotor}
                                  refreshMotorState={refreshMotorState}
                                  patchControl={patchControl}
                                  setLimitWarn={setLimitWarn}
                                  showLimitToast={showLimitToast}
                                  limits={jointLimits}
                                >
                                  {(live) => (
                                    <div className="armRightPane">
                                      <JointControlPanel
                                        activeRow={activeRow}
                                        perJointBusy={perJointBusy}
                                        liveMove={liveMove}
                                        sliderValue={sliderValue}
                                        limitWarn={limitWarn}
                                        patchControl={patchControl}
                                        onSliderTargetChange={live.onSliderTargetChange}
                                        cancelLiveMove={live.cancelLiveMove}
                                        jointLimit={zero.jointLimit}
                                        setUiPref={setUiPref}
                                        controlMotor={controlMotor}
                                        refreshMotorState={refreshMotorState}
                                        moveOnce={live.moveOnce}
                                        runExclusive={live.runExclusive}
                                      />

                                      <ArmSimPanel
                                        jointTargets={jointTargets}
                                        trail={trail}
                                        gripperOpening={gripperOpening}
                                        setGripperOpening={setGripperOpening}
                                        profile={armVendorForProfile(robotArmModel)}
                                      />
                                    </div>
                                  )}
                                </LiveMoveScheduler>
                              </div>
                            </>
                          );
                        }}
                      </ParamManager>
                    );
                  }}
                </SequenceManager>
              )}
            </TrailManager>
          )}
        </ZeroDialogManager>
      </ToastManager>
    </section>
  );
}
