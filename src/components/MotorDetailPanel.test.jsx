// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { MotorStudioProvider } from '../hooks/useMotorStudioContext';
import { MotorDetailPanel } from './MotorDetailPanel';
import { ParamManager } from './robot-arm/managers/ParamManager';

function renderWithStudio(ui) {
  const studio = {
    connection: {
      gatewayCapabilities: {
        vendors: {
          robstride: { modes: ['mit', 'pos_vel', 'pos_vel_pp', 'pos_vel_csp', 'vel'] },
        },
      },
    },
    scan: {},
    control: {},
    robotArm: {},
    preferences: {
      uiPrefs: { generalSliderLiveMove: false },
      setUiPref: vi.fn(),
    },
    logs: {},
    workspace: {},
  };

  return render(
    <I18nProvider>
      <MotorStudioProvider value={studio}>{ui}</MotorStudioProvider>
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MotorDetailPanel control UI', () => {
  it('enables the target slider in MIT mode', () => {
    renderWithStudio(
      <MotorDetailPanel
        connected
        activeMotor={{
          vendor: 'robstride',
          model: 'rs-00',
          esc_id: 1,
          mst_id: 0xfd,
          probe: 1,
          updated_at_ms: Date.now(),
        }}
        activeControl={{ mode: 'mit', target: 0, vlim: 1, kp: 30, kd: 1, tau: 0 }}
        patchControl={vi.fn()}
        controlMotor={vi.fn()}
        zeroMotor={vi.fn()}
        probeMotor={vi.fn()}
        setIdFor={vi.fn()}
        verifyHit={vi.fn()}
        refreshMotorState={vi.fn()}
        runMotorOp={vi.fn()}
      />
    );

    expect(screen.getByRole('slider').hasAttribute('disabled')).toBe(false);
  });

  it('shows Target Vel label and disables Vlim in vel mode', () => {
    renderWithStudio(
      <MotorDetailPanel
        connected
        activeMotor={{
          vendor: 'robstride',
          model: 'rs-00',
          esc_id: 1,
          mst_id: 0xfd,
          probe: 1,
          updated_at_ms: Date.now(),
        }}
        activeControl={{ mode: 'vel', target: 0, vlim: 1, kp: 30, kd: 1, tau: 0 }}
        patchControl={vi.fn()}
        controlMotor={vi.fn()}
        zeroMotor={vi.fn()}
        probeMotor={vi.fn()}
        setIdFor={vi.fn()}
        verifyHit={vi.fn()}
        refreshMotorState={vi.fn()}
        runMotorOp={vi.fn()}
      />
    );

    expect(screen.getByText('Target Vel')).toBeTruthy();
    const vlimLabel = screen.getByText('Vlim');
    const vlimInput = vlimLabel.parentElement?.querySelector('input');
    expect(vlimInput).toBeTruthy();
    expect(vlimInput?.disabled).toBe(true);
  });

  it('disables Live Move in MIT mode', () => {
    renderWithStudio(
      <MotorDetailPanel
        connected
        activeMotor={{
          vendor: 'robstride',
          model: 'rs-00',
          esc_id: 1,
          mst_id: 0xfd,
          probe: 1,
          updated_at_ms: Date.now(),
        }}
        activeControl={{ mode: 'mit', target: 0, vlim: 1, kp: 30, kd: 1, tau: 0 }}
        patchControl={vi.fn()}
        controlMotor={vi.fn()}
        zeroMotor={vi.fn()}
        probeMotor={vi.fn()}
        setIdFor={vi.fn()}
        verifyHit={vi.fn()}
        refreshMotorState={vi.fn()}
        runMotorOp={vi.fn()}
      />
    );

    expect(screen.getByRole('checkbox', { name: 'Live move while dragging' }).disabled).toBe(true);
    expect(
      screen.getByText(
        'Live Move is disabled in MIT mode for safety. Dragging only updates the target; click Move to send.'
      )
    ).toBeTruthy();
  });

  it('shows RobStride PP native fields and hides generic gains', () => {
    renderWithStudio(
      <MotorDetailPanel
        connected
        activeMotor={{
          vendor: 'robstride',
          model: 'rs-00',
          esc_id: 1,
          mst_id: 0xfd,
          probe: 1,
          updated_at_ms: Date.now(),
        }}
        activeControl={{
          mode: 'pos_vel_pp',
          target: 0,
          vlim: 0.02,
          acc: 0.5,
          kp: 30,
          kd: 1,
          tau: 0,
        }}
        patchControl={vi.fn()}
        controlMotor={vi.fn()}
        zeroMotor={vi.fn()}
        probeMotor={vi.fn()}
        setIdFor={vi.fn()}
        verifyHit={vi.fn()}
        refreshMotorState={vi.fn()}
        runMotorOp={vi.fn()}
      />
    );

    expect(screen.getByText('PP position (vel_max + acc_set)')).toBeTruthy();
    expect(screen.getByText('vel_max').parentElement?.querySelector('input')).toBeTruthy();
    expect(screen.getByText('acc_set').parentElement?.querySelector('input')).toBeTruthy();
    expect(screen.queryByText('KP')).toBeNull();
    expect(screen.queryByText('KD')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Live move while dragging' }).disabled).toBe(true);
  });

  it('calls enable with only the active motor', async () => {
    const controlMotor = vi.fn().mockResolvedValue(true);

    renderWithStudio(
      <MotorDetailPanel
        connected
        activeMotor={{
          vendor: 'robstride',
          model: 'rs-00',
          esc_id: 1,
          mst_id: 0xfd,
          probe: 1,
          updated_at_ms: Date.now(),
        }}
        activeControl={{ mode: 'mit', target: 0, vlim: 1, kp: 30, kd: 1, tau: 0 }}
        patchControl={vi.fn()}
        controlMotor={controlMotor}
        zeroMotor={vi.fn()}
        probeMotor={vi.fn()}
        setIdFor={vi.fn()}
        verifyHit={vi.fn()}
        refreshMotorState={vi.fn()}
        runMotorOp={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enable' }));

    await waitFor(() => {
      expect(controlMotor).toHaveBeenCalledWith(
        expect.objectContaining({ vendor: 'robstride', esc_id: 1, mst_id: 0xfd }),
        'enable'
      );
    });
  });

  it('requires a dedicated RobStride parameter write confirmation before sending write_param', async () => {
    const runMotorOp = vi.fn().mockResolvedValue({ ok: true, data: { value: 0 } });

    renderWithStudio(
      <MotorDetailPanel
        connected
        activeMotor={{
          vendor: 'robstride',
          model: 'rs-00',
          esc_id: 1,
          mst_id: 0xfd,
          probe: 1,
          updated_at_ms: Date.now(),
        }}
        activeControl={{ mode: 'mit', target: 0, vlim: 1, kp: 30, kd: 1, tau: 0 }}
        patchControl={vi.fn()}
        controlMotor={vi.fn()}
        zeroMotor={vi.fn()}
        probeMotor={vi.fn()}
        setIdFor={vi.fn()}
        verifyHit={vi.fn()}
        refreshMotorState={vi.fn()}
        runMotorOp={runMotorOp}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show Advanced' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Write Param' }));

    expect(screen.getByText('Confirm RobStride Parameter Write')).toBeTruthy();
    expect(runMotorOp).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(runMotorOp).toHaveBeenCalledWith(
        expect.objectContaining({ vendor: 'robstride', esc_id: 1 }),
        'robstride_write_param',
        expect.objectContaining({ param_id: '0x7017' })
      );
    });
  });
});

describe('ParamManager safety confirmations', () => {
  it('uses the robot-arm confirmation path before writing arm parameters', async () => {
    const askZeroConfirm = vi.fn().mockResolvedValue(false);
    const writeRobotArmControlParams = vi.fn();

    render(
      <I18nProvider>
        <ParamManager
          robotArmModel="rebot-arm-robstride"
          robotArmJointRows={[
            {
              key: 'robstride:1:253',
              joint: 1,
              hit: {
                vendor: 'robstride',
                esc_id: 1,
                mst_id: 0xfd,
                online: true,
              },
            },
          ]}
          readRobotArmControlParams={vi.fn()}
          writeRobotArmControlParams={writeRobotArmControlParams}
          askZeroConfirm={askZeroConfirm}
          canAction
          armToolbarBusy={false}
        >
          {(manager) => (
            <>
              <button onClick={manager.applyDefaultTemplate}>Open Params</button>
              {manager.paramTable}
            </>
          )}
        </ParamManager>
      </I18nProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Params' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Write Params' }).disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Write Params' }));

    await waitFor(() => {
      expect(askZeroConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Confirm Parameter Write',
          danger: true,
        })
      );
    });
    expect(writeRobotArmControlParams).not.toHaveBeenCalled();
  });
});
