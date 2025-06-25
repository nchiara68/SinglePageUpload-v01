// App.tsx - Updated with New Theme Colors
import { useState, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import outputs from '../amplify_outputs.json';
import { UploadStore } from './components/UploadStore';
import { InvoiceViewer } from './components/InvoiceViewer';

// Configure Amplify
Amplify.configure(outputs);

type ViewMode = 'upload' | 'invoices';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<ViewMode>('upload');

  useEffect(() => {
    // Simulate initial loading
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner-icon">🔄</div>
          <div>Loading Invoice Center...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Authenticator>
        {({ signOut, user }) => (
          <div className="authenticated-app">
            <header className="app-header">
              <div className="header-content">
                <h1>🗂️ Invoice Processing Center</h1>
                <div className="header-nav">
                  <button 
                    className={`nav-btn ${currentView === 'upload' ? 'active' : ''}`}
                    onClick={() => setCurrentView('upload')}
                  >
                    📤 Upload & Process
                  </button>
                  <button 
                    className={`nav-btn ${currentView === 'invoices' ? 'active' : ''}`}
                    onClick={() => setCurrentView('invoices')}
                  >
                    📊 Invoice Dashboard
                  </button>
                </div>
                <div className="user-info">
                  <span className="welcome-text">
                    Welcome, {user?.username || user?.signInDetails?.loginId || 'User'}!
                  </span>
                  <button onClick={signOut} className="sign-out-btn">
                    👋 Sign Out
                  </button>
                </div>
              </div>
            </header>

            <main className="app-main">
              <div className="view-container">
                {currentView === 'upload' && (
                  <div className="view-content">
                    <UploadStore />
                  </div>
                )}
                {currentView === 'invoices' && (
                  <div className="view-content">
                    <InvoiceViewer />
                  </div>
                )}
              </div>
            </main>

            <footer className="app-footer">
              <div className="footer-content">
                <p>
                  🔒 Your invoice data is stored securely and only accessible by you. 
                  Upload CSV/Excel files to automatically process commercial invoices.
                </p>
                <div className="footer-meta">
                  <span>Current View: {currentView === 'upload' ? 'Upload & Processing' : 'Invoice Dashboard'}</span>
                  <span>•</span>
                  <span>Frontend Processing Enabled</span>
                </div>
              </div>
            </footer>
          </div>
        )}
      </Authenticator>

      <style>{`
        .app {
          min-height: 100vh;
          background: linear-gradient(135deg, #32b3e7 0%, #002b4b 100%);
        }

        .loading-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background: linear-gradient(135deg, #32b3e7 0%, #002b4b 100%);
        }

        .loading-spinner {
          color: white;
          font-size: 18px;
          font-weight: 500;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }

        .spinner-icon {
          font-size: 32px;
          animation: rotate 2s linear infinite;
        }

        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .authenticated-app {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .app-header {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(50, 179, 231, 0.3);
          padding: 15px 0;
          box-shadow: 0 2px 10px rgba(50, 179, 231, 0.2);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
        }

        .app-header h1 {
          margin: 0;
          color: #002b4b;
          font-size: 24px;
          font-weight: 600;
        }

        .header-nav {
          display: flex;
          gap: 10px;
          flex: 1;
          justify-content: center;
        }

        .nav-btn {
          padding: 12px 24px;
          background: white;
          border: 2px solid #32b3e7;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #5e6e77;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }

        .nav-btn:hover {
          background: #f8fcff;
          border-color: #32b3e7;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(50, 179, 231, 0.2);
        }

        .nav-btn.active {
          background: linear-gradient(135deg, #32b3e7, #1a9bd8);
          color: white;
          border-color: #32b3e7;
          box-shadow: 0 4px 6px rgba(50, 179, 231, 0.3);
          transform: translateY(-1px);
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .welcome-text {
          color: #5e6e77;
          font-weight: 500;
          font-size: 14px;
        }

        .sign-out-btn {
          padding: 8px 16px;
          background: #e53e3e;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .sign-out-btn:hover {
          background: #c53030;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .app-main {
          flex: 1;
          padding: 0;
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
        }

        .view-container {
          min-height: calc(100vh - 140px);
          display: flex;
          flex-direction: column;
        }

        .view-content {
          flex: 1;
          padding: 30px 20px;
        }

        .app-footer {
          background: rgba(0, 43, 75, 0.9);
          backdrop-filter: blur(10px);
          padding: 20px;
          text-align: center;
          color: white;
          border-top: 1px solid rgba(50, 179, 231, 0.3);
        }

        .footer-content {
          max-width: 1200px;
          margin: 0 auto;
        }

        .app-footer p {
          margin: 0 0 10px 0;
          font-size: 14px;
          opacity: 0.9;
        }

        .footer-meta {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 15px;
          font-size: 12px;
          opacity: 0.7;
        }

        @media (max-width: 768px) {
          .header-content {
            flex-direction: column;
            gap: 15px;
            text-align: center;
          }

          .app-header h1 {
            font-size: 20px;
          }

          .header-nav {
            justify-content: center;
            width: 100%;
          }

          .nav-btn {
            flex: 1;
            max-width: 180px;
            justify-content: center;
            padding: 10px 16px;
          }

          .user-info {
            flex-direction: column;
            gap: 10px;
            width: 100%;
          }

          .view-content {
            padding: 20px 15px;
          }

          .footer-meta {
            flex-direction: column;
            gap: 5px;
          }
        }

        @media (max-width: 480px) {
          .header-nav {
            flex-direction: column;
            gap: 8px;
          }

          .nav-btn {
            max-width: none;
          }
        }
      `}</style>
      
      <style>{`
        /* Override Amplify Authenticator styles */
        .amplify-authenticator {
          --amplify-colors-brand-primary-60: #32b3e7;
          --amplify-colors-brand-primary-80: #1a9bd8;
          --amplify-colors-brand-primary-90: #0f7ba8;
          --amplify-colors-brand-primary-100: #002b4b;
        }

        .amplify-authenticator__container {
          background: linear-gradient(135deg, #32b3e7 0%, #002b4b 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .amplify-card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(50, 179, 231, 0.3);
          box-shadow: 0 8px 32px rgba(50, 179, 231, 0.2);
        }

        .amplify-card__header {
          text-align: center;
        }
      `}</style>
    </div>
  );
}