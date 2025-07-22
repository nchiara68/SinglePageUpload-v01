// src/pages/UploadPage.tsx - Single page with upload at top and invoices below
import React from 'react';
import { UploadStore } from '../components/UploadPage/UploadStore';
import { InvoiceViewer } from '../components/UploadPage/InvoiceViewer';
import { uploadPageTheme } from '../theme';

interface UploadPageProps {
  // Props can be added here as needed
}

const UploadPage: React.FC<UploadPageProps> = () => {

  // Simple scroll to top when page loads
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="upload-page">
      {/* Header with User Info and Sign Out */}
      <div className="upload-page-header">
        <div className="header-content">
          <div className="header-title">
            <span></span>
            <h1>Invoice Upload Page</h1>
          </div>
          
          <div className="header-actions">
            {/* Removed user info and sign out button */}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="page-content">
        <div className="content-container">
          {/* Upload & Process Section */}
          <div className="section">
            <div className="section-header">
              <h2>Start</h2>
              <p></p>
            </div>
            <div className="component-wrapper">
              <UploadStore />
            </div>
          </div>

          {/* View Invoices Section */}
          <div className="section">
            <div className="section-header">
              <h2>Check</h2>
              <p>Before submitting, please check that the invoices have been uploaded correctly.</p>
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
        
        /* Ensure page starts at top and smooth scrolling */
        html, body {
          scroll-behavior: smooth;
        }
        
        .upload-page {
          scroll-margin-top: 0;
          padding-top: 0;
        }
        
        /* Override theme's sticky header positioning - keep it as is */
        .upload-page-header {
          position: sticky !important;
          top: 0 !important;
          z-index: 100 !important;
        }
        
        /* Let JavaScript handle the spacing dynamically */
        .page-content {
          margin-top: 100px; /* Fallback margin */
          padding-top: 20px;
          min-height: calc(100vh - 100px);
        }
        
        .content-container {
          max-width: 100%;
          overflow-x: auto;
        }
        
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
          /* Ensure sticky header on mobile too */
          .upload-page-header {
            position: sticky !important;
            top: 0 !important;
          }
          
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