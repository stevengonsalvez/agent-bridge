import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

if (import.meta.env.DEV) {
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
    <App />
  </React.StrictMode>
);
