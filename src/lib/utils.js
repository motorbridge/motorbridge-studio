export function ts() {
  return new Date().toLocaleTimeString();
}

export function parseNum(raw, fallback = 0) {
  const s = String(raw ?? '').trim();
  if (!s) return fallback;
  if (s.startsWith('0x') || s.startsWith('0X')) {
    const n = Number.parseInt(s, 16);
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

export function toHex(n) {
  return `0x${Number(n).toString(16).toUpperCase()}`;
}

export const NUMERIC_CONTROL_FIELDS = new Set(['target', 'vlim', 'acc', 'kp', 'kd', 'tau', 'ratio', 'newEsc', 'newMst']);

export function normalizeControlValue(field, value, fallback = 0) {
  if (!NUMERIC_CONTROL_FIELDS.has(field)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return '';
    if (trimmed === '-' || trimmed === '.' || trimmed === '-.') return trimmed;
    if (/^-?\d+\.$/.test(trimmed)) return trimmed;
  }
  return parseNum(value, fallback);
}

export function normalizeControlForHit(hit, rawControl) {
  const defaults = defaultControlsForHit(hit);
  const merged = {
    ...defaults,
    ...(rawControl && typeof rawControl === 'object' ? rawControl : {}),
  };
  Object.keys(defaults).forEach((field) => {
    const fallback = defaults[field];
    const value = merged[field];
    if (value == null) {
      merged[field] = fallback;
      return;
    }
    merged[field] = normalizeControlValue(field, value, fallback);
  });
  return merged;
}

export function controlInputValue(value) {
  return value == null ? '' : String(value);
}

export function getResponseValue(ret) {
  return ret?.data?.value ?? ret?.value ?? ret?.data?.result?.value ?? ret?.result?.value;
}

export function motorKey(h) {
  return `${h.vendor}:${h.esc_id}:${h.mst_id}`;
}

export function mergeHitsByVendor(prev, incoming) {
  const map = new Map();
  for (const h of prev) map.set(motorKey(h), h);
  for (const h of incoming) {
    const k = motorKey(h);
    const old = map.get(k);
    map.set(k, { ...(old || {}), ...h });
  }
  return [...map.values()];
}

export function dedupHitsByVendor(list) {
  const seen = new Set();
  const out = [];
  for (const h of list) {
    const k = motorKey(h);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(h);
  }
  return out;
}

export function defaultControlsForHit(hit) {
  const mode = hit.vendor === 'damiao' ? 'pos_vel' : (hit.vendor === 'robstride' ? 'mit' : 'vel');
  return {
    mode,
    enabled: false,
    target: 0,
    vlim: 1,
    acc: 10,
    kp: 30,
    kd: 1,
    tau: 0,
    ratio: 0.1,
    newEsc: Number(hit.esc_id),
    newMst: Number(hit.mst_id),
  };
}

export function isAutoModel(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return s === '' || s === 'auto' || s === 'all' || s === '*';
}

export function damiaoModelCandidates(raw) {
  const s = String(raw || '').trim();
  if (isAutoModel(s)) return ['4340', '4310'];
  if (s.includes(',')) {
    const arr = s.split(',').map((x) => x.trim()).filter(Boolean);
    return arr.length ? arr : ['4340', '4310'];
  }
  return [s];
}

export function formatLocal(ms) {
  if (!ms) return '-';
  try {
    return new Date(ms).toLocaleTimeString();
  } catch {
    return '-';
  }
}

export function scanSummary(h) {
  const hasTelemetry =
    Number.isFinite(h.pos) || Number.isFinite(h.vel) || Number.isFinite(h.torq);
  if (hasTelemetry) {
    return `fb pos=${Number.isFinite(h.pos) ? h.pos.toFixed(2) : '-'} vel=${Number.isFinite(h.vel) ? h.vel.toFixed(2) : '-'} torq=${Number.isFinite(h.torq) ? h.torq.toFixed(2) : '-'}`;
  }
  if (h.vendor === 'damiao' && h.detected_by === 'registers') {
    return `reg p=${Number.isFinite(h.pmax) ? h.pmax.toFixed(2) : '-'} v=${Number.isFinite(h.vmax) ? h.vmax.toFixed(2) : '-'} t=${Number.isFinite(h.tmax) ? h.tmax.toFixed(2) : '-'}`;
  }
  if (h.vendor !== 'damiao') return `${toHex(h.esc_id)} / ${toHex(h.mst_id)}`;
  return '-';
}

export function normalizeHits(vendor, data, model) {
  const arr = Array.isArray(data?.hits) ? data.hits : [];
  const now = Date.now();
  const out = [];
  for (const h of arr) {
    if (vendor === 'damiao') {
      out.push({
        vendor,
        model,
        probe: Number(h.probe ?? h.esc_id ?? 0),
        esc_id: Number(h.esc_id ?? h.probe ?? 0),
        mst_id: Number(h.mst_id ?? h.probe_feedback_id ?? 0),
        detected_by: String(h.detected_by ?? ''),
        model_guess: String(h.model_guess ?? ''),
        pmax: Number(h.pmax ?? Number.NaN),
        vmax: Number(h.vmax ?? Number.NaN),
        tmax: Number(h.tmax ?? Number.NaN),
        status: Number(h.status ?? Number.NaN),
        pos: Number(h.pos ?? Number.NaN),
        vel: Number(h.vel ?? Number.NaN),
        torq: Number(h.torq ?? Number.NaN),
        updated_at_ms: now,
      });
      continue;
    }
    if (vendor === 'robstride') {
      // RobStride probe is the candidate ID. A ping hit is confirmed only when
      // the response device_id agrees, otherwise it is likely a stale/cross reply.
      const probeId = Number(h.probe ?? Number.NaN);
      const deviceId = Number(h.device_id ?? Number.NaN);
      const hasProbeId = Number.isFinite(probeId) && probeId > 0;
      const hasDeviceId = Number.isFinite(deviceId) && deviceId > 0;
      if (hasProbeId && hasDeviceId && probeId !== deviceId) continue;
      const motorId = hasDeviceId ? deviceId : probeId;
      if (!Number.isFinite(motorId) || motorId <= 0) continue;
      const modelPatch = robstrideModelLimits(model);
      out.push({
        vendor,
        model,
        probe: hasProbeId ? probeId : motorId,
        esc_id: motorId,
        device_id: deviceId,
        responder_id: Number(h.responder_id ?? Number.NaN),
        mst_id: Number(h.feedback_id ?? 0xFD),
        ...modelPatch,
        updated_at_ms: now,
      });
      continue;
    }
    out.push({
      vendor,
      model,
      probe: Number(h.probe ?? h.motor_id ?? h.node_id ?? 0),
      esc_id: Number(h.motor_id ?? h.node_id ?? h.probe ?? 0),
      mst_id: Number(h.feedback_id ?? 0),
      updated_at_ms: now,
    });
  }
  return out;
}

export function robstrideModelLimits(model) {
  const pmax = 4 * Math.PI;
  const table = {
    'rs-00': { pmax, vmax: 50, tmax: 17 },
    'rs-01': { pmax, vmax: 44, tmax: 17 },
    'rs-02': { pmax, vmax: 44, tmax: 17 },
    'rs-03': { pmax, vmax: 50, tmax: 60 },
    'rs-04': { pmax, vmax: 15, tmax: 120 },
    'rs-05': { pmax, vmax: 33, tmax: 17 },
    'rs-06': { pmax, vmax: 20, tmax: 60 },
  };
  return table[String(model || '').toLowerCase()] || {};
}
