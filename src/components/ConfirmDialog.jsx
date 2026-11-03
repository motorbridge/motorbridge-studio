import React from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';

export function ConfirmDialog({ open, title, message, danger, onCancel, onConfirm, children }) {
  const { t } = useI18n();
  if (!open) return null;
  return createPortal(
    <div className="armDialogMask" role="dialog" aria-modal="true" aria-live="assertive">
      <div className="armDialogCard">
        <h3>{title || t('confirm_dialog_title')}</h3>
        <p>{message}</p>
        {children}
        <div className="row toolbar compactToolbar">
          <button className="ghostBtn" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button className={danger ? 'dangerBtn' : 'primary'} onClick={onConfirm}>
            {t('confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
