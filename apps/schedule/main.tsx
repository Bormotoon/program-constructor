import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ScheduleApp from '../../src/schedule/ScheduleApp';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import '../../src/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ScheduleApp />
    </ErrorBoundary>
  </StrictMode>,
);
