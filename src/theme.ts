// src/theme.ts - Centralized theme and styles for the application
/* .app --> background:linear-gradient(135deg, #32b3e7 0%, #002b4b 100%);*/
/* .amplify-authenticator__container --> linear-gradient(135deg, #32b3e7 0%, #002b4b 100%);*/
/* ..upload-page --> linear-gradient(135deg, #32b3e7 0%, #002b4b 100%);*/
export const appTheme = `
  .app {
    min-height: 100vh;
    background:  #002b4b;
    
  }

  /* Override Amplify Authenticator styles */
  .amplify-authenticator {
    --amplify-colors-brand-primary-60: #32b3e7;
    --amplify-colors-brand-primary-80: #1a9bd8;
    --amplify-colors-brand-primary-90: #0f7ba8;
    --amplify-colors-brand-primary-100: #002b4b;
  }

  .amplify-authenticator__container {
    background:   #002b4b;;
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
`;

export const uploadPageTheme = `
  .upload-page {
    min-height: 100vh;
    background: #32b3e7;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .upload-page-header {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(50, 179, 231, 0.3);
    box-shadow: 0 2px 8px rgba(50, 179, 231, 0.1);
    padding: 20px 0;
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
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-title h1 {
    margin: 0;
    color: #002b4b;
    font-size: 24px;
    font-weight: 700;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 15px;
  }

  .user-info {
    color: #5e6e77;
    font-size: 14px;
    font-weight: 500;
  }

  .nav-tabs {
    display: flex;
    gap: 0;
    background: #f8fcff;
    border-radius: 8px;
    padding: 4px;
    border: 1px solid #32b3e7;
  }

  .nav-tab {
    padding: 8px 16px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    color: #5e6e77;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .nav-tab.active {
    background: #32b3e7;
    color: white;
    box-shadow: 0 2px 4px rgba(50, 179, 231, 0.3);
  }

  .nav-tab:hover:not(.active) {
    background: rgba(50, 179, 231, 0.1);
    color: #002b4b;
  }

  .sign-out-btn {
    padding: 8px 16px;
    background: #fed7d7;
    color: #c53030;
    border: 1px solid #feb2b2;
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
    background: #feb2b2;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .page-content {
    padding: 30px 0;
  }

  .content-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
  }

  .welcome-section {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(50, 179, 231, 0.3);
    border-radius: 12px;
    padding: 30px;
    margin-bottom: 30px;
    box-shadow: 0 8px 32px rgba(50, 179, 231, 0.1);
    text-align: center;
  }

  .welcome-section h2 {
    margin: 0 0 15px 0;
    color: #002b4b;
    font-size: 28px;
    font-weight: 700;
  }

  .welcome-section p {
    margin: 0;
    color: #5e6e77;
    font-size: 16px;
    line-height: 1.6;
  }

  .component-wrapper {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(50, 179, 231, 0.3);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(50, 179, 231, 0.1);
    overflow: hidden;
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .header-content {
      flex-direction: column;
      gap: 15px;
      align-items: stretch;
    }

    .header-actions {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
    }

    .nav-tabs {
      justify-content: center;
    }

    .nav-tab {
      flex: 1;
      text-align: center;
    }

    .upload-page-header {
      position: static;
    }

    .welcome-section {
      padding: 20px;
    }

    .welcome-section h2 {
      font-size: 24px;
    }

    .content-container {
      padding: 0 15px;
    }
  }

  @media (max-width: 480px) {
    .header-title h1 {
      font-size: 20px;
    }

    .nav-tab {
      padding: 6px 12px;
      font-size: 13px;
    }

    .welcome-section {
      padding: 15px;
    }

    .welcome-section h2 {
      font-size: 22px;
    }

    .page-content {
      padding: 20px 0;
    }
  }
`;