import {
  ROBSTRIDE_PARAM_CATALOG,
  canRobstrideWrite,
  toRobstrideCliType,
} from './robstrideParamCatalog';

export const ROBOT_ARM_MODELS = [
  { key: 'rebot-arm-damiao', label: 'rebot-arm-damiao' },
  { key: 'rebot-arm-robstride', label: 'rebot-arm-robstride' },
];

const ROBOT_ARM_MODEL_KEYS = new Set(ROBOT_ARM_MODELS.map((x) => x.key));
const ROBOT_ARM_MODEL_ALIASES = {
  'reBot-Arm 7DOF': 'rebot-arm-damiao',
  'reBot-Arm Lite': 'rebot-arm-robstride',
  'rebot-arm-7dof': 'rebot-arm-damiao',
  'rebot-arm-lite': 'rebot-arm-robstride',
  '7dof': 'rebot-arm-damiao',
  lite: 'rebot-arm-robstride',
};

const PROFILE_VENDOR = {
  'rebot-arm-damiao': 'damiao',
  'rebot-arm-robstride': 'robstride',
};

const PROFILE_DEFAULT_MODEL = {
  'rebot-arm-damiao': '4310',
  'rebot-arm-robstride': 'rs-00',
};

export const ROBSTRIDE_FEEDBACK_IDS = [0xfd, 0xff, 0xfe];

export const ROBOT_ARM_JOINTS = [
  { joint: 1, esc_id: 0x01 },
  { joint: 2, esc_id: 0x02 },
  { joint: 3, esc_id: 0x03 },
  { joint: 4, esc_id: 0x04 },
  { joint: 5, esc_id: 0x05 },
  { joint: 6, esc_id: 0x06 },
  { joint: 7, esc_id: 0x07 },
];

export const REBOT_ARM_DAMIAO_DEFAULT_TEMPLATE = {
  1: {
    ctrlMode: '2',
    currentBw: '1000',
    velKp: '0.0125',
    velKi: '0.004',
    posKp: '150',
    posKi: '0.5',
  },
  2: {
    ctrlMode: '2',
    currentBw: '1000',
    velKp: '0.013',
    velKi: '0.004',
    posKp: '200',
    posKi: '10',
  },
  3: {
    ctrlMode: '2',
    currentBw: '1000',
    velKp: '0.013',
    velKi: '0.004',
    posKp: '200',
    posKi: '10',
  },
  4: { ctrlMode: '2', currentBw: '1000', velKp: '0.0008', velKi: '0.002', posKp: '50', posKi: '1' },
  5: { ctrlMode: '2', currentBw: '1000', velKp: '0.0008', velKi: '0.002', posKp: '50', posKi: '1' },
  6: { ctrlMode: '2', currentBw: '1000', velKp: '0.0008', velKi: '0.002', posKp: '50', posKi: '1' },
  7: { ctrlMode: '2', currentBw: '1000', velKp: '0.0008', velKi: '0.002', posKp: '50', posKi: '1' },
};

// Maps each RobStride default-template field name to its runtime param id,
// so buildRobstrideTemplateParsed can build the { joints, rows } structure
// straight from the template without the TSV parser or the table-editor
// param defs. Covers the 22 writable tuning/config section-4 params — the
// three MIT target references (iq_ref 0x7006 / spd_ref 0x700a / loc_ref
// 0x7016) are deliberately excluded: they are control commands (current /
// speed / position targets), not parameters, and writing them would
// command the motor to move or apply torque. The TSV import path still
// carries all 25 params — it restores a full export snapshot, where
// re-applying the targets is the intent. Order follows ascending param id.
export const ROBSTRIDE_TEMPLATE_PARAM_IDS = {
  runMode: 0x7005,
  limitTorque: 0x700b,
  curKp: 0x7010,
  curKi: 0x7011,
  curFilterGain: 0x7014,
  limitSpd: 0x7017,
  limitCur: 0x7018,
  locKp: 0x701e,
  spdKp: 0x701f,
  spdKi: 0x7020,
  spdFilterGain: 0x7021,
  accRad: 0x7022,
  velMax: 0x7024,
  accSet: 0x7025,
  epScanTime: 0x7026,
  canTimeout: 0x7028,
  zeroSta: 0x7029,
  damper: 0x702a,
  addOffset: 0x702b,
  alveolousOpen: 0x702c,
  iqTest: 0x702d,
  dccSet: 0x702e,
};

