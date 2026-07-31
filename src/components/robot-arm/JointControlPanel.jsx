import React from 'react';
import { useI18n } from '../../i18n';
import { useConnectionContext } from '../../hooks/useMotorStudioContext';
import { modesForVendor } from '../../lib/wsCapabilities';
import { controlInputValue, toHex } from '../../lib/utils';

function modeDefaultsForRow(row, nextMode) {
  const joint = Number(row?.joint);
  if (nextMode === 'mit') {
    if (joint === 7) {
      return { mode: nextMode, kp: 6, kd: 0.2, tau: 0 };
    }
    return { mode: nextMode, kp: 12, kd: 0.5, tau: 0 };
  }
  if (nextMode === 'pos_vel' || nextMode === 'pos_vel_csp') {
    return { mode: nextMode, vlim: 1 };
  }
  if (nextMode === 'pos_vel_pp') {
    return { mode: nextMode, vlim: 1, acc: 10 };
  }
  if (nextMode === 'vel') {
    return { mode: nextMode };
  }
  if (nextMode === 'force_pos') {
    return { mode: nextMode, vlim: 1 };
  }
  return { mode: nextMode };
}

export function JointControlPanel({
  activeRow,
  perJointBusy,
  liveMove,
  sliderValue,
  limitWarn,
  patchControl,
  onSliderTargetChange,
  cancelLiveMove,
  jointLimit,
  setUiPref,
  controlMotor,
  refreshMotorState,
  moveOnce,
  runExclusive,
}) {
  const { t } = useI18n();
  const { gatewayCapabilities } = useConnectionContext();
  if (!activeRow) return null;
  const vendor = String(activeRow?.hit?.vendor || '').toLowerCase();
  const mode = String(activeRow?.control?.mode || 'pos_vel');
  const modeOptions = modesForVendor(gatewayCapabilities, vendor);
  const isRobstridePp = vendor === 'robstride' && mode === 'pos_vel_pp';
  const isRobstrideCsp = vendor === 'robstride' && mode === 'pos_vel_csp';
  const isRobstrideNativePosition = isRobstridePp || isRobstrideCsp;
  const vlimDisabled = mode !== 'pos_vel' && mode !== 'force_pos';
  const tauDisabled = mode !== 'mit';
  const kpDisabled = mode !== 'mit';
  const kdDisabled = mode !== 'mit';
  const positionSliderEnabled =
    mode === 'mit' ||
    mode === 'pos_vel' ||
    mode === 'pos_vel_pp' ||
    mode === 'pos_vel_csp' ||
    mode === 'force_pos';
  const liveMoveSupported = mode === 'pos_vel' || mode === 'pos_vel_csp' || mode === 'force_pos';
  const effectiveLiveMove = liveMoveSupported && liveMove;
  const targetLabelKey = mode === 'vel' ? 'target_vel' : 'target_pos';
  const patchNumber = (field) => (e) => {
    patchControl(activeRow.key, {
      [field]: e.target.value,
    });
  };
  const targetInputLabel = t(targetLabelKey);
  return (
    <div className="armControlPanel">
      <div className="sectionTitle armPaneTitle">
        <h2>
          {t('arm_right_control')} · {t('joint')} {activeRow.joint}
        </h2>
        <span className="tip">
          {t('esc_id')} {toHex(activeRow.hit.esc_id)} / {t('mst_id')} {toHex(activeRow.hit.mst_id)}
        </span>
      </div>

      <div className="grid3 tight armFields">
        <div className="field">
          <label>{t('mode')}</label>
          <select
            value={activeRow.control.mode}
            onChange={(e) => {
              cancelLiveMove();
              patchControl(activeRow.key, modeDefaultsForRow(activeRow, e.target.value));
            }}
          >
            {modeOptions.map((m) => (
              <option key={m} value={m}>
                {vendor === 'robstride' && m === 'pos_vel_pp'
                  ? t('robstride_mode_pp')
                  : vendor === 'robstride' && m === 'pos_vel_csp'
                    ? t('robstride_mode_csp')
                    : m}
              </option>
            ))}
          </select>
        </div>
        {isRobstrideNativePosition ? (
          <>
            <div className="field">
              <label>{targetInputLabel}</label>
              <input
                aria-label={targetInputLabel}
                value={controlInputValue(activeRow.control.target)}
                onChange={(e) => onSliderTargetChange(e.target.value)}
              />
            </div>
            <div className="field">
              <label>{t(isRobstridePp ? 'vel_max' : 'limit_spd')}</label>
              <input
                value={controlInputValue(activeRow.control.vlim)}
                onChange={patchNumber('vlim')}
              />
            </div>
            {isRobstridePp && (
              <div className="field">
                <label>{t('acc_set')}</label>
                <input
                  value={controlInputValue(activeRow.control.acc)}
                  onChange={patchNumber('acc')}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <div className="field">
              <label>{t('vlim')}</label>
              <input
                value={controlInputValue(activeRow.control.vlim)}
                disabled={vlimDisabled}
                onChange={patchNumber('vlim')}
              />
            </div>
            <div className="field">
              <label>{t('tau')}</label>
              <input
                value={controlInputValue(activeRow.control.tau)}
                disabled={tauDisabled}
                onChange={patchNumber('tau')}
              />
            </div>
            <div className="field">
              <label>{t('kp')}</label>
              <input
                value={controlInputValue(activeRow.control.kp)}
                disabled={kpDisabled}
                onChange={patchNumber('kp')}
              />
            </div>
            <div className="field">
              <label>{t('kd')}</label>
              <input
                value={controlInputValue(activeRow.control.kd)}
                disabled={kdDisabled}
                onChange={patchNumber('kd')}
              />
            </div>
            <div className="field">
              <label>{targetInputLabel}</label>
              <input
                aria-label={targetInputLabel}
                value={controlInputValue(activeRow.control.target)}
                onChange={(e) => onSliderTargetChange(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
      {isRobstridePp && <div className="tip">{t('robstride_pp_tip')}</div>}
      {isRobstrideCsp && <div className="tip">{t('robstride_csp_tip')}</div>}

      <div className="field armSliderWrap">
        <label>
          {t('arm_pos_slider')}: {sliderValue.toFixed(3)}
        </label>
        <input
          type="range"
          min={String(jointLimit(activeRow.joint).min)}
          max={String(jointLimit(activeRow.joint).max)}
          step="0.01"
          value={sliderValue}
          disabled={!positionSliderEnabled}
          onChange={(e) => onSliderTargetChange(e.target.value)}
        />
        <div className="armSliderMeta">
          <label className="armLiveToggle">
            <input
              type="checkbox"
              checked={effectiveLiveMove}
              disabled={perJointBusy || !liveMoveSupported}
              onChange={(e) => setUiPref('armSliderLiveMove', e.target.checked)}
            />
            <span>{t('arm_live_move')}</span>
          </label>
          <span>{effectiveLiveMove ? t('arm_live_move_on') : t('arm_live_move_off')}</span>
        </div>
        <div className="armSliderMeta">
          <span>
            {t('arm_pos_range_hint')}: {jointLimit(activeRow.joint).min.toFixed(2)} ..{' '}
            {jointLimit(activeRow.joint).max.toFixed(2)}
          </span>
          <input
            aria-label={t('arm_pos_slider')}
            className="armPosInput"
            value={controlInputValue(activeRow.control.target)}
            disabled={perJointBusy || !positionSliderEnabled}
            onChange={(e) => onSliderTargetChange(e.target.value)}
          />
        </div>
        {!positionSliderEnabled ? (
          <div className="tip">{t('general_target_slider_disabled')}</div>
        ) : !liveMoveSupported ? (
          <div className="tip">{t('general_target_slider_mit_live_disabled')}</div>
        ) : null}
        {limitWarn && <div className="tip warnText">{limitWarn}</div>}
        {vendor === 'damiao' &&
          Number(activeRow.joint) === 7 &&
          activeRow.control.mode === 'mit' && (
            <div className="tip warnText">{t('arm_joint7_mit_warn')}</div>
          )}
      </div>

      <div className="row toolbar compactToolbar">
        <button disabled={perJointBusy} onClick={() => controlMotor(activeRow.hit, 'enable')}>
          {t('enable')}
        </button>
        <button
          disabled={perJointBusy}
          title={vendor === 'robstride' ? t('robstride_disable_warning') : ''}
          onClick={() => runExclusive(() => controlMotor(activeRow.hit, 'disable'))}
        >
          {t('disable')}
        </button>
        <button className="primary" disabled={perJointBusy} onClick={() => moveOnce(activeRow)}>
          {t('move')}
        </button>
        <button
          disabled={perJointBusy}
          title={vendor === 'robstride' ? t('robstride_stop_hint') : ''}
          onClick={() => runExclusive(() => controlMotor(activeRow.hit, 'stop'))}
        >
          {t('stop')}
        </button>
        <button
          disabled={perJointBusy}
          onClick={() => runExclusive(() => controlMotor(activeRow.hit, 'clear_error'))}
        >
          {t('clear_error')}
        </button>
        <button disabled={perJointBusy} onClick={() => refreshMotorState(activeRow.hit)}>
          {t('refresh_state')}
        </button>
      </div>
      {vendor === 'robstride' && (
        <div className="tip warnText">{t('robstride_stop_disable_warning')}</div>
      )}
    </div>
  );
}
