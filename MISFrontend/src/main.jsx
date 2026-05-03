import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { toast } from './Components';
import { initOfflineQueue } from './utils/offlineQueue.js';
import './apiClient.js';
import { AuthProvider } from './context/AuthContext.jsx';
import { AppThemeProvider } from './context/ThemeConfigContext.jsx';
import { repairAuthStorage } from './utils/authStorage.js';

// Repair auth storage on every boot:
// - Restores User_name/User_group for users whose keys were deleted by the old migration
// - Syncs new keys (mis_userName) from old keys for fresh sessions
repairAuthStorage();

// Wake the Render backend early — free tier sleeps after 15 min inactivity.
// This fires a single health-check ping so the server is warm before the
// dashboard fires its requests. All app data hooks share the same promise.
import('./utils/backendWake.js').then(({ wakeBackend }) => wakeBackend());

// Override window.alert to use toast notifications instead
const nativeAlert = window.alert.bind(window);
window.alert = (msg) => {
  if (typeof msg === 'string' && msg.trim()) {
    toast(msg);
    return;
  }
  nativeAlert(msg);
};

initOfflineQueue();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </AppThemeProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration is best-effort; don't crash the app
    });
  });
}
