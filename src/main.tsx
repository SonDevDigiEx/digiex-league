import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LeagueProvider } from './data/store';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <LeagueProvider>
        <App />
      </LeagueProvider>
    </ErrorBoundary>
  </StrictMode>,
);
