import PocketBase from 'pocketbase';

/**
 * PocketBase Singleton Client Configuration
 * Uses VITE_POCKETBASE_URL from .env if provided, or defaults to standard PocketBase local URL.
 */
export const POCKETBASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_POCKETBASE_URL) ||
  'http://127.0.0.1:8090';

export const pb = new PocketBase(POCKETBASE_URL);

// Disable request auto-cancellation for parallel data fetching
pb.autoCancellation(false);

/**
 * Collection Name Constants matching current ProductionPulse schema
 */
export const PB_COLLECTIONS = {
  USERS: 'users',
  ACCESS_REQUESTS: 'access_requests',
  PROJECTS: 'projects',
  ASSIGNED_HOURS: 'assigned_hours',
  WORK_LOGS: 'work_logs',
  DISCIPLINES: 'disciplines',
  PROJECT_FEEDBACKS: 'project_feedbacks',
} as const;

export default pb;