// Default RobStride arm parameter template — one entry per joint (1..7),
// covering the 22 writable tuning/config params (no MIT target references:
// iq_ref/spd_ref/loc_ref are control commands, not parameters). Values are
// the arm's known-good snapshot. Tuning gains/limits use clean numbers.
//
// SAFETY: runMode (0x7005) is a runtime quantity, not a tuning. Applying
// this template to an enabled arm that is currently in another mode will
// switch it to MIT (run_mode 0). Prefer applying with the arm disabled.
// Target references (position/velocity/current) are intentionally NOT in
// the template, so applying it will not command the motor to move.
export const REBOT_ARM_ROBSTRIDE_DEFAULT_TEMPLATE = {
  1: {
    runMode: '0',
    limitTorque: '36',
    curKp: '0.17',
    curKi: '0.012',
    curFilterGain: '0.1',
    limitSpd: '10',
    limitCur: '57',
    locKp: '13',
    spdKp: '12.0',
    spdKi: '0.02',
    spdFilterGain: '0.1',
    accRad: '12.0',
    velMax: '1',
    accSet: '10',
    epScanTime: '3',
    canTimeout: '0',
    zeroSta: '1',
    damper: '0',
    addOffset: '0',
    alveolousOpen: '0',
    iqTest: '0',
    dccSet: '0',
  },
  2: {
    runMode: '0',
    limitTorque: '36',
    curKp: '0.08',
    curKi: '0.012',
    curFilterGain: '0.1',
    limitSpd: '10',
    limitCur: '57',
    locKp: '17',
    spdKp: '13.5',
    spdKi: '0.02',
    spdFilterGain: '0.1',
    accRad: '1.5',
    velMax: '0.4',
    accSet: '10',
    epScanTime: '0',
    canTimeout: '0',
    zeroSta: '1',
    damper: '0',
    addOffset: '0',
    alveolousOpen: '0',
    iqTest: '0',
    dccSet: '0',
  },
  3: {
    runMode: '0',
    limitTorque: '36',
    curKp: '0.08',
    curKi: '0.012',
    curFilterGain: '0.1',
    limitSpd: '10',
    limitCur: '57',
    locKp: '17',
    spdKp: '13.5',
    spdKi: '0.02',
    spdFilterGain: '0.1',
    accRad: '1.5',
    velMax: '0.4',
    accSet: '10',
    epScanTime: '0',
    canTimeout: '0',
    zeroSta: '1',
    damper: '0',
    addOffset: '0',
    alveolousOpen: '0',
    iqTest: '0',
    dccSet: '0',
  },
  4: {
    runMode: '0',
    limitTorque: '14',
    curKp: '0.125',
    curKi: '0.0158',
    curFilterGain: '0.1',
    limitSpd: '1',
    limitCur: '16',
    locKp: '30',
    spdKp: '8',
    spdKi: '0.02',
    spdFilterGain: '0.05',
    accRad: '20.0',
    velMax: '1',
    accSet: '10',
    epScanTime: '3',
    canTimeout: '0',
    zeroSta: '1',
    damper: '0',
    addOffset: '0',
    alveolousOpen: '0',
    iqTest: '0',
    dccSet: '0',
  },
  5: {
    runMode: '0',
    limitTorque: '14',
    curKp: '0.125',
    curKi: '0.0158',
    curFilterGain: '0.1',
    limitSpd: '33',
    limitCur: '16',
    locKp: '18',
    spdKp: '5',
    spdKi: '0.02',
    spdFilterGain: '0.05',
    accRad: '20.0',
    velMax: '1',
    accSet: '10',
    epScanTime: '3',
    canTimeout: '0',
    zeroSta: '1',
    damper: '0',
    addOffset: '0',
    alveolousOpen: '0',
    iqTest: '0',
    dccSet: '0',
  },
  6: {
    runMode: '0',
    limitTorque: '14',
    curKp: '0.125',
    curKi: '0.0158',
    curFilterGain: '0.1',
    limitSpd: '33',
    limitCur: '16',
    locKp: '10',
    spdKp: '5',
    spdKi: '0.02',
    spdFilterGain: '0.05',
    accRad: '20.0',
    velMax: '1',
    accSet: '10',
    epScanTime: '3',
    canTimeout: '0',
    zeroSta: '1',
    damper: '0',
    addOffset: '0',
    alveolousOpen: '0',
    iqTest: '0',
    dccSet: '0',
  },
  7: {
    runMode: '0',
    limitTorque: '14',
    curKp: '0.125',
    curKi: '0.0158',
    curFilterGain: '0.1',
    limitSpd: '33',
    limitCur: '16',
    locKp: '10',
    spdKp: '5',
    spdKi: '0.02',
    spdFilterGain: '0.05',
    accRad: '20.0',
    velMax: '1',
    accSet: '10',
    epScanTime: '0',
    canTimeout: '0',
    zeroSta: '1',
    damper: '0',
    addOffset: '0',
    alveolousOpen: '0',
    iqTest: '0',
    dccSet: '0',
  },
};

