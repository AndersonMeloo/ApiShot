import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppStateProvider } from './hooks/useAppState';
import { NotificationsProvider } from './hooks/useNotifications';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado');

createRoot(root).render(
  <StrictMode>
    <NotificationsProvider>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </NotificationsProvider>
  </StrictMode>,
);
