// src/pages/UploadPage.tsx - Single page with upload at top and invoices below
import React from 'react';
import { UploadStore } from '../components/UploadStore';
import { InvoiceViewer } from '../components/InvoiceViewer';
import { uploadPageTheme } from '../theme';

interface UploadPageProps {
  signOut?: () => void;
  user?: {
    username?: string;
    signInDetails?: {
      loginId?: string;
    };
  };
}

const UploadPage: React.FC<UploadPageProps> = ({ signOut, user }) => {
  const getUserDisplayName = () => {
    if (!user) return 'User';
    return user.username || user.signInDetails?.loginId || 'User';
  };

  return (
    <div className="upload-page">
      {/* Header with User Info and Sign Out */}
      <div className="upload-page-header">
        <div className="header-content">
          <div className="header-title">
            <span>📊</span>
            <h1>Invoice Upload Page</h1>
          </div>
          
          <div className="header-actions">
            <div className="user-info">
              👤 {getUserDisplayName()}
            </div>
            
            {signOut && (
              <button 
                onClick={signOut} 
                className="sign-out-btn"
                title="Sign out of the application"
              >
                🚪 Sign Out
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="page-content">
        <div className="content-container">
          {/* Upload & Process Section */}
          <div className="section">
            <div className="section-header">
              <h2>📤 Upload & Process</h2>
              <p>Upload your commercial invoice files (CSV or Excel) for automated processing and analysis.</p>
            </div>
            <div className="component-wrapper">
              <UploadStore />
            </div>
          </div>

          {/* View Invoices Section */}
          <div className="section">
            <div className="section-header">
              <h2>📋 View Invoices</h2>
              <p>View, search, and analyze your processed invoice data with advanced sorting capabilities.</p>
            </div>
            <div className="component-wrapper">
              <InvoiceViewer />
            </div>
          </div>
        </div>
      </div>

      {/* Apply Theme Styles */}
      <style>{`
        ${uploadPageTheme}
        
        .section {
          margin-bottom: 40px;
        }
        
        .section:last-child {
          margin-bottom: 0;
        }
        
        .section-header {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(50, 179, 231, 0.3);
          border-radius: 12px 12px 0 0;
          padding: 25px;
          border-bottom: none;
        }
        
        .section-header h2 {
          margin: 0 0 10px 0;
          color: #002b4b;
          font-size: 24px;
          font-weight: 700;
        }
        
        .section-header p {
          margin: 0;
          color: #5e6e77;
          font-size: 16px;
          line-height: 1.5;
        }
        
        .component-wrapper {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(50, 179, 231, 0.3);
          border-radius: 0 0 12px 12px;
          box-shadow: 0 8px 32px rgba(50, 179, 231, 0.1);
          overflow: hidden;
        }
        
        /* Override header actions layout for single page */
        .header-actions {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        
        /* Remove nav-tabs styles since we're not using tabs */
        .nav-tabs {
          display: none;
        }
        
        @media (max-width: 768px) {
          .section-header {
            padding: 20px;
          }
          
          .section-header h2 {
            font-size: 20px;
          }
          
          .section-header p {
            font-size: 14px;
          }
          
          .section {
            margin-bottom: 30px;
          }
        }
      `}</style>
    </div>
  );
};

export default UploadPage;