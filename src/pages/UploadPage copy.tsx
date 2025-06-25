// src/pages/UploadPage.tsx - Main page component with navigation and tab switching
import React, { useState } from 'react';
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

type ActiveTab = 'upload' | 'viewer';

const UploadPage: React.FC<UploadPageProps> = ({ signOut, user }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');

  const getUserDisplayName = () => {
    if (!user) return 'User';
    return user.username || user.signInDetails?.loginId || 'User';
  };

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
  };

  return (
    <div className="upload-page">
      {/* Header with Navigation and Sign Out */}
      <div className="upload-page-header">
        <div className="header-content">
          <div className="header-title">
            <span>📊</span>
            <h1>Invoice Processing Platform</h1>
          </div>
          
          <div className="header-actions">
            <div className="nav-tabs">
              <button
                className={`nav-tab ${activeTab === 'upload' ? 'active' : ''}`}
                onClick={() => handleTabChange('upload')}
              >
                📤 Upload & Process
              </button>
              <button
                className={`nav-tab ${activeTab === 'viewer' ? 'active' : ''}`}
                onClick={() => handleTabChange('viewer')}
              >
                📋 View Invoices
              </button>
            </div>
            
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
          {/* Welcome Section */}
          {activeTab === 'upload' && (
            <div className="welcome-section">
              <h2>📊 Invoice Processing Center</h2>
              <p>
                Upload your commercial invoice files (CSV or Excel) for automated processing and analysis. 
                Our system will validate the data, extract key information, and store it for easy management and reporting.
              </p>
            </div>
          )}

          {activeTab === 'viewer' && (
            <div className="welcome-section">
              <h2>📋 Invoice Dashboard</h2>
              <p>
                View, search, and analyze your processed invoice data with advanced filtering, 
                sorting capabilities, and real-time analytics to help you manage your commercial operations.
              </p>
            </div>
          )}

          {/* Component Wrapper */}
          <div className="component-wrapper">
            {activeTab === 'upload' ? (
              <UploadStore />
            ) : (
              <InvoiceViewer />
            )}
          </div>
        </div>
      </div>

      {/* Apply Theme Styles */}
      <style>{uploadPageTheme}</style>
    </div>
  );
};

export default UploadPage;