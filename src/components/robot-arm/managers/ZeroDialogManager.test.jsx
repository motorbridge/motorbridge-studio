// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ZeroDialogManager } from './ZeroDialogManager';

vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: (key) => key }) }));
vi.mock('../../ArmUrdfViewer', () => ({ ArmUrdfViewer: () => null }));
afterEach(cleanup);

function setup(refreshMotorState, rows = [1, 7].map((joint) => ({ joint, hit: { joint } }))) {
  const zeroAllRobotArm = vi.fn();
  render(
    <ZeroDialogManager
      robotArmJointRows={rows}
      refreshMotorState={refreshMotorState}
      zeroAllRobotArm={zeroAllRobotArm}
    >
      {(z) => (
        <>
          <button onClick={z.onZeroAllSafe}>start</button>
          <output>{JSON.stringify(z.zeroReadStatus)}</output>
        </>
      )}
    </ZeroDialogManager>
  );
  fireEvent.click(screen.getByText('start'));
  return { zeroAllRobotArm };
}

describe('zero calibration state read', () => {
  it('reads every joint including gripper and accepts nonzero angles before two confirmations', async () => {
    const refresh = vi.fn().mockResolvedValue({ online: true, pos: 0.72 });
    const { zeroAllRobotArm: zero } = setup(refresh);
    await screen.findByRole('dialog');
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenLastCalledWith({ joint: 7 });
    expect(screen.getByText('arm_zero_reference')).toBeTruthy();
    expect(screen.getByText('arm_zero_read_complete')).toBeTruthy();
    expect(zero).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('confirm'));
    await waitFor(() => expect(screen.getByText('arm_zero_all_confirm_2')).toBeTruthy());
    expect(zero).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('confirm'));
    await waitFor(() => expect(zero).toHaveBeenCalledTimes(1));
  });

  it('reports a failed joint and prevents calibration while still reading the rest', async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue({ online: true, pos: 0.72 });
    const { zeroAllRobotArm: zero } = setup(refresh);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('"reading":false')
    );
    expect(screen.getByRole('status').textContent).toContain('"failed":["J1"]');
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(zero).not.toHaveBeenCalled();
  });
});

describe('zero dialog ownership', () => {
  it('drops zero-read results when the arm profile or joint set changes', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('offline'));
    const rows = [1, 2].map((joint) => ({ joint, hit: { joint } }));
    const view = render(
      <ZeroDialogManager
        profile="damiao"
        robotArmJointRows={rows}
        refreshMotorState={refresh}
        zeroAllRobotArm={vi.fn()}
      >
        {(z) => (
          <>
            <button onClick={z.onZeroAllSafe}>start</button>
            <output>{JSON.stringify(z.zeroReadStatus)}</output>
          </>
        )}
      </ZeroDialogManager>
    );
    fireEvent.click(screen.getByText('start'));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('"reading":false')
    );
    view.rerender(
      <ZeroDialogManager
        profile="robstride"
        robotArmJointRows={rows}
        refreshMotorState={refresh}
        zeroAllRobotArm={vi.fn()}
      >
        {(z) => (
          <>
            <button onClick={z.onZeroAllSafe}>start</button>
            <output>{JSON.stringify(z.zeroReadStatus)}</output>
          </>
        )}
      </ZeroDialogManager>
    );
    expect(screen.getByRole('status').textContent).toBe('null');
  });

  it('drops zero-read results when the joint set changes at the same length', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('offline'));
    const view = render(
      <ZeroDialogManager
        profile="damiao"
        robotArmJointRows={[1, 2].map((joint) => ({ joint, hit: { joint } }))}
        refreshMotorState={refresh}
        zeroAllRobotArm={vi.fn()}
      >
        {(z) => (
          <>
            <button onClick={z.onZeroAllSafe}>start</button>
            <output>{JSON.stringify(z.zeroReadStatus)}</output>
          </>
        )}
      </ZeroDialogManager>
    );
    fireEvent.click(screen.getByText('start'));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('"reading":false')
    );
    // Same profile, same count, different joints: still a different set.
    view.rerender(
      <ZeroDialogManager
        profile="damiao"
        robotArmJointRows={[1, 3].map((joint) => ({ joint, hit: { joint } }))}
        refreshMotorState={refresh}
        zeroAllRobotArm={vi.fn()}
      >
        {(z) => (
          <>
            <button onClick={z.onZeroAllSafe}>start</button>
            <output>{JSON.stringify(z.zeroReadStatus)}</output>
          </>
        )}
      </ZeroDialogManager>
    );
    expect(screen.getByRole('status').textContent).toBe('null');
  });

  it('aborts the flow when the arm profile changes mid-read', async () => {
    const refresh = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { online: true, pos: 0.5 };
    });
    const zeroAllRobotArm = vi.fn();
    const rows = [1, 2].map((joint) => ({ joint, hit: { joint } }));
    const view = render(
      <ZeroDialogManager
        profile="damiao"
        robotArmJointRows={rows}
        refreshMotorState={refresh}
        zeroAllRobotArm={zeroAllRobotArm}
      >
        {(z) => (
          <>
            <button onClick={z.onZeroAllSafe}>start</button>
            <output>{JSON.stringify(z.zeroReadStatus)}</output>
          </>
        )}
      </ZeroDialogManager>
    );
    fireEvent.click(screen.getByText('start'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    // Switch the arm while the read loop is still running: every joint of the
    // old set reads back fine, but the flow must abort before any dialog or
    // calibration — the results describe an arm that is no longer selected.
    view.rerender(
      <ZeroDialogManager
        profile="robstride"
        robotArmJointRows={rows}
        refreshMotorState={refresh}
        zeroAllRobotArm={zeroAllRobotArm}
      >
        {(z) => (
          <>
            <button onClick={z.onZeroAllSafe}>start</button>
            <output>{JSON.stringify(z.zeroReadStatus)}</output>
          </>
        )}
      </ZeroDialogManager>
    );
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(zeroAllRobotArm).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('null');
  });
});
