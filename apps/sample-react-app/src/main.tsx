import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { initDebugBridge } from './debug-bridge';
import './styles.css';

if (import.meta.env.DEV) {
  initDebugBridge();
  const enableDesignMode = () => {
    const dm = (window as unknown as { __agentBridgeDesignMode?: { enable: () => void } }).__agentBridgeDesignMode;
    if (dm) {
      dm.enable();
    } else {
      setTimeout(enableDesignMode, 50);
    }
  };
  enableDesignMode();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
