import { parseNum } from './utils';

export const VENDOR_SCAN_FIELD_MAP = {
  damiao: { key: 'feedbackBase', fallback: 0x10, type: 'feedback_base' },
  robstride: { key: 'feedbackId', fallback: 0xfd, type: 'feedback_id' },
};

export function getVendorModels(vendor, model, damiaoModelCandidates) {
  if (vendor === 'damiao') return damiaoModelCandidates(model);
  return [model || vendor];
}

export function getVendorScanDefaults(vendor, cfg, startId) {
  if (vendor === 'robstride') {
    return parseNum(cfg.feedbackId, 0xfd);
  }
  if (vendor === 'damiao') {
    return parseNum(cfg.feedbackBase, 0x10) + (startId & 0x0f);
  }
  return 0;
}

export function buildScanPayloadExtras(vendor, cfg) {
  if (vendor === 'damiao') {
    return { feedback_base: parseNum(cfg.feedbackBase, 0x10) };
  }
  if (vendor === 'robstride') {
    const raw = String(cfg.feedbackId ?? '').trim();
    const parts = raw.includes(',') ? raw.split(',').map((x) => x.trim()).filter(Boolean) : [raw];
    const feedbackIds = [];
    const pushUnique = (id) => {
      if (Number.isFinite(id) && id >= 0 && !feedbackIds.includes(id)) feedbackIds.push(id);
    };
    for (const p of parts) pushUnique(parseNum(p, Number.NaN));
    if (feedbackIds.length === 0) pushUnique(parseNum(cfg.feedbackId, 0xfd));
    return { feedback_ids: feedbackIds };
  }
  return {};
}

export function buildSetIdPayload(vendor, h, newEsc, newMst) {
  if (vendor === 'damiao') {
    return {
      vendor: 'damiao',
      old_motor_id: h.esc_id,
      old_feedback_id: h.mst_id,
      new_motor_id: newEsc,
      new_feedback_id: newMst,
      store: true,
      verify: true,
    };
  }
  if (vendor === 'robstride') {
    return {
      vendor: 'robstride',
      old_motor_id: h.esc_id,
      new_motor_id: newEsc,
      feedback_id: h.mst_id,
      verify: true,
    };
  }
  return null;
}

export function buildProbePayload(vendor, escId, mstId) {
  const payload = {
    vendor,
    start_id: Number(escId),
    end_id: Number(escId),
    timeout_ms: 300,
  };

  if (vendor === 'damiao') {
    const feedbackBase = Math.max(0, Number(mstId) - (Number(escId) & 0x0f));
    payload.feedback_base = feedbackBase;
  }
  if (vendor === 'robstride') {
    payload.feedback_ids = [Number(mstId)];
  }

  return payload;
}
