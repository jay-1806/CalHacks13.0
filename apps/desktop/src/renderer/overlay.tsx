import React from 'react';
import { createRoot } from 'react-dom/client';
import DictationGlow from './components/DictationGlow';
import RegionSelectOverlay from './components/RegionSelectOverlay';
import AnnotationOverlay from './components/AnnotationOverlay';
import { initRendererSentry } from './sentry';

initRendererSentry();

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <DictationGlow />
      <RegionSelectOverlay />
      <AnnotationOverlay />
    </React.StrictMode>
  );
}
