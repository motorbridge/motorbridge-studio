export class SimuWsBridge {
  constructor({ url, onStatus, onState, onLog, onPacket, onTask }) {
    this.url = url;
    this.onStatus = onStatus;
    this.onState = onState;
    this.onLog = onLog;
    this.onPacket = onPacket;
    this.onTask = onTask;
    this.ws = null;
    this.reqId = 1;
    this.pending = new Map();
    this.autoReconnect = true;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
  }

  _emitStatus(status) {
    this.onStatus?.(status);
  }

  _emitLog(msg) {
    this.onLog?.(msg);
  }

  setUrl(url) {
    this.url = String(url || '').trim();
  }

  connect() {
    if (!this.url) throw new Error('empty ws url');
    this.disconnect(false);
    this._emitStatus({ connected: false, phase: 'connecting' });
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this._emitStatus({ connected: true, phase: 'connected' });
      this._emitLog(`connected: ${this.url}`);
    };
    this.ws.onclose = () => {
      this._rejectPending('ws closed');
      this._emitStatus({ connected: false, phase: 'disconnected' });
      if (this.autoReconnect) this._scheduleReconnect();
    };
    this.ws.onerror = () => {
      this._emitLog('ws error');
    };
    this.ws.onmessage = (ev) => {
      let msg = null;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.onPacket?.({ dir: 'rx', packet: msg, ts: Date.now() / 1000 });
      if (msg?.type === 'state') {
        this.onState?.(msg.data);
        return;
      }
      if (msg?.type === 'task' || msg?.type === 'waypoint') {
        this.onTask?.(msg);
        return;
      }
      if (typeof msg?.ok === 'boolean' && msg?.req_id != null) {
        const p = this.pending.get(msg.req_id);
        if (!p) return;
        this.pending.delete(msg.req_id);
        clearTimeout(p.timer);
        p.resolve(msg);
      }
    };
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    const ms = Math.min(5000, 500 * 2 ** Math.max(0, this.reconnectAttempt - 1));
    this._emitStatus({ connected: false, phase: 'reconnecting', delayMs: ms });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      try {
        this.connect();
      } catch {
        this._scheduleReconnect();
      }
    }, ms);
  }

  _rejectPending(reason) {
    const err = new Error(reason || 'ws closed');
    this.pending.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(err);
    });
    this.pending.clear();
  }

  disconnect(manual = true) {
    if (manual) this.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._rejectPending('ws disconnected');
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
    }
    this.ws = null;
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  send(op, payload = {}, timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new Error('ws not connected'));
        return;
      }
      const reqId = this.reqId++;
      const req = { op, req_id: reqId, ...payload };
      this.onPacket?.({ dir: 'tx', packet: req, ts: Date.now() / 1000 });
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new Error(`timeout: ${op}`));
      }, timeoutMs);
      this.pending.set(reqId, { resolve, reject, timer });
      this.ws.send(JSON.stringify(req));
    });
  }
}
