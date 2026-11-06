/**
 * BPMS Role Synchronization & Database Persistence Engine
 * 
 * Ensures roles assigned through Admin Nexus persist across logins, sessions, and page reloads.
 * Fetches and preserves user roles from Firestore collections ('users' and 'access_requests').
 * Enforces strict non-overwriting guarantees for SUPER_ADMIN, PROJECT_MANAGER, EDITOR, and VIEWER.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { UserRole, UserApprovalStatus, AccessLevel, SecurityRole, AuthUser } from '../types';
import {
  isSuperAdminEmail,
  normalizeUserRole,
  mapAppRoleToAccessLevel,
  mapAppRoleToDisplayRole,
  mapUserRoleToSecurityRole,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_NAME,
} from './googleAuth';

export interface DatabaseRoleResult {
  role: UserRole;
  status: UserApprovalStatus;
  accessLevel: AccessLevel;
  displayRole: string;
  securityRole: SecurityRole;
  name?: string;
  discipline?: string;
  source: 'super_admin' | 'database_users' | 'database_access_requests' | 'local_db' | 'default';
  isApproved: boolean;
  id?: string;
}

const STORAGE_KEYS = {
  CURRENT_USER: 'bim_auth_user_central_v1',
  SAVED_USERS_DB: 'bim_auth_users_db_v1',
  REGISTERED_USERS_DB: 'bim_auth_registered_users_v1',
  TRACKER_CURRENT_USER: 'bim_tracker_current_user_v7',
};

/**
 * Deterministic document ID generator for access requests based on email
 */
export function generateRequestDocId(email: string): string {
  const clean = (email || '').trim().toLowerCase();
  const safeStr = clean.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
  const hash = Math.abs(
    clean.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
  );
  return `req_${safeStr}_${hash}`;
}

function normalizeApprovalStatus(rawStatus: any): UserApprovalStatus {
  const s = String(rawStatus || 'Pending').trim().toLowerCase();
  if (s === 'approved' || s === 'active') return 'APPROVED';
  if (s === 'rejected' || s === 'declined' || s === 'suspended') return 'REJECTED';
  return 'PENDING';
}

function withTimeout<T>(promise: Promise<T>, ms = 600, fallback?: T): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T | undefined>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Fetch the user's assigned role and approval status from Firestore ('access_requests' and 'users').
 * Prioritizes approved records across both collections and never marks unknown users as approved.
 * Uses strict timeouts and local cache checks so callers never hang on slow network or quota limits.
 */
