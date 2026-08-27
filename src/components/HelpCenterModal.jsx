import React from 'react';
import { useI18n } from '../i18n';

export function HelpCenterModal({ open, page, onClose }) {
  const { t } = useI18n();
  if (!open) return null;

  const generalItems = [
    t('help_general_1'),
    t('help_general_2'),
    t('help_general_3'),
    t('help_general_4'),
    t('help_general_5'),
  ];
  const robotItems = [
    t('help_robot_1'),
    t('help_robot_2'),
    t('help_robot_3'),
    t('help_robot_4'),
    t('help_robot_5'),
    t('help_robot_6'),
  ];
  const safetyItems = [t('help_safety_1'), t('help_safety_2'), t('help_safety_3'), t('help_safety_4')];
  const troubleshootItems = [
    t('help_troubleshoot_1'),
    t('help_troubleshoot_2'),
    t('help_troubleshoot_3'),
    t('help_troubleshoot_4'),
  ];
  const quickStartItems = [t('help_quick_1'), t('help_quick_2'), t('help_quick_3'), t('help_quick_4')];
  const canRestartCmd = `# Bring can0 up at 1 Mbit/s — use this to start the CAN bus.
sudo ip link set can0 up type can bitrate 1000000

alias can_restart='if ip link show can0 >/dev/null 2>&1; then echo "[can_restart] restarting can0"; sudo ip link set can0 down 2>/dev/null || true; sudo ip link set can0 type can bitrate 1000000 restart-ms 100 loopback off 2>/dev/null || sudo ip link set can0 type can bitrate 1000000 loopback off; sudo ip link set can0 up; ip -details link show can0; fi; if ip link show can1 >/dev/null 2>&1; then echo "[can_restart] restarting can1"; sudo ip link set can1 down 2>/dev/null || true; sudo ip link set can1 type can bitrate 1000000 restart-ms 100 loopback off 2>/dev/null || sudo ip link set can1 type can bitrate 1000000 loopback off; sudo ip link set can1 up; ip -details link show can1; fi'

# After adding it to ~/.bashrc:
source ~/.bashrc
can_restart`;
  const modeCmd = (name, cmd) => ({ name, cmd });
  const setupModesByPlatform = (platform) => {
    const channel = platform === 'windows' ? 'can0@1000000' : 'can0';
    return [
      modeCmd(t('help_mode_router'), 'motorbridge-gateway -- --bind 127.0.0.1:9002'),
      modeCmd(
        t('help_mode_auto'),
        `motorbridge-gateway -- --bind 127.0.0.1:9002 --transport auto --channel ${channel}`,
      ),
      modeCmd(
        t('help_mode_socketcan'),
        `motorbridge-gateway -- --bind 127.0.0.1:9002 --transport socketcan --channel ${channel}`,
      ),
      modeCmd(
        t('help_mode_socketcanfd'),
        `motorbridge-gateway -- --bind 127.0.0.1:9002 --transport socketcanfd --channel ${channel}`,
      ),
    ];
  };
  const setupByPlatform = [
    {
      name: t('help_platform_linux'),
      installCmd: 'pip install -U motorbridge',
      modeCmds: setupModesByPlatform('linux'),
    },
    {
      name: t('help_platform_macos'),
      installCmd: 'pip install -U motorbridge',
      modeCmds: setupModesByPlatform('macos'),
    },
    {
      name: t('help_platform_windows'),
      installCmd: 'pip install -U motorbridge',
      modeCmds: setupModesByPlatform('windows'),
    },
  ];
  const dmSerialByPlatform = [
    {
      name: t('help_platform_linux'),
      gatewayCmd: `motorbridge-gateway -- \\
  --bind 127.0.0.1:9002 --vendor damiao --transport dm-serial \\
  --serial-port /dev/ttyACM0 --serial-baud 921600 \\
  --dt-ms 20`,
    },
    {
      name: t('help_platform_macos'),
      gatewayCmd: `motorbridge-gateway -- \\
  --bind 127.0.0.1:9002 --vendor damiao --transport dm-serial \\
  --serial-port /dev/tty.usbmodem14101 --serial-baud 921600 \\
  --dt-ms 20`,
    },
    {
      name: t('help_platform_windows'),
      gatewayCmd: `motorbridge-gateway -- --bind 127.0.0.1:9002 --vendor damiao --transport dm-serial --serial-port COM3 --serial-baud 921600 --dt-ms 20`,
    },
  ];
  const glossaryItems = [
    { k: 'CAN_ID', v: t('help_glossary_esc') },
    { k: 'MASTER_ID', v: t('help_glossary_mst') },
    { k: 'Zero', v: t('help_glossary_zero') },
    { k: 'Reset Pose', v: t('help_glossary_reset') },
  ];

  return (
    <div className="helpCenterMask" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="helpCenterCard" onClick={(e) => e.stopPropagation()}>
        <div className="sectionTitle">
          <h2>{t('help_center_title')}</h2>
          <span className="tip">{page === 'general' ? t('help_general_tag') : t('help_robot_tag')}</span>
        </div>
        <p className="tip">{t('help_center_intro')}</p>

        <div className="helpCenterBody">
          <section className="helpCenterOverview">
            <div className="helpMetricCard">
              <b>{t('help_metric_ops_title')}</b>
              <span>{t('help_metric_ops_desc')}</span>
            </div>
            <div className="helpMetricCard">
              <b>{t('help_metric_safe_title')}</b>
              <span>{t('help_metric_safe_desc')}</span>
            </div>
            <div className="helpMetricCard">
              <b>{t('help_metric_flow_title')}</b>
              <span>{t('help_metric_flow_desc')}</span>
            </div>
          </section>

          <section className="helpCenterSection">
            <h3>{t('help_center_setup_title')}</h3>
            <ul className="helpList">
              <li>{t('help_setup_1')}</li>
              <li>{t('help_setup_2')}</li>
            </ul>
            <div className="helpCallout helpCalloutWarn">
              <b>{t('help_setup_risk_title')}</b>
              <span>{t('help_setup_risk_desc')}</span>
            </div>
            <div className="helpCmdBlock">
              <span className="helpCmdLabel">{t('help_standard_can_restart_cmd')}</span>
              <pre>{canRestartCmd}</pre>
            </div>
            <div className="helpPlatformGrid">
              {setupByPlatform.map((item) => (
                <article key={item.name} className="helpPlatformCard">
                  <div className="helpPlatformHead">
                    <b>{item.name}</b>
                  </div>
                  <div className="helpCmdBlock">
                    <span className="helpCmdLabel">{t('help_setup_install_cmd')}</span>
                    <pre>{item.installCmd}</pre>
                  </div>
                  {item.modeCmds.map((mode) => (
                    <div key={`${item.name}-${mode.name}`} className="helpCmdBlock">
                      <span className="helpCmdLabel">{`${t('help_setup_gateway_cmd')} · ${mode.name}`}</span>
                      <pre>{mode.cmd}</pre>
                    </div>
                  ))}
                </article>
              ))}
            </div>
            <p className="tip">{t('help_setup_3')}</p>
          </section>

          <section className="helpCenterSection">
            <h3>{t('help_center_dmserial_title')}</h3>
            <ul className="helpList">
              <li>{t('help_dmserial_1')}</li>
              <li>{t('help_dmserial_2')}</li>
              <li>{t('help_dmserial_3')}</li>
            </ul>
            <div className="helpPlatformGrid">
              {dmSerialByPlatform.map((item) => (
                <article key={`dm-${item.name}`} className="helpPlatformCard">
                  <div className="helpPlatformHead">
                    <b>{item.name}</b>
                    <span className="chip">{t('help_center_dmserial_title')}</span>
                  </div>
                  <div className="helpCmdBlock">
                    <span className="helpCmdLabel">{t('help_dmserial_gateway_cmd')}</span>
                    <pre>{item.gatewayCmd}</pre>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="helpCenterSection">
            <h3>{t('help_center_quick_title')}</h3>
            <ol className="helpStepList">
              {quickStartItems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ol>
          </section>

          <section className="helpCenterSection">
            <h3>{t('help_center_general_title')}</h3>
            <ul className="helpList">
              {generalItems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>

          <section className="helpCenterSection">
            <h3>{t('help_center_robot_title')}</h3>
            <ul className="helpList">
              {robotItems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>

          <section className="helpCenterSection">
            <h3>{t('help_center_safety_title')}</h3>
            <ul className="helpList">
              {safetyItems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>

          <section className="helpCenterSection">
            <h3>{t('help_center_troubleshoot_title')}</h3>
            <ul className="helpList">
              {troubleshootItems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>

          <section className="helpCenterSection">
            <h3>{t('help_center_glossary_title')}</h3>
            <div className="helpGlossaryGrid">
              {glossaryItems.map((x) => (
                <div key={x.k} className="helpGlossaryItem">
                  <span className="chip">{x.k}</span>
                  <p>{x.v}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="row toolbar compactToolbar">
          <button className="ghostBtn" onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
