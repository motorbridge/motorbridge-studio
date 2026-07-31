// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../../i18n';
import { MotorStudioProvider } from '../../hooks/useMotorStudioContext';
import { JointControlPanel } from './JointControlPanel';

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

function createRow(mode = 'pos_vel', target = 0) {
  return {
    key: 'robstride:1:253',
    joint: 1,
    hit: {
      vendor: 'robstride',
      esc_id: 1,
      mst_id: 0xfd,
    },
    control: {
      mode,
      target,
      vlim: 1,
      acc: 10,
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
    renderPanel({ activeRow: createRow('vel') });

    expect(screen.getByLabelText('Target Vel')).toBeTruthy();
  });

  it('shows Target Pos outside vel mode', () => {
    renderPanel({ activeRow: createRow('mit') });

    expect(screen.getByLabelText('Target Pos')).toBeTruthy();
  });

  it('shows MIT live move as effectively off', () => {
    renderPanel({ activeRow: createRow('mit'), liveMove: true });

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
    renderPanel({ activeRow: createRow('vel'), liveMove: true });

    const slider = screen.getByRole('slider');
    const sliderInput = screen.getByLabelText('Position Slider');
    const checkbox = screen.getByRole('checkbox', { name: 'Live move while dragging' });
    expect(slider.disabled).toBe(true);
    expect(sliderInput.disabled).toBe(true);
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.checked).toBe(false);
    expect(
      screen.getByText(
        'Slider is enabled for position modes only: mit / pos_vel / pos_vel_pp / pos_vel_csp / force_pos.'
      )
    ).toBeTruthy();
  });

  it('shows only native PP motion parameters and disables Live Move', () => {
    renderPanel({ activeRow: createRow('pos_vel_pp'), liveMove: true });

    expect(screen.getByText('PP position (vel_max + acc_set)')).toBeTruthy();
    expect(screen.getByText('vel_max').parentElement?.querySelector('input')).toBeTruthy();
    expect(screen.getByText('acc_set').parentElement?.querySelector('input')).toBeTruthy();
    expect(screen.queryByText('KP')).toBeNull();
    expect(screen.queryByText('KD')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Live move while dragging' }).disabled).toBe(true);
  });

  it('shows CSP limit_spd and keeps Live Move available', () => {
    renderPanel({ activeRow: createRow('pos_vel_csp'), liveMove: true });

    expect(screen.getByText('CSP position (limit_spd)')).toBeTruthy();
    expect(screen.getByText('limit_spd').parentElement?.querySelector('input')).toBeTruthy();
    const checkbox = screen.getByRole('checkbox', { name: 'Live move while dragging' });
    expect(checkbox.disabled).toBe(false);
    expect(checkbox.checked).toBe(true);
  });

  it('passes transient negative target text through input changes', () => {
    const onSliderTargetChange = vi.fn();
    renderPanel({ onSliderTargetChange });

    fireEvent.change(screen.getByLabelText('Target Pos'), { target: { value: '-' } });

    expect(onSliderTargetChange).toHaveBeenCalledWith('-');
  });
});
