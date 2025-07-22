// src/pages/SubmittedInvoicesPage.tsx - Complete page for submitted invoices
import React from 'react';
import { SubmittedInvoicesViewer } from '../components/SubmittedInvoicesPage/SubmittedInvoicesViewer';
import { uploadPageTheme } from '../theme'; // Reuse your existing theme

interface SubmittedInvoicesPageProps {
  // Props can be added here as needed
}

const SubmittedInvoicesPage: React.FC<SubmittedInvoicesPageProps> = () => {
  // Simple scroll to top when page loads
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="submitted-invoices-page">
      {/* Header with User Info and Sign Out */}
      <div className="page-header">
        <div className="header-content">
          <div className="header-title">
            <span></span>
            <h1>Submitted Invoices</h1>
          </div>
          
          <div className="header-actions">
            {/* Header actions can be added here as needed */}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="page-content">
        <div className="content-container">
          {/* Submitted Invoices Section */}
          <div className="section">
            <div className="section-header">
              <h2>History</h2>
              <p>Review all invoices that have been submitted and track their processing status.</p>
            </div>
            <div className="component-wrapper">
              <SubmittedInvoicesViewer />
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
        
        .submitted-invoices-page {
          scroll-margin-top: 0;
          padding-top: 0;
        }
        
        /* Override theme's sticky header positioning - keep it as is */
        .page-header {
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
        
        @media (max-width: 768px) {
          /* Ensure sticky header on mobile too */
          .page-header {
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

export default SubmittedInvoicesPage;