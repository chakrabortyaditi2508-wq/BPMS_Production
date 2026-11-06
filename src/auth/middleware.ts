/**
 * Route Protection Middleware & RBAC Governance for BPMS
 */

import { AuthUser, UserRole, UserApprovalStatus } from '../types';

export type RouteDecision = 'ALLOW' | 'PENDING_HOLD' | 'ACCESS_DENIED' | 'UNAUTHENTICATED';

export interface RouteGuardResult {
  decision: RouteDecision;
  redirectReason?: string;
  allowedTabs: string[];
}

export const ROLE_PERMISSIONS: Record<
  UserRole,
  {
    canViewAnalytics: boolean;
    canEditProjects: boolean;
    canLogHours: boolean;
    canManageTeam: boolean;
    canAccessAdminNexus: boolean;
    canDeleteRecords: boolean;
    canExportReports: boolean;
  }
> = {
  SUPER_ADMIN: {
    canViewAnalytics: true,
    canEditProjects: true,
    canLogHours: true,
    canManageTeam: true,
    canAccessAdminNexus: true,
    canDeleteRecords: true,
    canExportReports: true,
  },
  DIRECTOR: {
    canViewAnalytics: true,
    canEditProjects: true,
    canLogHours: true,
    canManageTeam: true,
    canAccessAdminNexus: true,
    canDeleteRecords: true,
    canExportReports: true,
  },
  MANAGER: {
    canViewAnalytics: true,
    canEditProjects: true,
    canLogHours: true,
    canManageTeam: true,
    canAccessAdminNexus: false,
    canDeleteRecords: false,
    canExportReports: true,
  },
  PROJECT_MANAGER: {
    canViewAnalytics: true,
    canEditProjects: true,
    canLogHours: true,
    canManageTeam: true,
    canAccessAdminNexus: false,
    canDeleteRecords: false,
    canExportReports: true,
  },
  EDITOR: {
    canViewAnalytics: true,
    canEditProjects: true,
    canLogHours: true,
    canManageTeam: false,
    canAccessAdminNexus: false,
    canDeleteRecords: false,
    canExportReports: true,
  },
  VIEWER: {
    canViewAnalytics: false,
    canEditProjects: false,
    canLogHours: true,
    canManageTeam: false,
    canAccessAdminNexus: false,
    canDeleteRecords: false,
    canExportReports: false,
  },
};

/**
 * State-based Route Guard & RBAC Checker
 */
export function isPublicFeedbackRoute(path?: string): boolean {
  if (typeof window !== 'undefined') {
    const p = path ?? window.location.pathname;
    if (p === '/feedback' || p.startsWith('/feedback')) return true;
    const h = window.location.hash;
    if (h === '#feedback' || h === '#/feedback' || h.startsWith('#feedback') || h.startsWith('#/feedback')) return true;
  }
  if (!path) return false;
  return path === '/feedback' || path.startsWith('/feedback');
}

export function checkRouteAccess(user: AuthUser | null): RouteGuardResult {
  if (!user) {
    return {
      decision: 'UNAUTHENTICATED',
      redirectReason: 'Please sign in with your Google account.',
      allowedTabs: [],
    };
  }

  // Normalize status checks
  const rawStatus = (user.status || '').toLowerCase();

  if (rawStatus === 'pending' || rawStatus === 'pending_approval') {
    return {
      decision: 'PENDING_HOLD',
      redirectReason: 'Your request has been sent to the Super Admin. You will be granted access once approved.',
      allowedTabs: [],
    };
  }

  if (rawStatus === 'rejected' || rawStatus === 'suspended') {
    return {
      decision: 'ACCESS_DENIED',
      redirectReason: 'Your access request has been declined by the Super Admin.',
      allowedTabs: [],
    };
  }

  const role: UserRole = user.appRole || (user.isAdmin ? 'SUPER_ADMIN' : 'EDITOR');

  // Strict Viewer Lock: Viewer ONLY has access to Daily Hour Tracking & Organizational Timesheets
  if (role === 'VIEWER') {
    return {
      decision: 'ALLOW',
      allowedTabs: ['daily-tracker'],
    };
  }

  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.EDITOR;

  const allowedTabs: string[] = ['dashboard', 'projects'];
  if (permissions.canLogHours) allowedTabs.push('daily-tracker', 'assign-hours');
  if (permissions.canManageTeam) allowedTabs.push('employees', 'project-members');
  if (permissions.canExportReports) allowedTabs.push('stakeholder-reports', 'clash-lod', 'project-feedback');
  if (permissions.canAccessAdminNexus) allowedTabs.push('admin-nexus');

  return {
    decision: 'ALLOW',
    allowedTabs,
  };
}
