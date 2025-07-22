// src/App.tsx - Complete Application with Router Integration - AWS Amplify Gen 2
import { Authenticator } from '@aws-amplify/ui-react';
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';
import '@aws-amplify/ui-react/styles.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import SubmittedInvoicesPage from './pages/SubmittedInvoicesPage';
import { appTheme } from './theme';

// Configure Amplify
Amplify.configure(outputs);

export default function App() {
  return (
    <div className="app">
      <Authenticator>
        {({ signOut, user }) => (
          <Router>
            <div className="authenticated-app">
              {/* Navigation Bar - Always visible after authentication */}
              <Navbar signOut={signOut} user={user} />
              
              {/* Main Content Area with Routing */}
              <main className="main-content">
                <Routes>
                  {/* Dashboard - Default route */}
                  <Route 
                    path="/" 
                    element={<DashboardPage />} 
                  />
                  
                  {/* Upload Page */}
                  <Route 
                    path="/upload" 
                    element={<UploadPage />} 
                  />
                  
                  {/* Submitted Invoices Page */}
                  <Route 
                    path="/submitted-invoices" 
                    element={<SubmittedInvoicesPage />} 
                  />
                  
                  {/* Catch-all redirect to dashboard */}
                  <Route 
                    path="*" 
                    element={<Navigate to="/" replace />} 
                  />
                </Routes>
              </main>
            </div>
          </Router>
        )}
      </Authenticator>

      {/* Apply App Theme Styles */}
      <style>{appTheme}</style>

      <style>{`
        /* Additional Router-specific styles to complement your existing appTheme */
        .authenticated-app {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .main-content {
          /* Account for navbar height */
          flex: 1;
          min-height: calc(100vh - 70px);
          /* Remove default padding since pages handle their own spacing */
          padding: 0;
        }

        /* Router-specific responsive adjustments */
        @media (max-width: 768px) {
          .main-content {
            min-height: calc(100vh - 60px);
          }
        }

        @media (max-width: 480px) {
          .main-content {
            min-height: calc(100vh - 60px);
          }
        }

        /* Ensure smooth transitions between routes */
        .main-content > * {
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}