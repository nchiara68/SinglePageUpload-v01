// src/App.tsx - Minimal version with Amplify config and authentication only
import { Authenticator } from '@aws-amplify/ui-react';
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';
import '@aws-amplify/ui-react/styles.css';
import UploadPage from './pages/UploadPage';
import { appTheme } from './theme';

// Configure Amplify
Amplify.configure(outputs);

export default function App() {
  return (
    <div className="app">
      <Authenticator>
        {({ signOut, user }) => (
          <main>
            <UploadPage signOut={signOut} user={user} />
          </main>
        )}
      </Authenticator>

      {/* Apply App Theme Styles */}
      <style>{appTheme}</style>
    </div>
  );
}