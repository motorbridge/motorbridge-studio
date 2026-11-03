// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ParamManager } from './ParamManager';

vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: (key) => key }) }));
afterEach(cleanup);

const KEY = 'damiao:1:253';

function makeRows() {
  return [{ key: KEY, joint: 1, hit: { vendor: 'damiao', esc_id: 1, mst_id: 0xfd, online: true } }];
}

function mountManager({ read, write }) {
  let manager = null;
  render(
    <ParamManager
      robotArmModel="rebot-arm-damiao"
      robotArmJointRows={makeRows()}
      readRobotArmControlParams={read}
      writeRobotArmControlParams={write}
      exportArmParams={vi.fn()}
      importArmParams={vi.fn()}
      devMode={false}
      sendCmd={vi.fn().mockResolvedValue({})}
      setArmParamOpBusy={vi.fn()}
      canAction
      armToolbarBusy={false}
    >
      {(m) => {
        manager = m;
        // The write-params ConfirmDialog lives inside paramTable; render it.
        return m.paramTable;
      }}
    </ParamManager>
  );
  return () => manager;
}

describe('param write confirmations', () => {
  it('opens its own text-only dialog: no URDF reference, no zero-read status', async () => {
    const read = vi.fn().mockResolvedValue({ [KEY]: { ok: true, values: {} } });
    const write = vi.fn().mockResolvedValue({ ok: true });
    const getManager = mountManager({ read, write });

    // Load the row's params so writeParams passes its blocked-rows check.
    await act(async () => {
      await getManager().readParams();
    });
    // writeParams pends on the confirmation dialog; fire it without awaiting.
    let writeFlow;
    act(() => {
      writeFlow = getManager().writeParams();
    });

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('arm_params_write_confirm_title')).toBeTruthy();
    // The zero-calibration reference figure and status line live in
    // ZeroDialogManager's own dialog and must never appear here.
    expect(screen.queryByText('arm_zero_reference')).toBeNull();
    expect(screen.queryByText('arm_zero_read_complete')).toBeNull();

    fireEvent.click(screen.getByText('confirm'));
    // Parsed write values can differ from the raw template strings, so a
    // risky-param confirmation may follow; confirm it if it pops.
    const riskyDialog = await screen.findByRole('dialog').catch(() => null);
    if (riskyDialog) fireEvent.click(screen.getByText('confirm'));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    await act(async () => {
      await writeFlow;
    });
  });
});
