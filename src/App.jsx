import React from 'react';
import { BrandWatermark } from './components/BrandWatermark';
import { HeaderBar } from './components/HeaderBar';
import { QuickMenu } from './components/QuickMenu';
import { ConnectionPanel } from './components/ConnectionPanel';
import { ScanWorkspace } from './components/ScanWorkspace';
import { MotorSection } from './components/MotorSection';
import { StateLogsPanel } from './components/StateLogsPanel';
import { RobotArmPage } from './components/RobotArmPage';
import { SimuPage } from './third_page';
import { HelpCenterModal } from './components/HelpCenterModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { useMotorStudio } from './hooks/useMotorStudio';
import { MotorStudioProvider } from './hooks/useMotorStudioContext';
import { useI18n } from './i18n';

export default function App() {
  const { t } = useI18n();
  const studio = useMotorStudio();
  const [page, setPage] = React.useState('general');
  const [helpOpen, setHelpOpen] = React.useState(false);

  const pathParts = String(window.location.pathname || '/')
    .split('/')
    .filter(Boolean);
  const leading = pathParts[0];
  const isLocale = leading === 'en' || leading === 'zh' || leading === 'es';
  const route = isLocale ? pathParts[1] || '' : pathParts[0] || '';
  const isSimuRoute = route === 'simu';

  if (isSimuRoute) {
    return (
      <MotorStudioProvider value={studio}>
        <SimuPage />
      </MotorStudioProvider>
    );
  }

  return (
    <MotorStudioProvider value={studio}>
      <div className="app shell">
        <BrandWatermark />
        <HeaderBar />

        {studio.workspace.menuOpen && <QuickMenu />}

        <section className="card glass">
          <div className="row toolbar compactToolbar">
            <button className={page === 'general' ? 'primary' : ''} onClick={() => setPage('general')}>
              {t('page_general')}
            </button>
            <button className={page === 'robot_arm' ? 'primary' : ''} onClick={() => setPage('robot_arm')}>
              {t('page_robot_arm')}
            </button>
            <button className="ghostBtn" onClick={() => setHelpOpen(true)}>
              {t('help_show')}
            </button>
          </div>
        </section>

        <HelpCenterModal open={helpOpen} page={page} onClose={() => setHelpOpen(false)} />
        <ConfirmDialog
          open={Boolean(studio.scan?.confirmDialog?.open)}
          title={studio.scan?.confirmDialog?.title}
          message={studio.scan?.confirmDialog?.message}
          danger={Boolean(studio.scan?.confirmDialog?.danger)}
          onCancel={() => studio.scan?.closeConfirmDialog(false)}
          onConfirm={() => studio.scan?.closeConfirmDialog(true)}
        />

        <ConnectionPanel />

        {page === 'general' ? (
          <>
            <ScanWorkspace />
            <MotorSection />
          </>
        ) : (
          <RobotArmPage />
        )}

        <StateLogsPanel />
      </div>
    </MotorStudioProvider>
  );
}
