import React from 'react';
import { useI18n } from '../../i18n';

const GROUPS = [
  { key: 'core', title: 'Core' },
  { key: 'limits', title: 'Limits' },
  { key: 'identity', title: 'Identity' },
  { key: 'advanced', title: 'Advanced' },
];

function renderField(def, row, patchParam, paramBusy) {
  const value = row.values?.[def.key] ?? '';
  const disabled = paramBusy || def.writable === false;
  const title = def._title || `RID ${def.rid} | ${def.variable} | ${def.range}`;

  if (def.key === 'ctrlMode') {
    return (
      <select
        value={value}
        title={title}
        onChange={(e) => patchParam(row.key, def.key, e.target.value)}
        disabled={disabled}
      >
        <option value="1">1: MIT</option>
        <option value="2">2: PosVel</option>
        <option value="3">3: Vel</option>
        <option value="4">4: ForcePos</option>
      </select>
    );
  }

  return (
    <input
      value={value}
      title={title}
      onChange={(e) => patchParam(row.key, def.key, e.target.value)}
      disabled={disabled}
      readOnly={def.writable === false}
      placeholder={row.loaded ? '' : '-'}
    />
  );
}

export function ParamTable({
  open,
  canAction,
  armToolbarBusy,
  paramBusy,
  paramInfo,
  paramRows,
  paramDefs,
  canWriteParams,
  paramSupported,
  paramVendor,
  patchParam,
  readParams,
  writeParams,
  applyDefaultTemplate,
  exportParams,
  importParams,
  onClose,
}) {
  const { t } = useI18n();
  const fileInputRef = React.useRef(null);
  if (!open) return null;
  const onImportFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (f) importParams?.(f);
  };

  return (
    <div className="armParamPanel">
      <div className="sectionTitle armPaneTitle">
        <h2>{t('arm_params_title')}</h2>
        <span className="tip">
          {t(paramVendor === 'robstride' ? 'arm_params_hint_robstride' : 'arm_params_hint')}
        </span>
      </div>
      <div className="row toolbar compactToolbar">
        <button
          disabled={!canAction || armToolbarBusy || !paramSupported}
          onClick={readParams}
          title={paramSupported ? '' : t('arm_params_vendor_unsupported')}
        >
          {t('arm_read_params')}
        </button>
        <button
          className="primary"
          disabled={!canAction || armToolbarBusy || !canWriteParams || !paramSupported}
          onClick={writeParams}
          title={paramSupported ? '' : t('arm_params_vendor_unsupported')}
        >
          {t('arm_write_params')}
        </button>
        <button
          disabled={!canAction || armToolbarBusy || !paramSupported}
          onClick={applyDefaultTemplate}
          title={paramSupported ? '' : t('arm_params_vendor_unsupported')}
        >
          {t('arm_apply_default_template')}
        </button>
        {paramSupported && (
          <button
            disabled={!canAction || armToolbarBusy || !paramSupported}
            onClick={exportParams}
            title={paramSupported ? '' : t('arm_params_vendor_unsupported')}
          >
            {t('arm_export_params')}
          </button>
        )}
        {paramSupported && (
          <>
            <button
              disabled={!canAction || armToolbarBusy || paramBusy || !paramSupported}
              onClick={() => fileInputRef.current?.click()}
              title={
                paramSupported ? t('arm_import_params_hint') : t('arm_params_vendor_unsupported')
              }
            >
              {t('arm_import_params')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".tsv,.txt,text/tab-separated-values,text/plain"
              style={{ display: 'none' }}
              onChange={onImportFile}
            />
          </>
        )}
        <button className="ghostBtn" disabled={armToolbarBusy} onClick={onClose}>
          {t('close')}
        </button>
      </div>
      {paramSupported && <div className="tip warnText">{t('arm_params_write_risk_hint')}</div>}
      {!paramSupported && <div className="tip">{t('arm_params_vendor_unsupported')}</div>}
      {paramSupported && !canWriteParams && (
        <div className="tip">{t('arm_params_read_before_write')}</div>
      )}
      {paramInfo && <div className="tip">{paramInfo}</div>}
      {GROUPS.map((group) => {
        const defs = (paramDefs || []).filter((def) => def.group === group.key);
        if (defs.length === 0) return null;
        return (
          <div key={group.key} className="armParamTableWrap">
            <div className="sectionTitle armPaneTitle">
              <h2>{group.title}</h2>
              <span className="tip">{defs.map((x) => x.variable).join(', ')}</span>
            </div>
            <table className="armParamTable">
              <thead>
                <tr>
                  <th>{t('joint')}</th>
                  {defs.map((def) => (
                    <th
                      key={def.key}
                      title={`${t(def.labelKey || def.label)} | RID ${def.rid} | ${def.range}${def.descKey ? ` | ${t(def.descKey)}` : ''}`}
                    >
                      {t(def.labelKey || def.label)}
                    </th>
                  ))}
                  <th>{t('status')}</th>
                </tr>
              </thead>
              <tbody>
                {paramRows.map((row) => (
                  <tr key={`${group.key}-${row.key}`}>
                    <td>{row.joint}</td>
                    {defs.map((def) => (
                      <td key={def.key}>
                        {renderField(
                          {
                            ...def,
                            _title: `${t(def.labelKey || def.label)} | RID ${def.rid} | ${def.range}${def.descKey ? ` | ${t(def.descKey)}` : ''}`,
                          },
                          row,
                          patchParam,
                          paramBusy
                        )}
                      </td>
                    ))}
                    <td className={row.error ? 'errText' : ''}>
                      {row.error || (row.loaded ? t('ok') : '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
