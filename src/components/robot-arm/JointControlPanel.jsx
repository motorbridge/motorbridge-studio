import React from 'react';
import { useI18n } from '../../i18n';
import { toHex } from '../../lib/utils';

function modeDefaultsForRow(row, nextMode) {
  const joint = Number(row?.joint);
  if (nextMode === 'mit') {
    if (joint === 7) {
      return { mode: nextMode, kp: '6.0', kd: '0.2', tau: '0.0' };
    }
    return { mode: nextMode, kp: '12.0', kd: '0.5', tau: '0.0' };
  }
  if (nextMode === 'pos_vel') {
    return { mode: nextMode, vlim: '1.0' };
  }
  if (nextMode === 'vel') {
    return { mode: nextMode };
  }
  if (nextMode === 'force_pos') {
    return { mode: nextMode, vlim: '1.0' };
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
  jointLimit,
  setUiPref,
  controlMotor,
  refreshMotorState,
  clampTargetForRow,
  setLimitWarn,
  showLimitToast,
}) {
  const { t } = useI18n();
  if (!activeRow) return null;
  const vendor = String(activeRow?.hit?.vendor || '').toLowerCase();
  const mode = String(activeRow?.control?.mode || 'pos_vel');
  const modeOptions = vendor === 'robstride' ? ['pos_vel', 'mit', 'vel'] : ['pos_vel', 'mit', 'vel', 'force_pos'];
  const vlimDisabled = mode !== 'pos_vel' && mode !== 'force_pos';
  const tauDisabled = mode !== 'mit';
  const kpDisabled = mode !== 'mit';
  const kdDisabled = mode !== 'mit';
  return (
    <div className="armControlPanel">
      <div className="sectionTitle armPaneTitle">
        <h2>
          {t('arm_right_control')} · {t('joint')} {activeRow.joint}
        </h2>
        <span className="tip">
          ESC {toHex(activeRow.hit.esc_id)} / MST {toHex(activeRow.hit.mst_id)}
        </span>
      </div>

      <div className="grid3 tight armFields">
        <div className="field">
          <label>{t('mode')}</label>
          <select
            value={activeRow.control.mode}
            onChange={(e) => patchControl(activeRow.key, modeDefaultsForRow(activeRow, e.target.value))}
          >
            {modeOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('vlim')}</label>
          <input
            value={activeRow.control.vlim}
            disabled={vlimDisabled}
            onChange={(e) => patchControl(activeRow.key, { vlim: e.target.value })}
          />
        </div>
        <div className="field">
          <label>{t('tau')}</label>
          <input
            value={activeRow.control.tau}
            disabled={tauDisabled}
            onChange={(e) => patchControl(activeRow.key, { tau: e.target.value })}
          />
        </div>
        <div className="field">
          <label>{t('kp')}</label>
          <input
            value={activeRow.control.kp}
            disabled={kpDisabled}
            onChange={(e) => patchControl(activeRow.key, { kp: e.target.value })}
          />
        </div>
        <div className="field">
          <label>{t('kd')}</label>
          <input
            value={activeRow.control.kd}
            disabled={kdDisabled}
            onChange={(e) => patchControl(activeRow.key, { kd: e.target.value })}
          />
        </div>
        <div className="field">
          <label>{t('target')}</label>
          <input
            value={activeRow.control.target}
            onChange={(e) => onSliderTargetChange(e.target.value)}
          />
        </div>
      </div>

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
          onChange={(e) => onSliderTargetChange(e.target.value)}
        />
        <div className="armSliderMeta">
          <label className="armLiveToggle">
            <input
              type="checkbox"
              checked={liveMove}
              disabled={perJointBusy || mode === 'mit'}
              onChange={(e) => setUiPref('armSliderLiveMove', e.target.checked)}
            />
            <span>{t('arm_live_move')}</span>
          </label>
          <span>{liveMove ? t('arm_live_move_on') : t('arm_live_move_off')}</span>
        </div>
        <div className="armSliderMeta">
          <span>
            {t('arm_pos_range_hint')}: {jointLimit(activeRow.joint).min.toFixed(2)} ..{' '}
            {jointLimit(activeRow.joint).max.toFixed(2)}
          </span>
          <input
            className="armPosInput"
            value={activeRow.control.target}
            disabled={perJointBusy}
            onChange={(e) => onSliderTargetChange(e.target.value)}
          />
        </div>
        {limitWarn && <div className="tip warnText">{limitWarn}</div>}
        {vendor === 'damiao' && Number(activeRow.joint) === 7 && activeRow.control.mode === 'mit' && (
          <div className="tip warnText">{t('arm_joint7_mit_warn')}</div>
        )}
      </div>

      <div className="row toolbar compactToolbar">
        <button disabled={perJointBusy} onClick={() => controlMotor(activeRow.hit, 'enable')}>
          {t('enable')}
        </button>
        <button disabled={perJointBusy} onClick={() => controlMotor(activeRow.hit, 'disable')}>
          {t('disable')}
        </button>
        <button
          className="primary"
          disabled={perJointBusy}
          onClick={() => {
            const checked = clampTargetForRow(activeRow, activeRow.control.target);
            if (checked.clipped) {
              const msg = t('arm_limit_blocked', {
                joint: activeRow.joint,
                req: checked.raw.toFixed(3),
                min: checked.lim.min.toFixed(3),
                max: checked.lim.max.toFixed(3),
                use: checked.clamped.toFixed(3),
              });
              setLimitWarn(msg);
              showLimitToast(msg);
              patchControl(activeRow.key, { target: String(checked.clamped) });
            } else {
              setLimitWarn('');
            }
            controlMotor(activeRow.hit, 'move', { target: String(checked.clamped) });
          }}
        >
          {t('move')}
        </button>
        <button disabled={perJointBusy} onClick={() => controlMotor(activeRow.hit, 'stop')}>
          {t('stop')}
        </button>
        <button disabled={perJointBusy} onClick={() => controlMotor(activeRow.hit, 'clear_error')}>
          {t('clear_error')}
        </button>
        <button disabled={perJointBusy} onClick={() => refreshMotorState(activeRow.hit)}>
          {t('refresh_state')}
        </button>
      </div>
    </div>
  );
}
