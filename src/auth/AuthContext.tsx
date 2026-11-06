import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  AuthUser,
  SecurityRole,
  OrganizationalPermissions,
  SessionTokenInfo,
  TwoFactorConfig,
  UserApprovalStatus,
  UserRole,
  AccessLevel,
} from '../types';
import {
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_NAME,
  SECONDARY_ADMIN_EMAIL,
  SECONDARY_ADMIN_NAME,
  isSuperAdminEmail,
  mapAppRoleToAccessLevel,
  mapAppRoleToDisplayRole,
  mapUserRoleToSecurityRole,
  normalizeUserRole,
} from './googleAuth';
import {
  fetchUserRoleFromDatabase,
  persistUserRoleToDatabase,
  generateRequestDocId,
  DatabaseRoleResult,
} from './roleSync';
import {
  generateTotpSecret,
  buildOtpAuthUri,
  generateQrCodeDataUrl,
  generateBackupCodes,
  verifyTotpToken,
  validateAndConsumeBackupCode,
} from './totp';
import {
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase/config';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';

export interface TwoFactorSetupDraft {
  secret: string;
  uri: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

export interface AuthContextType {
  user: AuthUser | null;
  session: SessionTokenInfo | null;
  securityRole: SecurityRole;
  permissions: OrganizationalPermissions;
  isAuthenticated: boolean;
  is2FAPending: boolean;
  pending2FAUser: AuthUser | null;
  twoFactorState: {
    isEnabled: boolean;
    backupCodesRemaining: number;
    enrolledAt?: string;
  };

  // Auth Operations
  fetchGoogleIdentity: () => Promise<{
    name: string;
    email: string;
    uid: string;
    photoURL?: string;
  }>;
  submitAccessRequest: (params: {
    name: string;
    email: string;
    uid?: string;
    existingDbRecord?: DatabaseRoleResult;
    skipFirestoreWrite?: boolean;
  }) => Promise<{ requires2FA: boolean; status: UserApprovalStatus; user: AuthUser }>;
  confirmGoogleAccessRequest: (params: {
    name: string;
    email: string;
    uid: string;
    photoURL?: string;
    existingDbRecord?: DatabaseRoleResult;
    skipFirestoreWrite?: boolean;
  }) => Promise<{ requires2FA: boolean; status: UserApprovalStatus; user: AuthUser }>;
  loginWithEmail: (
    email: string,
    password?: string,
    extra?: { name?: string; role?: SecurityRole; organization?: string; accessReason?: string }
  ) => Promise<{ requires2FA: boolean; status: UserApprovalStatus; user: AuthUser }>;
  loginWithGoogle: (profile: {
    googleId?: string;
    email: string;
    name?: string;
    picture?: string;
    organization?: string;
    discipline?: string;
    accessReason?: string;
  }) => Promise<{ requires2FA: boolean; status: UserApprovalStatus; user: AuthUser }>;
  verify2FAChallenge: (
    codeOrBackup: string,
    rememberBrowser?: boolean
  ) => Promise<{ success: boolean; error?: string; method?: 'totp' | 'backup'; remainingCodes?: number }>;
  cancel2FAChallenge: () => void;

  // 2FA Management
  initiateTwoFactorSetup: () => Promise<TwoFactorSetupDraft>;
  confirmTwoFactorSetup: (
    secret: string,
    verificationCode: string,
    backupCodes: string[]
  ) => Promise<{ success: boolean; error?: string }>;
  disableTwoFactor: (codeOrPassword?: string) => Promise<{ success: boolean; error?: string }>;
  regenerateBackupCodes: (currentTotpCode: string) => Promise<{ success: boolean; codes?: string[]; error?: string }>;

  // Session & Role Operations
  logout: () => void;
  switchSecurityRole: (role: SecurityRole) => void;
  updateCurrentUser: (updates: Partial<AuthUser>) => void;
  simulateQuickLogin: (role: 'Super Admin' | 'Project Manager' | 'BIM Specialist' | 'Viewer', enable2FAForDemo?: boolean) => void;
}

const STORAGE_KEYS = {
  CURRENT_USER: 'bim_auth_user_central_v1',
  SESSION: 'bim_auth_session_central_v1',
  SAVED_USERS_DB: 'bim_auth_registered_users_v1',
};

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<SecurityRole, OrganizationalPermissions> = {
  'Super Admin': {
    canViewAnalytics: true,
    canEditProjects: true,
    canLogHours: true,
    canManageTeam: true,
    canAccessAdminNexus: true,
    canDeleteRecords: true,
    canExportReports: true,
    canManageSecurity: true,
    canAssignHours: true,
    canReviewClashes: true,
  },
  'Director': {
    canViewAnalytics: true,
    canEditProjects: true,
    canLogHours: true,
    canManageTeam: true,
    canAccessAdminNexus: true,
    canDeleteRecords: true,
    canExportReports: true,
    canManageSecurity: true,
    canAssignHours: true,
    canReviewClashes: true,
  },
  'Project Manager': {
    canViewAnalytics: true,
    canEditProjects: true,
    canLogHours: true,
    canManageTeam: true,
    canAccessAdminNexus: false,
    canDeleteRecords: false,
    canExportReports: true,
    canManageSecurity: false,
    canAssignHours: true,
    canReviewClashes: true,
  },
  'BIM Specialist': {
    canViewAnalytics: true,
    canEditProjects: true,
    canLogHours: true,
    canManageTeam: false,
    canAccessAdminNexus: false,
    canDeleteRecords: false,
    canExportReports: true,
    canManageSecurity: false,
    canAssignHours: true,
    canReviewClashes: true,
  },
  'Lead Coordinator': {
    canViewAnalytics: true,
    canEditProjects: true,
    canLogHours: true,
    canManageTeam: false,
    canAccessAdminNexus: false,
    canDeleteRecords: false,
    canExportReports: true,
    canManageSecurity: false,
    canAssignHours: true,
    canReviewClashes: true,
  },
  'Editor': {
    canViewAnalytics: true,
    canEditProjects: true,
    canLogHours: true,
    canManageTeam: false,
    canAccessAdminNexus: false,
    canDeleteRecords: false,
    canExportReports: true,
    canManageSecurity: false,
    canAssignHours: true,
    canReviewClashes: false,
  },
  'Viewer': {
    canViewAnalytics: false,
    canEditProjects: false,
    canLogHours: true,
    canManageTeam: false,
    canAccessAdminNexus: false,
    canDeleteRecords: false,
    canExportReports: false,
    canManageSecurity: false,
    canAssignHours: false,
    canReviewClashes: false,
  },
};

export function getRoleFromUser(user: AuthUser | null): SecurityRole {
  if (!user) return 'Viewer';
  if (user.securityRole) return user.securityRole;
  if (user.appRole === 'SUPER_ADMIN' || user.accessLevel === 'Super Admin' || isSuperAdminEmail(user.email)) {
    return 'Super Admin';
  }
  if (user.appRole === 'DIRECTOR' || user.accessLevel === 'Director') {
    return 'Director';
  }
  if (user.appRole === 'PROJECT_MANAGER' || user.accessLevel === 'Project Manager') {
    return 'Project Manager';
  }
  if (user.appRole === 'VIEWER' || user.accessLevel === 'Viewer') {
    return 'Viewer';
  }
  if (user.appRole === 'EDITOR' || user.accessLevel === 'Editor') {
    return 'Editor';
  }
  if (user.role?.toLowerCase().includes('director')) {
    return 'Director';
  }
  if (user.role?.toLowerCase().includes('specialist') || user.role?.toLowerCase().includes('modeler')) {
    return 'BIM Specialist';
  }
  return 'Viewer';
}

function generateSessionToken(email: string, is2FAVerified: boolean): SessionTokenInfo {
  const token = `bpms_sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days session
  return {
    token,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    ipAddress: '10.240.18.92 (Secure Gateway)',
    deviceLabel: 'Enterprise Workstation',
    browser: typeof navigator !== 'undefined' ? (navigator.userAgent.includes('Chrome') ? 'Chrome / Linux' : 'Browser Session') : 'Standard Web',
    is2FAVerified,
    lastActive: now.toISOString(),
  };
}

// Initial seed default Super Admin with full master access across all BPMS modules
const INITIAL_SUPER_ADMIN: AuthUser = {
  id: 'usr_super_admin_modelatech',
  googleId: 'google_super_admin_modelatech',
  email: 'modelatech2026@gmail.com',
  name: 'Aditi Chakraborty',
  role: 'Super Administrator & Lead Architect',
  appRole: 'SUPER_ADMIN',
  status: 'APPROVED',
  isAdmin: true,
  accessLevel: 'Super Admin',
  securityRole: 'Super Admin',
  organization: 'BPMS Core Systems & Architecture',
  accessReason: 'Executive Super Administrator with master editing and governance access',
  requestTimestamp: '2026-08-23 09:00 AM',
  avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AditiChakraborty',
  twoFactor: {
    isEnabled: false,
    backupCodes: [],
    usedBackupCodes: [],
  },
  twoFactorEnabled: false,
  permissions: DEFAULT_PERMISSIONS_BY_ROLE['Super Admin'],
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Registered user accounts storage to persist 2FA configs per email
  const [usersDb, setUsersDb] = useState<Record<string, AuthUser>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SAVED_USERS_DB);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) {
      console.warn('Error reading users db', e);
    }
    return {
      'modelatech2026@gmail.com': INITIAL_SUPER_ADMIN,
      'sushoovandas@gmail.com': {
        ...INITIAL_SUPER_ADMIN,
        id: 'usr_super_admin_sushoovan',
        email: 'sushoovandas@gmail.com',
        name: 'Sushoovan Das',
      },
    };
  });

  // Save users database
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SAVED_USERS_DB, JSON.stringify(usersDb));
    } catch (e) {
      console.warn('Error saving users db', e);
    }
  }, [usersDb]);

  // Active Authenticated User - default to null (unauthenticated by default)
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.email) {
          // Verify session exists and is unexpired
          const savedSession = localStorage.getItem(STORAGE_KEYS.SESSION);
          if (savedSession) {
            const parsedSession = JSON.parse(savedSession);
            if (
              parsedSession &&
              parsedSession.token &&
              new Date(parsedSession.expiresAt).getTime() > Date.now()
            ) {
              const cleanSavedEmail = String(parsed.email || '').trim().toLowerCase();
              const lowerSavedName = String(parsed.name || '').trim().toLowerCase();
              const isSushovan =
                lowerSavedName.includes('sushovan') ||
                lowerSavedName.includes('sushoovan') ||
                cleanSavedEmail === 'sushoovandas@gmail.com' ||
                cleanSavedEmail === 'sushovandas@gmail.com';
              const isAditiSuper =
                !isSushovan && cleanSavedEmail === SUPER_ADMIN_EMAIL.toLowerCase();
              const canonicalSavedUser = isAditiSuper
                ? {
                    ...parsed,
                    id: 'emp-modelatech2026_gmail_com',
                    googleId: 'emp-modelatech2026_gmail_com',
                    name: SUPER_ADMIN_NAME,
                    email: SUPER_ADMIN_EMAIL,
                  }
                : isSushovan
                ? {
                    ...parsed,
                    id: 'emp-sushoovan_das',
                    googleId: 'emp-sushoovan_das',
                    name: parsed.name || 'Sushovan Das',
                    email:
                      cleanSavedEmail && cleanSavedEmail !== SUPER_ADMIN_EMAIL.toLowerCase()
                        ? cleanSavedEmail
                        : 'sushoovandas@gmail.com',
                  }
                : parsed;
              if (isSuperAdminEmail(canonicalSavedUser.email)) {
                const roleOverride =
                  typeof window !== 'undefined'
                    ? (sessionStorage.getItem('bpms_active_security_role_override') as SecurityRole | null)
                    : null;
                if (roleOverride && canonicalSavedUser.securityRole === roleOverride) {
                  return canonicalSavedUser;
                }
                return {
                  ...canonicalSavedUser,
                  status: 'APPROVED',
                  role: 'Super Administrator & Lead Architect',
                  appRole: 'SUPER_ADMIN',
                  isAdmin: true,
                  accessLevel: 'Super Admin',
                  securityRole: 'Super Admin',
                  permissions: DEFAULT_PERMISSIONS_BY_ROLE['Super Admin'],
                };
              }
              return canonicalSavedUser;
            }
          }
        }
      }
    } catch {
      // ignore
    }
    return null;
  });

  // Active Session - default to null (unauthenticated by default)
  const [session, setSession] = useState<SessionTokenInfo | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SESSION);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.token) {
          if (new Date(parsed.expiresAt).getTime() > Date.now()) {
            return parsed;
          }
        }
      }
    } catch {
      // ignore
    }
    return null;
  });

  // 2FA Challenge Pending State
  const [pending2FAUser, setPending2FAUser] = useState<AuthUser | null>(null);

  // Sync session & user to local storage
  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
  }, [user]);

  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEYS.SESSION);
    }
  }, [session]);

  // 1. Global Firebase Authentication Observer: fetches user role from database upon sign-in
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser || !firebaseUser.email) return;

      try {
        const cleanEmail = firebaseUser.email.trim().toLowerCase();
        const isSuper = isSuperAdminEmail(cleanEmail);
        const isAditiSuper = cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase();
        const isSushovanSuper = isSuper && !isAditiSuper;
        const uid = isAditiSuper
          ? 'emp-modelatech2026_gmail_com'
          : isSushovanSuper
          ? 'emp-sushoovan_das'
          : firebaseUser.uid;
        const displayName = isAditiSuper
          ? SUPER_ADMIN_NAME
          : isSushovanSuper
          ? SECONDARY_ADMIN_NAME
          : firebaseUser.displayName || cleanEmail.split('@')[0];

        // Fetch user profile record from the users (or access_requests) database table
        const dbRecord = await fetchUserRoleFromDatabase(cleanEmail, uid);

        // Dynamically set user session state using dbRecord.role (guaranteeing Super Admin status)
        const role = isSuper ? 'SUPER_ADMIN' : dbRecord.role;
        const status = isSuper ? 'APPROVED' : dbRecord.status;
        const accessLevel = isSuper ? 'Super Admin' : dbRecord.accessLevel;
        const securityRole = isSuper ? 'Super Admin' : dbRecord.securityRole;
        const displayRole = isSuper
          ? 'Super Administrator & Lead Architect'
          : dbRecord.displayRole || mapAppRoleToDisplayRole(role);

        const authUser: AuthUser = {
          id: uid,
          googleId: uid,
          email: cleanEmail,
          name: displayName,
          avatar: firebaseUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`,
          role: displayRole,
          appRole: role,
          status,
          isAdmin: role === 'SUPER_ADMIN' || role === 'DIRECTOR' || role === 'PROJECT_MANAGER',
          accessLevel,
          securityRole,
          permissions: DEFAULT_PERMISSIONS_BY_ROLE[securityRole] || DEFAULT_PERMISSIONS_BY_ROLE['Viewer'],
          organization: 'ProductionPulse Team',
          requestTimestamp: new Date().toISOString(),
        };

        saveUserToDb(authUser);
        setUser(authUser);

        setSession((prev) => {
          if (prev && new Date(prev.expiresAt).getTime() > Date.now()) {
            return prev;
          }
          return generateSessionToken(cleanEmail, true);
        });
      } catch (err) {
        console.warn('Global onAuthStateChanged role fetch notice:', err);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 2. Synchronize and verify user's assigned role from database during session initialization & real-time updates
  useEffect(() => {
    if (!user || !user.email) return;
    let isCancelled = false;

    // 2a. Direct database query
    const verifyDatabaseRole = async () => {
      try {
        if (
          typeof window !== 'undefined' &&
          sessionStorage.getItem('bpms_active_security_role_override')
        ) {
          return;
        }
        const dbRecord = await fetchUserRoleFromDatabase(user.email, user.googleId || user.id);
        if (isCancelled || !dbRecord) return;

        // Never overwrite an assigned role with default 'EDITOR' if user already has an assigned role
        if (dbRecord.source === 'default' && (user.appRole === 'SUPER_ADMIN' || user.appRole === 'DIRECTOR' || user.appRole === 'PROJECT_MANAGER' || user.appRole === 'VIEWER')) {
          return;
        }

        const shouldUpdate =
          user.appRole !== dbRecord.role ||
          user.status !== dbRecord.status ||
          user.accessLevel !== dbRecord.accessLevel;

        if (shouldUpdate) {
          setUser((prev) => {
            if (!prev || prev.email.toLowerCase() !== user.email.toLowerCase()) return prev;
            const updated: AuthUser = {
              ...prev,
              appRole: dbRecord.role,
              status: dbRecord.status,
              accessLevel: dbRecord.accessLevel,
              role: dbRecord.displayRole || mapAppRoleToDisplayRole(dbRecord.role),
              securityRole: dbRecord.securityRole,
              isAdmin: dbRecord.role === 'SUPER_ADMIN' || dbRecord.role === 'DIRECTOR' || dbRecord.role === 'PROJECT_MANAGER',
              permissions: DEFAULT_PERMISSIONS_BY_ROLE[dbRecord.securityRole] || prev.permissions,
            };
            saveUserToDb(updated);
            return updated;
          });
        }
      } catch (err) {
        console.warn('Session database role sync notice:', err);
      }
    };

    verifyDatabaseRole();

    // 2b. Real-time snapshot listener on access_requests by email to immediately catch Super Admin edits in Admin Nexus
    const cleanUserEmail = user.email.trim().toLowerCase();
    let unsubSnapshot: (() => void) | undefined;

    try {
      const reqQuery = query(collection(db, 'access_requests'), where('email', '==', cleanUserEmail));
      unsubSnapshot = onSnapshot(reqQuery, (snap) => {
        if (snap.empty || isCancelled) return;
        if (
          typeof window !== 'undefined' &&
          sessionStorage.getItem('bpms_active_security_role_override')
        ) {
          return;
        }
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        docs.sort((a, b) => {
          const aStatus = String(a.status || '').toLowerCase();
          const bStatus = String(b.status || '').toLowerCase();
          const aWeight = aStatus === 'approved' ? 3 : aStatus === 'rejected' ? 2 : 1;
          const bWeight = bStatus === 'approved' ? 3 : bStatus === 'rejected' ? 2 : 1;
          if (aWeight !== bWeight) return bWeight - aWeight;
          const aTime = new Date(a.updatedAt || a.reviewedAt || a.timestamp || a.createdAt || 0).getTime() || 0;
          const bTime = new Date(b.updatedAt || b.reviewedAt || b.timestamp || b.createdAt || 0).getTime() || 0;
          return bTime - aTime;
        });
        const data = docs[0];
        const role = normalizeUserRole(
          data.assignedRole || data.role || data.appRole,
          isSuperAdminEmail(cleanUserEmail)
        );
        const rawStatus = String(data.status || 'Pending').trim().toLowerCase();
        const status: UserApprovalStatus =
          rawStatus === 'approved' || rawStatus === 'active'
            ? 'APPROVED'
            : rawStatus === 'rejected' || rawStatus === 'declined'
            ? 'REJECTED'
            : 'PENDING';
        const accessLevel: AccessLevel =
          (data.assignedAccessLevel as AccessLevel) || mapAppRoleToAccessLevel(role);
        const securityRole = mapUserRoleToSecurityRole(role);
        const displayRole = mapAppRoleToDisplayRole(role);

        setUser((prev) => {
          if (!prev || prev.email.toLowerCase() !== cleanUserEmail) return prev;
          if (
            prev.appRole === role &&
            prev.status === status &&
            prev.accessLevel === accessLevel &&
            prev.securityRole === securityRole
          ) {
            return prev;
          }
          const updated: AuthUser = {
            ...prev,
            appRole: role,
            status,
            accessLevel,
            role: displayRole,
            securityRole,
            isAdmin: role === 'SUPER_ADMIN' || role === 'DIRECTOR' || role === 'PROJECT_MANAGER',
            permissions: DEFAULT_PERMISSIONS_BY_ROLE[securityRole] || prev.permissions,
          };
          saveUserToDb(updated);
          return updated;
        });
      }, (err) => console.warn('User access_requests snapshot notice:', err));
    } catch (e) {
      // ignore
    }

    return () => {
      isCancelled = true;
      if (unsubSnapshot) unsubSnapshot();
    };
  }, [user?.email, user?.id, user?.googleId]);

  const securityRole = useMemo<SecurityRole>(() => {
    return getRoleFromUser(user);
  }, [user]);

  const permissions = useMemo<OrganizationalPermissions>(() => {
    if (user?.permissions) return user.permissions;
    return DEFAULT_PERMISSIONS_BY_ROLE[securityRole] || DEFAULT_PERMISSIONS_BY_ROLE['Viewer'];
  }, [user, securityRole]);

  // Authentication status: user exists, session is active and not expired,
  // and if 2FA was enabled, session must be 2FA verified
  const isAuthenticated = useMemo<boolean>(() => {
    if (!user || !session) return false;
    const now = Date.now();
    const isExpired = new Date(session.expiresAt).getTime() <= now;
    if (isExpired) return false;

    // Strict Gate: If user has 2FA enabled, the session MUST be verified
    if (user.twoFactor?.isEnabled && !session.is2FAVerified) {
      return false;
    }

    return true;
  }, [user, session]);

  const is2FAPending = useMemo<boolean>(() => {
    return !!pending2FAUser;
  }, [pending2FAUser]);

  const twoFactorState = useMemo(() => {
    const isEnabled = user?.twoFactorEnabled !== undefined
      ? Boolean(user.twoFactorEnabled)
      : Boolean(user?.twoFactor?.isEnabled);
    const remaining = (user?.twoFactor?.backupCodes || []).length;
    return {
      isEnabled,
      backupCodesRemaining: remaining,
      enrolledAt: user?.twoFactor?.enrolledAt,
    };
  }, [user]);

  // Helper to store/update user record
  const saveUserToDb = (updatedUser: AuthUser) => {
    const emailKey = updatedUser.email.toLowerCase();
    setUsersDb((prev) => ({
      ...prev,
      [emailKey]: updatedUser,
    }));
  };

  /**
   * 1. Auto Fetch Google Identity using Firebase Auth without manual input
   */
  const fetchGoogleIdentity = async (): Promise<{
    name: string;
    email: string;
    uid: string;
    photoURL?: string;
  }> => {
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      const fbUser = result.user;
      const name = fbUser.displayName || fbUser.email?.split('@')[0] || 'Google User';
      const email = fbUser.email || '';
      const uid = fbUser.uid;
      const photoURL = fbUser.photoURL || undefined;

      return {
        name,
        email,
        uid,
        photoURL,
      };
    } catch (popupError: any) {
      console.warn('Firebase popup notice:', popupError);
      if (auth.currentUser) {
        const u = auth.currentUser;
        return {
          name: u.displayName || u.email?.split('@')[0] || 'Google User',
          email: u.email || '',
          uid: u.uid,
          photoURL: u.photoURL || undefined,
        };
      }
      throw popupError;
    }
  };

  /**
   * 2. Confirm Google Access Request:
   * Creates Firestore request record { name, email, uid, timestamp, status: "Pending" }
   * or grants immediate access if Super Admin / Approved.
   */
  const confirmGoogleAccessRequest = async (params: {
    name: string;
    email: string;
    uid: string;
    photoURL?: string;
    existingDbRecord?: DatabaseRoleResult;
    skipFirestoreWrite?: boolean;
  }): Promise<{ requires2FA: boolean; status: UserApprovalStatus; user: AuthUser }> => {
    const cleanEmail = params.email.trim().toLowerCase();
    const isSuper = isSuperAdminEmail(cleanEmail);

    if (isSuper) {
      const isAditiSuper = cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase();
      const canonicalSuperId = isAditiSuper
        ? 'emp-modelatech2026_gmail_com'
        : params.uid || generateRequestDocId(cleanEmail);
      const canonicalSuperName = isAditiSuper
        ? SUPER_ADMIN_NAME
        : params.name || cleanEmail.split('@')[0];
      const adminUser: AuthUser = {
        id: canonicalSuperId,
        googleId: canonicalSuperId,
        email: cleanEmail,
        name: canonicalSuperName,
        role: 'Super Administrator & Lead Architect',
        appRole: 'SUPER_ADMIN',
        status: 'APPROVED',
        isAdmin: true,
        accessLevel: 'Super Admin',
        securityRole: 'Super Admin',
        permissions: DEFAULT_PERMISSIONS_BY_ROLE['Super Admin'],
        organization: 'BPMS Core Systems & Architecture',
        avatar: params.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
        requestTimestamp: new Date().toISOString(),
      };

      if (!params.skipFirestoreWrite) {
        setDoc(
          doc(db, 'access_requests', adminUser.id),
          {
            id: adminUser.id,
            uid: adminUser.id,
            name: adminUser.name,
            fullName: adminUser.name,
            email: adminUser.email,
            timestamp: new Date().toISOString(),
            status: 'Approved',
            role: 'SUPER_ADMIN',
            assignedRole: 'SUPER_ADMIN',
            requestedRole: 'Super Admin',
          },
          { merge: true }
        ).catch((err) => {
          console.warn('Firestore admin write notice:', err);
        });
      }

      saveUserToDb(adminUser);
      const sess = generateSessionToken(adminUser.email, true);
      setUser(adminUser);
      setSession(sess);
      setPending2FAUser(null);
      return { requires2FA: false, status: 'APPROVED', user: adminUser };
    }

    // Query authoritative database role from Firestore 'users' or 'access_requests' unless already fetched
    const dbRecord = params.existingDbRecord || (await fetchUserRoleFromDatabase(cleanEmail, params.uid));
    let firestoreStatus: UserApprovalStatus = dbRecord.status;
    let appRole: UserRole = dbRecord.role;
    let assignedRole: SecurityRole = dbRecord.securityRole;
    let accessLevel: AccessLevel = dbRecord.accessLevel;
    let displayRole: string = dbRecord.displayRole;
    const effectiveUid = dbRecord.id || params.uid || generateRequestDocId(cleanEmail);

    if (dbRecord.source === 'default') {
      if (!params.skipFirestoreWrite) {
        const isoTimestamp = new Date().toISOString();
        const newRecord = {
          fullName: params.name,
          email: cleanEmail,
          discipline: 'BIM - ACS',
          reasonForAccess: 'Sign-in Access Request for ProductionPulse BPMS',
          status: 'pending',
          createdAt: isoTimestamp,
          id: effectiveUid,
          uid: effectiveUid,
          name: params.name,
          role: 'Editor',
          assignedRole: 'EDITOR',
          requestedAt: isoTimestamp,
          timestamp: isoTimestamp,
          requestTimestamp: isoTimestamp,
          requestedRole: 'Editor',
          primaryDiscipline: 'BIM - ACS',
          organization: 'BIM - ACS',
          accessReason: 'Sign-in Access Request for ProductionPulse BPMS',
        };
        setDoc(doc(db, 'access_requests', effectiveUid), newRecord, { merge: true }).catch((e) => {
          console.warn('Firestore access_requests write notice:', e);
        });
      }
      firestoreStatus = 'PENDING';
      appRole = 'EDITOR';
      assignedRole = 'Editor';
      accessLevel = 'Editor';
      displayRole = 'BIM Modeler / Editor';
    } else if (!params.skipFirestoreWrite) {
      // User has existing database role: update login activity in background without blocking
      const isoNow = new Date().toISOString();
      setDoc(
        doc(db, 'access_requests', effectiveUid),
        {
          email: cleanEmail,
          name: params.name || dbRecord.name || cleanEmail.split('@')[0],
          fullName: params.name || dbRecord.name || cleanEmail.split('@')[0],
          lastLoginAt: isoNow,
          lastActive: isoNow,
          updatedAt: isoNow,
        },
        { merge: true }
      ).catch((e) => {
        console.warn('Login timestamp update notice:', e);
      });
    }

    const applicantUser: AuthUser = {
      id: effectiveUid,
      googleId: effectiveUid,
      email: cleanEmail,
      name: params.name || dbRecord.name || cleanEmail.split('@')[0],
      avatar: params.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(params.name)}`,
      role: displayRole,
      appRole,
      status: firestoreStatus,
      isAdmin: appRole === 'SUPER_ADMIN' || appRole === 'DIRECTOR' || appRole === 'PROJECT_MANAGER',
      accessLevel,
      securityRole: assignedRole,
      permissions: DEFAULT_PERMISSIONS_BY_ROLE[assignedRole] || DEFAULT_PERMISSIONS_BY_ROLE['Viewer'],
      organization: 'ProductionPulse Team',
      requestTimestamp: new Date().toISOString(),
    };

    saveUserToDb(applicantUser);
    setUser(applicantUser);

    if (firestoreStatus === 'APPROVED') {
      const sess = generateSessionToken(applicantUser.email, true);
      setSession(sess);
      setPending2FAUser(null);
      return { requires2FA: false, status: 'APPROVED', user: applicantUser };
    } else {
      const pendingSess = generateSessionToken(applicantUser.email, false);
      setSession(pendingSess);
      return { requires2FA: false, status: firestoreStatus, user: applicantUser };
    }
  };

  /**
   * Submit direct access request with Name & Email
   */
  const submitAccessRequest = async (params: {
    name: string;
    email: string;
    uid?: string;
    existingDbRecord?: DatabaseRoleResult;
    skipFirestoreWrite?: boolean;
  }): Promise<{ requires2FA: boolean; status: UserApprovalStatus; user: AuthUser }> => {
    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName = params.name.trim() || cleanEmail.split('@')[0];
    const generatedUid = params.uid || generateRequestDocId(cleanEmail);

    return confirmGoogleAccessRequest({
      name: cleanName,
      email: cleanEmail,
      uid: generatedUid,
      existingDbRecord: params.existingDbRecord,
      skipFirestoreWrite: params.skipFirestoreWrite,
    });
  };

  /**
   * Log In With Email & Password
   */
  const loginWithEmail = async (
    email: string,
    _password?: string,
    extra?: { name?: string; role?: SecurityRole; organization?: string; accessReason?: string }
  ): Promise<{ requires2FA: boolean; status: UserApprovalStatus; user: AuthUser }> => {
    const cleanEmail = email.trim().toLowerCase();
    const isAditiSuper = cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase();
    const isSushoovan =
      !isAditiSuper &&
      (cleanEmail === 'sushoovandas@gmail.com' ||
        (extra?.name || '').toLowerCase().includes('sushoovan'));
    const isSuper = isAditiSuper || isSushoovan;

    // Authoritative lookup from Firestore users and access_requests
    const dbRecord = await fetchUserRoleFromDatabase(cleanEmail);

    let targetUser = usersDb[cleanEmail];

    // Determine preserved role: database record takes precedence, then existing cached role
    let assignedAppRole: UserRole = isSuper
      ? 'SUPER_ADMIN'
      : dbRecord.source !== 'default'
      ? dbRecord.role
      : targetUser?.appRole || 'EDITOR';

    let assignedStatus: UserApprovalStatus = isSuper
      ? 'APPROVED'
      : dbRecord.source !== 'default'
      ? dbRecord.status
      : targetUser?.status || 'APPROVED';

    let assignedAccessLevel: AccessLevel = isSuper
      ? 'Super Admin'
      : dbRecord.source !== 'default'
      ? dbRecord.accessLevel
      : targetUser?.accessLevel || mapAppRoleToAccessLevel(assignedAppRole);

    let assignedDisplayRole: string = isSuper
      ? 'Super Administrator & Lead Architect'
      : dbRecord.source !== 'default'
      ? dbRecord.displayRole
      : targetUser?.role || mapAppRoleToDisplayRole(assignedAppRole);

    let assignedSecurityRole: SecurityRole = isSuper
      ? 'Super Admin'
      : dbRecord.securityRole || mapUserRoleToSecurityRole(assignedAppRole);

    const canonicalId = isAditiSuper
      ? 'emp-modelatech2026_gmail_com'
      : isSushoovan
      ? 'emp-sushoovan_das'
      : targetUser?.id && targetUser.id !== 'usr_super_admin_sushoovan'
      ? targetUser.id
      : `emp-${generateRequestDocId(cleanEmail)}`;

    targetUser = {
      ...(targetUser || {}),
      id: canonicalId,
      email: isSushoovan ? 'sushoovandas@gmail.com' : cleanEmail,
      name: isAditiSuper
        ? SUPER_ADMIN_NAME
        : isSushoovan
        ? 'Sushoovan Das'
        : extra?.name || targetUser?.name || cleanEmail.split('@')[0],
      role: assignedDisplayRole,
      appRole: assignedAppRole,
      status: assignedStatus,
      isAdmin: assignedAppRole === 'SUPER_ADMIN' || assignedAppRole === 'PROJECT_MANAGER',
      accessLevel: assignedAccessLevel,
      securityRole: assignedSecurityRole,
      permissions: DEFAULT_PERMISSIONS_BY_ROLE[assignedSecurityRole] || DEFAULT_PERMISSIONS_BY_ROLE['Editor'],
      organization: extra?.organization || targetUser?.organization || (isSuper ? 'BPMS Core Systems' : 'AEC Modeling Division'),
      accessReason: extra?.accessReason || targetUser?.accessReason || 'BIM project coordination & hours logging',
      requestTimestamp: targetUser?.requestTimestamp || new Date().toISOString(),
      avatar: targetUser?.avatar || (isSuper
        ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250'
        : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanEmail)}`),
      twoFactor: targetUser?.twoFactor || (isSuper ? INITIAL_SUPER_ADMIN.twoFactor : { isEnabled: false, backupCodes: [], usedBackupCodes: [] }),
    };

    saveUserToDb(targetUser);

    // Update last login timestamp in Firestore without modifying role or status
    try {
      const docId = dbRecord.id || targetUser?.googleId || targetUser?.id;
      if (docId) {
        setDoc(
          doc(db, 'access_requests', docId),
          {
            lastLoginAt: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ).catch(() => {});
      }
    } catch {
      // ignore
    }

    // Check if 2FA is enabled
    if (targetUser.twoFactor?.isEnabled) {
      setPending2FAUser(targetUser);
      return {
        requires2FA: true,
        status: targetUser.status,
        user: targetUser,
      };
    }

    // 2FA Not Enabled: Create active session directly
    const newSession = generateSessionToken(targetUser.email, false);
    setUser(targetUser);
    setSession(newSession);
    setPending2FAUser(null);

    return {
      requires2FA: false,
      status: targetUser.status,
      user: targetUser,
    };
  };

  /**
   * Log In With Google Profile
   */
  const loginWithGoogle = async (profile: {
    googleId?: string;
    email: string;
    name?: string;
    picture?: string;
    organization?: string;
    discipline?: string;
    accessReason?: string;
  }): Promise<{ requires2FA: boolean; status: UserApprovalStatus; user: AuthUser }> => {
    const cleanEmail = profile.email.trim().toLowerCase();
    const isAditiSuper = cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase();
    const isSushoovan =
      !isAditiSuper &&
      (cleanEmail === 'sushoovandas@gmail.com' ||
        (profile.name || '').toLowerCase().includes('sushoovan'));
    const isSuper = isAditiSuper || isSushoovan;

    // Authoritative lookup from Firestore users and access_requests
    const dbRecord = await fetchUserRoleFromDatabase(cleanEmail, profile.googleId);

    let targetUser = usersDb[cleanEmail];

    let assignedAppRole: UserRole = isSuper
      ? 'SUPER_ADMIN'
      : dbRecord.source !== 'default'
      ? dbRecord.role
      : targetUser?.appRole || 'EDITOR';

    let assignedStatus: UserApprovalStatus = isSuper
      ? 'APPROVED'
      : dbRecord.source !== 'default'
      ? dbRecord.status
      : targetUser?.status || 'APPROVED';

    let assignedAccessLevel: AccessLevel = isSuper
      ? 'Super Admin'
      : dbRecord.source !== 'default'
      ? dbRecord.accessLevel
      : targetUser?.accessLevel || mapAppRoleToAccessLevel(assignedAppRole);

    let assignedDisplayRole: string = isSuper
      ? 'Super Administrator & Lead Architect'
      : dbRecord.source !== 'default'
      ? dbRecord.displayRole
      : targetUser?.role || mapAppRoleToDisplayRole(assignedAppRole);

    let assignedSecurityRole: SecurityRole = isSuper
      ? 'Super Admin'
      : dbRecord.securityRole || mapUserRoleToSecurityRole(assignedAppRole);

    const canonicalId = isAditiSuper
      ? 'emp-modelatech2026_gmail_com'
      : isSushoovan
      ? 'emp-sushoovan_das'
      : targetUser?.id && targetUser.id !== 'usr_super_admin_sushoovan'
      ? targetUser.id
      : `emp-${generateRequestDocId(cleanEmail)}`;

    targetUser = {
      ...(targetUser || {}),
      id: canonicalId,
      googleId: profile.googleId || targetUser?.googleId || canonicalId,
      email: isSushoovan ? 'sushoovandas@gmail.com' : cleanEmail,
      name: isAditiSuper
        ? SUPER_ADMIN_NAME
        : isSushoovan
        ? 'Sushoovan Das'
        : profile.name || targetUser?.name || cleanEmail.split('@')[0],
      role: assignedDisplayRole,
      appRole: assignedAppRole,
      status: assignedStatus,
      isAdmin: assignedAppRole === 'SUPER_ADMIN' || assignedAppRole === 'PROJECT_MANAGER',
      accessLevel: assignedAccessLevel,
      securityRole: assignedSecurityRole,
      permissions: DEFAULT_PERMISSIONS_BY_ROLE[assignedSecurityRole] || DEFAULT_PERMISSIONS_BY_ROLE['Editor'],
      organization: profile.organization || targetUser?.organization || 'BPMS Cloud Workspace',
      accessReason: profile.accessReason || targetUser?.accessReason || 'BIM management and coordination',
      requestTimestamp: targetUser?.requestTimestamp || new Date().toISOString(),
      avatar: profile.picture || targetUser?.avatar || (isSuper
        ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250'
        : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanEmail)}`),
      twoFactor: targetUser?.twoFactor || (isSuper ? INITIAL_SUPER_ADMIN.twoFactor : { isEnabled: false, backupCodes: [], usedBackupCodes: [] }),
    };

    saveUserToDb(targetUser);

    // Update last login timestamp in Firestore without modifying role or status
    try {
      const docId = profile.googleId || dbRecord.id || targetUser?.googleId;
      if (docId) {
        setDoc(
          doc(db, 'access_requests', docId),
          {
            lastLoginAt: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ).catch(() => {});
      }
    } catch {
      // ignore
    }

    if (targetUser.twoFactor?.isEnabled) {
      setPending2FAUser(targetUser);
      return {
        requires2FA: true,
        status: targetUser.status,
        user: targetUser,
      };
    }

    const newSession = generateSessionToken(targetUser.email, false);
    setUser(targetUser);
    setSession(newSession);
    setPending2FAUser(null);

    return {
      requires2FA: false,
      status: targetUser.status,
      user: targetUser,
    };
  };

  /**
   * Verify 2FA Challenge (TOTP code or Emergency Backup Code)
   */
  const verify2FAChallenge = async (
    codeOrBackup: string,
    _rememberBrowser: boolean = true
  ): Promise<{ success: boolean; error?: string; method?: 'totp' | 'backup'; remainingCodes?: number }> => {
    if (!pending2FAUser) {
      return { success: false, error: 'No active authentication session awaiting 2FA verification.' };
    }

    const cleanInput = codeOrBackup.trim();
    const twoFactor = pending2FAUser.twoFactor;

    if (!twoFactor || !twoFactor.isEnabled) {
      // Fallback: If 2FA somehow not configured, promote session
      const sess = generateSessionToken(pending2FAUser.email, true);
      setUser(pending2FAUser);
      setSession(sess);
      setPending2FAUser(null);
      return { success: true, method: 'totp' };
    }

    // 1. Check if input is a 6-digit TOTP code
    const isDigitsOnly = /^\d{6}$/.test(cleanInput.replace(/\s+/g, ''));
    if (isDigitsOnly && twoFactor.secret) {
      const isValidTotp = await verifyTotpToken(cleanInput, twoFactor.secret);
      if (isValidTotp) {
        const sess = generateSessionToken(pending2FAUser.email, true);
        setUser(pending2FAUser);
        setSession(sess);
        setPending2FAUser(null);
        return { success: true, method: 'totp' };
      }
    }

    // 2. Check if input is an emergency backup recovery code
    const availableCodes = twoFactor.backupCodes || [];
    const usedCodes = twoFactor.usedBackupCodes || [];
    const backupValidation = validateAndConsumeBackupCode(cleanInput, availableCodes, usedCodes);

    if (backupValidation.isValid) {
      // Single-use code consumed! Update user record
      const updatedUser: AuthUser = {
        ...pending2FAUser,
        twoFactor: {
          ...twoFactor,
          backupCodes: backupValidation.remainingCodes,
          usedBackupCodes: backupValidation.updatedUsedCodes,
        },
      };

      saveUserToDb(updatedUser);
      const sess = generateSessionToken(updatedUser.email, true);
      setUser(updatedUser);
      setSession(sess);
      setPending2FAUser(null);

      return {
        success: true,
        method: 'backup',
        remainingCodes: backupValidation.remainingCodes.length,
      };
    }

    return {
      success: false,
      error: 'Invalid 6-digit code or emergency recovery code. Please check your authenticator device.',
    };
  };

  /**
   * Cancel 2FA Challenge & return to login
   */
  const cancel2FAChallenge = () => {
    setPending2FAUser(null);
  };

  /**
   * Initiate 2FA Setup Draft (Secret, QR code, Backup Codes)
   */
  const initiateTwoFactorSetup = async (): Promise<TwoFactorSetupDraft> => {
    const targetEmail = user?.email || SUPER_ADMIN_EMAIL;
    const secret = generateTotpSecret();
    const uri = buildOtpAuthUri({
      accountName: targetEmail,
      issuer: 'BIM Matrix Pro',
      secret,
    });
    const qrCodeDataUrl = await generateQrCodeDataUrl(uri);
    const backupCodes = generateBackupCodes(8);

    return {
      secret,
      uri,
      qrCodeDataUrl,
      backupCodes,
    };
  };

  /**
   * Confirm & Enable 2FA after user tests verification code
   */
  const confirmTwoFactorSetup = async (
    secret: string,
    verificationCode: string,
    backupCodes: string[]
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      return { success: false, error: 'User must be authenticated to enable 2FA.' };
    }

    const isValid = await verifyTotpToken(verificationCode, secret);
    if (!isValid) {
      return {
        success: false,
        error: 'Invalid verification code. Please make sure your authenticator app time is synchronized.',
      };
    }

    const twoFactorConfig: TwoFactorConfig = {
      isEnabled: true,
      secret,
      enrolledAt: new Date().toISOString(),
      backupCodes,
      usedBackupCodes: [],
    };

    const updatedUser: AuthUser = {
      ...user,
      twoFactor: twoFactorConfig,
      twoFactorEnabled: true,
    };

    saveUserToDb(updatedUser);
    setUser(updatedUser);

    // Persist to Firestore
    try {
      const userDocId = user.googleId || user.id;
      if (userDocId) {
        setDoc(
          doc(db, 'users', userDocId),
          {
            email: user.email,
            twoFactorEnabled: true,
            twoFactor: twoFactorConfig,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ).catch((err) => console.warn('Firestore 2FA update notice:', err));
      }
    } catch (e) {
      // ignore
    }

    // Update active session to mark as 2FA verified
    if (session) {
      setSession({
        ...session,
        is2FAVerified: true,
      });
    }

    return { success: true };
  };

  /**
   * Disable 2FA
   */
  const disableTwoFactor = async (_codeOrPassword?: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not authenticated' };

    const updatedUser: AuthUser = {
      ...user,
      twoFactor: {
        isEnabled: false,
        secret: undefined,
        enrolledAt: undefined,
        backupCodes: [],
        usedBackupCodes: [],
      },
      twoFactorEnabled: false,
    };

    saveUserToDb(updatedUser);
    setUser(updatedUser);

    // Persist to Firestore
    try {
      const userDocId = user.googleId || user.id;
      if (userDocId) {
        setDoc(
          doc(db, 'users', userDocId),
          {
            email: user.email,
            twoFactorEnabled: false,
            'twoFactor.isEnabled': false,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ).catch((err) => console.warn('Firestore 2FA disable notice:', err));
      }
    } catch (e) {
      // ignore
    }

    if (session) {
      setSession({
        ...session,
        is2FAVerified: false,
      });
    }

    return { success: true };
  };

  /**
   * Regenerate 8 new emergency backup recovery codes
   */
  const regenerateBackupCodes = async (
    currentTotpCode: string
  ): Promise<{ success: boolean; codes?: string[]; error?: string }> => {
    if (!user || !user.twoFactor?.secret) {
      return { success: false, error: '2FA is not active on this account.' };
    }

    const isValid = await verifyTotpToken(currentTotpCode, user.twoFactor.secret);
    if (!isValid) {
      return { success: false, error: 'Invalid verification code.' };
    }

    const newCodes = generateBackupCodes(8);
    const updatedUser: AuthUser = {
      ...user,
      twoFactor: {
        ...user.twoFactor,
        backupCodes: newCodes,
        usedBackupCodes: [],
      },
    };

    saveUserToDb(updatedUser);
    setUser(updatedUser);

    return { success: true, codes: newCodes };
  };

  /**
   * Log out and destroy session
   */
  const logout = () => {
    setUser(null);
    setSession(null);
    setPending2FAUser(null);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    localStorage.removeItem('bim_tracker_current_user_v5');
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('bpms_redirect_target');
      sessionStorage.removeItem('bpms_active_security_role_override');
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new Event('popstate'));
    }
  };

  /**
   * Switch Active Security Role
   */
  const switchSecurityRole = (newRole: SecurityRole) => {
    if (!user) return;
    const isViewerLocked =
      securityRole === 'Viewer' ||
      String(securityRole).toLowerCase().startsWith('viewer') ||
      user.securityRole === 'Viewer' ||
      user.role === 'Viewer' ||
      user.role === 'VIEWER' ||
      user.appRole === 'VIEWER';
    if (isViewerLocked && newRole !== 'Viewer') {
      return;
    }
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('bpms_active_security_role_override', newRole);
    }
    const newPerms = DEFAULT_PERMISSIONS_BY_ROLE[newRole] || DEFAULT_PERMISSIONS_BY_ROLE['Viewer'];
    const mappedAppRole: UserRole =
      newRole === 'Super Admin'
        ? 'SUPER_ADMIN'
        : newRole === 'Director'
        ? 'DIRECTOR'
        : newRole === 'Project Manager'
        ? 'PROJECT_MANAGER'
        : newRole === 'Viewer'
        ? 'VIEWER'
        : 'EDITOR';
    const mappedAccessLevel: AccessLevel =
      newRole === 'Super Admin'
        ? 'Super Admin'
        : newRole === 'Director'
        ? 'Director'
        : newRole === 'Project Manager'
        ? 'Project Manager'
        : newRole === 'Viewer'
        ? 'Viewer'
        : 'Editor';
    const updatedUser: AuthUser = {
      ...user,
      securityRole: newRole,
      role: newRole,
      appRole: mappedAppRole,
      permissions: newPerms,
      accessLevel: mappedAccessLevel,
      isAdmin: mappedAppRole === 'SUPER_ADMIN' || mappedAppRole === 'DIRECTOR' || mappedAppRole === 'PROJECT_MANAGER',
    };
    saveUserToDb(updatedUser);
    setUser(updatedUser);
  };

  /**
   * Update Profile Details - Never overwrites stored role with default
   */
  const updateCurrentUser = (updates: Partial<AuthUser>) => {
    const base = user || (updates as AuthUser);
    if (!base || !base.email) return;

    // Preserve existing role unless an explicit valid role is provided
    const cleanAppRole = updates.appRole || base.appRole || 'EDITOR';
    const cleanRole = updates.role || base.role || mapAppRoleToDisplayRole(cleanAppRole);
    const cleanAccessLevel = updates.accessLevel || base.accessLevel || mapAppRoleToAccessLevel(cleanAppRole);
    const cleanSecurityRole = updates.securityRole || mapUserRoleToSecurityRole(cleanAppRole);

    const updated: AuthUser = {
      ...base,
      ...updates,
      appRole: cleanAppRole,
      role: cleanRole,
      accessLevel: cleanAccessLevel,
      securityRole: cleanSecurityRole,
      permissions: updates.permissions || DEFAULT_PERMISSIONS_BY_ROLE[cleanSecurityRole] || base.permissions,
      isAdmin: cleanAppRole === 'SUPER_ADMIN' || cleanAppRole === 'DIRECTOR' || cleanAppRole === 'PROJECT_MANAGER',
    };
    saveUserToDb(updated);
    setUser(updated);

    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      setSession(generateSessionToken(updated.email, true));
    }

    if (updates.appRole || updates.status || updates.accessLevel) {
      persistUserRoleToDatabase({
        email: updated.email,
        role: updated.appRole,
        status: updated.status,
        accessLevel: updated.accessLevel,
        name: updated.name,
        uid: updated.googleId || updated.id,
      }).catch((e) => console.warn('Role update persistence notice:', e));
    }
  };

  /**
   * Quick simulate login for rapid testing of roles & 2FA
   */
  const simulateQuickLogin = (role: 'Super Admin' | 'Project Manager' | 'BIM Specialist' | 'Viewer', enable2FAForDemo: boolean = false) => {
    const roleMap: Record<string, { email: string; name: string; appRole: UserRole }> = {
      'Super Admin': { email: SUPER_ADMIN_EMAIL, name: SUPER_ADMIN_NAME, appRole: 'SUPER_ADMIN' },
      'Project Manager': { email: 'sarah.jenkins.bim@gmail.com', name: 'Sarah Jenkins', appRole: 'PROJECT_MANAGER' },
      'BIM Specialist': { email: 'david.kim.mep@gmail.com', name: 'David Kim', appRole: 'EDITOR' },
      'Viewer': { email: 'guest.reviewer@clientcorp.com', name: 'Alex Vance', appRole: 'VIEWER' },
    };

    const target = roleMap[role];
    const demoUser: AuthUser = {
      id: `usr_${role.toLowerCase().replace(/\s+/g, '_')}`,
      email: target.email,
      name: target.name,
      role,
      appRole: target.appRole,
      status: 'APPROVED',
      isAdmin: role === 'Super Admin',
      accessLevel: role === 'Super Admin' ? 'Super Admin' : role === 'Project Manager' ? 'Project Manager' : 'Editor',
      securityRole: role,
      permissions: DEFAULT_PERMISSIONS_BY_ROLE[role],
      organization: 'BIM Matrix Enterprise',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(target.name)}`,
      twoFactor: enable2FAForDemo ? {
        isEnabled: true,
        secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
        enrolledAt: new Date().toISOString(),
        backupCodes: ['8421-9932', '3194-5820', '7029-4188', '5219-6301', '9812-4011', '6620-1943'],
        usedBackupCodes: [],
      } : { isEnabled: false, backupCodes: [], usedBackupCodes: [] },
      twoFactorEnabled: enable2FAForDemo,
    };

    saveUserToDb(demoUser);
    const sess = generateSessionToken(demoUser.email, true);
    setUser(demoUser);
    setSession(sess);
    setPending2FAUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        securityRole,
        permissions,
        isAuthenticated,
        is2FAPending,
        pending2FAUser,
        twoFactorState,
        fetchGoogleIdentity,
        confirmGoogleAccessRequest,
        submitAccessRequest,
        loginWithEmail,
        loginWithGoogle,
        verify2FAChallenge,
        cancel2FAChallenge,
        initiateTwoFactorSetup,
        confirmTwoFactorSetup,
        disableTwoFactor,
        regenerateBackupCodes,
        logout,
        switchSecurityRole,
        updateCurrentUser,
        simulateQuickLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useOptionalAuth = () => {
  return useContext(AuthContext);
};
