import React from 'react';

// Promise-based confirmation for the robot-arm manager components. Each
// consumer owns its own dialog instance: the hook only holds the open/close
// state and the pending resolver, while the caller renders whichever
// ConfirmDialog (or any other JSX) it needs around {confirmState}. That keeps
// flow-specific dialog content structurally out of every other consumer —
// e.g. ParamManager's write confirmations can never pick up ZeroDialogManager's
// URDF reference figure.
export function useConfirmDialog() {
  const [confirmState, setConfirmState] = React.useState({
    open: false,
    title: '',
    message: '',
    danger: false,
  });
  const resolverRef = React.useRef(null);

  const ask = React.useCallback((cfg) => {
    return new Promise((resolve) => {
      // A re-entrant ask (e.g. Write Params clicked again while its dialog is
      // open — the button is not gated by paramBusy) must not orphan the
      // previous promise: resolve it as false so its flow unwinds normally.
      if (resolverRef.current) resolverRef.current(false);
      resolverRef.current = resolve;
      setConfirmState({
        open: true,
        title: cfg?.title || '',
        message: cfg?.message || '',
        danger: Boolean(cfg?.danger),
      });
    });
  }, []);

  const close = React.useCallback((accepted) => {
    const done = resolverRef.current;
    resolverRef.current = null;
    setConfirmState((prev) => ({ ...prev, open: false }));
    if (done) done(Boolean(accepted));
  }, []);

  // Unmounting with a pending confirmation must still resolve the caller's
  // promise (as false), or flows like writeParams would await forever.
  React.useEffect(() => {
    return () => {
      if (resolverRef.current) {
        resolverRef.current(false);
        resolverRef.current = null;
      }
    };
  }, []);

  return { confirmState, ask, close };
}
