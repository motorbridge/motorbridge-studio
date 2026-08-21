import { describe, expect, it } from 'vitest';
import {
  REBOT_ARM_JOINT_LIMITS,
  REBOT_ARM_ROBSTRIDE_JOINT_LIMITS,
  REBOT_ARM_ROBSTRIDE_DEFAULT_TEMPLATE,
  ROBSTRIDE_TEMPLATE_PARAM_IDS,
  jointLimitsForProfile,
  normalizeRobotArmModel,
} from './robotArm';

describe('robotArm config', () => {
  it('normalizes aliases', () => {
    expect(normalizeRobotArmModel('reBot-Arm Lite')).toBe('rebot-arm-robstride');
    expect(normalizeRobotArmModel('7dof')).toBe('rebot-arm-damiao');
  });

  it('contains joint limits for all joints', () => {
    for (let joint = 1; joint <= 7; joint += 1) {
      expect(REBOT_ARM_JOINT_LIMITS[joint]).toBeTruthy();
      expect(REBOT_ARM_JOINT_LIMITS[joint].min).toBeLessThanOrEqual(
        REBOT_ARM_JOINT_LIMITS[joint].max
      );
    }
  });

  it('returns model-specific limits map', () => {
    expect(jointLimitsForProfile('rebot-arm-damiao')).toBe(REBOT_ARM_JOINT_LIMITS);
    expect(jointLimitsForProfile('rebot-arm-robstride')).toBe(REBOT_ARM_ROBSTRIDE_JOINT_LIMITS);
    expect(jointLimitsForProfile('reBot-Arm Lite')).toBe(REBOT_ARM_ROBSTRIDE_JOINT_LIMITS);
  });

  it('contains RobStride default template values for all joints', () => {
    expect(Object.keys(REBOT_ARM_ROBSTRIDE_DEFAULT_TEMPLATE)).toHaveLength(7);
    // Compared numerically — the template stores string values whose form
    // ('5' vs '5.0') is not meaningful.
    const expectNum = (joint, expected) => {
      const tpl = REBOT_ARM_ROBSTRIDE_DEFAULT_TEMPLATE[joint];
      for (const [field, value] of Object.entries(expected)) {
        expect(Number(tpl[field])).toBeCloseTo(value, 5);
      }
    };
    expectNum(1, { curKp: 0.17, locKp: 13, spdKp: 12, accRad: 12, velMax: 1 });
    expectNum(2, { curKp: 0.08, locKp: 17, spdKp: 13.5, accRad: 1.5, velMax: 0.4 });
    expectNum(7, { curKp: 0.125, locKp: 10, spdKp: 5, accRad: 20, velMax: 1 });
  });

  it('covers the 22 tuning params (no MIT target references) for every RobStride joint', () => {
    const fields = Object.keys(ROBSTRIDE_TEMPLATE_PARAM_IDS);
    expect(fields).toHaveLength(22);
    expect(fields).not.toContain('iqRef');
    expect(fields).not.toContain('spdRef');
    expect(fields).not.toContain('locRef');
    for (let joint = 1; joint <= 7; joint += 1) {
      const tpl = REBOT_ARM_ROBSTRIDE_DEFAULT_TEMPLATE[joint];
      expect(tpl).toBeTruthy();
      expect(tpl).not.toHaveProperty('iqRef');
      expect(tpl).not.toHaveProperty('spdRef');
      expect(tpl).not.toHaveProperty('locRef');
      // Every template field has a numeric value.
      for (const field of fields) {
        expect(tpl[field]).toBeDefined();
        expect(Number(tpl[field])).not.toBeNaN();
      }
    }
  });
});
