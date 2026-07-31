import { describe, expect, it } from 'vitest';
import {
  modesForVendor,
  normalizeGatewayCapabilities,
  WS_V1_FALLBACK_CAPABILITIES,
} from './wsCapabilities';

describe('ws capabilities helpers', () => {
  it('keeps v0.3.5 fallback modes aligned for RobStride pos_vel', () => {
    expect(modesForVendor(WS_V1_FALLBACK_CAPABILITIES, 'robstride')).toContain('pos_vel');
  });

  it('merges gateway capabilities over fallback without dropping vendor defaults', () => {
    const caps = normalizeGatewayCapabilities({
      data: {
        vendors: {
          robstride: {
            modes: ['mit', 'pos_vel', 'vel'],
          },
        },
      },
    });
    expect(caps.vendors.robstride.modes).toEqual(['mit', 'pos_vel', 'vel']);
    expect(caps.vendors.robstride.ops_vendor_native).toContain('robstride_read_param');
  });

  it('exposes explicit RobStride PP and CSP modes advertised by a new gateway', () => {
    const caps = normalizeGatewayCapabilities({
      data: {
        vendors: {
          robstride: {
            modes: ['mit', 'pos_vel', 'pos_vel_pp', 'pos_vel_csp', 'vel'],
          },
        },
      },
    });

    expect(modesForVendor(caps, 'robstride')).toContain('pos_vel_pp');
    expect(modesForVendor(caps, 'robstride')).toContain('pos_vel_csp');
    expect(modesForVendor(caps, 'damiao')).not.toContain('pos_vel_pp');
    expect(modesForVendor(caps, 'damiao')).not.toContain('pos_vel_csp');
  });
});
