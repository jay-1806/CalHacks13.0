import { patchConsole } from '@screentutor/shared';
patchConsole();

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './App.css';
import { initRendererSentry } from './sentry';

initRendererSentry();

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
