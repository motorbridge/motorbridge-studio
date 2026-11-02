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
      {({ onZeroAllSafe, zeroReadStatus }) => (
        <>
          <button onClick={onZeroAllSafe}>start</button>
          <output>{JSON.stringify(zeroReadStatus)}</output>
        </>
      )}
    </ZeroDialogManager>
  );
  fireEvent.click(screen.getByText('start'));
  return zeroAllRobotArm;
}

describe('zero calibration state read', () => {
  it('reads every joint including gripper and accepts nonzero angles before two confirmations', async () => {
    const refresh = vi.fn().mockResolvedValue({ online: true, pos: 0.72 });
    const zero = setup(refresh);
    await screen.findByRole('dialog');
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenLastCalledWith({ joint: 7 });
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
    const zero = setup(refresh);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('"reading":false')
    );
    expect(screen.getByRole('status').textContent).toContain('"failed":["J1"]');
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(zero).not.toHaveBeenCalled();
  });
});
