// Damiao (DM) arm parameter TSV catalog + parser. Mirrors the layout of
// robstrideParamCatalog.js but addresses registers by decimal `rid` (DM has
// no param_id), and applies the identity-group exclusion at parse time so the
// four identity params (mstId/escId/timeout/canBr) are never imported even if a
// hand-edited TSV contains them. The export path (useRobotArmOps) filters them
// out at the source, so a normal export never emits them either.
//
// DM ARM param defs live in appConfig.js (DAMIAO_ARM_PARAM_DEFS) — each entry
// already carries rid/variable/dataType/writable/group, so this module only
// owns the TSV parser and the priority classification, not the def table.

import { DAMIAO_ARM_PARAM_DEFS } from './appConfig';

// Safety- / motion- / tuning-critical registers that an importer should review
// before writing back. `high` flags them in the export's priority column;
// everything else is `normal`. Mirrors ROBSTRIDE_HIGH_PRIORITY_PARAM_IDS —
// core (control loops + mode) and limits (safety thresholds) are the DM
// equivalents of RS's safety/tuning set. Identity params are excluded from
// export/import entirely and are not listed here.
export const DAMIAO_HIGH_PRIORITY_RIDS = new Set([
  10, // CTRL_MODE  - control mode switch; wrong mode => unexpected motion
  24, // I_BW       - current-loop bandwidth; affects torque / stability
  25, // KP_ASR     - velocity-loop Kp; affects motion / stability
  26, // KI_ASR     - velocity-loop Ki; affects motion / stability
  27, // KP_APR     - position-loop Kp; affects motion / stiffness
  28, // KI_APR     - position-loop Ki; affects motion / stability
  0, // UV_Value   - under-voltage threshold; safety
  2, // OT_Value   - over-temperature threshold; safety
  3, // OC_Value   - over-current threshold; safety
  6, // MAX_SPD    - speed limit; safety
  21, // PMAX       - position limit; safety / motion
  22, // VMAX       - velocity limit; safety / motion
  23, // TMAX       - torque limit; safety
]);

export function damiaoParamPriority(def) {
  return DAMIAO_HIGH_PRIORITY_RIDS.has(def.rid) ? 'high' : 'normal';
}

// DM dataType strings ('u32'/'f32') are already the CLI register types used by
// get_register_*/write_register_*, so the type column is the dataType verbatim.
export function damiaoCliType(dataType) {
  const t = String(dataType || '').toLowerCase();
  return t === 'u32' || t === 'f32' ? t : '';
}

// Parse a TSV produced by exportArmParams back into a structured import plan.
// Mirrors parseRobstrideParamsTsv: comment lines (#) and blanks are skipped,
// the first non-comment line is the header, and each following line is one
// register. Columns are located by header name (not fixed index) so a reordered
// file still parses. Cells that are not numeric ("", "ERR", "offline") are
// skipped — they carry no import value.
//
// Identity exclusion: rows whose rid maps to a DAMIAO_ARM_PARAM_DEFS entry with
// group === 'identity' are silently skipped, so a hand-edited TSV that contains
// mstId/escId/timeout/canBr cannot change bus addresses through this path.
//
// Returns { ok, errors, joints, rows }:
//   ok     — true iff errors is empty AND at least one writable value exists
//   errors — human-readable format problems (rid unknown, name/type mismatch,
//            non-numeric cell, ...)
//   joints — [1,2,...] joint numbers found in the header
//   rows   — [{ def, rid, type, values: { joint: number } }] for every
//            non-identity writable register that has at least one numeric cell
export function parseDamiaoParamsTsv(text) {
  const errors = [];
  const lines = String(text || '').split(/\r?\n/);

  // Locate the header: first non-comment, non-blank line.
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i].trim();
    if (!l || l.startsWith('#')) continue;
    headerIdx = i;
    break;
  }
  if (headerIdx === -1) {
    return { ok: false, errors: ['no header row found'], joints: [], rows: [] };
  }

  const headers = lines[headerIdx].split('\t').map((h) => h.trim());
  const col = (name) => headers.indexOf(name);
  const required = ['rid', 'type', 'name', 'group', 'priority'];
  for (const name of required) {
    if (col(name) === -1) errors.push(`missing column: ${name}`);
  }
  // Joint columns: headers matching /^J\d+$/.
  const jointCols = [];
  headers.forEach((h, idx) => {
    const m = /^J(\d+)$/.exec(h);
    if (m) jointCols.push({ col: idx, joint: Number(m[1]) });
  });
  if (jointCols.length === 0) errors.push('no joint columns (J1..) found');

  if (errors.length > 0) {
    return { ok: false, errors, joints: jointCols.map((j) => j.joint), rows: [] };
  }

  const ridCol = col('rid');
  const typeCol = col('type');
  const nameCol = col('name');
  const rows = [];

  // Accept both decimal ("10") and hex ("0x0a") rid forms for hand-edited files.
  const parseRid = (s) => {
    const raw = (s || '').trim();
    const hex = /^0x([0-9a-fA-F]+)$/.exec(raw);
    if (hex) return parseInt(hex[1], 16);
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const l = lines[i].replace(/\r$/, '');
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const cells = l.split('\t');
    const ridRaw = (cells[ridCol] || '').trim();
    const rid = parseRid(ridRaw);
    if (rid == null) {
      errors.push(`line ${i + 1}: bad rid "${ridRaw}"`);
      continue;
    }
    const def = DAMIAO_ARM_PARAM_DEFS.find((d) => d.rid === rid);
    if (!def) {
      errors.push(`line ${i + 1}: unknown rid ${ridRaw}`);
      continue;
    }
    // Cross-check name/type against the catalog (informational, non-fatal).
    const nameVal = (cells[nameCol] || '').trim();
    if (nameVal && nameVal !== def.variable) {
      errors.push(`line ${i + 1}: name mismatch "${nameVal}" vs "${def.variable}" for ${ridRaw}`);
    }
    const expType = damiaoCliType(def.dataType);
    const typeVal = (cells[typeCol] || '').trim();
    if (typeVal && typeVal !== expType) {
      errors.push(`line ${i + 1}: type mismatch "${typeVal}" vs "${expType}" for ${ridRaw}`);
    }
    // Identity exclusion: never import bus-address / identity params even if a
    // hand-edited TSV carries them. Writing these would change the motor's CAN
    // address and drop it off the bus mid-import.
    if (def.group === 'identity') {
      continue;
    }
    // Only writable registers can be imported; a hand-edited file may contain
    // non-writable rows (the export never emits them) — silently skip.
    if (def.writable === false) {
      continue;
    }
    const values = {};
    for (const jc of jointCols) {
      const raw = (cells[jc.col] || '').trim();
      if (raw === '' || raw === 'ERR' || raw === 'offline') continue;
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        errors.push(`line ${i + 1}: J${jc.joint} non-numeric value "${raw}" for ${ridRaw}`);
        continue;
      }
      values[jc.joint] = num;
    }
    if (Object.keys(values).length > 0) {
      rows.push({ def, rid, type: expType, values });
    }
  }

  if (rows.length === 0) {
    errors.push('no writable parameter values found to import');
  }
  return {
    ok: errors.length === 0,
    errors,
    joints: jointCols.map((j) => j.joint),
    rows,
  };
}