export async function fetchUserRoleFromDatabase(
  rawEmail: string,
  uid?: string
): Promise<DatabaseRoleResult> {
  const cleanEmail = (rawEmail || '').trim().toLowerCase();

  // 1. Super Admin check: always full SUPER_ADMIN access
  if (isSuperAdminEmail(cleanEmail)) {
    return {
      role: 'SUPER_ADMIN',
      status: 'APPROVED',
      accessLevel: 'Super Admin',
      displayRole: 'Super Administrator & Lead Architect',
      securityRole: 'Super Admin',
      source: 'super_admin',
      isApproved: true,
      id: uid || generateRequestDocId(cleanEmail),
    };
  }

  const candidates: Array<DatabaseRoleResult & { updatedAtMs: number }> = [];
  const deterministicId = generateRequestDocId(cleanEmail);
  const validUid = uid && !uid.startsWith('emp-') ? uid : undefined;
  const docIdsToTry = Array.from(new Set([deterministicId, validUid].filter(Boolean) as string[]));

  const parseTimestampMs = (data: any): number => {
    const raw = data?.updatedAt || data?.reviewedAt || data?.timestamp || data?.requestedAt || data?.createdAt;
    if (!raw) return 0;
    if (typeof raw?.toDate === 'function') {
      try {
        return raw.toDate().getTime();
      } catch {
        return 0;
      }
    }
    if (typeof raw?.seconds === 'number') {
      return raw.seconds * 1000;
    }
    const ms = new Date(raw).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  };

  // 2. Check local onboarding & saved user caches synchronously first (0ms latency)
  try {
    for (const reqKey of ['bim_pending_access_requests_v1', 'bim_tracker_onboarding_v7']) {
      const rawReqs = localStorage.getItem(reqKey);
      if (!rawReqs) continue;
      const parsed = JSON.parse(rawReqs);
      if (!Array.isArray(parsed)) continue;
      parsed.forEach((r: any) => {
        if ((r?.email || '').trim().toLowerCase() !== cleanEmail) return;
        if (r?.isDeleted || String(r?.status || '').toLowerCase() === 'deleted') return;
        const rawRole = r?.assignedRole || r?.role || r?.requestedRole;
        const role = normalizeUserRole(rawRole);
        const status = normalizeApprovalStatus(r?.status);
        candidates.push({
          role,
          status,
          accessLevel: (r?.assignedAccessLevel as AccessLevel) || mapAppRoleToAccessLevel(role),
          displayRole: mapAppRoleToDisplayRole(role),
          securityRole: mapUserRoleToSecurityRole(role),
          name: r?.fullName || r?.name,
          discipline: r?.discipline || r?.primaryDiscipline,
          source: 'local_db',
          isApproved: status === 'APPROVED',
          id: r?.id || deterministicId,
          updatedAtMs: parseTimestampMs(r),
        });
      });
    }
  } catch {}

  // 3. Direct deterministic document lookups across 'access_requests' and 'users' in parallel with strict 500ms timeout
  try {
    const directReads = await withTimeout(
      Promise.all(
        docIdsToTry.flatMap((dId) => [
          getDoc(doc(db, 'access_requests', dId)).then((snap) => ({ kind: 'req' as const, snap })),
          getDoc(doc(db, 'users', dId)).then((snap) => ({ kind: 'usr' as const, snap })),
        ])
      ),
      500,
      []
    );

    if (directReads && directReads.length > 0) {
      for (const item of directReads) {
        if (!item?.snap?.exists()) continue;
        const data = item.snap.data();
        if ((data?.email || '').trim().toLowerCase() !== cleanEmail) continue;

        if (item.kind === 'req') {
          const rawRole = data?.assignedRole || data?.role || data?.requestedRole;
          const role = normalizeUserRole(rawRole);
          const status = normalizeApprovalStatus(data?.status);
          candidates.push({
            role,
            status,
            accessLevel: (data?.assignedAccessLevel as AccessLevel) || mapAppRoleToAccessLevel(role),
            displayRole: mapAppRoleToDisplayRole(role),
            securityRole: mapUserRoleToSecurityRole(role),
            name: data?.fullName || data?.name,
            discipline: data?.discipline || data?.primaryDiscipline,
            source: 'database_access_requests',
            isApproved: status === 'APPROVED',
            id: item.snap.id,
            updatedAtMs: parseTimestampMs(data),
          });
        } else {
          const rawRole = data?.role || data?.appRole || data?.assignedRole;
          if (rawRole) {
            const role = normalizeUserRole(rawRole);
            const status = normalizeApprovalStatus(data?.status || 'APPROVED');
            candidates.push({
              role,
              status,
              accessLevel: (data?.accessLevel as AccessLevel) || mapAppRoleToAccessLevel(role),
              displayRole: mapAppRoleToDisplayRole(role),
              securityRole: mapUserRoleToSecurityRole(role),
              name: data?.name || data?.fullName,
              discipline: data?.discipline || data?.primaryDiscipline,
              source: 'database_users',
              isApproved: status === 'APPROVED',
              id: item.snap.id,
              updatedAtMs: parseTimestampMs(data),
            });
          }
        }
      }
    }

    // 4. Only query by email if no approved or pending candidate was found yet
    if (candidates.length === 0) {
      const querySnaps = await withTimeout(
        Promise.all([
          getDocs(query(collection(db, 'access_requests'), where('email', '==', cleanEmail))),
          getDocs(query(collection(db, 'users'), where('email', '==', cleanEmail))),
        ]),
        500
      );

      if (querySnaps) {
        const [reqQuerySnap, userQuerySnap] = querySnaps;
        reqQuerySnap.docs.forEach((docSnap) => {
          const rData = docSnap.data();
          const rawRole = rData?.assignedRole || rData?.role || rData?.requestedRole;
          const role = normalizeUserRole(rawRole);
          const status = normalizeApprovalStatus(rData?.status);
          candidates.push({
            role,
            status,
            accessLevel: (rData?.assignedAccessLevel as AccessLevel) || mapAppRoleToAccessLevel(role),
            displayRole: mapAppRoleToDisplayRole(role),
            securityRole: mapUserRoleToSecurityRole(role),
            name: rData?.fullName || rData?.name,
            discipline: rData?.discipline || rData?.primaryDiscipline,
            source: 'database_access_requests',
            isApproved: status === 'APPROVED',
            id: docSnap.id,
            updatedAtMs: parseTimestampMs(rData),
          });
        });

        userQuerySnap.docs.forEach((docSnap) => {
          const uData = docSnap.data();
          const rawRole = uData?.role || uData?.appRole || uData?.assignedRole;
          if (rawRole) {
            const role = normalizeUserRole(rawRole);
            const status = normalizeApprovalStatus(uData?.status || 'APPROVED');
            candidates.push({
              role,
              status,
              accessLevel: (uData?.accessLevel as AccessLevel) || mapAppRoleToAccessLevel(role),
              displayRole: mapAppRoleToDisplayRole(role),
              securityRole: mapUserRoleToSecurityRole(role),
              name: uData?.name || uData?.fullName,
              discipline: uData?.discipline || uData?.primaryDiscipline,
              source: 'database_users',
              isApproved: status === 'APPROVED',
              id: docSnap.id,
              updatedAtMs: parseTimestampMs(uData),
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn('Firestore role lookup notice:', err);
  }

  if (candidates.length > 0) {
    // Prioritize APPROVED records first, otherwise sort by newest timestamp so fresh pending requests override stale rejections
    candidates.sort((a, b) => {
      if (a.isApproved !== b.isApproved) {
        return a.isApproved ? -1 : 1;
      }
      return b.updatedAtMs - a.updatedAtMs;
    });
    const best = candidates[0];
    return {
      role: best.role,
      status: best.status,
      accessLevel: best.accessLevel,
      displayRole: best.displayRole,
      securityRole: best.securityRole,
      name: best.name,
      discipline: best.discipline,
      source: best.source,
      isApproved: best.isApproved,
      id: best.id,
    };
  }

  // 5. Default fallback for completely unknown user (not yet in Firestore)
  return {
    role: 'EDITOR',
    status: 'PENDING',
    accessLevel: 'Editor',
    displayRole: 'BIM Modeler / Editor',
    securityRole: 'BIM Specialist',
    source: 'default',
    isApproved: false,
    id: deterministicId,
  };
}

/**
 * Persists the user's assigned role and approval status to local session caches immediately
 * (0ms UI latency) and syncs to Firestore collections ('access_requests' and 'users') with strict timeout.
 */
export async function persistUserRoleToDatabase(params: {
  email: string;
  role: UserRole;
  status?: UserApprovalStatus;
  accessLevel?: AccessLevel;
  name?: string;
  discipline?: string;
  uid?: string;
  reviewedBy?: string;
  notes?: string;
}): Promise<void> {
  const cleanEmail = params.email.trim().toLowerCase();
  if (!cleanEmail) return;

  const validatedRole: UserRole = normalizeUserRole(params.role, isSuperAdminEmail(cleanEmail));
  const calculatedAccessLevel: AccessLevel =
    params.accessLevel || mapAppRoleToAccessLevel(validatedRole);
  const normalizedStatus: UserApprovalStatus = normalizeApprovalStatus(params.status || 'APPROVED');
  const firestoreRequestStatus =
    normalizedStatus === 'APPROVED'
      ? 'APPROVED'
      : normalizedStatus === 'REJECTED'
      ? 'REJECTED'
      : 'pending';
  const displayRole = mapAppRoleToDisplayRole(validatedRole);
  const nowIso = new Date().toISOString();
  const deterministicId = generateRequestDocId(cleanEmail);
  const cleanUid = params.uid && !params.uid.startsWith('emp-') ? params.uid : deterministicId;
  const targetId = cleanUid || deterministicId;

  // 1. Update saved users database in localStorage synchronously FIRST for zero latency
  try {
    for (const dbKey of [STORAGE_KEYS.SAVED_USERS_DB, STORAGE_KEYS.REGISTERED_USERS_DB]) {
      const saved = localStorage.getItem(dbKey);
      let usersDb: Record<string, AuthUser> = {};
      if (saved) {
        usersDb = JSON.parse(saved);
      }
      const existing = usersDb[cleanEmail];
      usersDb[cleanEmail] = {
        ...(existing || {}),
        id: existing?.id || targetId,
        googleId: existing?.googleId || targetId,
        email: cleanEmail,
        name: params.name || existing?.name || cleanEmail.split('@')[0],
        role: validatedRole,
        appRole: validatedRole,
        accessLevel: calculatedAccessLevel,
        securityRole: mapUserRoleToSecurityRole(validatedRole),
        status: normalizedStatus,
        isAdmin: validatedRole === 'SUPER_ADMIN' || validatedRole === 'DIRECTOR' || validatedRole === 'PROJECT_MANAGER',
        requestTimestamp: existing?.requestTimestamp || nowIso,
      };
      localStorage.setItem(dbKey, JSON.stringify(usersDb));
    }
  } catch (e) {
    console.warn('LocalStorage usersDb persistence notice:', e);
  }

  // 2. Synchronize cached employees list in localStorage and notify active listeners immediately
  try {
    const empRaw = localStorage.getItem('bim_tracker_employees_v7');
    if (empRaw) {
      const empList = JSON.parse(empRaw);
      if (Array.isArray(empList)) {
        const cleanNameLower = (params.name || '').trim().toLowerCase();
        const updatedEmpList = empList.map((emp: any) => {
          const eEmail = (emp?.email || '').trim().toLowerCase();
          const eName = (emp?.name || '').trim().toLowerCase();
          const eIdStripped = String(emp?.id || '').replace(/^emp-/, '');
          if (
            eEmail === cleanEmail ||
            eIdStripped === deterministicId ||
            eIdStripped === targetId.replace(/^emp-/, '') ||
            (cleanNameLower && eName === cleanNameLower)
          ) {
            return {
              ...emp,
              role: validatedRole,
              ...(params.discipline
                ? { discipline: params.discipline, primaryDiscipline: params.discipline }
                : {}),
            };
          }
          return emp;
        });
        localStorage.setItem('bim_tracker_employees_v7', JSON.stringify(updatedEmpList));
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('bim_user_role_synced', {
          detail: {
            email: cleanEmail,
            uid: targetId,
            deterministicId,
            name: params.name,
            role: validatedRole,
            displayRole,
            status: normalizedStatus,
            accessLevel: calculatedAccessLevel,
            discipline: params.discipline,
          },
        })
      );
    }
  } catch (e) {
    console.warn('Employees localStorage role sync notice:', e);
  }

  // 3. If current logged in user is this user, update current user cache in localStorage immediately
  try {
    const curRaw = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (curRaw) {
      const cur = JSON.parse(curRaw);
      if (cur?.email?.toLowerCase() === cleanEmail) {
        const updatedCur: AuthUser = {
          ...cur,
          role: validatedRole,
          appRole: validatedRole,
          accessLevel: calculatedAccessLevel,
          securityRole: mapUserRoleToSecurityRole(validatedRole),
          status: normalizedStatus,
          isAdmin: validatedRole === 'SUPER_ADMIN' || validatedRole === 'DIRECTOR' || validatedRole === 'PROJECT_MANAGER',
        };
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(updatedCur));
        localStorage.setItem(STORAGE_KEYS.TRACKER_CURRENT_USER, JSON.stringify(updatedCur));
      }
    }
  } catch (e) {
    console.warn('Current user storage update notice:', e);
  }

  // 4. Persist to Firestore 'access_requests', 'accessRequests', and 'users' + server SSE store
  const isApprovedFlag = normalizedStatus === 'APPROVED';
  const resolvedDiscipline = params.discipline || 'BIM - ACS';
  const updatePayload: Record<string, any> = {
    email: cleanEmail,
    name: params.name || cleanEmail.split('@')[0],
    fullName: params.name || cleanEmail.split('@')[0],
    role: validatedRole,
    assignedRole: validatedRole,
    requestedRole: displayRole,
    assignedAccessLevel: calculatedAccessLevel,
    discipline: resolvedDiscipline,
    primaryDiscipline: resolvedDiscipline,
    assignedDiscipline: resolvedDiscipline,
    orgDiscipline: resolvedDiscipline,
    organization: resolvedDiscipline,
    status: isApprovedFlag ? 'approved' : firestoreRequestStatus,
    isApproved: isApprovedFlag,
    reviewedBy:
      normalizedStatus === 'PENDING'
        ? null
        : params.reviewedBy || `${SUPER_ADMIN_NAME} (Super Admin)`,
    reviewedAt: normalizedStatus === 'PENDING' ? null : nowIso,
    updatedAt: nowIso,
    ...(params.notes ? { notes: params.notes } : {}),
  };

  // Sync to backend real-time store non-blockingly
  if (typeof fetch !== 'undefined') {
    fetch('/api/access-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: deterministicId,
        uid: targetId,
        ...updatePayload,
        timestamp: nowIso,
      }),
    }).catch(() => {});
  }

  const userPayload = {
    id: `emp-${deterministicId}`,
    email: cleanEmail,
    name: params.name || cleanEmail.split('@')[0],
    fullName: params.name || cleanEmail.split('@')[0],
    role: validatedRole,
    appRole: validatedRole,
    assignedRole: validatedRole,
    status: isApprovedFlag ? 'active' : normalizedStatus,
    isApproved: isApprovedFlag,
    accessLevel: calculatedAccessLevel,
    assignedAccessLevel: calculatedAccessLevel,
    discipline: resolvedDiscipline,
    primaryDiscipline: resolvedDiscipline,
    assignedDiscipline: resolvedDiscipline,
    orgDiscipline: resolvedDiscipline,
    organization: resolvedDiscipline,
    isDeleted: false,
    updatedAt: nowIso,
  };

  const docIds = Array.from(new Set([deterministicId, targetId].filter(Boolean)));
  const writeOps: Promise<any>[] = [];

  for (const dId of docIds) {
    for (const colName of ['access_requests', 'accessRequests']) {
      writeOps.push(
        setDoc(
          doc(db, colName, dId),
          {
            id: dId,
            uid: dId,
            timestamp: nowIso,
            ...updatePayload,
          },
          { merge: true }
        ).catch(() => {})
      );
    }
    writeOps.push(
      setDoc(
        doc(db, 'users', dId),
        {
          ...userPayload,
          id: dId.startsWith('emp-') ? dId : `emp-${dId}`,
        },
        { merge: true }
      ).catch(() => {})
    );
  }

  await withTimeout(Promise.allSettled(writeOps), 600);
}

