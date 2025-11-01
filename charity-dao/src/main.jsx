import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { WalletProvider } from './context/WalletContext.jsx';
import { MilestoneProvider } from './context/MilestoneContext.jsx';
import { NGOProvider } from './context/NGOContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WalletProvider>
      <MilestoneProvider>
        <NGOProvider>
          <App />
        </NGOProvider>
      </MilestoneProvider>
    </WalletProvider>
  </React.StrictMode>
);