// Build a { joints, rows } structure (same shape parseRobstrideParamsTsv
// yields) straight from the in-memory default template, so apply-default-
// template can reuse the import compare/write/save path without a TSV file.
// Each template field maps to a writable catalog param via
// ROBSTRIDE_TEMPLATE_PARAM_IDS; only params the template actually carries
// numeric values for are included. The map excludes the MIT target
// references (iq_ref/spd_ref/loc_ref) so applying never commands motion;
// see the map and template SAFETY comments.
export function buildRobstrideTemplateParsed(template) {
  const joints = Object.keys(template || {})
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const rows = [];
  for (const [field, paramId] of Object.entries(ROBSTRIDE_TEMPLATE_PARAM_IDS)) {
    const values = {};
    for (const joint of joints) {
      const tpl = template[joint];
      if (!tpl) continue;
      const raw = tpl[field];
      if (raw == null || String(raw).trim() === '') continue;
      const num = Number(raw);
      if (!Number.isFinite(num)) continue;
      values[joint] = num;
    }
    if (Object.keys(values).length === 0) continue;
    const catDef = ROBSTRIDE_PARAM_CATALOG.find((d) => d.id === paramId);
    if (!catDef || !canRobstrideWrite(catDef.access)) continue;
    rows.push({
      def: catDef,
      paramId,
      type: toRobstrideCliType(catDef.dataType),
      values,
    });
  }
  return { joints, rows };
}

export const REBOT_ARM_DAMIAO_JOINT_LIMITS = {
  1: { min: -2.61, max: 2.61 },
  2: { min: -3.7, max: 0.0 },
  3: { min: -3.7, max: 0.0 },
  4: { min: -1.57, max: 1.57 },
  5: { min: -1.57, max: 1.57 },
  6: { min: -1.57, max: 1.57 },
  7: { min: -5.7, max: 0.0 },
};

export const REBOT_ARM_ROBSTRIDE_JOINT_LIMITS = {
  // Converted from provided degree limits:
  // shoulder_pan(-145,145), shoulder_lift(0,170), elbow_flex(0,200),
  // wrist_flex(-80,90), wrist_yaw(-90,90), wrist_roll(-90,90), gripper(0,270)
  1: { min: -2.53, max: 2.53 },
  2: { min: 0.0, max: 2.96 },
  3: { min: 0.0, max: 3.5 },
  4: { min: -1.39, max: 1.57 },
  5: { min: -1.57, max: 1.57 },
  6: { min: -1.57, max: 1.57 },
  7: { min: 0.0, max: 4.71 },
};

const PROFILE_JOINT_LIMITS = {
  'rebot-arm-damiao': REBOT_ARM_DAMIAO_JOINT_LIMITS,
  'rebot-arm-robstride': REBOT_ARM_ROBSTRIDE_JOINT_LIMITS,
};

// Backward compatibility for existing callers that still import one shared limit map.
export const REBOT_ARM_JOINT_LIMITS = REBOT_ARM_DAMIAO_JOINT_LIMITS;

export const ZERO_SAFE_EPS_RAD = 0.08;

export function normalizeRobotArmModel(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return ROBOT_ARM_MODELS[0].key;
  if (ROBOT_ARM_MODEL_KEYS.has(text)) return text;
  if (ROBOT_ARM_MODEL_ALIASES[text]) return ROBOT_ARM_MODEL_ALIASES[text];
  return ROBOT_ARM_MODELS[0].key;
}

export function armVendorForProfile(armModel) {
  const key = normalizeRobotArmModel(armModel);
  return PROFILE_VENDOR[key] || 'damiao';
}

export function armMotorModelForProfile(armModel) {
  const key = normalizeRobotArmModel(armModel);
  return PROFILE_DEFAULT_MODEL[key] || '4310';
}

export function jointLimitsForProfile(armModel) {
  const key = normalizeRobotArmModel(armModel);
  return PROFILE_JOINT_LIMITS[key] || REBOT_ARM_DAMIAO_JOINT_LIMITS;
}

export function defaultFeedbackIdForProfile(armModel, escId) {
  const vendor = armVendorForProfile(armModel);
  if (vendor === 'robstride') return 0xfd;
  return 0x10 + (Number(escId) & 0x0f);
}

export function isProfileJointHit(hit, armModel, jointCfg) {
  const vendor = armVendorForProfile(armModel);
  if (String(hit.vendor) !== vendor) return false;
  if (Number(hit.esc_id) !== Number(jointCfg.esc_id)) return false;
  const fid = Number(hit.mst_id);
  if (vendor === 'robstride') return ROBSTRIDE_FEEDBACK_IDS.includes(fid);
  return fid === defaultFeedbackIdForProfile(armModel, jointCfg.esc_id);
}

export function buildRobotArmHit(jointCfg, armModel) {
  const profile = normalizeRobotArmModel(armModel);
  const vendor = armVendorForProfile(profile);
  const motorModel = armMotorModelForProfile(profile);
  return {
    vendor,
    model: motorModel,
    model_guess: motorModel,
    arm_profile: profile,
    probe: jointCfg.esc_id,
    esc_id: jointCfg.esc_id,
    mst_id: defaultFeedbackIdForProfile(profile, jointCfg.esc_id),
    joint: jointCfg.joint,
    detected_by: 'arm-default',
    online: false,
    updated_at_ms: Date.now(),
    last_check_ms: Date.now(),
  };
}
