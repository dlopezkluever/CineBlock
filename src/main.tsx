import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CineBlockProvider } from './store';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CineBlockProvider>
      <App />
    </CineBlockProvider>
  </StrictMode>,
);
