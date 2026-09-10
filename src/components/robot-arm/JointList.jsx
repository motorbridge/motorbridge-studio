import React from 'react';
import { useI18n } from '../../i18n';
import { toHex } from '../../lib/utils';

function numText(v, digits = 3) {
  return Number.isFinite(v) ? Number(v).toFixed(digits) : '-';
}

export function JointList({
  robotArmJointRows,
  activeRowKey,
  onSelect,
  connected,
  scanRobotArmJoint,
  refreshMotorState,
  zeroMotor,
}) {
  const { t } = useI18n();
  return (
    <div className="armLeftPane">
      <div className="sectionTitle armPaneTitle">
        <h2>{t('arm_left_joints')}</h2>
        <span className="tip">{robotArmJointRows.length}/7</span>
      </div>
      <div className="armJointList">
        {robotArmJointRows.map((row) => (
          <div
            key={row.key}
            className={`armJointCard ${activeRowKey === row.key ? 'active' : ''}`}
            onClick={() => onSelect(row.key)}
          >
            <div className="armCardHead">
              <strong>
                {t('joint')} {row.joint}
              </strong>
              <div className="row" style={{ gap: 6 }}>
                <span className={`chip ${row.hit.online === false ? '' : 'chipOk'}`}>
                  {row.hit.online === false
                    ? t('offline')
                    : row.hit.online === true
                      ? t('online')
                      : t('online_unknown')}
                </span>
                <span className={`chip ${row.control.enabled ? 'chipOk' : ''}`}>
                  {row.control.enabled ? t('enabled') : t('disabled')}
                </span>
              </div>
            </div>
            <div className="armMeta">
              <span>
                {t('esc_id')} {toHex(row.hit.esc_id)}
              </span>
              <span>
                {t('mst_id')} {toHex(row.hit.mst_id)}
              </span>
            </div>
            <div className="armMeta">
              <span>
                {t('pos')} {numText(row.hit.pos)}
              </span>
              <span>
                {t('vel')} {numText(row.hit.vel)}
              </span>
              <span>
                {t('torq')} {numText(row.hit.torq)}
              </span>
            </div>
            <div className="row compactToolbar">
              <button
                className="small ghostBtn"
                disabled={!connected}
                onClick={(e) => {
                  e.stopPropagation();
                  scanRobotArmJoint(row.joint);
                }}
              >
                {t('arm_scan_joint')}
              </button>
              <button
                className="small ghostBtn"
                disabled={!connected}
                onClick={(e) => {
                  e.stopPropagation();
                  refreshMotorState(row.hit);
                }}
              >
                {t('refresh_state')}
              </button>
              <button
                className="small ghostBtn"
                disabled={!connected}
                onClick={(e) => {
                  e.stopPropagation();
                  zeroMotor(row.hit);
                }}
                title={t('zero_set')}
              >
                {t('arm_zero_current')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
