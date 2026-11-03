// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useConfirmDialog } from './useConfirmDialog';
import { ConfirmDialog } from '../../ConfirmDialog';

vi.mock('../../../i18n', () => ({ useI18n: () => ({ t: (key) => key }) }));
afterEach(cleanup);

function Harness({ onApi }) {
  const { confirmState, ask, close } = useConfirmDialog();
  const apiRef = React.useRef(null);
  apiRef.current = { ask, close };
  React.useEffect(() => {
    onApi(() => apiRef.current);
  }, [onApi]);
  return (
    <ConfirmDialog
      open={confirmState.open}
      title={confirmState.title}
      message={confirmState.message}
      danger={confirmState.danger}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  );
}

async function mount() {
  let takeApi = null;
  const onApi = (get) => {
    takeApi = get;
  };
  const view = render(<Harness onApi={onApi} />);
  await waitFor(() => expect(takeApi).toBeTruthy());
  return { view, getApi: () => takeApi() };
}

describe('useConfirmDialog', () => {
  it('resolves true on confirm and closes the dialog', async () => {
    const { getApi } = await mount();
    const p = getApi().ask({ title: 'T', message: 'M', danger: true });
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('T')).toBeTruthy();
    fireEvent.click(screen.getByText('confirm'));
    await expect(p).resolves.toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('resolves false on cancel', async () => {
    const { getApi } = await mount();
    const p = getApi().ask({ title: 'T', message: 'M' });
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByText('cancel'));
    await expect(p).resolves.toBe(false);
  });

  it('resolves a pending confirmation as false when the consumer unmounts', async () => {
    const { view, getApi } = await mount();
    const p = getApi().ask({ title: 'T', message: 'M' });
    await screen.findByRole('dialog');
    view.unmount();
    await expect(p).resolves.toBe(false);
  });

  it('resolves a superseded pending ask as false instead of orphaning it', async () => {
    const { getApi } = await mount();
    const p1 = getApi().ask({ title: 'T1', message: 'M1' });
    const p2 = getApi().ask({ title: 'T2', message: 'M2' });
    await expect(p1).resolves.toBe(false);
    expect(await screen.findByText('T2')).toBeTruthy();
    fireEvent.click(screen.getByText('confirm'));
    await expect(p2).resolves.toBe(true);
  });
});
