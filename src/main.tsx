import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { applyAppearance, readCachedAppearance } from '@/components/layout/appearance';

// apply the cached theme before the first render so the splash doesn't flash the default one
const cachedAppearance = readCachedAppearance();
if (cachedAppearance) applyAppearance(cachedAppearance);

const container = document.getElementById('root');
if (!container) throw new Error('Cadence: #root element is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
