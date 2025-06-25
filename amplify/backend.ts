// amplify/backend.ts - SIMPLIFIED
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';

const backend = defineBackend({
  auth,
  data,
  storage,
  // ✅ No function to register
});

// ✅ No grants needed - frontend handles everything