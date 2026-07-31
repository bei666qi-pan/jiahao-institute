import React from 'react';
import ReactDOM from 'react-dom/client';

async function boot() {
  const admin = window.location.pathname.startsWith('/admin');
  let App;
  if (admin) {
    ({ default: App } = await import('./admin/AdminApp.jsx'));
  } else {
    ({ default: App } = await import('./App.jsx'));
    await import('./ui-upgrade.css');
    await import('./mobile-navigation-fix.css');
  }
  ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
  if (!admin) {
    const { startTelemetry } = await import('./telemetry.js');
    startTelemetry();
    const { startReveal } = await import('./reveal.js');
    startReveal();
  }
}

boot();
