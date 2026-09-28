/**
 * Browser entry point. The `dapp-connector-api` import is a side-effect import:
 * it installs the `window.midnight` global that `useMidnight` reads.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@midnight-ntwrk/dapp-connector-api';
import './styles.css';
import App from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
