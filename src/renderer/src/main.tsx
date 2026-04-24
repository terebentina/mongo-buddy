import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { useStore } from './store';
import { subscribeOperationStream } from './hooks/use-operation';
import './assets/index.css';

useStore.getState().subscribeToConnectionState();
useStore.getState().initMcpStatus();
subscribeOperationStream();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
