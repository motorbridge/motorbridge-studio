import { describe, expect, it, vi } from 'vitest';
import {
  controlMotorOp,
  invalidControlFields,
  mapParamStreamToHit,
  mapResponseToHit,
  probeHitMatchesTarget,
} from './motorStudioOps';

describe('motor studio ops', () => {
  async function sendMove(mode, controlPatch = {}, vendor = 'robstride') {
    const h = {
      vendor,
      model: vendor === 'robstride' ? 'rs-00' : '4340',
      esc_id: 1,
      mst_id: vendor === 'robstride' ? 0xfd : 0x11,
    };
    const sendCmd = vi.fn().mockResolvedValue({ ok: true, data: {} });
    const control = {
      mode,
      target: 0.25,
      vlim: 0.02,
      acc: 0.05,
      kp: 30,
      kd: 1,
      tau: 0,
      ratio: 0.1,
      ...controlPatch,
    };
    const ok = await controlMotorOp({
      h,
      action: 'move',
      controls: { [`${vendor}:1:${h.mst_id}`]: control },
      vendors: { [vendor]: { model: h.model } },
      setTargetFor: vi.fn().mockResolvedValue(undefined),
      sendCmd,
      setHits: vi.fn(),
      setControls: vi.fn(),
      pushLog: vi.fn(),
    });
    return { ok, sendCmd };
  }

  it('sends explicit RobStride PP op with vel_max and acc_set', async () => {
    const { ok, sendCmd } = await sendMove('pos_vel_pp');

    expect(ok).toBe(true);
    expect(sendCmd).toHaveBeenCalledWith(
      'pos_vel_pp',
      {
        vendor: 'robstride',
        continuous: false,
        pos: 0.25,
        vel_max: 0.02,
        acc_set: 0.05,
      },
      expect.any(Number)
    );
  });

  it('sends explicit RobStride CSP op with limit_spd', async () => {
    const { ok, sendCmd } = await sendMove('pos_vel_csp');

    expect(ok).toBe(true);
    expect(sendCmd).toHaveBeenCalledWith(
      'pos_vel_csp',
      {
        vendor: 'robstride',
        continuous: false,
        pos: 0.25,
        limit_spd: 0.02,
      },
      expect.any(Number)
    );
  });

  it('keeps Damiao pos_vel routing unchanged', async () => {
    const { ok, sendCmd } = await sendMove('pos_vel', {}, 'damiao');

    expect(ok).toBe(true);
    expect(sendCmd).toHaveBeenCalledWith(
      'pos_vel',
      expect.objectContaining({
        vendor: 'damiao',
        continuous: false,
        pos: 0.25,
        vlim: 0.02,
      }),
      expect.any(Number)
    );
  });

  it('unwraps gateway state_once payloads before merging RobStride telemetry', () => {
    const hit = {
      vendor: 'robstride',
      model: 'rs-00',
      esc_id: 4,
      mst_id: 0xfd,
    };
    const next = mapResponseToHit(hit, {
      state: {
        vendor: 'robstride',
        has_value: true,
        status_code: 0,
        pos: -0.138,
        vel: 0.25,
        torq: 0.03,
        t_mos: 31.5,
      },
    });

    expect(next.pos).toBeCloseTo(-0.138);
    expect(next.vel).toBeCloseTo(0.25);
    expect(next.torq).toBeCloseTo(0.03);
    expect(next.t_mos).toBeCloseTo(31.5);
    expect(next.pmax).toBeCloseTo(4 * Math.PI);
    expect(next.vmax).toBe(50);
    expect(next.tmax).toBe(17);
  });

  it('maps RobStride observation params into live feedback fields', () => {
    const next = mapParamStreamToHit(
      { vendor: 'robstride', pos: 0, vel: 0, torq: 0, status_name: 'Motor' },
      {
        vendor: 'robstride',
        values: {
          run_mode: 1,
          mechPos: -0.82,
          mechVel: 0.25,
          iqf: 0.31,
          VBUS: 24.1,
          torque_fdb: 0.08,
          drv_temp: 0,
        },
      }
    );

    expect(next.pos).toBeCloseTo(-0.82);
    expect(next.vel).toBeCloseTo(0.25);
    expect(next.iqf).toBeCloseTo(0.31);
    expect(next.torq).toBeCloseTo(0.08);
    expect(next.vbus).toBeCloseTo(24.1);
    expect(next.t_mos).toBeUndefined();
    expect(next.status_name).toBe('Motor');
    expect(next.run_mode).toBe(1);
    expect(next.run_mode_name).toBe('Position');
    expect(next.feedback_source).toBe('robstride_observation_params');
  });

  it('maps Damiao param stream values into diagnostic fields without overriding feedback', () => {
    const next = mapParamStreamToHit(
      { vendor: 'damiao', pos: 0 },
      {
        vendor: 'damiao',
        values: {
          CTRL_MODE: 2,
          VBus: 24.2,
          Tpcb: 35,
          Tmtr: 32,
          p_m: 0.5,
          xout: 0.45,
          PMAX: 12.5,
          VMAX: 50,
          TMAX: 17,
        },
      }
    );

    expect(next.pos).toBe(0);
    expect(next.motor_pos).toBeCloseTo(0.5);
    expect(next.output_pos).toBeCloseTo(0.45);
    expect(next.vbus).toBeCloseTo(24.2);
    expect(next.t_mos).toBeCloseTo(35);
    expect(next.t_rotor).toBeCloseTo(32);
    expect(next.status).toBe(2);
    expect(next.pmax).toBeCloseTo(12.5);
  });

  it('flags cleared control fields before commands can be sent', () => {
    const invalid = invalidControlFields(
      {
        target: '',
        vlim: '1',
        kp: '',
        kd: 'bad',
        tau: '0',
      },
      ['target', 'vlim', 'kp', 'kd', 'tau']
    );

    expect(invalid).toEqual(['target', 'kp', 'kd']);
  });

  it('keeps RobStride probe hits scoped to the requested feedback id by default', () => {
    const target = { vendor: 'robstride', esc_id: 6, mst_id: 0xfd };

    expect(probeHitMatchesTarget({ esc_id: 6, mst_id: 0xfd }, target)).toBe(true);
    expect(probeHitMatchesTarget({ esc_id: 6, mst_id: 0xff }, target)).toBe(false);
    expect(probeHitMatchesTarget({ esc_id: 7, mst_id: 0xfd }, target)).toBe(false);
  });

  it('allows robot-arm RobStride probes to accept alternate host ids for the same device', () => {
    const target = { vendor: 'robstride', esc_id: 6, mst_id: 0xfd };

    expect(
      probeHitMatchesTarget({ esc_id: 6, mst_id: 0xff }, target, {
        acceptAnyFeedbackId: true,
      })
    ).toBe(true);
    expect(
      probeHitMatchesTarget({ esc_id: 7, mst_id: 0xff }, target, {
        acceptAnyFeedbackId: true,
      })
    ).toBe(false);
  });
});
