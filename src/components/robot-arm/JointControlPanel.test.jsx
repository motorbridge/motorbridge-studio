// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { en } from '../../i18n/messages/en';
import { MotorStudioProvider } from '../../hooks/useMotorStudioContext';
import { JointControlPanel } from './JointControlPanel';

function renderWithStudio(ui) {
  const studio = {
    connection: {
      gatewayCapabilities: {
        vendors: {
          damiao: { modes: ['mit', 'pos_vel', 'vel', 'force_pos'] },
          robstride: { modes: ['mit', 'pos_vel', 'vel'] },
        },
      },
    },
    scan: {},
    control: {},
    robotArm: {},
    preferences: {
      uiPrefs: { armSliderLiveMove: false },
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

function createRow(vendor = 'damiao', mode = 'pos_vel', target = 0) {
  return {
    key: `${vendor}:1:253`,
    joint: 1,
    hit: {
      vendor,
      esc_id: 1,
      mst_id: 0xfd,
    },
    control: {
      mode,
      target,
      vlim: 1,
      kp: 30,
      kd: 1,
      tau: 0,
    },
  };
}

function renderPanel(overrides = {}) {
  const props = {
    activeRow: createRow(),
    perJointBusy: false,
    liveMove: false,
    sliderValue: 0,
    limitWarn: '',
    patchControl: vi.fn(),
    onSliderTargetChange: vi.fn(),
    cancelLiveMove: vi.fn(),
    jointLimit: vi.fn(() => ({ min: -3.14, max: 3.14 })),
    setUiPref: vi.fn(),
    controlMotor: vi.fn(),
    refreshMotorState: vi.fn(),
    moveOnce: vi.fn(),
    runExclusive: vi.fn((fn) => fn()),
    ...overrides,
  };

  return {
    ...renderWithStudio(<JointControlPanel {...props} />),
    props,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('JointControlPanel', () => {
  it('shows Target Vel in vel mode', () => {
    renderPanel({ activeRow: createRow('damiao', 'vel') });

    expect(screen.getByLabelText('Target Vel')).toBeTruthy();
  });

  it('shows Target Pos outside vel mode', () => {
    renderPanel({ activeRow: createRow('damiao', 'mit') });

    expect(screen.getByLabelText('Target Pos')).toBeTruthy();
  });

  it('shows MIT live move as effectively off', () => {
    renderPanel({ activeRow: createRow('damiao', 'mit'), liveMove: true });

    const checkbox = screen.getByRole('checkbox', { name: 'Live move while dragging' });
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.checked).toBe(false);
    expect(screen.getByText('Manual mode (click Move to send)')).toBeTruthy();
    expect(
      screen.getByText(
        'Live Move is disabled in MIT mode for safety. Dragging only updates the target; click Move to send.'
      )
    ).toBeTruthy();
  });

  it('disables the position slider in vel mode', () => {
    renderPanel({ activeRow: createRow('damiao', 'vel'), liveMove: true });

    const slider = screen.getByRole('slider');
    const sliderInput = screen.getByLabelText('Position Slider');
    const checkbox = screen.getByRole('checkbox', { name: 'Live move while dragging' });
    expect(slider.disabled).toBe(true);
    expect(sliderInput.disabled).toBe(true);
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.checked).toBe(false);
    expect(
      screen.getByText('Slider is enabled for position modes only: mit / pos_vel / force_pos.')
    ).toBeTruthy();
  });

  it('passes transient negative target text through input changes', () => {
    const onSliderTargetChange = vi.fn();
    renderPanel({ onSliderTargetChange });

    fireEvent.change(screen.getByLabelText('Target Pos'), { target: { value: '-' } });

    expect(onSliderTargetChange).toHaveBeenCalledWith('-');
  });

  it('gates slider drag behind an interpolation warning dialog', () => {
    const onSliderTargetChange = vi.fn();
    renderPanel({ onSliderTargetChange });

    const slider = screen.getByRole('slider');
    const warn = en.arm_slider_no_interp_warn;

    fireEvent.change(slider, { target: { value: '1' } });
    expect(onSliderTargetChange).not.toHaveBeenCalled();
    expect(screen.getByText(warn)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.queryByText(warn)).toBeNull();

    fireEvent.change(slider, { target: { value: '1' } });
    expect(onSliderTargetChange).toHaveBeenCalledWith('1');
  });

  it('locks robstride to MIT and hides the vlim field', () => {
    const patchControl = vi.fn();
    renderPanel({
      activeRow: createRow('robstride', 'pos_vel'),
      patchControl,
    });

    const modeSelect = screen.getByDisplayValue('mit');
    expect(modeSelect.disabled).toBe(true);
    expect(screen.queryByText('Vlim')).toBeNull();
    expect(screen.getByLabelText('Target Pos')).toBeTruthy();
    expect(patchControl).toHaveBeenCalledWith('robstride:1:253', { mode: 'mit' });
  });
});
