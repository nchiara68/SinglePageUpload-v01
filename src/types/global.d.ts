// src/types/global.d.ts - Global TypeScript declarations
import type { AmplifyConfig } from '../utils/amplifyConfigSetup';

declare global {
  interface Window {
    amplifyConfig?: AmplifyConfig;
    refreshInvoiceViewer?: () => void;
    fs?: {
      readFile: (path: string, options?: { encoding?: string }) => Promise<Uint8Array | string>;
    };
  }
}

// Extend process.env for environment variables (if needed)
declare namespace NodeJS {
  interface ProcessEnv {
    REACT_APP_S3_BUCKET_NAME?: string;
    REACT_APP_ENV?: string;
    REACT_APP_DEBUG?: string;
  }
}

export {};