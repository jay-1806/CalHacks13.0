import React from 'react';
import { createRoot } from 'react-dom/client';
import DictationGlow from './components/DictationGlow';
import RegionSelectOverlay from './components/RegionSelectOverlay';
import AnnotationOverlay from './components/AnnotationOverlay';
import { initRendererSentry } from './sentry';
import { HAND_FONT } from './components/overlay-canvas';
import '@fontsource/caveat/700.css';

initRendererSentry();
// The canvas only draws with a font that is already loaded.
void document.fonts.load(`700 24px ${HAND_FONT}`);

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
