import { describe, expect, it } from 'vitest';
import { normalizeHits } from './utils';

describe('utils normalizeHits', () => {
  it('uses probe as robstride esc_id when both probe and device_id exist', () => {
    const normalized = normalizeHits(
      'robstride',
      {
        hits: [
          { probe: 1, device_id: 35, responder_id: 254, feedback_id: 0xfd },
          { probe: 2, device_id: 71, responder_id: 254, feedback_id: 0xfd },
        ],
      },
      'rs-00',
    );

    expect(normalized).toHaveLength(2);
    expect(normalized[0].esc_id).toBe(1);
    expect(normalized[1].esc_id).toBe(2);
    expect(normalized[0].device_id).toBe(35);
    expect(normalized[1].device_id).toBe(71);
  });
});
