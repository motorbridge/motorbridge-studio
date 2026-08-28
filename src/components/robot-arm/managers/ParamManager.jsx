import React from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../../i18n';
import { ProgressBar } from '../../ProgressBar';
import { DAMIAO_ARM_PARAM_DEFS, ROBSTRIDE_ARM_PARAM_DEFS } from '../../../lib/appConfig';
import {
  REBOT_ARM_DAMIAO_DEFAULT_TEMPLATE,
  REBOT_ARM_ROBSTRIDE_DEFAULT_TEMPLATE,
  armVendorForProfile,
  buildRobstrideTemplateParsed,
  buildDamiaoTemplateParsed,
} from '../../../lib/robotArm';
import { parseNum } from '../../../lib/utils';
import { ParamTable } from '../ParamTable';

function createParamValueDefaults(paramDefs) {
  return Object.fromEntries(paramDefs.map((def) => [def.key, String(def.defaultValue ?? '')]));
}

export function ParamManager({
  robotArmModel,
  robotArmJointRows,
  readRobotArmControlParams,
  writeRobotArmControlParams,
  exportArmParams,
  importArmParams,
  devMode,
  sendCmd,
  setArmParamOpBusy,
  askZeroConfirm,
  canAction,
  armToolbarBusy,
  children,
}) {
  const { t } = useI18n();
  const [paramPanelOpen, setParamPanelOpen] = React.useState(false);
  const [paramBusy, setParamBusy] = React.useState(false);
  const [paramRows, setParamRows] = React.useState([]);
  const [paramInfo, setParamInfo] = React.useState('');
  const [importAlert, setImportAlert] = React.useState({ open: false, title: '', message: '' });
  const [paramProgress, setParamProgress] = React.useState({
    active: false,
    done: 0,
    total: 0,
    label: '',
    percent: 0,
  });
  const paramVendor = armVendorForProfile(robotArmModel);

  // Shared handler for an import/template run aborted because a motor went
  // offline (either already offline at start, or it dropped mid-read/write).
  // Pops the existing importAlert modal with an "offline / aborted" title and
  // a body listing only the joint IDs that dropped (e.g. "J1, J3"). The
  // detailed esc/mst feedback IDs stay in the event log, not the modal.
  const showImportAbortAlert = React.useCallback(
    (res) => {
      const ab = res?.aborted;
      if (!ab) return;
      // describeHit yields "J<n> esc=0x… mst=0x…"; the modal only needs the
      // joint token so the operator sees which motor to check, not bus IDs.
      const jointId = (s) => String(s || '').split(/\s+/)[0] || String(s || '');
      const list = ab.joints
        ? ab.joints.map(jointId).filter(Boolean).join(', ')
        : jointId(ab.motor);
      const kind = ab.kind === 'export' ? 'export' : 'import';
      const reasonKey =
        ab.reason === 'offline_at_start'
          ? 'offline'
          : ab.reason === 'all_failed'
            ? 'all_failed'
            : 'timeout';
      const key = `arm_${kind}_aborted_${reasonKey}`;
      const failedKey = kind === 'export' ? 'arm_params_export_failed' : 'arm_params_import_failed';
      setImportAlert({ open: true, title: t(key), message: list });
      setParamInfo(`${t(failedKey)}: ${t(key)}`);
    },
    [t]
  );

  const paramDefs = React.useMemo(
    () => (paramVendor === 'robstride' ? ROBSTRIDE_ARM_PARAM_DEFS : DAMIAO_ARM_PARAM_DEFS),
    [paramVendor]
  );
  const paramSupported = paramVendor === 'damiao' || paramVendor === 'robstride';
  const writableParamDefs = React.useMemo(
    () => paramDefs.filter((x) => x.writable !== false),
    [paramDefs]
  );
  const riskyParamDefs = React.useMemo(
    () => writableParamDefs.filter((x) => x.risky),
    [writableParamDefs]
  );

  React.useEffect(() => {
    setParamRows((prev) =>
      robotArmJointRows.map((row) => {
        const old = prev.find((x) => x.key === row.key && x.vendor === paramVendor);
        return (
          old || {
            key: row.key,
            vendor: paramVendor,
            joint: row.joint,
            hit: row.hit,
            loaded: false,
            error: '',
            values: createParamValueDefaults(paramDefs),
          }
        );
      })
    );
  }, [paramDefs, paramVendor, robotArmJointRows]);

  const patchParam = React.useCallback((key, field, value) => {
    setParamRows((prev) =>
      prev.map((x) => (x.key === key ? { ...x, values: { ...x.values, [field]: value } } : x))
    );
  }, []);

  const closeEnough = React.useCallback((a, b, eps = 1e-6) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return Math.abs(a - b) <= eps;
  }, []);

  const applyReadResultToRows = React.useCallback(
    (result) => {
      setParamRows((prev) =>
        prev.map((x) => {
          const r = result?.[x.key];
          if (!r) return x;
          if (!r.ok) return { ...x, loaded: false, error: r.error || 'read failed' };
          const v = r.values || {};
          return {
            ...x,
            loaded: true,
            error: '',
            values: Object.fromEntries(
              paramDefs.map((def) => [def.key, String(v[def.key] ?? x.values?.[def.key] ?? '')])
            ),
          };
        })
      );
    },
    [paramDefs]
  );

  const readParams = React.useCallback(async () => {
    setParamPanelOpen(true);
    if (!paramSupported) {
      setParamInfo(t('arm_params_vendor_unsupported'));
      return;
    }
    setParamBusy(true);
    setParamInfo('');
    try {
      const result = await readRobotArmControlParams({ onProgress: setParamProgress });
      const matched = paramRows.filter((x) => Boolean(result?.[x.key])).length;
      applyReadResultToRows(result);
      setParamInfo(matched > 0 ? t('arm_params_read_done') : t('arm_params_vendor_unsupported'));
    } catch (e) {
      setParamInfo(`${t('arm_params_read_failed')}: ${e.message || e}`);
    } finally {
      setParamBusy(false);
    }
  }, [applyReadResultToRows, paramRows, paramSupported, readRobotArmControlParams, t]);

  const writeParams = React.useCallback(async () => {
    setParamPanelOpen(true);
    if (!paramSupported) {
      setParamInfo(t('arm_params_vendor_unsupported'));
      return;
    }
    setParamBusy(true);
    setParamInfo('');
    try {
      const onlineRows = paramRows.filter(
        (x) => String(x?.hit?.vendor) === paramVendor && Boolean(x?.hit?.online)
      );
      if (onlineRows.length === 0) {
        throw new Error(`no online ${paramVendor} joints`);
      }
      const blockedRows = onlineRows.filter((x) => !x.loaded || x.error);
      if (blockedRows.length > 0) {
        throw new Error(
          `read parameters first for joints: ${blockedRows.map((x) => `J${x.joint}`).join(', ')}`
        );
      }

      const rows = onlineRows.map((x) => ({
        key: x.key,
        joint: x.joint,
        hit: x.hit,
        values: Object.fromEntries(
          writableParamDefs.map((def) => {
            const fallback = def.defaultValue === '' ? 0 : Number(def.defaultValue);
            let parsed = parseNum(x.values?.[def.key], fallback);
            if (def.key === 'ctrlMode') parsed = Math.max(1, Math.min(4, Math.round(parsed)));
            if (def.dataType === 'u32') parsed = Math.max(0, Math.round(parsed));
            return [def.key, parsed];
          })
        ),
      }));
      const confirmedWrite = await askZeroConfirm({
        title: t('arm_params_write_confirm_title'),
        message: t('arm_params_write_confirm_message'),
        danger: true,
      });
      if (!confirmedWrite) return;
      const riskyKeys = riskyParamDefs.map((def) => def.key);
      const changedRisky = rows.some((row) =>
        riskyKeys.some(
          (key) =>
            String(row.values?.[key] ?? '') !==
            String(paramRows.find((x) => x.key === row.key)?.values?.[key] ?? '')
        )
      );
      if (changedRisky) {
        const confirmed = await askZeroConfirm({
          title: t('arm_params_risky_write_confirm_title'),
          message: t('arm_params_risky_write_confirm_message'),
          danger: true,
        });
        if (!confirmed) return;
      }
      setArmParamOpBusy?.(true);
      await sendCmd?.('state_stream', { enabled: false }, 3000);
      await sendCmd?.('param_stream', { enabled: false }, 3000);
      const writeResult = await writeRobotArmControlParams(rows, { onProgress: setParamProgress });
      const readBack = await readRobotArmControlParams({ onProgress: setParamProgress });
      applyReadResultToRows(readBack);

      const targetByKey = new Map(rows.map((x) => [x.key, x.values]));
      let mismatch = 0;
      let checked = 0;
      Object.entries(readBack || {}).forEach(([key, item]) => {
        const target = targetByKey.get(key);
        if (!target || !item?.ok) return;
        const actual = item.values || {};
        checked += 1;
        const same = writableParamDefs.every((def) => {
          const lhs = Number(actual[def.key]);
          const rhs = Number(target[def.key]);
          return def.dataType === 'u32'
            ? Math.round(lhs) === Math.round(rhs)
            : closeEnough(lhs, rhs, 1e-6);
        });
        if (!same) mismatch += 1;
      });

      const writeFailed = Object.values(writeResult || {}).filter((x) => x?.ok === false).length;
      if (writeFailed > 0) {
        setParamInfo(`${t('arm_params_write_failed')}: ${writeFailed}`);
      } else if (checked > 0 && mismatch === 0) {
        setParamInfo(t('arm_params_verify_ok'));
      } else if (checked > 0) {
        setParamInfo(`${t('arm_params_verify_mismatch')}: ${mismatch}`);
      } else {
        setParamInfo(t('arm_params_write_done'));
      }
    } catch (e) {
      setParamInfo(`${t('arm_params_write_failed')}: ${e.message || e}`);
    } finally {
      await sendCmd?.('state_stream', { enabled: true }, 3000).catch(() => {});
      const paramStreamConfig =
        paramVendor === 'robstride'
          ? { enabled: true, profile: 'realtime', interval_ms: 100, timeout_ms: 80 }
          : { enabled: true, profile: 'realtime', interval_ms: 500, timeout_ms: 80 };
      await sendCmd?.('param_stream', paramStreamConfig, 3000).catch(() => {});
      setArmParamOpBusy?.(false);
      setParamBusy(false);
    }
  }, [
    applyReadResultToRows,
    askZeroConfirm,
    closeEnough,
    paramRows,
    paramSupported,
    paramVendor,
    readRobotArmControlParams,
    riskyParamDefs,
    t,
    sendCmd,
    setArmParamOpBusy,
    writableParamDefs,
    writeRobotArmControlParams,
  ]);

  const applyDefaultTemplate = React.useCallback(async () => {
    setParamPanelOpen(true);
    if (!paramSupported) {
      setParamInfo(t('arm_params_vendor_unsupported'));
      return;
    }
    const template =
      paramVendor === 'robstride'
        ? REBOT_ARM_ROBSTRIDE_DEFAULT_TEMPLATE
        : REBOT_ARM_DAMIAO_DEFAULT_TEMPLATE;
    setParamRows((prev) =>
      prev.map((row) => {
        const tpl = template[row.joint];
        if (!tpl) return row;
        return {
          ...row,
          loaded: true,
          error: '',
          values: {
            ...row.values,
            ...tpl,
          },
        };
      })
    );

    // Reuse the shared import compare/write/save path against the in-memory
    // template (no TSV file). build*TemplateParsed turns the template into the
    // same { joints, rows } shape the TSV parser yields, then importArmParams
    // (vendor-branched internally) reads each online joint's current value and
    // writes only the differing params, storing to Flash when something changed.
    if (importArmParams) {
      setParamBusy(true);
      setArmParamOpBusy?.(true);
      setParamInfo(t('arm_params_import_doing'));
      try {
        const parsed =
          paramVendor === 'robstride'
            ? buildRobstrideTemplateParsed(template)
            : buildDamiaoTemplateParsed(template);
        const res = await importArmParams({ parsed, onProgress: setParamProgress });
        if (res?.aborted) {
          showImportAbortAlert(res);
          return;
        }
        if (res?.error) {
          setParamInfo(`${t('arm_params_write_failed')}: ${res.error}`);
        } else {
          const appliedKey =
            paramVendor === 'robstride'
              ? 'arm_params_template_applied_robstride'
              : 'arm_params_template_applied';
          setParamInfo(
            `${t(appliedKey)} (joints=${res.okCount}/${res.total} read=${res.read} written=${res.written} skipped=${res.skipped} saved=${res.saved})`
          );
        }
      } catch (e) {
        setParamInfo(`${t('arm_params_write_failed')}: ${e.message || e}`);
      } finally {
        setArmParamOpBusy?.(false);
        setParamBusy(false);
      }
      return;
    }

    setParamInfo(
      t(
        paramVendor === 'robstride'
          ? 'arm_params_template_applied_robstride'
          : 'arm_params_template_applied'
      )
    );
  }, [paramSupported, paramVendor, setArmParamOpBusy, t, importArmParams, showImportAbortAlert]);

  const canWriteParams = React.useMemo(() => {
    if (!paramSupported) return false;
    const onlineRows = paramRows.filter(
      (row) => String(row?.hit?.vendor) === paramVendor && Boolean(row?.hit?.online)
    );
    if (onlineRows.length === 0) return false;
    return onlineRows.every((row) => row.loaded && !row.error);
  }, [paramRows, paramSupported, paramVendor]);

  const exportParams = React.useCallback(async () => {
    setParamPanelOpen(true);
    if (!exportArmParams) {
      setParamInfo(t('arm_params_vendor_unsupported'));
      return;
    }
    setParamBusy(true);
    setArmParamOpBusy?.(true);
    setParamInfo(t('arm_params_export_doing'));
    try {
      const res = await exportArmParams({ onProgress: setParamProgress });
      if (res?.aborted) {
        showImportAbortAlert(res);
        return;
      }
      if (res?.error) {
        setParamInfo(`${t('arm_params_export_failed')}: ${res.error}`);
      } else {
        setParamInfo(`${t('arm_params_export_done')} (${res.okCount}/${res.total})`);
      }
    } catch (e) {
      setParamInfo(`${t('arm_params_export_failed')}: ${e.message || e}`);
    } finally {
      setArmParamOpBusy?.(false);
      setParamBusy(false);
    }
  }, [exportArmParams, setArmParamOpBusy, t, showImportAbortAlert]);

  const importParams = React.useCallback(
    async (file) => {
      setParamPanelOpen(true);
      if (!importArmParams) {
        setParamInfo(t('arm_params_vendor_unsupported'));
        return;
      }
      if (!file) return;
      setParamBusy(true);
      setArmParamOpBusy?.(true);
      setParamInfo(t('arm_params_import_doing'));
      try {
        const res = await importArmParams({ file, onProgress: setParamProgress });
        if (res?.aborted) {
          showImportAbortAlert(res);
          return;
        }
        if (res?.error === 'format invalid') {
          // Format mismatch: pop up a modal listing the parser's errors so the
          // operator can fix the file; nothing was written to any motor.
          const detail = res.errors?.length
            ? res.errors.join('\n')
            : t('arm_import_format_invalid');
          setImportAlert({
            open: true,
            title: t('arm_import_format_invalid'),
            message: detail,
          });
          setParamInfo(`${t('arm_params_import_failed')}: ${t('arm_import_format_invalid')}`);
        } else if (res?.error) {
          const detail = res.errors?.length ? res.errors.slice(0, 3).join('; ') : res.error;
          setParamInfo(`${t('arm_params_import_failed')}: ${detail}`);
        } else {
          setParamInfo(
            `${t('arm_params_import_done')} (${res.okCount}/${res.total} r=${res.read} w=${res.written} s=${res.skipped} saved=${res.saved})`
          );
        }
      } catch (e) {
        setParamInfo(`${t('arm_params_import_failed')}: ${e.message || e}`);
      } finally {
        setArmParamOpBusy?.(false);
        setParamBusy(false);
      }
    },
    [importArmParams, setArmParamOpBusy, t, showImportAbortAlert]
  );

  const manager = {
    paramPanelOpen,
    paramBusy,
    paramSupported,
    paramVendor,
    readParams,
    writeParams,
    applyDefaultTemplate,
    exportParams,
    importParams,
    // The shared param-action progress bar. It is NOT rendered inside the dev
    // param display panel; instead it pops up temporarily below the toolbar
    // hint whenever a read/write/apply/export/import action is running, so the
    // operator gets progress feedback in default mode too (where the panel is
    // hidden). It auto-hides once the action finishes.
    paramProgressBar:
      paramBusy || paramProgress?.active ? (
        <div className="armParamProgressPop" aria-live="polite">
          <ProgressBar active progress={paramProgress} />
        </div>
      ) : null,
    paramTable: (
      <>
        <ParamTable
          // The param display panel is a developer-only surface: in default
          // mode it never renders, even if a toolbar action (read/write/apply/
          // export/import) set paramPanelOpen. The actions themselves still run
          // and report through the event log; only the inline panel is hidden.
          open={paramPanelOpen && devMode}
          canAction={canAction}
          armToolbarBusy={armToolbarBusy}
          paramBusy={paramBusy}
          paramInfo={paramInfo}
          paramRows={paramRows}
          paramDefs={paramDefs}
          canWriteParams={canWriteParams}
          paramSupported={paramSupported}
          paramVendor={paramVendor}
          patchParam={patchParam}
          readParams={readParams}
          writeParams={writeParams}
          applyDefaultTemplate={applyDefaultTemplate}
          exportParams={exportParams}
          importParams={importParams}
          onClose={() => setParamPanelOpen(false)}
        />
        {importAlert.open &&
          createPortal(
            <div
              className="armDialogMask"
              role="dialog"
              aria-modal="true"
              aria-live="assertive"
              onClick={() => setImportAlert((prev) => ({ ...prev, open: false }))}
            >
              <div className="armDialogCard" onClick={(e) => e.stopPropagation()}>
                <h3>{importAlert.title || t('arm_import_format_invalid')}</h3>
                <pre className="armImportAlertDetail">{importAlert.message}</pre>
                <div className="row toolbar compactToolbar">
                  <button
                    className="primary"
                    onClick={() => setImportAlert((prev) => ({ ...prev, open: false }))}
                  >
                    {t('close')}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </>
    ),
  };

  return children(manager);
}
