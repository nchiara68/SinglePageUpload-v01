// amplify/backend.ts - Updated to expose bucket name (Gen 2 compatible)
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';

// Define and configure the backend
export const backend = defineBackend({
  auth,
  data,
  storage,
});

// ✅ Expose the storage bucket name for frontend access
backend.addOutput({
  storage: {
    aws_region: backend.auth.resources.userPool.stack.region,
    bucket_name: backend.storage.resources.bucket.bucketName,
  },
});

// Ensure backend is properly exported and used
export default backend;