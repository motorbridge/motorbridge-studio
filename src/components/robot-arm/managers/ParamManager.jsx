import React from 'react';
import { useI18n } from '../../../i18n';
import { DAMIAO_ARM_PARAM_DEFS, ROBSTRIDE_ARM_PARAM_DEFS } from '../../../lib/appConfig';
import {
  REBOT_ARM_DAMIAO_DEFAULT_TEMPLATE,
  REBOT_ARM_ROBSTRIDE_DEFAULT_TEMPLATE,
  armVendorForProfile,
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
  const [paramProgress, setParamProgress] = React.useState({
    active: false,
    done: 0,
    total: 0,
    label: '',
    percent: 0,
  });
  const paramVendor = armVendorForProfile(robotArmModel);
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
      await sendCmd?.('param_stream', { enabled: true }, 3000).catch(() => {});
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

  const applyDefaultTemplate = React.useCallback(() => {
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
    setParamInfo(
      t(
        paramVendor === 'robstride'
          ? 'arm_params_template_applied_robstride'
          : 'arm_params_template_applied'
      )
    );
  }, [paramSupported, paramVendor, t]);

  const canWriteParams = React.useMemo(() => {
    if (!paramSupported) return false;
    const onlineRows = paramRows.filter(
      (row) => String(row?.hit?.vendor) === paramVendor && Boolean(row?.hit?.online)
    );
    if (onlineRows.length === 0) return false;
    return onlineRows.every((row) => row.loaded && !row.error);
  }, [paramRows, paramSupported, paramVendor]);

  const manager = {
    paramPanelOpen,
    paramBusy,
    paramSupported,
    readParams,
    writeParams,
    applyDefaultTemplate,
    paramTable: (
      <ParamTable
        open={paramPanelOpen}
        canAction={canAction}
        armToolbarBusy={armToolbarBusy}
        paramBusy={paramBusy}
        paramInfo={paramInfo}
        paramProgress={paramProgress}
        paramRows={paramRows}
        paramDefs={paramDefs}
        canWriteParams={canWriteParams}
        paramSupported={paramSupported}
        paramVendor={paramVendor}
        patchParam={patchParam}
        readParams={readParams}
        writeParams={writeParams}
        applyDefaultTemplate={applyDefaultTemplate}
        onClose={() => setParamPanelOpen(false)}
      />
    ),
  };

  return children(manager);
}
