export const APP_DEFAULTS = {
  wsUrl: 'ws://127.0.0.1:9002',
  channel: 'can0',
  scanTimeoutMs: '500',
};

export const DEV_SERVER = {
  host: '0.0.0.0',
  port: Number.parseInt(import.meta?.env?.VITE_FACTORY_UI_PORT || '18110', 10) || 18110,
};

export const CMD_TIMEOUTS = {
  shortMs: 1500,
  controlMs: 6000,
  stateMs: 1500,
  verifyMs: 8000,
  setIdMs: 12000,
  registerMs: 3000,
  storeMs: 4000,
};

export const DAMIAO_CTRL_PARAM_RID = {
  ctrlMode: 10,
  currentBw: 24,
  velKp: 25,
  velKi: 26,
  posKp: 27,
  posKi: 28,
};

export const DAMIAO_RW_REGISTER_DEFS = [
  { rid: 0, variable: 'UV_Value', dataType: 'f32', range: '(10.0, 3.4E38]', common: true },
  { rid: 1, variable: 'KT_Value', dataType: 'f32', range: '[0.0, 3.4E38]', common: false },
  { rid: 2, variable: 'OT_Value', dataType: 'f32', range: '[80.0, 200)', common: true },
  { rid: 3, variable: 'OC_Value', dataType: 'f32', range: '(0.0, 1.0)', common: true },
  { rid: 4, variable: 'ACC', dataType: 'f32', range: '(0.0, 3.4E38)', common: false },
  { rid: 5, variable: 'DEC', dataType: 'f32', range: '[-3.4E38, 0.0)', common: false },
  { rid: 6, variable: 'MAX_SPD', dataType: 'f32', range: '(0.0, 3.4E38]', common: true },
  { rid: 7, variable: 'MST_ID', dataType: 'u32', range: '[0, 0x7FF]', common: true },
  { rid: 8, variable: 'ESC_ID', dataType: 'u32', range: '[0, 0x7FF]', common: true },
  { rid: 9, variable: 'TIMEOUT', dataType: 'u32', range: '[0, 2^32-1]', common: true },
  { rid: 10, variable: 'CTRL_MODE', dataType: 'u32', range: '[1, 4]', common: true },
  { rid: 21, variable: 'PMAX', dataType: 'f32', range: '(0.0, 3.4E38]', common: true },
  { rid: 22, variable: 'VMAX', dataType: 'f32', range: '(0.0, 3.4E38]', common: true },
  { rid: 23, variable: 'TMAX', dataType: 'f32', range: '(0.0, 3.4E38]', common: true },
  { rid: 24, variable: 'I_BW', dataType: 'f32', range: '[100.0, 10000.0]', common: true },
  { rid: 25, variable: 'KP_ASR', dataType: 'f32', range: '[0.0, 3.4E38]', common: true },
  { rid: 26, variable: 'KI_ASR', dataType: 'f32', range: '[0.0, 3.4E38]', common: true },
  { rid: 27, variable: 'KP_APR', dataType: 'f32', range: '[0.0, 3.4E38]', common: true },
  { rid: 28, variable: 'KI_APR', dataType: 'f32', range: '[0.0, 3.4E38]', common: true },
  { rid: 29, variable: 'OV_Value', dataType: 'f32', range: 'TBD', common: false },
  { rid: 30, variable: 'GREF', dataType: 'f32', range: '(0.0, 1.0]', common: false },
  { rid: 31, variable: 'Deta', dataType: 'f32', range: '[1.0, 30.0]', common: false },
  { rid: 32, variable: 'V_BW', dataType: 'f32', range: '(0.0, 500.0)', common: false },
  { rid: 33, variable: 'IQ_c1', dataType: 'f32', range: '[100.0, 10000.0]', common: false },
  { rid: 34, variable: 'VL_c1', dataType: 'f32', range: '(0.0, 10000.0]', common: false },
  { rid: 35, variable: 'can_br', dataType: 'u32', range: '[0, 4]', common: true },
];
