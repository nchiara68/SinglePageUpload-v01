// src/components/Navbar.tsx - Main Navigation Component
import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

interface NavbarProps {
  signOut?: () => void;
  user?: {
    username?: string;
    attributes?: {
      email?: string;
    };
    signInDetails?: {
      loginId?: string;
    };
  };
}

export const Navbar: React.FC<NavbarProps> = ({ signOut, user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const getUserDisplayName = () => {
    if (!user) return 'User';
    return user.attributes?.email || user.signInDetails?.loginId || user.username || 'User';
  };

  const handleSignOut = () => {
    if (signOut) {
      signOut();
      navigate('/');
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const navigationItems = [
    {
      path: '/',
      label: 'Dashboard',
      icon: '',
      description: 'Overview and analytics'
    },
    {
      path: '/upload',
      label: 'Upload',
      icon: '',
      description: 'Upload and process invoices'
    },
    {
      path: '/submitted-invoices',
      label: 'Sell',
      icon: '',
      description: 'View submitted invoices'
    }
  ];

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Logo/Brand */}
        <div className="navbar-brand">
          <Link to="/" className="brand-link" onClick={closeMobileMenu}>
            <span className="brand-icon"></span>
            <span className="brand-text">Trade Finance Manager</span>
          </Link>
        </div>

        {/* Desktop Navigation Links */}
        <div className="navbar-nav">
          {navigationItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
              title={item.description}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </div>

        {/* User Info and Actions */}
        <div className="navbar-actions">
          <div className="user-info">
            <span className="user-icon">👤</span>
            <span className="user-name">{getUserDisplayName()}</span>
          </div>
          
          {signOut && (
            <button 
              onClick={handleSignOut}
              className="logout-btn"
              title="Sign out of the application"
            >
              <span className="logout-icon">🚪</span>
              <span className="logout-text">Logout</span>
            </button>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button 
          className="mobile-menu-toggle"
          onClick={toggleMobileMenu}
          aria-label="Toggle navigation menu"
        >
          <span className={`hamburger ${isMobileMenuOpen ? 'active' : ''}`}>
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
      </div>

      {/* Mobile Navigation Menu */}
      <div className={`mobile-nav ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="mobile-nav-content">
          {navigationItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`mobile-nav-link ${location.pathname === item.path ? 'active' : ''}`}
              onClick={closeMobileMenu}
            >
              <span className="nav-icon">{item.icon}</span>
              <div className="nav-info">
                <span className="nav-label">{item.label}</span>
                <span className="nav-description">{item.description}</span>
              </div>
            </Link>
          ))}
          
          <div className="mobile-nav-divider"></div>
          
          <div className="mobile-user-section">
            <div className="mobile-user-info">
              <span className="user-icon">👤</span>
              <span className="user-name">{getUserDisplayName()}</span>
            </div>
            
            {signOut && (
              <button 
                onClick={handleSignOut}
                className="mobile-logout-btn"
              >
                <span className="logout-icon">🚪</span>
                <span className="logout-text">Logout</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={closeMobileMenu}></div>
      )}

      <style>{`
        .navbar {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(50, 179, 231, 0.2);
          box-shadow: 0 2px 20px rgba(50, 179, 231, 0.1);
          position: sticky;
          top: 0;
          z-index: 1000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .navbar-container {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          height: 70px;
        }

        /* Brand */
        .navbar-brand {
          flex-shrink: 0;
        }

        .brand-link {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: #002b4b;
          font-weight: 700;
          font-size: 20px;
          transition: all 0.2s;
        }

        .brand-link:hover {
          color: #32b3e7;
          transform: translateY(-1px);
        }

        .brand-icon {
          font-size: 24px;
          filter: drop-shadow(0 2px 4px rgba(50, 179, 231, 0.3));
        }

        .brand-text {
          background: linear-gradient(135deg, #002b4b 0%, #32b3e7 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        /* Desktop Navigation */
        .navbar-nav {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          justify-content: center;
          margin: 0 40px;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: 8px;
          text-decoration: none;
          color: #5e6e77;
          font-weight: 500;
          font-size: 14px;
          transition: all 0.2s;
          position: relative;
          white-space: nowrap;
        }

        .nav-link:hover {
          background: rgba(50, 179, 231, 0.1);
          color: #002b4b;
          transform: translateY(-1px);
        }

        .nav-link.active {
          background: linear-gradient(135deg, #32b3e7, #1a9bd8);
          color: white;
          box-shadow: 0 4px 12px rgba(50, 179, 231, 0.3);
        }

        .nav-link.active:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(50, 179, 231, 0.4);
        }

        .nav-icon {
          font-size: 16px;
          opacity: 0.9;
        }

        .nav-label {
          font-weight: 600;
        }

        /* User Actions */
        .navbar-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(50, 179, 231, 0.1);
          border-radius: 20px;
          color: #002b4b;
          font-size: 13px;
          font-weight: 500;
        }

        .user-icon {
          font-size: 16px;
          opacity: 0.8;
        }

        .user-name {
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .logout-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: linear-gradient(135deg, #fed7d7, #feb2b2);
          border: 1px solid #f87171;
          border-radius: 6px;
          color: #dc2626;
          font-weight: 500;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .logout-btn:hover {
          background: linear-gradient(135deg, #fecaca, #f87171);
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(220, 38, 38, 0.2);
        }

        .logout-icon {
          font-size: 14px;
        }

        /* Mobile Menu Toggle */
        .mobile-menu-toggle {
          display: none;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          width: 40px;
          height: 40px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
        }

        .hamburger {
          display: flex;
          flex-direction: column;
          width: 20px;
          height: 16px;
          position: relative;
        }

        .hamburger span {
          display: block;
          width: 100%;
          height: 2px;
          background: #002b4b;
          border-radius: 1px;
          transition: all 0.3s;
          transform-origin: center;
        }

        .hamburger span:nth-child(1) {
          position: absolute;
          top: 0;
        }

        .hamburger span:nth-child(2) {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
        }

        .hamburger span:nth-child(3) {
          position: absolute;
          bottom: 0;
        }

        .hamburger.active span:nth-child(1) {
          transform: rotate(45deg) translate(0, 7px);
        }

        .hamburger.active span:nth-child(2) {
          opacity: 0;
        }

        .hamburger.active span:nth-child(3) {
          transform: rotate(-45deg) translate(0, -7px);
        }

        /* Mobile Navigation */
        .mobile-nav {
          display: none;
          position: fixed;
          top: 70px;
          left: 0;
          width: 100%;
          height: calc(100vh - 70px);
          background: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(20px);
          transform: translateX(-100%);
          transition: transform 0.3s ease;
          z-index: 999;
        }

        .mobile-nav.open {
          transform: translateX(0);
        }

        .mobile-nav-content {
          padding: 30px 20px;
          height: 100%;
          overflow-y: auto;
        }

        .mobile-nav-link {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 16px 0;
          border-bottom: 1px solid rgba(50, 179, 231, 0.1);
          text-decoration: none;
          color: #5e6e77;
          transition: all 0.2s;
        }

        .mobile-nav-link:hover {
          color: #002b4b;
          background: rgba(50, 179, 231, 0.05);
          margin: 0 -20px;
          padding-left: 20px;
          padding-right: 20px;
        }

        .mobile-nav-link.active {
          color: #32b3e7;
          font-weight: 600;
        }

        .mobile-nav-link .nav-icon {
          font-size: 20px;
          width: 24px;
          text-align: center;
        }

        .nav-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .nav-description {
          font-size: 12px;
          color: #9ca3af;
        }

        .mobile-nav-divider {
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(50, 179, 231, 0.3), transparent);
          margin: 20px 0;
        }

        .mobile-user-section {
          margin-top: 20px;
          padding-top: 20px;
        }

        .mobile-user-info {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 0;
          color: #002b4b;
          font-weight: 500;
        }

        .mobile-logout-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #fed7d7, #feb2b2);
          border: 1px solid #f87171;
          border-radius: 8px;
          color: #dc2626;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 10px;
        }

        .mobile-logout-btn:hover {
          background: linear-gradient(135deg, #fecaca, #f87171);
          transform: translateY(-1px);
        }

        .mobile-menu-overlay {
          display: none;
          position: fixed;
          top: 70px;
          left: 0;
          width: 100%;
          height: calc(100vh - 70px);
          background: rgba(0, 0, 0, 0.3);
          z-index: 998;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .navbar-nav {
            display: none;
          }

          .navbar-actions {
            display: none;
          }

          .mobile-menu-toggle {
            display: flex;
          }

          .mobile-nav {
            display: block;
          }

          .mobile-menu-overlay {
            display: block;
          }

          .navbar-container {
            padding: 0 15px;
          }

          .brand-text {
            display: none;
          }
        }

        @media (max-width: 1024px) {
          .navbar-nav {
            margin: 0 20px;
          }

          .user-name {
            max-width: 100px;
          }
        }

        @media (max-width: 480px) {
          .navbar-container {
            height: 60px;
          }

          .mobile-nav {
            top: 60px;
            height: calc(100vh - 60px);
          }

          .mobile-menu-overlay {
            top: 60px;
            height: calc(100vh - 60px);
          }

          .brand-link {
            font-size: 18px;
          }

          .brand-icon {
            font-size: 20px;
          }
        }
      `}</style>
    </nav>
  );
};