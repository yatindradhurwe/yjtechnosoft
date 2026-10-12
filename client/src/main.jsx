import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { SiteProvider } from './context/SiteContext';
import { ConfirmProvider } from './components/ui';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <SiteProvider>
          <AuthProvider>
            <ConfirmProvider>
              <App />
              <Toaster position="top-right" toastOptions={{ style: { borderRadius: 12, fontSize: 14 }, success: { iconTheme: { primary: '#1d6fb8', secondary: '#fff' } } }} />
            </ConfirmProvider>
          </AuthProvider>
        </SiteProvider>
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);
