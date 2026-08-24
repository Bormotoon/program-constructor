import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import TechCardApp from '../../src/techcard/TechCardApp';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import '../../src/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <TechCardApp />
    </ErrorBoundary>
  </StrictMode>,
);
