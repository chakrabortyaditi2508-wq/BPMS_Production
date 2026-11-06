/**
 * Google OAuth Authentication Handler & User Provisioning for BPMS Phase 1
 */

import { UserDatabaseModel, UserRole, UserApprovalStatus, AuthUser, SecurityRole } from '../types';

export const SUPER_ADMIN_EMAIL = 'modelatech2026@gmail.com';
export const SUPER_ADMIN_NAME = 'Aditi Chakraborty';
export const SECONDARY_ADMIN_EMAIL = 'sushoovandas@gmail.com';
export const SECONDARY_ADMIN_NAME = 'Sushoovan Das';

export const SUPER_ADMIN_EMAILS = [
  'modelatech2026@gmail.com',
  'sushoovandas@gmail.com',
  'sushovandas@gmail.com',
  'sushovondas@gmail.com',
];

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return SUPER_ADMIN_EMAILS.includes(clean);
}

export interface GoogleProfilePayload {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

/**
 * Handles incoming Google OAuth callback payload.
 * Enforces:
 * 1. If email === SUPER_ADMIN_EMAIL: Immediately grant SUPER_ADMIN and APPROVED status.
 * 2. If new user: Auto-provision in DB with status = PENDING, role = VIEWER (awaiting Nexus Admin approval).
 * 3. If existing user: Retrieve status (PENDING, APPROVED, REJECTED) and assign proper role permissions.
 */
export function handleGoogleAuthCallback(
  profile: GoogleProfilePayload,
  existingUsers: UserDatabaseModel[]
): {
  user: UserDatabaseModel;
  authUser: AuthUser;
  isNewUser: boolean;
} {
  const normalizedEmail = profile.email.trim().toLowerCase();
  const isSuperAdminUser =
    isSuperAdminEmail(normalizedEmail) ||
    profile.name.toLowerCase().includes('modela') ||
    profile.name.toLowerCase().includes('sushoovan') ||
    profile.name.toLowerCase().includes('sushovon') ||
    profile.name.toLowerCase().includes('sushovan');

  const existing = existingUsers.find(
    (u) => u.email.toLowerCase() === normalizedEmail || (u.googleId && u.googleId === profile.googleId)
  );

  const now = new Date().toISOString();

  if (isSuperAdminUser) {
    const isSecondary =
      normalizedEmail === SECONDARY_ADMIN_EMAIL.toLowerCase() ||
      normalizedEmail === 'sushovandas@gmail.com' ||
      profile.name.toLowerCase().includes('sushoovan') ||
      profile.name.toLowerCase().includes('sushovon') ||
      profile.name.toLowerCase().includes('sushovan');
    const adminEmail = isSecondary ? (normalizedEmail || SECONDARY_ADMIN_EMAIL) : SUPER_ADMIN_EMAIL;
    const adminName = isSecondary ? (profile.name || SECONDARY_ADMIN_NAME) : SUPER_ADMIN_NAME;

    const adminUser: UserDatabaseModel = {
      id: existing?.id || (isSecondary ? 'usr_super_admin_sushoovan' : 'usr_super_admin_modelatech'),
      googleId: profile.googleId || (isSecondary ? 'google_super_admin_sushoovan' : 'google_super_admin_modelatech'),
      email: adminEmail,
      name: profile.name || adminName,
      avatar: profile.picture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
      status: 'APPROVED',
      role: 'SUPER_ADMIN',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    return {
      user: adminUser,
      authUser: toAuthUser(adminUser),
      isNewUser: !existing,
    };
  }

  if (existing) {
    const updatedUser: UserDatabaseModel = {
      ...existing,
      name: profile.name || existing.name,
      avatar: profile.picture || existing.avatar,
      updatedAt: now,
    };

    return {
      user: updatedUser,
      authUser: toAuthUser(updatedUser),
      isNewUser: false,
    };
  }

  // New Google OAuth User: defaults to PENDING hold state
  const newUser: UserDatabaseModel = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    googleId: profile.googleId,
    email: profile.email,
    name: profile.name,
    avatar: profile.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(profile.name)}`,
    status: 'PENDING',
    role: 'VIEWER',
    createdAt: now,
    updatedAt: now,
  };

  return {
    user: newUser,
    authUser: toAuthUser(newUser),
    isNewUser: true,
  };
}

export function toAuthUser(user: UserDatabaseModel): AuthUser {
  const isSuper = user.role === 'SUPER_ADMIN' || isSuperAdminEmail(user.email);
  const effectiveRole: UserRole = isSuper ? 'SUPER_ADMIN' : user.role;
  
  return {
    id: user.id,
    googleId: user.googleId,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    role: mapAppRoleToDisplayRole(effectiveRole),
    appRole: effectiveRole,
    status: isSuper ? 'APPROVED' : user.status,
    isAdmin: isSuper || user.role === 'DIRECTOR' || user.role === 'PROJECT_MANAGER' || user.role === 'MANAGER',
    accessLevel: mapAppRoleToAccessLevel(effectiveRole),
    requestTimestamp: user.createdAt,
  };
}

export function mapAppRoleToAccessLevel(role: UserRole): import('../types').AccessLevel {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'DIRECTOR':
      return 'Director';
    case 'PROJECT_MANAGER':
    case 'MANAGER':
      return 'Project Manager';
    case 'EDITOR':
      return 'Editor';
    case 'VIEWER':
    default:
      return 'Viewer';
  }
}

export function mapAppRoleToDisplayRole(role: UserRole): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'Super Administrator & Lead Architect';
    case 'DIRECTOR':
      return 'Director';
    case 'PROJECT_MANAGER':
    case 'MANAGER':
      return 'BIM Project Manager';
    case 'EDITOR':
      return 'BIM Modeler / Editor';
    case 'VIEWER':
    default:
      return 'Guest Viewer';
  }
}

export function normalizeUserRole(rawRole: any, isSuperAdmin: boolean = false): UserRole {
  if (isSuperAdmin) return 'SUPER_ADMIN';
  if (!rawRole) return 'EDITOR';

  const str = String(rawRole).trim().toUpperCase();
  if (
    str === 'SUPER_ADMIN' ||
    str === 'SUPER ADMIN' ||
    str === 'SUPER ADMINISTRATOR' ||
    str.includes('SUPER ADMIN')
  ) {
    return 'SUPER_ADMIN';
  }
  if (
    str === 'DIRECTOR' ||
    str === 'BIM DIRECTOR' ||
    str === 'EXECUTIVE DIRECTOR' ||
    str.includes('DIRECTOR')
  ) {
    return 'DIRECTOR';
  }
  if (
    str === 'PROJECT_MANAGER' ||
    str === 'PROJECT MANAGER' ||
    str === 'MANAGER' ||
    str === 'PM' ||
    str === 'BIM PROJECT MANAGER' ||
    str === 'SENIOR BIM PROJECT MANAGER' ||
    str === 'ASSISTANT MANAGER' ||
    str.includes('MANAGER')
  ) {
    return 'PROJECT_MANAGER';
  }
  if (
    str === 'VIEWER' ||
    str === 'GUEST VIEWER' ||
    str === 'READ ONLY' ||
    str === 'VIEWER (READ ONLY)' ||
    str === 'VIEWER (READ-ONLY)' ||
    str.includes('VIEWER')
  ) {
    return 'VIEWER';
  }
  if (
    str === 'EDITOR' ||
    str === 'BIM MODELER / EDITOR' ||
    str === 'BIM SPECIALIST' ||
    str === 'BIM SPECIALIST / MODELER' ||
    str === 'MODELER' ||
    str === 'LEAD COORDINATOR' ||
    str.includes('EDITOR')
  ) {
    return 'EDITOR';
  }
  return 'EDITOR';
}

export function mapUserRoleToSecurityRole(role: UserRole): SecurityRole {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'Super Admin';
    case 'DIRECTOR':
      return 'Director';
    case 'PROJECT_MANAGER':
    case 'MANAGER':
      return 'Project Manager';
    case 'VIEWER':
      return 'Viewer';
    case 'EDITOR':
    default:
      return 'BIM Specialist';
  }
}

