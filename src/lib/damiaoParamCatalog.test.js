import { describe, expect, it } from 'vitest';
import { parseDamiaoParamsTsv, damiaoParamPriority, damiaoCliType } from './damiaoParamCatalog';
import { DAMIAO_ARM_PARAM_DEFS } from './appConfig';

describe('damiao parameter catalog helpers', () => {
  it('maps DM dataType strings to register types', () => {
    expect(damiaoCliType('u32')).toBe('u32');
    expect(damiaoCliType('f32')).toBe('f32');
    expect(damiaoCliType('garbage')).toBe('');
  });

  it('marks core/limits params as high priority, advanced as normal', () => {
    const ctrlMode = DAMIAO_ARM_PARAM_DEFS.find((d) => d.rid === 10);
    const velKp = DAMIAO_ARM_PARAM_DEFS.find((d) => d.rid === 25);
    const acc = DAMIAO_ARM_PARAM_DEFS.find((d) => d.rid === 4); // advanced
    expect(damiaoParamPriority(ctrlMode)).toBe('high');
    expect(damiaoParamPriority(velKp)).toBe('high');
    expect(damiaoParamPriority(acc)).toBe('normal');
  });

  it('parses an exported TSV back into an import plan', () => {
    const tsv = [
      '# Damiao arm parameters export (TSV)',
      '# vendor: damiao',
      '# joints: 1, 2, 3',
      '',
      'rid\ttype\tname\tdesc_zh\tgroup\tpriority\tJ1\tJ2\tJ3',
      '10\tu32\tCTRL_MODE\t\tcore\thigh\t2\t2\t2',
      '25\tf32\tKP_ASR\t\tcore\thigh\t0.0125\t0.013\toffline',
      '4\tf32\tACC\t\tadvanced\tnormal\tERR\t1.0\t2.0',
    ].join('\n');

    const parsed = parseDamiaoParamsTsv(tsv);
    expect(parsed.ok).toBe(true);
    expect(parsed.joints).toEqual([1, 2, 3]);
    const rids = parsed.rows.map((r) => r.rid);
    expect(rids).toEqual([10, 25, 4]);
    const velKp = parsed.rows.find((r) => r.rid === 25);
    expect(velKp.values).toEqual({ 1: 0.0125, 2: 0.013 }); // J3 "offline" skipped
    const acc = parsed.rows.find((r) => r.rid === 4);
    expect(acc.values).toEqual({ 2: 1.0, 3: 2.0 }); // J1 "ERR" skipped
  });

  it('never imports the four identity params even if present in the TSV', () => {
    // mstId(7) / escId(8) / timeout(9) / canBr(35) are identity-group registers.
    const tsv = [
      'rid\ttype\tname\tdesc_zh\tgroup\tpriority\tJ1',
      '7\tu32\tMST_ID\t\tidentity\tnormal\t0x01',
      '8\tu32\tESC_ID\t\tidentity\tnormal\t0x02',
      '9\tu32\tTIMEOUT\t\tidentity\tnormal\t1000',
      '35\tu32\tcan_br\t\tidentity\tnormal\t0',
      '10\tu32\tCTRL_MODE\t\tcore\thigh\t2',
    ].join('\n');

    const parsed = parseDamiaoParamsTsv(tsv);
    expect(parsed.ok).toBe(true);
    const rids = parsed.rows.map((r) => r.rid);
    expect(rids).toEqual([10]); // only ctrlMode survives; identity rows dropped
    expect(rids).not.toContain(7);
    expect(rids).not.toContain(8);
    expect(rids).not.toContain(9);
    expect(rids).not.toContain(35);
  });

  it('accepts hex rid forms in hand-edited files', () => {
    const tsv = [
      'rid\ttype\tname\tdesc_zh\tgroup\tpriority\tJ1',
      '0x0a\tu32\tCTRL_MODE\t\tcore\thigh\t2',
    ].join('\n');
    const parsed = parseDamiaoParamsTsv(tsv);
    expect(parsed.ok).toBe(true);
    expect(parsed.rows[0].rid).toBe(10);
  });

  it('rejects a malformed TSV with readable errors', () => {
    // Missing header entirely.
    expect(parseDamiaoParamsTsv('# only comments\n').ok).toBe(false);
    // Unknown rid + missing required columns.
    const bad = 'rid\ttype\tname\tgroup\tpriority\tJ1\n999\tf32\tbogus\tcore\tnormal\t1.0\n';
    const parsed = parseDamiaoParamsTsv(bad);
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((e) => e.includes('unknown rid'))).toBe(true);
  });

  it('cross-checks name and type columns against the catalog', () => {
    const tsv = ['rid\ttype\tname\tgroup\tpriority\tJ1', '10\tf32\twrong_name\tcore\thigh\t2'].join(
      '\n'
    );
    const parsed = parseDamiaoParamsTsv(tsv);
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((e) => e.includes('name mismatch'))).toBe(true);
    expect(parsed.errors.some((e) => e.includes('type mismatch'))).toBe(true);
  });
});
