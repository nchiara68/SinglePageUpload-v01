// amplify/storage/resource.ts - SIMPLIFIED
import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'dataRoomStorage',
  access: (allow) => ({
    // User-specific data room folders - each user can only access their own files
    'user-files/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete'])
    ]
  })
  // ✅ No triggers needed - processing happens in frontend
});