import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { startFeedbackTrail } from './feedback/context';
import { listenForStaleBuild } from './lib/staleBuild';

listenForStaleBuild();
startFeedbackTrail();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
