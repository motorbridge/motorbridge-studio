import { useRef, useState } from 'react';
import { WsGatewayClient } from '../wsGatewayClient';
import { useI18n } from '../i18n';
import { normalizeGatewayCapabilities, WS_V1_FALLBACK_CAPABILITIES } from '../lib/wsCapabilities';

export function useGatewayBridge({
  wsUrl,
  channel,
  wsTokenEnabled,
  wsToken,
  pushLog,
  setStateSnapshot,
  onGatewayState,
  onGatewayParams,
}) {
  const { t } = useI18n();
  const [connText, setConnText] = useState(t('conn_disconnected'));
  const [connected, setConnected] = useState(false);
  const [targetTransport, setTargetTransport] = useState('auto');
  const [targetSerialPort, setTargetSerialPort] = useState('');
  const [gatewayCapabilities, setGatewayCapabilities] = useState(WS_V1_FALLBACK_CAPABILITIES);
  const [capabilitiesSource, setCapabilitiesSource] = useState('fallback');
  const clientRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const shouldAutoReconnectRef = useRef(false);
  const connectingRef = useRef(false);
  const lastConnectUrlRef = useRef('');
  const connectConfigRef = useRef({ wsUrl, wsTokenEnabled, wsToken });
  const onGatewayStateRef = useRef(onGatewayState);
  const onGatewayParamsRef = useRef(onGatewayParams);
  connectConfigRef.current = { wsUrl, wsTokenEnabled, wsToken };
  onGatewayStateRef.current = onGatewayState;
  onGatewayParamsRef.current = onGatewayParams;

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const reconnectDelayMs = (attempt) => {
    const base = 600;
    const max = 5000;
    const exp = Math.min(max, base * 2 ** Math.max(0, attempt));
    return exp + Math.floor(Math.random() * 300);
  };

  const buildWsConnectUrl = () => {
    const {
      wsUrl: nextWsUrl,
      wsTokenEnabled: nextWsTokenEnabled,
      wsToken: nextWsToken,
    } = connectConfigRef.current;
    const baseUrl = nextWsUrl.trim();
    if (!nextWsTokenEnabled) return baseUrl;
    if (!nextWsToken.trim()) {
      throw new Error(t('ws_token_required'));
    }
    const url = new URL(baseUrl);
    url.searchParams.set('motorbridge_ws_token', nextWsToken.trim());
    return url.toString();
  };

  const connectNow = (client, statusText = '', forceReconnect = false) => {
    const nextUrl = buildWsConnectUrl();
    const isAlreadyConnected = connected || client?.isConnected?.();
    if (connectingRef.current) return;
    if (isAlreadyConnected && !forceReconnect && nextUrl === lastConnectUrlRef.current) return;
    connectingRef.current = true;
    setConnText(statusText || t('conn_connecting'));
    try {
      lastConnectUrlRef.current = nextUrl;
      client.connect(nextUrl);
    } catch (e) {
      connectingRef.current = false;
      pushLog(e.message || e, 'err');
      throw e;
    }
  };

  const ensureClient = () => {
    if (!clientRef.current) {
      clientRef.current = new WsGatewayClient({
        onEvent: (msg, lvl = 'info') => {
          const text = String(msg || '');
          if (
            text.startsWith('ws msg:') ||
            text.startsWith('async ws message:') ||
            text.startsWith('tx:')
          ) {
            return;
          }
          pushLog(msg, lvl);
        },
        onState: (st) => {
          setStateSnapshot(JSON.stringify(st, null, 2));
          onGatewayStateRef.current?.(st);
        },
        onParams: (data) => {
          setStateSnapshot(JSON.stringify(data, null, 2));
          onGatewayParamsRef.current?.(data);
        },
        onMessage: (msg) => {
          if (msg?.type === 'event' && msg?.event === 'connected' && msg?.data) {
            const d = msg.data;
            const target = d.default_target || {};
            const transport = target.transport ?? d.transport ?? 'auto';
            const serialPort = target.serial_port ?? d.serial_port ?? '';
            setTargetTransport(transport);
            setTargetSerialPort(serialPort);
            setStateSnapshot(
              JSON.stringify(
                {
                  gateway: {
                    router_mode: d.router_mode || 'unknown',
                    connected_bus: d.connected_bus ?? null,
                  },
                  target_default: {
                    vendor: target.vendor ?? d.vendor ?? null,
                    transport,
                    channel: target.channel ?? d.channel ?? null,
                    serial_port: serialPort || null,
                    model: target.model ?? d.model ?? null,
                    motor_id: target.motor_id ?? d.motor_id ?? null,
                    feedback_id: target.feedback_id ?? d.feedback_id ?? null,
                  },
                },
                null,
                2
              )
            );
            return;
          }

          if (msg?.ok === true && msg?.op === 'set_target') {
            const d = msg?.data || {};
            if (typeof d.transport === 'string') setTargetTransport(d.transport);
            if (typeof d.serial_port === 'string') setTargetSerialPort(d.serial_port);
          }
        },
        onOpen: () => {
          clearReconnectTimer();
          reconnectAttemptRef.current = 0;
          connectingRef.current = false;
          setConnected(true);
          setConnText(t('conn_connected'));
          pushLog(
            t('log_connected', {
              url: lastConnectUrlRef.current || connectConfigRef.current.wsUrl,
            }),
            'ok'
          );
          clientRef.current
            ?.send('capabilities', {}, 3000)
            .then((ret) => {
              if (!ret?.ok) throw new Error(ret?.error || 'capabilities failed');
              setGatewayCapabilities(normalizeGatewayCapabilities(ret));
              setCapabilitiesSource('gateway');
              pushLog(t('log_capabilities_gateway'), 'ok');
            })
            .catch((e) => {
              setGatewayCapabilities(WS_V1_FALLBACK_CAPABILITIES);
              setCapabilitiesSource('fallback');
              pushLog(t('log_capabilities_fallback', { err: e.message || e }), 'info');
            });
        },
        onClose: () => {
          connectingRef.current = false;
          setConnected(false);
          setConnText(t('conn_disconnected'));
          pushLog(t('log_disconnected'), 'err');
          if (!shouldAutoReconnectRef.current) return;

          clearReconnectTimer();
          const attempt = reconnectAttemptRef.current + 1;
          reconnectAttemptRef.current = attempt;
          const delay = reconnectDelayMs(attempt - 1);
          setConnText(t('conn_reconnecting_in', { sec: Math.ceil(delay / 1000) }));
          pushLog(t('log_reconnect_attempt', { n: attempt, ms: delay }), 'info');

          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            try {
              connectNow(clientRef.current, t('conn_reconnecting_n', { n: attempt }), true);
            } catch (e) {
              pushLog(t('log_reconnect_start_failed', { err: e.message || e }), 'err');
            }
          }, delay);
        },
        onError: () => {
          connectingRef.current = false;
          pushLog(t('log_error'), 'err');
        },
      });
    }
    return clientRef.current;
  };

  const sendCmd = async (op, payload = {}, timeoutMs = 8000, opts = undefined) => {
    const client = ensureClient();
    return client.send(op, payload, timeoutMs, opts);
  };

  const connectWs = () => {
    shouldAutoReconnectRef.current = true;
    clearReconnectTimer();
    try {
      connectNow(ensureClient());
    } catch {
      shouldAutoReconnectRef.current = false;
      connectingRef.current = false;
      setConnected(false);
      setConnText(t('conn_disconnected'));
    }
  };

  const disconnectWs = () => {
    shouldAutoReconnectRef.current = false;
    reconnectAttemptRef.current = 0;
    clearReconnectTimer();
    connectingRef.current = false;
    lastConnectUrlRef.current = '';
    setConnected(false);
    setConnText(t('conn_disconnected'));
    ensureClient().disconnect();
  };

  const closeBusQuietly = async () => {
    try {
      const ret = await sendCmd('close_bus', {}, 3000);
      if (!ret.ok) pushLog(t('log_close_bus_warn', { err: ret.error || 'unknown' }), 'err');
    } catch (e) {
      pushLog(t('log_close_bus_warn', { err: e.message || e }), 'err');
    }
  };

  const setTargetFor = async (vendor, model, motorId, feedbackId, options = {}) => {
    const enableStreams = options.enableStreams !== false;
    const ret = await sendCmd(
      'set_target',
      {
        vendor,
        channel,
        model,
        motor_id: motorId,
        feedback_id: feedbackId,
      },
      10000
    );
    if (!ret.ok) throw new Error(ret.error || 'set_target failed');
    if (!enableStreams) return;
    if (String(vendor) === 'robstride') {
      try {
        await sendCmd(
          'robstride_write_param',
          { param_id: 0x7026, type: 'u16', value: 3, timeout_ms: 500 },
          3000
        );
      } catch (e) {
        pushLog(`robstride report period setup failed: ${e.message || e}`, 'err');
      }
      try {
        await sendCmd('set_active_report', { enabled: true }, 3000);
      } catch (e) {
        pushLog(`robstride active report enable failed: ${e.message || e}`, 'err');
      }
    }
    try {
      await sendCmd('state_stream', { enabled: true }, 3000);
    } catch (e) {
      pushLog(`state stream enable failed: ${e.message || e}`, 'err');
    }
    if (String(vendor) === 'robstride' || String(vendor) === 'damiao') {
      try {
        const paramStreamConfig =
          String(vendor) === 'robstride'
            ? { enabled: true, profile: 'realtime', interval_ms: 100, timeout_ms: 80 }
            : { enabled: true, profile: 'realtime', interval_ms: 500, timeout_ms: 80 };
        await sendCmd('param_stream', paramStreamConfig, 3000);
      } catch (e) {
        pushLog(`param stream enable failed: ${e.message || e}`, 'err');
      }
    }
  };

  return {
    connText,
    connected,
    targetTransport,
    targetSerialPort,
    gatewayCapabilities,
    capabilitiesSource,
    connectWs,
    disconnectWs,
    sendCmd,
    closeBusQuietly,
    setTargetFor,
  };
}
