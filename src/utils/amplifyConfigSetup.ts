// src/utils/amplifyConfigSetup.ts - Setup for Amplify Gen 2 default outputs (Type-safe)
import { Amplify } from 'aws-amplify';
import outputs from '../../amplify_outputs.json';

// Define proper TypeScript interfaces for Amplify Gen 2 default outputs
export interface AmplifyStorageConfig {
  bucket_name?: string;
  aws_region?: string;
}

export interface AmplifyConfig {
  storage?: AmplifyStorageConfig; // Made optional to match usage
}

export interface AmplifyOutputs {
  storage?: {
    bucket_name?: string;
    aws_region?: string;
  };
  auth?: {
    aws_region: string;
    user_pool_id: string;
    user_pool_client_id: string;
  };
  data?: {
    aws_region: string;
    url: string;
  };
  // Amplify Gen 2 might use different structure
  custom?: {
    [key: string]: unknown;
  };
}

// Note: Global Window interface is declared in src/types/global.d.ts

// Configure Amplify with outputs
Amplify.configure(outputs);

// Extract and expose storage configuration globally for components to access
const setupStorageConfig = (): string | null => {
  try {
    console.log('🔧 [AMPLIFY] Raw outputs structure:', outputs);
    
    // Get the storage configuration from Amplify outputs
    const typedOutputs = outputs as AmplifyOutputs;
    
    // Try to find bucket name in various possible locations
    let bucketName: string | undefined;
    let region: string | undefined;
    
    // Method 1: Direct storage configuration
    if (typedOutputs.storage?.bucket_name) {
      bucketName = typedOutputs.storage.bucket_name;
      region = typedOutputs.storage.aws_region;
      console.log('✅ [AMPLIFY] Found bucket in storage config:', bucketName);
    }
    
    // Method 2: Check if bucket info is in custom outputs
    if (!bucketName && typedOutputs.custom) {
      const customEntries = Object.entries(typedOutputs.custom);
      for (const [key, value] of customEntries) {
        if (key.includes('bucket') || key.includes('storage')) {
          console.log('🔍 [AMPLIFY] Found custom storage entry:', key, value);
          if (typeof value === 'string' && value.includes('amplify')) {
            bucketName = value;
            break;
          }
        }
      }
    }
    
    // Method 3: Try to extract from any string values that look like bucket names
    if (!bucketName) {
      const allValues = JSON.stringify(outputs);
      const bucketMatch = allValues.match(/amplify-[a-zA-Z0-9-]+/);
      if (bucketMatch) {
        bucketName = bucketMatch[0];
        console.log('🔍 [AMPLIFY] Extracted bucket name from outputs:', bucketName);
      }
    }
    
    // Get region from auth config as fallback
    if (!region) {
      region = typedOutputs.auth?.aws_region || 'us-east-1';
    }
    
    if (bucketName) {
      // Make bucket name globally accessible with proper typing
      window.amplifyConfig = {
        storage: {
          bucket_name: bucketName,
          aws_region: region,
        }
      };
      
      console.log('✅ [AMPLIFY] Storage configuration loaded:', {
        bucket: bucketName,
        region: region
      });
      
      return bucketName;
    } else {
      console.warn('⚠️ [AMPLIFY] Storage bucket name not found in outputs');
      console.log('📋 [AMPLIFY] Available output keys:', Object.keys(outputs));
      return null;
    }
  } catch (error) {
    console.error('❌ [AMPLIFY] Error setting up storage configuration:', error);
    return null;
  }
};

// Initialize on module load
const bucketName = setupStorageConfig();

export { bucketName, setupStorageConfig };