import { describe, expect, it } from 'vitest';
import { armPreferredMode } from './armMotionUtils';

describe('armPreferredMode', () => {
  it('uses explicit PP for RobStride when the gateway advertises it', () => {
    expect(armPreferredMode('robstride', ['mit', 'pos_vel', 'pos_vel_pp'])).toBe('pos_vel_pp');
  });

  it('keeps the legacy mode for older RobStride gateways', () => {
    expect(armPreferredMode('robstride', ['mit', 'pos_vel', 'vel'])).toBe('pos_vel');
  });

  it('keeps other vendors on unified pos_vel', () => {
    expect(armPreferredMode('damiao', ['mit', 'pos_vel'])).toBe('pos_vel');
  });
});
