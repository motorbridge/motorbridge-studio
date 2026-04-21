import React from 'react';
import { DAMIAO_RW_REGISTER_DEFS } from '../lib/appConfig';
import { SET_ID_VENDORS, VENDOR_LABELS } from '../lib/constants';
import { formatLocal, motorKey, toHex } from '../lib/utils';
import { useI18n } from '../i18n';

function ModeSelect({ vendor, value, onChange }) {
  return (
    <select value={value} onChange={onChange}>
      {vendor === 'damiao' && (
        <>
          <option value="pos_vel">pos_vel</option>
          <option value="mit">mit</option>
          <option value="vel">vel</option>
          <option value="force_pos">force_pos</option>
        </>
      )}
      {vendor === 'robstride' && (
        <>
          <option value="mit">mit</option>
          <option value="vel">vel</option>
        </>
      )}
      {!['damiao', 'robstride'].includes(vendor) && <option value="vel">vel</option>}
    </select>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input value={value} onChange={onChange} />
    </div>
  );
}

function MetaItem({ label, value }) {
  return <div className="metaItem"><b>{label}</b> {value}</div>;
}

export function MotorDetailPanel({
  connected,
  activeMotor,
  activeControl,
  patchControl,
  controlMotor,
  zeroMotor,
  probeMotor,
  setIdFor,
  verifyHit,
  refreshMotorState,
  runMotorOp,
}) {
  const { t } = useI18n();
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [ensureMode, setEnsureMode] = React.useState('mit');
  const [ensureTimeoutMs, setEnsureTimeoutMs] = React.useState('1000');
  const [canTimeoutMs, setCanTimeoutMs] = React.useState('800');
  const [rid, setRid] = React.useState('24');
  const [regType, setRegType] = React.useState('f32');
  const [regValue, setRegValue] = React.useState('0');
  const [regReadValue, setRegReadValue] = React.useState('');
  const [rsParamId, setRsParamId] = React.useState('0x7017');
  const [rsParamType, setRsParamType] = React.useState('f32');
  const [rsParamValue, setRsParamValue] = React.useState('0');
  const [rsReadValue, setRsReadValue] = React.useState('');
  const [showLessCommonDamiaoRw, setShowLessCommonDamiaoRw] = React.useState(false);
  const [advancedRiskAccepted, setAdvancedRiskAccepted] = React.useState(false);
  const [opBusy, setOpBusy] = React.useState(false);

  if (!activeMotor || !activeControl) {
    return <div className="tip">{t('select_motor_tip')}</div>;
  }

  const key = motorKey(activeMotor);
  const patch = (field) => (e) => patchControl(key, { [field]: e.target.value });
  const vendor = String(activeMotor.vendor || '').toLowerCase();
  const commonDamiaoRw = DAMIAO_RW_REGISTER_DEFS.filter((x) => x.common);
  const lessCommonDamiaoRw = DAMIAO_RW_REGISTER_DEFS.filter((x) => !x.common);

  const basicKeys = new Set([
    'vendor',
    'model',
    'model_guess',
    'probe',
    'esc_id',
    'mst_id',
    'detected_by',
    'online',
    'status',
    'status_name',
    'pos',
    'vel',
    'torq',
    'pmax',
    'vmax',
    'tmax',
    'updated_at_ms',
    'last_check_ms',
  ]);
  const extraEntries = Object.entries(activeMotor).filter(([k]) => !basicKeys.has(k));

  const runOp = async (fn) => {
    if (opBusy || !connected) return;
    setOpBusy(true);
    try {
      await fn();
    } finally {
      setOpBusy(false);
    }
  };

  const toggleAdvanced = () => {
    if (advancedOpen) {
      setAdvancedOpen(false);
      return;
    }
    if (!advancedRiskAccepted) {
      const accepted = window.confirm(t('advanced_risk_confirm'));
      if (!accepted) return;
      setAdvancedRiskAccepted(true);
    }
    setAdvancedOpen(true);
  };

  return (
    <>
      <div className="sectionTitle">
        <h2>{VENDOR_LABELS[activeMotor.vendor] || activeMotor.vendor} {toHex(activeMotor.esc_id)}</h2>
        <span>{t('mst')} {toHex(activeMotor.mst_id)} | {t('updated')} {formatLocal(activeMotor.updated_at_ms)}</span>
      </div>

      <div className="metaGrid">
        <MetaItem label={t('esc_id')} value={toHex(activeMotor.esc_id)} />
        <MetaItem label={t('mst_id')} value={toHex(activeMotor.mst_id)} />
        <MetaItem label={t('probe')} value={toHex(activeMotor.probe)} />
        <MetaItem label={t('detect')} value={activeMotor.detected_by || '-'} />
        <MetaItem label={t('online')} value={activeMotor.online === false ? t('offline') : t('online_unknown')} />
        <MetaItem label={t('model')} value={activeMotor.model_guess || activeMotor.model || '-'} />
        <MetaItem label={t('status')} value={Number.isFinite(activeMotor.status) ? String(activeMotor.status) : '-'} />
        <MetaItem label={t('pos')} value={Number.isFinite(activeMotor.pos) ? activeMotor.pos.toFixed(3) : '-'} />
        <MetaItem label={t('vel')} value={Number.isFinite(activeMotor.vel) ? activeMotor.vel.toFixed(3) : '-'} />
        <MetaItem label={t('torq')} value={Number.isFinite(activeMotor.torq) ? activeMotor.torq.toFixed(3) : '-'} />
        <MetaItem label={t('status_name')} value={activeMotor.status_name || '-'} />
        <MetaItem label={t('t_mos')} value={Number.isFinite(activeMotor.t_mos) ? activeMotor.t_mos.toFixed(1) : '-'} />
        <MetaItem
          label={t('t_rotor')}
          value={Number.isFinite(activeMotor.t_rotor) ? activeMotor.t_rotor.toFixed(1) : '-'}
        />
        <MetaItem label={t('pmax')} value={Number.isFinite(activeMotor.pmax) ? activeMotor.pmax.toFixed(2) : '-'} />
        <MetaItem label={t('vmax')} value={Number.isFinite(activeMotor.vmax) ? activeMotor.vmax.toFixed(2) : '-'} />
        <MetaItem label={t('tmax')} value={Number.isFinite(activeMotor.tmax) ? activeMotor.tmax.toFixed(2) : '-'} />
      </div>

      <div className="grid3 denseGrid">
        <div className="field">
          <label>{t('mode')}</label>
          <ModeSelect vendor={activeMotor.vendor} value={activeControl.mode} onChange={patch('mode')} />
        </div>
        <Field label={t('target')} value={activeControl.target} onChange={patch('target')} />
        <Field label={t('vlim')} value={activeControl.vlim} onChange={patch('vlim')} />
        <Field label={t('kp')} value={activeControl.kp} onChange={patch('kp')} />
        <Field label={t('kd')} value={activeControl.kd} onChange={patch('kd')} />
        <Field label={t('tau')} value={activeControl.tau} onChange={patch('tau')} />
        <Field label={t('ratio')} value={activeControl.ratio} onChange={patch('ratio')} />
        <Field label={t('new_esc')} value={activeControl.newEsc} onChange={patch('newEsc')} />
        <Field label={t('new_mst')} value={activeControl.newMst} onChange={patch('newMst')} />
      </div>

      <div className="row toolbar compactToolbar">
        <button className="ghostBtn" onClick={toggleAdvanced}>
          {advancedOpen ? t('advanced_hide') : t('advanced_show')}
        </button>
        <span className="tip">{t('advanced_risk_note')}</span>
      </div>

      {advancedOpen && (
        <div className="motorAdvancedPanel">
          <div className="sectionTitle">
            <h2>{t('advanced_ops')}</h2>
            <span className="tip">{t('advanced_ops_desc')}</span>
          </div>
          <div className="row toolbar compactToolbar">
            <button disabled={!connected || opBusy} onClick={() => runOp(() => runMotorOp(activeMotor, 'clear_error'))}>
              {t('clear_error')}
            </button>
            <button
              disabled={!connected || opBusy}
              onClick={() => runOp(() => runMotorOp(activeMotor, 'request_feedback'))}
            >
              {t('request_feedback')}
            </button>
            <button
              disabled={!connected || opBusy}
              onClick={() => runOp(() => runMotorOp(activeMotor, 'store_parameters'))}
            >
              {t('store_params')}
            </button>
          </div>

          <div className="grid3 denseGrid">
            <Field label={t('ensure_mode')} value={ensureMode} onChange={(e) => setEnsureMode(e.target.value)} />
            <Field
              label={t('ensure_timeout_ms')}
              value={ensureTimeoutMs}
              onChange={(e) => setEnsureTimeoutMs(e.target.value)}
            />
            <Field
              label={t('can_timeout_ms')}
              value={canTimeoutMs}
              onChange={(e) => setCanTimeoutMs(e.target.value)}
            />
          </div>
          <div className="row toolbar compactToolbar">
            <button
              disabled={!connected || opBusy}
              onClick={() =>
                runOp(() =>
                  runMotorOp(activeMotor, 'ensure_mode', {
                    mode: ensureMode,
                    timeout_ms: Number(ensureTimeoutMs) || 1000,
                  }),
                )
              }
            >
              {t('ensure_mode')}
            </button>
            <button
              disabled={!connected || opBusy}
              onClick={() =>
                runOp(() =>
                  runMotorOp(activeMotor, 'set_can_timeout_ms', {
                    timeout_ms: Number(canTimeoutMs) || 800,
                  }),
                )
              }
            >
              {t('set_can_timeout')}
            </button>
          </div>

          {vendor === 'damiao' && (
            <>
              <div className="sectionTitle">
                <h2>{t('damiao_register')}</h2>
                <span className="tip">{t('damiao_rw_desc')}</span>
              </div>
              <div className="row toolbar compactToolbar">
                <button className="ghostBtn" onClick={() => setShowLessCommonDamiaoRw((v) => !v)}>
                  {showLessCommonDamiaoRw ? t('hide_less_common_rw') : t('show_less_common_rw')}
                </button>
              </div>

              <div className="damiaoRwList">
                {commonDamiaoRw.map((item) => (
                  <button
                    key={`rw-common-${item.rid}`}
                    className="damiaoRwChip"
                    onClick={() => {
                      setRid(String(item.rid));
                      setRegType(item.dataType);
                    }}
                  >
                    <span className="rid">RID {item.rid}</span>
                    <span className="name">{item.variable}</span>
                    <span className="type">{item.dataType}</span>
                    <span className="range">{item.range}</span>
                  </button>
                ))}
                {showLessCommonDamiaoRw &&
                  lessCommonDamiaoRw.map((item) => (
                    <button
                      key={`rw-less-${item.rid}`}
                      className="damiaoRwChip lessCommon"
                      onClick={() => {
                        setRid(String(item.rid));
                        setRegType(item.dataType);
                      }}
                    >
                      <span className="rid">RID {item.rid}</span>
                      <span className="name">{item.variable}</span>
                      <span className="type">{item.dataType}</span>
                      <span className="range">{item.range}</span>
                    </button>
                  ))}
              </div>

              <div className="grid3 denseGrid">
                <Field label={t('rid')} value={rid} onChange={(e) => setRid(e.target.value)} />
                <div className="field">
                  <label>{t('type')}</label>
                  <select value={regType} onChange={(e) => setRegType(e.target.value)}>
                    <option value="u32">u32</option>
                    <option value="f32">f32</option>
                  </select>
                </div>
                <Field label={t('write_value')} value={regValue} onChange={(e) => setRegValue(e.target.value)} />
              </div>
              <div className="row toolbar compactToolbar">
                <button
                  disabled={!connected || opBusy}
                  onClick={() =>
                    runOp(async () => {
                      const op = regType === 'u32' ? 'get_register_u32' : 'get_register_f32';
                      const ret = await runMotorOp(activeMotor, op, { rid: Number(rid) || 0, timeout_ms: 1000 });
                      setRegReadValue(String(ret?.data?.value ?? ''));
                    })
                  }
                >
                  {t('read_reg')}
                </button>
                <button
                  disabled={!connected || opBusy}
                  onClick={() =>
                    runOp(() => {
                      const op = regType === 'u32' ? 'write_register_u32' : 'write_register_f32';
                      return runMotorOp(activeMotor, op, {
                        rid: Number(rid) || 0,
                        value: regType === 'u32' ? Math.round(Number(regValue) || 0) : Number(regValue) || 0,
                      });
                    })
                  }
                >
                  {t('write_reg')}
                </button>
                <span className="tip">{t('read_value')}: {regReadValue || '-'}</span>
              </div>
            </>
          )}

          {vendor === 'robstride' && (
            <>
              <div className="sectionTitle">
                <h2>{t('robstride_param')}</h2>
              </div>
              <div className="grid3 denseGrid">
                <Field label={t('param_id')} value={rsParamId} onChange={(e) => setRsParamId(e.target.value)} />
                <div className="field">
                  <label>{t('param_type')}</label>
                  <select value={rsParamType} onChange={(e) => setRsParamType(e.target.value)}>
                    <option value="i8">i8</option>
                    <option value="u8">u8</option>
                    <option value="u16">u16</option>
                    <option value="u32">u32</option>
                    <option value="f32">f32</option>
                  </select>
                </div>
                <Field label={t('param_value')} value={rsParamValue} onChange={(e) => setRsParamValue(e.target.value)} />
              </div>
              <div className="row toolbar compactToolbar">
                <button
                  disabled={!connected || opBusy}
                  onClick={() =>
                    runOp(async () => {
                      const ret = await runMotorOp(activeMotor, 'robstride_read_param', {
                        param_id: rsParamId,
                        param_type: rsParamType,
                        timeout_ms: 200,
                      });
                      setRsReadValue(String(ret?.data?.value ?? ''));
                    })
                  }
                >
                  {t('read_param')}
                </button>
                <button
                  disabled={!connected || opBusy}
                  onClick={() =>
                    runOp(() =>
                      runMotorOp(activeMotor, 'robstride_write_param', {
                        param_id: rsParamId,
                        param_type: rsParamType,
                        value: rsParamValue,
                        timeout_ms: 200,
                      }),
                    )
                  }
                >
                  {t('write_param')}
                </button>
                <span className="tip">{t('read_value')}: {rsReadValue || '-'}</span>
              </div>
            </>
          )}

          {extraEntries.length > 0 && (
            <>
              <div className="sectionTitle">
                <h2>{t('extra_snapshot_fields')}</h2>
              </div>
              <pre className="box logs">{JSON.stringify(Object.fromEntries(extraEntries), null, 2)}</pre>
            </>
          )}

          <div className="sectionTitle">
            <h2>{t('full_motor_snapshot')}</h2>
          </div>
          <pre className="box logs">{JSON.stringify(activeMotor, null, 2)}</pre>
        </div>
      )}

      <div className="row toolbar">
        <button disabled={!connected} onClick={() => controlMotor(activeMotor, 'enable')}>{t('enable')}</button>
        <button disabled={!connected} onClick={() => controlMotor(activeMotor, 'disable')}>{t('disable')}</button>
        <button className="primary" disabled={!connected} onClick={() => controlMotor(activeMotor, 'move')}>{t('move')}</button>
        <button
          disabled={!connected}
          onClick={() => zeroMotor(activeMotor)}
          title={activeControl.enabled ? '' : t('zero_requires_enable')}
        >
          {t('zero_set')}
        </button>
        <button disabled={!connected} onClick={() => controlMotor(activeMotor, 'stop')}>{t('stop')}</button>
        <button disabled={!connected} onClick={() => probeMotor(activeMotor)}>{t('probe')}</button>
        <button disabled={!connected || !SET_ID_VENDORS.has(activeMotor.vendor)} onClick={() => setIdFor(activeMotor)}>{t('set_id')}</button>
        <button disabled={!connected} onClick={() => verifyHit(activeMotor)}>{t('verify')}</button>
        <button disabled={!connected} onClick={() => refreshMotorState(activeMotor)}>{t('refresh_state')}</button>
      </div>
      {connected && !activeControl.enabled && <div className="tip">{t('zero_requires_enable')}</div>}
      {!connected && <div className="tip">{t('connect_ws_first')}</div>}
    </>
  );
}
