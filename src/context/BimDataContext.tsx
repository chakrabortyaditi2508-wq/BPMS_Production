import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  BimProject,
  Employee,
  DailyWorkLog,
  GeneratedStakeholderReport,
  ViewTab,
  Discipline,
  ActivityType,
  LODLevel,
  Milestone,
  ClashRecord,
  TaskItem,
  ThemeMode,
  AuthUser,
  OnboardingRequest,
  UserApprovalStatus,
  AccessLevel,
  AdminAuditLog,
  UserRole,
  SecurityRole,
  ResourceAllocationItem,
} from '../types';
import {
  INITIAL_PROJECTS,
  INITIAL_EMPLOYEES,
  generateInitialWorkLogs,
} from '../data/mockData';
import {
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_NAME,
  isSuperAdminEmail,
  mapAppRoleToAccessLevel,
  mapAppRoleToDisplayRole,
  normalizeUserRole,
} from '../auth/googleAuth';
import {
  persistUserRoleToDatabase,
  fetchUserRoleFromDatabase,
  generateRequestDocId,
  DatabaseRoleResult,
} from '../auth/roleSync';
import { useOptionalAuth } from '../auth/AuthContext';
import { db } from '../firebase/config';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  query,
  where,
  or,
  serverTimestamp,
} from 'firebase/firestore';

interface BimDataContextType {
  projects: BimProject[];
  employees: Employee[];
  workLogs: DailyWorkLog[];
  allWorkLogs: DailyWorkLog[];
  resourceAllocations: ResourceAllocationItem[];
  generatedReports: GeneratedStakeholderReport[];
  savedReports?: GeneratedStakeholderReport[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  currentTab: ViewTab;
  setCurrentTab: (tab: ViewTab) => void;
  dateFilter: string; // 'all' | 'today' | 'this-week' | 'this-month'
  setDateFilter: (filter: string) => void;
  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;

  // Authentication & Onboarding Workflow (Phase 1)
  currentUser: AuthUser | null;
  setCurrentUser: (user: AuthUser | null) => void;
  onboardingRequests: OnboardingRequest[];
  setOnboardingRequests: React.Dispatch<React.SetStateAction<OnboardingRequest[]>>;
  registerAccessRequest: (params: {
    name: string;
    email: string;
    fullName?: string;
    discipline?: string;
    reasonForAccess?: string;
    uid?: string;
    organization?: string;
    accessReason?: string;
    existingDbRecord?: DatabaseRoleResult;
    skipFirestoreWrite?: boolean;
  }) => Promise<OnboardingRequest>;
  auditLogs: AdminAuditLog[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AdminAuditLog[]>>;
  addAuditLog: (log: Omit<AdminAuditLog, 'id' | 'timestamp'>) => void;
  signInWithGoogle: (profile: {
    googleId?: string;
    email: string;
    name?: string;
    picture?: string;
    organization?: string;
    discipline?: string;
    accessReason?: string;
  }) => { status: UserApprovalStatus; user: AuthUser };
  signInWithEmail: (email: string, name?: string) => { status: UserApprovalStatus; user: AuthUser };
  requestAccess: (params: {
    name: string;
    email: string;
    requestedRole: string;
    primaryDiscipline: Discipline;
    organization?: string;
    accessReason?: string;
  }) => { status: UserApprovalStatus; user: AuthUser };
  updateAccessRequestReason: (requestId: string, accessReason: string, organization?: string) => void;
  checkUserStatus: () => void;
  approveOnboardingRequest: (
    requestId: string,
    assignedRole?: UserRole | string,
    assignedAccessLevel?: AccessLevel,
    assignedDiscipline?: Discipline | string
  ) => void;
  rejectOnboardingRequest: (requestId: string, notes?: string) => void;
  reopenOnboardingRequest: (requestId: string) => void;
  deleteOnboardingRequest: (requestId: string) => void;
  setSimulatedAuthStatus: (status: UserApprovalStatus) => void;
  switchUser: (user: Partial<AuthUser>) => void;
  signOut: () => void;

  // Actions
  addProject: (project: Omit<BimProject, 'id'>) => BimProject;
  updateProject: (id: string, updates: Partial<BimProject>) => void;
  updateProjectStatus: (id: string, status: BimProject['status']) => void;
  deleteProject: (id: string) => void;

  addWorkLog: (log: Omit<DailyWorkLog, 'id' | 'timestamp'>) => DailyWorkLog;
  updateWorkLog: (id: string, updates: Partial<DailyWorkLog>) => void;
  deleteWorkLog: (id: string) => void;

  addEmployee: (emp: Omit<Employee, 'id'>) => Employee;
  updateEmployee: (id: string, updates: Partial<Employee>) => void;
  deleteEmployee: (id: string) => void;

  addMilestone: (projectId: string, milestone: Omit<Milestone, 'id'>) => void;
  updateMilestoneStatus: (
    projectId: string,
    milestoneId: string,
    status: Milestone['status']
  ) => void;

  addClash: (projectId: string, clash: Omit<ClashRecord, 'id'>) => void;
  updateClashStatus: (
    projectId: string,
    clashId: string,
    status: ClashRecord['status']
  ) => void;

  addTask: (projectId: string, task: Omit<TaskItem, 'id' | 'projectId'>) => void;
  updateTask: (projectId: string, taskId: string, updates: Partial<TaskItem>) => void;

  // Discipline & Team Member Assignment State & Real-Time Firestore Sync
  disciplineAssignments: Record<string, string>;
  handleMemberSelect: (disciplineKey: string, memberId: string, projectId?: string) => Promise<void>;

  saveStakeholderReport: (report: GeneratedStakeholderReport) => void;
  resetToMockData: () => void;

  // Aggregated Analytics
  getProjectById: (id: string) => BimProject | undefined;
  getEmployeeById: (id: string) => Employee | undefined;
  getProjectCompletedHours: (projectId: string) => number;
  getEmployeeLoggedHours: (employeeId: string, filterRange?: string) => number;
  overallMetrics: {
    totalEstimatedHours: number;
    totalCompletedHours: number;
    hoursVariance: number;
    completionPercentage: number;
    activeProjectsCount: number;
    totalEmployeesCount: number;
    criticalClashesCount: number;
    totalClashesCount: number;
    resolvedClashesCount: number;
    avgUtilizationRate: number;
  };
}

const BimDataContext = createContext<BimDataContextType | undefined>(undefined);

const STORAGE_KEYS = {
  PROJECTS: 'bim_tracker_projects_v7',
  EMPLOYEES: 'bim_tracker_employees_v7',
  WORK_LOGS: 'bim_tracker_worklogs_v7',
  REPORTS: 'bim_tracker_reports_v7',
  USER_ACCESS: 'bim_tracker_user_access_v7',
  THEME: 'bim_tracker_theme_v7',
  CURRENT_USER: 'bim_tracker_current_user_v7',
  ONBOARDING: 'bim_tracker_onboarding_v8',
  AUDIT_LOGS: 'bim_tracker_audit_logs_v7',
  DELETED_MEMBERS: 'bim_deleted_members_v1',
};

export const PENDING_ACCESS_REQUESTS_KEY = 'bim_pending_access_requests_v2';
export const DELETED_ACCESS_REQUESTS_KEY = 'bim_deleted_access_requests_v2';
export const ACCESS_REQUESTS_CHANNEL = 'bim_access_requests_channel';

// Purge legacy storage caches on boot while rescuing any active pending sign-up requests
if (typeof window !== 'undefined') {
  try {
    const rescuedPending: OnboardingRequest[] = [];
    for (const oldKey of ['bim_pending_access_requests_v1', 'bim_tracker_onboarding_v7']) {
      const rawOld = localStorage.getItem(oldKey);
      if (rawOld) {
        try {
          const parsed = JSON.parse(rawOld);
          if (Array.isArray(parsed)) {
            parsed.forEach((item: any) => {
              const st = String(item?.status || '').trim().toLowerCase();
              if (item?.email && (st === 'pending' || st === 'pending_approval')) {
                rescuedPending.push(item);
              }
            });
          }
        } catch {}
      }
    }
    if (rescuedPending.length > 0) {
      const existingV2Raw = localStorage.getItem(PENDING_ACCESS_REQUESTS_KEY);
      const existingV2 = existingV2Raw ? JSON.parse(existingV2Raw) : [];
      const mergedRescue = [...rescuedPending, ...(Array.isArray(existingV2) ? existingV2 : [])];
      localStorage.setItem(PENDING_ACCESS_REQUESTS_KEY, JSON.stringify(mergedRescue));
    }

    const legacyKeys = [
      'bim_tracker_projects_v1', 'bim_tracker_projects_v2', 'bim_tracker_projects_v3', 'bim_tracker_projects_v4', 'bim_tracker_projects_v5', 'bim_tracker_projects_v6',
      'bim_tracker_employees_v1', 'bim_tracker_employees_v2', 'bim_tracker_employees_v3', 'bim_tracker_employees_v4', 'bim_tracker_employees_v5', 'bim_tracker_employees_v6',
      'bim_tracker_worklogs_v1', 'bim_tracker_worklogs_v2', 'bim_tracker_worklogs_v3', 'bim_tracker_worklogs_v4', 'bim_tracker_worklogs_v5', 'bim_tracker_worklogs_v6',
      'bim_projects_v2', 'bim_employees_v2', 'bim_work_logs_v2',
      'bim_resource_allocations_v1', 'bim_project_feedbacks_v1',
      'bim_tracker_onboarding_v7', 'bim_pending_access_requests_v1', 'bim_deleted_access_requests_v1'
    ];
    legacyKeys.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

const DEFAULT_CURRENT_USER: AuthUser = {
  id: 'usr_super_admin_modelatech',
  googleId: 'google_super_admin_modelatech',
  email: SUPER_ADMIN_EMAIL,
  name: SUPER_ADMIN_NAME,
  role: 'Super Administrator & Lead Architect',
  appRole: 'SUPER_ADMIN',
  status: 'APPROVED',
  isAdmin: true,
  accessLevel: 'Super Admin',
  organization: 'BPMS Core Systems & Architecture',
  accessReason: 'Executive Super Administrator with master editing and governance access',
  requestTimestamp: '2026-08-23 09:00 AM',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
};

export const REMOVED_MOCK_MEMBER_NAMES = new Set<string>([
  'harry potter',
  'amyy',
  'anumana bhattacharya',
  'kiara',
  'piya roy',
  'anny',
  'harry',
  'hammy',
  'abcd',
  'ankita ghosh',
  'stephen',
  'jishu',
  'steph',
  'bheem',
  'rony',
]);

export const REMOVED_MOCK_MEMBER_EMAILS = new Set<string>([
  'harry.potter@hogwarts.edu',
  'harry@gmail.com',
  'amy@gmail.com',
  'anu@gmail.com',
  'kira@gmail.com',
  'piyu@gmail.com',
  'an@gmail.com',
  'ha@gmail.com',
  'hm@gmail.com',
  'abcd@gmail.co',
  'anki@gmail.com',
  'step@gmail.com',
  'jish@gmail.com',
  'steph@gmail.com',
  'bheem@gmail.com',
  'rony@gmail.com',
]);

export const REMOVED_MOCK_MEMBER_IDS = new Set<string>([
  'harry_potter',
  'emp-harry_potter',
  'harry_gmail_com',
  'emp-harry_gmail_com',
  'harry_potter_hogwarts_edu',
  'emp-harry_potter_hogwarts_edu',
  'jishu',
  'emp-jishu',
  'jish_gmail_com',
  'emp-jish_gmail_com',
  'amy_gmail_com',
  'emp-amy_gmail_com',
  'anu_gmail_com',
  'emp-anu_gmail_com',
  'kira_gmail_com',
  'emp-kira_gmail_com',
  'piyu_gmail_com',
  'emp-piyu_gmail_com',
  'an_gmail_com',
  'emp-an_gmail_com',
  'ha_gmail_com',
  'emp-ha_gmail_com',
  'hm_gmail_com',
  'emp-hm_gmail_com',
  'abcd_gmail_co',
  'emp-abcd_gmail_co',
  'anki_gmail_com',
  'emp-anki_gmail_com',
  'step_gmail_com',
  'emp-step_gmail_com',
  'steph_gmail_com',
  'emp-steph_gmail_com',
  'bheem_gmail_com',
  'emp-bheem_gmail_com',
  'rony_gmail_com',
  'emp-rony_gmail_com',
  'req_seed_hammy',
  'req_seed_anny',
  'req_seed_harry',
]);

export const isRemovedMockMember = (item: {
  id?: string;
  employeeId?: string;
  memberId?: string;
  userId?: string;
  assignedTo?: string;
  name?: string;
  employeeName?: string;
  fullName?: string;
  memberName?: string;
  assignedToName?: string;
  email?: string;
  memberEmail?: string;
  userEmail?: string;
  assignedToEmail?: string;
  loggedBy?: string;
}): boolean => {
  if (!item) return false;
  const ids = [
    item.id,
    item.employeeId,
    item.memberId,
    item.userId,
    item.assignedTo,
  ];
  for (const rawId of ids) {
    const cleanId = String(rawId || '').trim().toLowerCase();
    if (!cleanId) continue;
    const stripped = cleanId.replace(/^emp-/, '');
    if (REMOVED_MOCK_MEMBER_IDS.has(cleanId) || REMOVED_MOCK_MEMBER_IDS.has(stripped)) {
      return true;
    }
  }

  const emails = [
    item.email,
    item.memberEmail,
    item.userEmail,
    item.assignedToEmail,
    item.loggedBy,
  ];
  for (const rawEmail of emails) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (email && REMOVED_MOCK_MEMBER_EMAILS.has(email)) return true;
  }

  const names = [
    item.name,
    item.employeeName,
    item.fullName,
    item.memberName,
    item.assignedToName,
    item.loggedBy,
  ];
  for (const n of names) {
    const clean = String(n || '').trim().toLowerCase();
    if (clean && REMOVED_MOCK_MEMBER_NAMES.has(clean)) return true;
  }
  return false;
};

const DEFAULT_ONBOARDING_REQUESTS: OnboardingRequest[] = [];

export const getRequestTimeMs = (req: any): number => {
  if (!req) return 0;
  const candidates = [
    req.updatedAt,
    req.reviewedAt,
    req.timestamp,
    req.requestedAt,
    req.createdAt,
    req.requestTimestamp,
  ];
  let maxMs = 0;
  for (const val of candidates) {
    if (!val) continue;
    let ms = 0;
    if (typeof val === 'number' && !Number.isNaN(val)) {
      ms = val;
    } else if (typeof val?.toDate === 'function') {
      try {
        const parsed = val.toDate().getTime();
        if (!Number.isNaN(parsed)) ms = parsed;
      } catch {}
    } else if (typeof val?.seconds === 'number') {
      ms = val.seconds * 1000;
    } else if (typeof val?._seconds === 'number') {
      ms = val._seconds * 1000;
    } else if (typeof val === 'string') {
      const parsed = new Date(val).getTime();
      if (!Number.isNaN(parsed)) ms = parsed;
    }
    if (ms > maxMs) {
      maxMs = ms;
    }
  }
  return maxMs;
};

const isStatusPending = (status?: string): boolean => {
  if (!status) return true;
  const s = String(status).trim().toLowerCase();
  return s === 'pending' || s === 'pending_approval' || s.includes('pending');
};

export const saveLocalAccessRequest = (req: OnboardingRequest): void => {
  if (!req || !req.email) return;
  const cleanEmail = req.email.trim().toLowerCase();
  const cleanId = String(req.id || '').trim().toLowerCase();
  try {
    // 1. Clear from deleted requests tombstones
    const delRaw = localStorage.getItem(DELETED_ACCESS_REQUESTS_KEY);
    if (delRaw) {
      const delArr = JSON.parse(delRaw);
      if (Array.isArray(delArr)) {
        const nextDel = delArr.filter((v: string) => {
          const k = String(v).trim().toLowerCase();
          return k !== cleanEmail && k !== cleanId;
        });
        localStorage.setItem(DELETED_ACCESS_REQUESTS_KEY, JSON.stringify(nextDel));
      }
    }

    if (isStatusPending(req.status)) {
      const delMemRaw = localStorage.getItem(STORAGE_KEYS.DELETED_MEMBERS);
      if (delMemRaw) {
        const delMemArr = JSON.parse(delMemRaw);
        if (Array.isArray(delMemArr)) {
          const nextMemDel = delMemArr.filter((v: string) => {
            const k = String(v).trim().toLowerCase();
            return k !== cleanEmail && k !== cleanId;
          });
          localStorage.setItem(STORAGE_KEYS.DELETED_MEMBERS, JSON.stringify(nextMemDel));
        }
      }
    }

    // 2. Upsert into PENDING_ACCESS_REQUESTS_KEY & STORAGE_KEYS.ONBOARDING
    for (const storageKey of [PENDING_ACCESS_REQUESTS_KEY, STORAGE_KEYS.ONBOARDING]) {
      const saved = localStorage.getItem(storageKey);
      let list: OnboardingRequest[] = [];
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) list = parsed;
      }
      const nextList = [
        req,
        ...list.filter(
          (r) =>
            (r?.email || '').trim().toLowerCase() !== cleanEmail &&
            String(r?.id || '').trim() !== String(req.id || '').trim()
        ),
      ];
      localStorage.setItem(storageKey, JSON.stringify(nextList));
    }

    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(ACCESS_REQUESTS_CHANNEL);
      bc.postMessage({ type: 'UPSERT_REQUEST', request: req });
      bc.close();
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('bim_access_request_submitted', {
          detail: req,
        })
      );
    }

    if (typeof fetch !== 'undefined') {
      fetch('/api/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('saveLocalAccessRequest notice:', e);
  }
};

export const removeLocalAccessRequest = (idOrEmail: string, email?: string): void => {
  const cleanId = String(idOrEmail || '').trim().toLowerCase();
  const cleanEmail = String(email || '').trim().toLowerCase();
  try {
    const delRaw = localStorage.getItem(DELETED_ACCESS_REQUESTS_KEY);
    const delSet = new Set<string>(
      delRaw ? JSON.parse(delRaw).map((v: string) => String(v).trim().toLowerCase()) : []
    );
    if (cleanId) delSet.add(cleanId);
    if (cleanEmail) delSet.add(cleanEmail);
    localStorage.setItem(DELETED_ACCESS_REQUESTS_KEY, JSON.stringify(Array.from(delSet)));

    for (const storageKey of [PENDING_ACCESS_REQUESTS_KEY, STORAGE_KEYS.ONBOARDING]) {
      const saved = localStorage.getItem(storageKey);
      if (!saved) continue;
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((r: any) => {
          const rId = String(r?.id || '').trim().toLowerCase();
          const rEmail = String(r?.email || '').trim().toLowerCase();
          return (
            (!cleanId || (rId !== cleanId && rEmail !== cleanId)) &&
            (!cleanEmail || rEmail !== cleanEmail)
          );
        });
        localStorage.setItem(storageKey, JSON.stringify(filtered));
      }
    }

    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(ACCESS_REQUESTS_CHANNEL);
      bc.postMessage({ type: 'DELETE_REQUEST', id: idOrEmail, email: cleanEmail });
      bc.close();
    }

    if (typeof fetch !== 'undefined' && (cleanId || cleanEmail)) {
      const target = encodeURIComponent(cleanId || cleanEmail);
      const q = cleanEmail ? `?email=${encodeURIComponent(cleanEmail)}` : '';
      fetch(`/api/access-requests/${target}${q}`, { method: 'DELETE' }).catch(() => {});
    }
  } catch (e) {
    console.warn('removeLocalAccessRequest notice:', e);
  }
};

let lastMergedRequestsSignature = '';

export const invalidateAccessRequestsCache = (): void => {
  lastMergedRequestsSignature = '';
};

export const mergeAccessRequestsWithLocal = (
  remoteList: OnboardingRequest[],
  currentList: OnboardingRequest[] = []
): OnboardingRequest[] => {
  const deletedSet = new Set<string>();
  try {
    const delRaw = localStorage.getItem(DELETED_ACCESS_REQUESTS_KEY);
    if (delRaw) {
      const parsed = JSON.parse(delRaw);
      if (Array.isArray(parsed)) {
        parsed.forEach((v: string) => deletedSet.add(String(v).trim().toLowerCase()));
      }
    }
  } catch {}

  let localPending: OnboardingRequest[] = [];
  let localOnboarding: OnboardingRequest[] = [];
  try {
    const rawP = localStorage.getItem(PENDING_ACCESS_REQUESTS_KEY);
    if (rawP) {
      const parsed = JSON.parse(rawP);
      if (Array.isArray(parsed)) localPending = parsed;
    }
  } catch {}
  try {
    const rawO = localStorage.getItem(STORAGE_KEYS.ONBOARDING);
    if (rawO) {
      const parsed = JSON.parse(rawO);
      if (Array.isArray(parsed)) localOnboarding = parsed;
    }
  } catch {}

  const seedDefaults = DEFAULT_ONBOARDING_REQUESTS.filter((d) => {
    const dEmail = (d.email || '').trim().toLowerCase();
    const dId = (d.id || '').trim().toLowerCase();
    return !deletedSet.has(dEmail) && !deletedSet.has(dId);
  });

  const combined = [
    ...seedDefaults,
    ...(currentList || []),
    ...localPending,
    ...localOnboarding,
    ...(remoteList || []),
  ];

  const byEmail = new Map<string, OnboardingRequest>();

  for (const item of combined) {
    if (!item || item.isDeleted || isRemovedMockMember(item)) continue;
    const rawStatus = String(item.status || 'pending').trim().toLowerCase();
    if (rawStatus === 'deleted') continue;

    const cleanEmail = String(item.email || '').trim().toLowerCase();
    if (!cleanEmail) continue;
    const cleanId = String(item.id || '').trim().toLowerCase();

    // Only filter out by deletedSet if the item is NOT a fresh pending request
    if (
      !isStatusPending(rawStatus) &&
      (deletedSet.has(cleanEmail) || (cleanId && deletedSet.has(cleanId)))
    ) {
      continue;
    }

    const normalizedStatus: UserApprovalStatus = isSuperAdminEmail(cleanEmail)
      ? 'APPROVED'
      : rawStatus === 'approved' || rawStatus === 'active'
      ? 'APPROVED'
      : rawStatus === 'rejected' || rawStatus === 'declined'
      ? 'REJECTED'
      : 'pending';

    const resolvedItemDiscipline =
      item.assignedDiscipline || item.discipline || item.primaryDiscipline || 'BIM - ACS';
    const resolvedOrgDiscipline =
      item.orgDiscipline || item.assignedDiscipline || item.discipline || item.primaryDiscipline || item.organization || resolvedItemDiscipline;

    const resolvedId =
      cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase() &&
      cleanId.includes('chakrabortyaditi2508')
        ? generateRequestDocId(cleanEmail)
        : item.id || generateRequestDocId(cleanEmail);

    const normalizedItem: OnboardingRequest = {
      ...item,
      id: resolvedId,
      email: cleanEmail,
      name: item.name || item.fullName || cleanEmail.split('@')[0],
      fullName: item.fullName || item.name || cleanEmail.split('@')[0],
      discipline: resolvedItemDiscipline,
      primaryDiscipline: resolvedItemDiscipline,
      assignedDiscipline: resolvedItemDiscipline,
      orgDiscipline: resolvedOrgDiscipline,
      organization: resolvedOrgDiscipline,
      status: normalizedStatus,
    };

    const existing = byEmail.get(cleanEmail);
    if (!existing) {
      byEmail.set(cleanEmail, normalizedItem);
      continue;
    }

    const tExisting = getRequestTimeMs(existing);
    const tCandidate = getRequestTimeMs(normalizedItem);

    // If one record has a strictly newer timestamp (> 1s difference), keep the newer one
    if (Math.abs(tCandidate - tExisting) > 1000) {
      if (tCandidate > tExisting) {
        byEmail.set(cleanEmail, normalizedItem);
      }
      continue;
    }

    // If timestamps are within 1s or equal, prefer reviewed status if reviewedAt is present, otherwise pending
    const existingReviewed = Boolean(existing.reviewedAt) && !isStatusPending(existing.status);
    const candidateReviewed = Boolean(normalizedItem.reviewedAt) && !isStatusPending(normalizedItem.status);
    if (candidateReviewed && !existingReviewed) {
      byEmail.set(cleanEmail, normalizedItem);
    } else if (!existingReviewed && !candidateReviewed && isStatusPending(normalizedItem.status)) {
      byEmail.set(cleanEmail, normalizedItem);
    }
  }

  const seenIds = new Set<string>();
  const uniqueById: OnboardingRequest[] = [];
  for (const req of byEmail.values()) {
    let finalId = String(req.id || '').trim();
    if (!finalId || seenIds.has(finalId.toLowerCase())) {
      finalId = generateRequestDocId(req.email);
      if (seenIds.has(finalId.toLowerCase())) {
        finalId = `${finalId}_${uniqueById.length}`;
      }
    }
    seenIds.add(finalId.toLowerCase());
    uniqueById.push(finalId === req.id ? req : { ...req, id: finalId });
  }

  const result = uniqueById.sort((a, b) => {
    const pA = isStatusPending(a.status) ? 1 : 0;
    const pB = isStatusPending(b.status) ? 1 : 0;
    if (pA !== pB) return pB - pA;
    return getRequestTimeMs(b) - getRequestTimeMs(a);
  });

  try {
    const signature = result
      .map(
        (r) =>
          `${r.id}:${r.email}:${r.name}:${r.status}:${r.assignedRole}:${r.assignedDiscipline || r.discipline || ''}:${r.orgDiscipline || r.organization || ''}:${r.createdAt || ''}:${r.timestamp || ''}`
      )
      .join('|');
    if (signature !== lastMergedRequestsSignature) {
      lastMergedRequestsSignature = signature;
      const serialized = JSON.stringify(result);
      localStorage.setItem(STORAGE_KEYS.ONBOARDING, serialized);
      localStorage.setItem(PENDING_ACCESS_REQUESTS_KEY, serialized);
    }
  } catch {}

  return result;
};

const DEFAULT_AUDIT_LOGS: AdminAuditLog[] = [
  {
    id: 'audit-1',
    action: 'approved',
    targetUserEmail: SUPER_ADMIN_EMAIL,
    targetUserName: SUPER_ADMIN_NAME,
    performedBy: 'System Bootstrap',
    timestamp: '2026-08-23 09:00 AM',
    details: 'Provisioned Super Admin credentials and master administrative privileges.',
  },
];

export interface WeekDayColumn {
  date: string;
  label: string;
  dayNum: string;
}

export interface WeekRangeResult {
  startDate: Date;
  endDate: Date;
  startIso: string;
  endIso: string;
  label: string;
  days: WeekDayColumn[];
}

export const toLocalIsoDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getCurrentWeekRange = (referenceDate: Date = new Date()): WeekRangeResult => {
  const now = new Date(referenceDate);
  const dayOfWeek = now.getDay(); // 0 (Sun) - 6 (Sat)
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const todayIso = toLocalIsoDate(new Date());
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const days: WeekDayColumn[] = Array.from({ length: 7 }, (_, idx) => {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + idx);
    const iso = toLocalIsoDate(cur);
    const dayNum = String(cur.getDate()).padStart(2, '0');
    return {
      date: iso,
      label: iso === todayIso ? `${dayNames[idx]} (Today)` : dayNames[idx],
      dayNum,
    };
  });

  const startFormatted = monday.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const endFormatted = sunday.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    startDate: monday,
    endDate: sunday,
    startIso: toLocalIsoDate(monday),
    endIso: toLocalIsoDate(sunday),
    label: `${startFormatted} - ${endFormatted}`,
    days,
  };
};

export const matchProjectId = (idA?: string, idB?: string): boolean => {
  if (!idA || !idB) return false;
  if (idA === idB) return true;
  const normA = idA.startsWith('proj-') ? idA : idA.replace(/^p(\d+)$/, 'proj-$1');
  const normB = idB.startsWith('proj-') ? idB : idB.replace(/^p(\d+)$/, 'proj-$1');
  return normA === normB;
};

export const doesLogBelongToProject = (
  log: {
    projectId?: string;
    projectName?: string;
    projectCode?: string;
  },
  project: {
    id: string;
    name?: string;
    code?: string;
  }
): boolean => {
  if (!log || !project) return false;

  const logProjId = (log.projectId || '').trim();
  const projId = (project.id || '').trim();

  // 1. Direct ID match or normalized ID match (e.g. p1 vs proj-1)
  if (logProjId && projId) {
    if (logProjId === projId) return true;
    if (matchProjectId(logProjId, projId)) return true;
    const strippedLogId = logProjId.replace(/^proj-/, '').replace(/^p/, '');
    const strippedProjId = projId.replace(/^proj-/, '').replace(/^p/, '');
    if (strippedLogId && strippedProjId && strippedLogId === strippedProjId) return true;
  }

  // 2. Project Code match
  const logCode = (log.projectCode || '').trim().toLowerCase();
  const projCode = (project.code || '').trim().toLowerCase();
  if (logCode && projCode) {
    if (logCode === projCode) {
      return true;
    }
  }

  // 3. Project Name match (normalized via cleanProjectName)
  const rawLogName = (log.projectName || '').trim();
  const rawProjName = (project.name || '').trim();
  const cleanedLogName = cleanProjectName(rawLogName).toLowerCase();
  const cleanedProjName = cleanProjectName(rawProjName).toLowerCase();

  const isGenericLogName =
    !cleanedLogName ||
    cleanedLogName === 'bim project' ||
    cleanedLogName === 'unassigned project' ||
    cleanedLogName === 'project';

  if (!isGenericLogName && cleanedProjName) {
    if (cleanedLogName === cleanedProjName) return true;
    const normLogKey = normalizeProjectNameKey(rawLogName);
    const normProjKey = normalizeProjectNameKey(rawProjName);
    if (normLogKey && normProjKey && normLogKey === normProjKey) return true;

    // Only allow substring match if the log does not carry an explicit projectId pointing elsewhere
    if (!logProjId && cleanedLogName.length >= 4 && cleanedProjName.length >= 4) {
      if (cleanedProjName.includes(cleanedLogName) || cleanedLogName.includes(cleanedProjName)) {
        return true;
      }
    }
  }

  // 4. Raw lowercased exact string check
  const lowerLogName = rawLogName.toLowerCase();
  const lowerProjName = rawProjName.toLowerCase();
  if (
    lowerLogName &&
    lowerProjName &&
    lowerLogName !== 'bim project' &&
    lowerLogName !== 'unassigned project' &&
    lowerLogName === lowerProjName
  ) {
    return true;
  }

  return false;
};

/**
 * Normalizes any date representation (ISO YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, ISO UTC string, Firestore Timestamp)
 * into a strict YYYY-MM-DD string without timezone-induced day shifts.
 */
export const normalizeDateToIso = (raw: any): string => {
  if (!raw) return '';
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return '';
    // 1. Matches YYYY-MM-DD, YYYY/MM/DD, or YYYY.MM.DD (e.g. 2026-10-28, 2026-10-28T00:00:00.000Z, 2026-10-28 14:30:00)
    const ymdMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (ymdMatch) {
      const year = ymdMatch[1];
      const month = ymdMatch[2].padStart(2, '0');
      const day = ymdMatch[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    // 2. Matches DD-MM-YYYY, DD/MM/YYYY, or DD.MM.YYYY (e.g. 28-10-2026, 28/10/2026)
    const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (dmyMatch) {
      const p1 = Number(dmyMatch[1]);
      const p2 = Number(dmyMatch[2]);
      const year = dmyMatch[3];
      if (p1 > 12) {
        // First part is day: DD-MM-YYYY
        const day = String(p1).padStart(2, '0');
        const month = String(p2).padStart(2, '0');
        return `${year}-${month}-${day}`;
      } else if (p2 > 12) {
        // Second part is day: MM-DD-YYYY
        const month = String(p1).padStart(2, '0');
        const day = String(p2).padStart(2, '0');
        return `${year}-${month}-${day}`;
      } else {
        // Default DD-MM-YYYY as standard display format
        const day = String(p1).padStart(2, '0');
        const month = String(p2).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }
    // 2.5 English Month Names (e.g. Oct 26, 2026 or 26 Oct 2026)
    const monthNames: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const namedMatch1 = s.match(/^([a-zA-Z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
    if (namedMatch1) {
      const mKey = namedMatch1[1].slice(0, 3).toLowerCase();
      if (monthNames[mKey]) {
        const day = namedMatch1[2].padStart(2, '0');
        const year = namedMatch1[3];
        return `${year}-${monthNames[mKey]}-${day}`;
      }
    }
    const namedMatch2 = s.match(/^(\d{1,2})\s+([a-zA-Z]{3,9}),?\s+(\d{4})/);
    if (namedMatch2) {
      const mKey = namedMatch2[2].slice(0, 3).toLowerCase();
      if (monthNames[mKey]) {
        const day = namedMatch2[1].padStart(2, '0');
        const year = namedMatch2[3];
        return `${year}-${monthNames[mKey]}-${day}`;
      }
    }

    // 3. Fallback date parse
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getUTCFullYear();
      const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
      const day = String(parsed.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return s.slice(0, 10);
  }
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return '';
    // If UTC midnight (e.g. from UTC ISO string), use UTC getters to prevent timezone day-shift
    if (raw.getUTCHours() === 0 && raw.getUTCMinutes() === 0) {
      const year = raw.getUTCFullYear();
      const month = String(raw.getUTCMonth() + 1).padStart(2, '0');
      const day = String(raw.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const year = raw.getFullYear();
    const month = String(raw.getMonth() + 1).padStart(2, '0');
    const day = String(raw.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof raw?.toDate === 'function') {
    try {
      const d = raw.toDate();
      if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {}
  }
  if (typeof raw?.seconds === 'number') {
    const d = new Date(raw.seconds * 1000);
    // Firestore Timestamp seconds for dates (midnight UTC): use UTC getters to prevent day-shift
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return '';
};

export const getEffectiveLogDate = (
  log: DailyWorkLog,
  _weekRange: WeekRangeResult = getCurrentWeekRange()
): string => {
  if (!log) return '';
  const rawDate = (log.date || (log as any).workDate || (log as any).entryDate || '').trim();
  const normalizedDate = normalizeDateToIso(rawDate);
  if (normalizedDate) {
    return normalizedDate;
  }

  const fallbackRaw = log.timestamp || (log as any).createdAt || (log as any).updatedAt;
  if (fallbackRaw) {
    const normalizedFallback = normalizeDateToIso(fallbackRaw);
    if (normalizedFallback) {
      return normalizedFallback;
    }
  }

  return rawDate;
};

export const getMemberLabel = (member: { name?: string; role?: string }): string =>
  `${member.name} (${member.role || 'VIEWER'})`;

export const isUserSuperAdmin = (u: AuthUser | null | undefined): boolean => {
  if (!u) return false;
  const email = (u.email || '').trim().toLowerCase();
  const lowerName = (u.name || '').trim().toLowerCase();
  const isNamedSuperAdmin =
    lowerName === 'aditi chakraborty' ||
    lowerName.includes('sushoovan') ||
    lowerName.includes('sushovan') ||
    lowerName.includes('sushovon');
  if (isSuperAdminEmail(email) || isNamedSuperAdmin) return true;
  // If user has an explicitly assigned non-admin role (e.g., switched role to Viewer/Editor/PM or standard user), respect it first
  if (
    u.securityRole === 'Project Manager' ||
    u.securityRole === 'BIM Specialist' ||
    u.securityRole === 'Lead Coordinator' ||
    u.securityRole === 'Editor' ||
    u.securityRole === 'Viewer' ||
    u.appRole === 'PROJECT_MANAGER' ||
    u.appRole === 'EDITOR' ||
    u.appRole === 'VIEWER' ||
    u.accessLevel === 'Viewer' ||
    u.role === 'Viewer' ||
    u.role === 'VIEWER' ||
    u.role === 'EDITOR'
  ) {
    return false;
  }
  if (
    u.securityRole === 'Super Admin' ||
    u.securityRole === 'Director' ||
    u.appRole === 'SUPER_ADMIN' ||
    u.appRole === 'DIRECTOR' ||
    u.accessLevel === 'Super Admin' ||
    u.accessLevel === 'Director' ||
    u.role === 'Super Admin' ||
    u.role === 'SUPER_ADMIN' ||
    u.role === 'Director' ||
    u.role === 'DIRECTOR'
  ) {
    return true;
  }
  if (u.appRole && (normalizeUserRole(u.appRole) === 'SUPER_ADMIN' || normalizeUserRole(u.appRole) === 'DIRECTOR')) return true;
  if (u.isAdmin && (u.role?.toLowerCase().includes('admin') || u.role?.toLowerCase().includes('director'))) return true;
  return false;
};

export const isUserViewer = (
  u: AuthUser | null | undefined,
  isAuthenticated: boolean = true,
  securityRole?: string
): boolean => {
  if (!isAuthenticated || !u) return true;
  const lowerName = (u.name || '').trim().toLowerCase();
  if (
    isSuperAdminEmail(u.email) ||
    lowerName === 'aditi chakraborty' ||
    lowerName.includes('sushoovan') ||
    lowerName.includes('sushovan') ||
    lowerName.includes('sushovon')
  ) {
    return false;
  }
  if (
    securityRole === 'Viewer' ||
    u.securityRole === 'Viewer' ||
    u.appRole === 'VIEWER' ||
    u.accessLevel === 'Viewer' ||
    u.role === 'Viewer'
  ) {
    return true;
  }
  return false;
};

export const resolveSecurityRole = (
  u: AuthUser | null | undefined,
  isAuthenticated: boolean = true,
  explicitSecurityRole?: SecurityRole | string
): SecurityRole => {
  if (
    u &&
    (isSuperAdminEmail(u.email) ||
      (u.name || '').toLowerCase().includes('sushoovan') ||
      (u.name || '').toLowerCase().includes('sushovan') ||
      (u.name || '').toLowerCase().includes('sushovon'))
  ) {
    return 'Super Admin';
  }
  if (!isAuthenticated && !u && !explicitSecurityRole) return 'Viewer';

  const candidate = (explicitSecurityRole || u?.securityRole || '').trim();
  if (
    candidate === 'Super Admin' ||
    candidate === 'Director' ||
    candidate === 'Project Manager' ||
    candidate === 'BIM Specialist' ||
    candidate === 'Lead Coordinator' ||
    candidate === 'Editor' ||
    candidate === 'Viewer'
  ) {
    return candidate;
  }

  if (candidate.startsWith('Super Admin')) return 'Super Admin';
  if (candidate.startsWith('Director')) return 'Director';
  if (candidate.startsWith('Viewer')) return 'Viewer';

  if (!u) return 'Viewer';
  if (u.appRole === 'SUPER_ADMIN' || u.accessLevel === 'Super Admin' || isSuperAdminEmail(u.email)) {
    return 'Super Admin';
  }
  if (u.appRole === 'DIRECTOR' || u.accessLevel === 'Director') {
    return 'Director';
  }
  if (u.appRole === 'PROJECT_MANAGER' || u.accessLevel === 'Project Manager') {
    return 'Project Manager';
  }
  if (u.appRole === 'VIEWER' || u.accessLevel === 'Viewer') {
    return 'Viewer';
  }
  if (u.role?.toLowerCase().includes('lead coordinator')) {
    return 'Lead Coordinator';
  }
  if (u.role?.toLowerCase().includes('specialist')) {
    return 'BIM Specialist';
  }
  if (u.appRole === 'EDITOR' || u.accessLevel === 'Editor') {
    return 'Editor';
  }
  return 'Viewer';
};

export const getQuickActionPermissions = (role: SecurityRole) => {
  return {
    canAddProject:
      role === 'Super Admin' || role === 'Director' || role === 'Project Manager',
    canAddMember: role === 'Super Admin' || role === 'Director',
    canLogHours: true,
    canViewAIReport: role !== 'Viewer',
  };
};

export const isTabAllowedForRole = (tab: ViewTab, role: SecurityRole): boolean => {
  switch (tab) {
    case 'admin-nexus':
      return role === 'Super Admin';
    case 'dashboard':
    case 'stakeholder-reports':
      return (
        role === 'Super Admin' ||
        role === 'Director' ||
        role === 'Project Manager'
      );
    case 'employees':
      return (
        role === 'Super Admin' ||
        role === 'Director' ||
        role === 'Project Manager' ||
        role === 'BIM Specialist' ||
        role === 'Lead Coordinator'
      );
    case 'projects':
    case 'project-feedback':
      return role !== 'Viewer';
    case 'assign-hours':
    case 'clash-lod':
    case 'project-members':
    case 'daily-tracker':
      return true;
    default:
      return false;
  }
};

export const getDefaultTabForRole = (role: SecurityRole): ViewTab => {
  if (isTabAllowedForRole('dashboard', role)) return 'dashboard';
  if (isTabAllowedForRole('projects', role)) return 'projects';
  return 'daily-tracker';
};

export const isRecordOwnedByMember = (
  rawLog: DailyWorkLog,
  user: AuthUser | null | undefined,
  allEmployees: Employee[]
): boolean => {
  if (!user) return false;
  const log = sanitizeWorkLogRecord(rawLog);
  const userName = (user.name || '').trim().toLowerCase();
  const logName = (log.employeeName || '').trim().toLowerCase();
  const isGenericLogName =
    !logName ||
    logName === 'bim modeler' ||
    logName === 'team member' ||
    logName === 'bim engineer';

  // If both user and log have explicit names and they do not match, they belong to different users
  if (userName && !isGenericLogName && userName !== logName) {
    return false;
  }

  const userEmail = (user.email || '').trim().toLowerCase();
  const logEmail = (log.memberEmail || (log as any).userEmail || '').trim().toLowerCase();
  if (userEmail && logEmail && userEmail !== logEmail) {
    return false;
  }

  const userId = (user.id || '').trim();
  const userIdStripped = userId.replace(/^emp-/, '');
  const userGoogleId = (user.googleId || '').trim();
  const detEmailId = userEmail ? generateRequestDocId(userEmail) : '';
  const logEmpId = (log.employeeId || '').trim();
  const logEmpIdStripped = logEmpId.replace(/^emp-/, '');
  const logUserId = ((log as any).userId || '').trim();
  const logUserIdStripped = logUserId.replace(/^emp-/, '');

  // 1. Direct email match
  if (userEmail && logEmail && logEmail === userEmail) {
    return true;
  }

  // 2. Direct user ID / deterministic ID match
  const candidateIds = new Set(
    [userId, userIdStripped, userGoogleId, detEmailId].filter(Boolean)
  );
  if (
    (logEmpId && candidateIds.has(logEmpId)) ||
    (logEmpIdStripped && candidateIds.has(logEmpIdStripped)) ||
    (logUserId && candidateIds.has(logUserId)) ||
    (logUserIdStripped && candidateIds.has(logUserIdStripped))
  ) {
    return true;
  }

  // 3. Direct name match if user has a name
  if (userName && !isGenericLogName && logName === userName) {
    return true;
  }

  // 4. Employee mapping match (strictly enforcing name agreement)
  const matchingEmp = allEmployees
    .map((e) => sanitizeEmployeeRecord(e))
    .find((e) => {
      const eName = (e.name || '').trim().toLowerCase();
      if (userName && eName && userName !== eName) return false;
      return (
        e.id === userId ||
        e.id.replace(/^emp-/, '') === userIdStripped ||
        (detEmailId && e.id.replace(/^emp-/, '') === detEmailId) ||
        (e.email && userEmail && e.email.trim().toLowerCase() === userEmail) ||
        (eName && userName && eName === userName)
      );
    });
  if (matchingEmp) {
    const matchEmpIdStripped = matchingEmp.id.replace(/^emp-/, '');
    if (
      logEmpId === matchingEmp.id ||
      logEmpIdStripped === matchEmpIdStripped ||
      logUserId === matchingEmp.id ||
      logUserIdStripped === matchEmpIdStripped
    ) {
      return true;
    }
    if (
      !isGenericLogName &&
      matchingEmp.name &&
      logName === matchingEmp.name.trim().toLowerCase()
    ) {
      return true;
    }
  }

  return false;
};

export const cleanProjectName = (name?: string): string => {
  if (!name) return '';
  const stripped = name.replace(/^BIM\s*-\s*/i, '').trim();
  const parts = stripped.split(/\s+-\s+/);
  if (parts.length === 2) {
    const left = parts[0].replace(/^BIM\s*-\s*/i, '').trim();
    const right = parts[1].replace(/^BIM\s*-\s*/i, '').trim();
    if (left.toLowerCase() === right.toLowerCase() || /^BIM\s*-/i.test(name.trim())) {
      return right;
    }
  }
  return stripped;
};

export const getProjectEstimatedHours = (project?: Partial<BimProject> | null): number => {
  if (!project) return 0;
  return (
    Number(
      project.manualEstimatedHoursOverride ??
        project.estimatedHours ??
        project.totalEstimatedHours
    ) || 0
  );
};

export const getProjectChangedHours = (project?: Partial<BimProject> | null): number => {
  if (!project) return 0;
  return (
    Number(
      project.manualChangedHoursOverride ??
        project.changedHours ??
        project.additionalHours
    ) || 0
  );
};

export const getProjectTargetHours = (project?: Partial<BimProject> | null): number => {
  return getProjectEstimatedHours(project) + getProjectChangedHours(project);
};

const normalizeProjectNameKey = (name?: string): string =>
  cleanProjectName(name).toLowerCase().replace(/[^a-z0-9]/g, '');

const mergeWithMasterProjects = (existingList: BimProject[]): BimProject[] => {
  const byId = new Map<string, BimProject>();
  const byName = new Map<string, BimProject>();

  existingList.forEach((p) => {
    if (p && p.id) byId.set(p.id, p);
    const nKey = normalizeProjectNameKey(p?.name);
    if (nKey && !byName.has(nKey)) byName.set(nKey, p);
  });

  const masterNameKeys = new Set(INITIAL_PROJECTS.map((mp) => normalizeProjectNameKey(mp.name)));
  const masterIds = new Set(INITIAL_PROJECTS.map((mp) => mp.id));

  // Keep any custom user-added projects that are not part of the 32 master spreadsheet projects at the top
  const customProjects = existingList
    .filter(
      (p) =>
        p &&
        p.id &&
        !masterIds.has(p.id) &&
        !masterNameKeys.has(normalizeProjectNameKey(p.name))
    )
    .map((p) => ({
      ...p,
      name: cleanProjectName(p.name),
    }));

  // Build the 32 master projects in exact Resource Allocation Sheet order
  const masterMerged = INITIAL_PROJECTS.map((masterProj) => {
    const matched =
      byId.get(masterProj.id) || byName.get(normalizeProjectNameKey(masterProj.name));
    if (!matched) {
      return {
        ...masterProj,
        name: cleanProjectName(masterProj.name),
      };
    }
    const resolvedEst =
      matched.manualEstimatedHoursOverride !== undefined &&
      !Number.isNaN(Number(matched.manualEstimatedHoursOverride))
        ? Number(matched.manualEstimatedHoursOverride)
        : matched.estimatedHours !== undefined &&
          !Number.isNaN(Number(matched.estimatedHours)) &&
          (Number(matched.estimatedHours) > 0 || masterProj.totalEstimatedHours === 0)
        ? Number(matched.estimatedHours)
        : matched.totalEstimatedHours !== undefined &&
          !Number.isNaN(Number(matched.totalEstimatedHours)) &&
          (Number(matched.totalEstimatedHours) > 0 || masterProj.totalEstimatedHours === 0)
        ? Number(matched.totalEstimatedHours)
        : masterProj.totalEstimatedHours;

    const resolvedChanged =
      matched.manualChangedHoursOverride !== undefined &&
      !Number.isNaN(Number(matched.manualChangedHoursOverride))
        ? Number(matched.manualChangedHoursOverride)
        : matched.changedHours !== undefined && !Number.isNaN(Number(matched.changedHours))
        ? Number(matched.changedHours)
        : matched.additionalHours !== undefined && !Number.isNaN(Number(matched.additionalHours))
        ? Number(matched.additionalHours)
        : undefined;

    const masterPrimaryDisc = masterProj.disciplines?.[0];
    let resolvedDisciplines =
      Array.isArray(matched.disciplines) && matched.disciplines.length > 0
        ? matched.disciplines
        : masterProj.disciplines;
    if (
      (masterPrimaryDisc === 'SCAN TO BIM' || masterPrimaryDisc === 'CAD') &&
      !resolvedDisciplines.includes(masterPrimaryDisc)
    ) {
      resolvedDisciplines = [masterPrimaryDisc, ...resolvedDisciplines];
    }

    return {
      ...masterProj,
      ...matched,
      id: masterProj.id,
      code: matched.code || masterProj.code,
      name: cleanProjectName(matched.name || masterProj.name),
      disciplines: resolvedDisciplines,
      totalEstimatedHours: resolvedEst,
      estimatedHours: resolvedEst,
      ...(matched.manualEstimatedHoursOverride !== undefined
        ? { manualEstimatedHoursOverride: Number(matched.manualEstimatedHoursOverride) }
        : {}),
      ...(resolvedChanged !== undefined
        ? {
            changedHours: resolvedChanged,
            additionalHours: resolvedChanged,
            manualChangedHoursOverride: resolvedChanged,
          }
        : {}),
      ...(matched.totalLogged !== undefined
        ? { totalLogged: Number(matched.totalLogged) }
        : {}),
      ...(matched.totalCompletedHours !== undefined
        ? { totalCompletedHours: Number(matched.totalCompletedHours) }
        : {}),
      ...(matched.manualHoursOverride !== undefined
        ? { manualHoursOverride: Number(matched.manualHoursOverride) }
        : {}),
      ...(matched.manualHoursBaseLogged !== undefined
        ? { manualHoursBaseLogged: Number(matched.manualHoursBaseLogged) }
        : {}),
      plannedDeliveryDate:
        matched.plannedDeliveryDate !== undefined && matched.plannedDeliveryDate !== ''
          ? matched.plannedDeliveryDate
          : masterProj.plannedDeliveryDate,
      targetCompletionDate:
        matched.targetCompletionDate !== undefined && matched.targetCompletionDate !== ''
          ? matched.targetCompletionDate
          : matched.plannedDeliveryDate || masterProj.targetCompletionDate,
      actualDeliveredDate:
        matched.actualDeliveredDate !== undefined
          ? matched.actualDeliveredDate
          : masterProj.actualDeliveredDate,
      status:
        !matched.status || matched.status === 'Not Started'
          ? masterProj.status
          : matched.status,
    };
  });

  return [...customProjects, ...masterMerged];
};

export const sanitizeEmployeeRecord = (emp: Employee): Employee => {
  const rawName = (emp.name || '').trim();
  const lowerName = rawName.toLowerCase();
  const lowerEmail = (emp.email || '').trim().toLowerCase();
  const rawId = (emp.id || '').trim();
  const lowerId = rawId.toLowerCase();

  const isGenericName =
    !lowerName ||
    lowerName === 'bim modeler' ||
    lowerName === 'team member' ||
    lowerName === 'bim engineer';

  const isSushovan =
    lowerName.includes('sushovan') ||
    lowerName.includes('sushoovan') ||
    lowerName.includes('sushovon') ||
    lowerEmail === 'sushoovandas@gmail.com' ||
    lowerEmail === 'sushovandas@gmail.com' ||
    (isGenericName && (lowerId.includes('sushovan') || lowerId.includes('sushoovan') || lowerId.includes('sushovon')));

  const isAditi =
    !isSushovan &&
    (lowerName === SUPER_ADMIN_NAME.toLowerCase() ||
      lowerName.includes('aditi chakraborty') ||
      lowerName === 'aditi' ||
      (isGenericName &&
        (lowerEmail === SUPER_ADMIN_EMAIL.toLowerCase() ||
          lowerId.includes('modelatech2026'))));

  if (isAditi) {
    return {
      ...emp,
      id: 'emp-modelatech2026_gmail_com',
      name: SUPER_ADMIN_NAME,
      email: SUPER_ADMIN_EMAIL,
      role: 'SUPER_ADMIN',
    };
  }

  if (isSushovan) {
    const cleanSushovanEmail =
      lowerEmail && lowerEmail !== SUPER_ADMIN_EMAIL.toLowerCase()
        ? lowerEmail
        : 'sushoovandas@gmail.com';
    return {
      ...emp,
      id: 'emp-sushoovan_das',
      name: !isGenericName ? rawName : 'Sushoovan Das',
      email: cleanSushovanEmail,
      role: 'SUPER_ADMIN',
    };
  }

  const cleanEmail = lowerEmail === SUPER_ADMIN_EMAIL.toLowerCase() ? '' : lowerEmail;
  let cleanId = rawId;
  if (
    !cleanId ||
    lowerId.includes('modelatech2026') ||
    lowerId.includes('sushovan') ||
    lowerId.includes('sushoovan')
  ) {
    cleanId = cleanEmail
      ? `emp-${generateRequestDocId(cleanEmail)}`
      : !isGenericName
      ? `emp-${lowerName.replace(/[^a-z0-9]+/g, '_')}`
      : `emp-${Date.now()}`;
  }

  return {
    ...emp,
    id: cleanId,
    email: cleanEmail,
  };
};

export const DELETED_ALLOCATIONS_STORAGE_KEY = 'bim_deleted_allocations_v1';

export const getDeletedAllocationIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DELETED_ALLOCATIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map((id) => String(id)));
      }
    }
  } catch {}
  return new Set<string>();
};

export const registerDeletedAllocationId = (id: string): void => {
  if (!id) return;
  try {
    const existing = getDeletedAllocationIds();
    existing.add(String(id));
    localStorage.setItem(DELETED_ALLOCATIONS_STORAGE_KEY, JSON.stringify(Array.from(existing)));
  } catch {}
};

export const mergeAllocationsWithLocal = (
  incomingList: ResourceAllocationItem[],
  currentList: ResourceAllocationItem[] = []
): ResourceAllocationItem[] => {
  const deletedIds = getDeletedAllocationIds();
  const mergedMap = new Map<string, ResourceAllocationItem>();

  const upsert = (item: ResourceAllocationItem) => {
    if (!item || !item.id) return;
    if (deletedIds.has(item.id)) return;
    if ((item as any).isDeleted === true) return;
    if (String(item.status || '').trim().toLowerCase() === 'deleted') return;
    if (isRemovedMockMember(item)) return;

    const existing = mergedMap.get(item.id);
    if (!existing) {
      mergedMap.set(item.id, item);
      return;
    }
    const existingTime = existing.updatedAt ? Date.parse(existing.updatedAt) : 0;
    const itemTime = item.updatedAt ? Date.parse(item.updatedAt) : 0;
    if (!existingTime || (itemTime && itemTime >= existingTime)) {
      mergedMap.set(item.id, { ...existing, ...item });
    }
  };

  try {
    const saved = localStorage.getItem('bim_resource_allocations_v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        parsed.forEach(upsert);
      }
    }
  } catch {}

  (currentList || []).forEach(upsert);
  (incomingList || []).forEach(upsert);

  return Array.from(mergedMap.values()).sort((a, b) => {
    const timeA = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const timeB = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    if (timeA !== timeB) return timeB - timeA;
    return String(b.id).localeCompare(String(a.id));
  });
};

export const sanitizeWorkLogRecord = (log: DailyWorkLog): DailyWorkLog => {
  const rawName = String(log.employeeName || '').trim();
  const lowerName = rawName.toLowerCase();
  const rawEmail = String(log.memberEmail || (log as any).userEmail || '')
    .trim()
    .toLowerCase();
  const rawEmpId = String(
    log.employeeId || (log as any).memberId || (log as any).userId || ''
  ).trim();
  const lowerEmpId = rawEmpId.toLowerCase();

  const isGenericName =
    !lowerName ||
    lowerName === 'bim modeler' ||
    lowerName === 'team member' ||
    lowerName === 'bim engineer';

  const isSushovan =
    lowerName.includes('sushovan') ||
    lowerName.includes('sushoovan') ||
    lowerName.includes('sushovon') ||
    rawEmail === 'sushoovandas@gmail.com' ||
    rawEmail === 'sushovandas@gmail.com' ||
    (isGenericName && (lowerEmpId.includes('sushovan') || lowerEmpId.includes('sushoovan') || lowerEmpId.includes('sushovon')));

  const isAditi =
    !isSushovan &&
    (lowerName === SUPER_ADMIN_NAME.toLowerCase() ||
      lowerName.includes('aditi chakraborty') ||
      lowerName === 'aditi' ||
      (isGenericName &&
        (rawEmail === SUPER_ADMIN_EMAIL.toLowerCase() ||
          lowerEmpId.includes('modelatech2026'))));

  const normalizedLogDate =
    normalizeDateToIso(log.date) ||
    normalizeDateToIso(log.timestamp) ||
    normalizeDateToIso((log as any).createdAt) ||
    log.date;

  if (isAditi) {
    return {
      ...log,
      date: normalizedLogDate,
      employeeId: 'emp-modelatech2026_gmail_com',
      memberId: 'emp-modelatech2026_gmail_com',
      userId: 'emp-modelatech2026_gmail_com',
      employeeName: SUPER_ADMIN_NAME,
      memberEmail: SUPER_ADMIN_EMAIL.toLowerCase(),
      userEmail: SUPER_ADMIN_EMAIL.toLowerCase(),
    };
  }

  if (isSushovan) {
    const cleanSushovanEmail =
      rawEmail && rawEmail !== SUPER_ADMIN_EMAIL.toLowerCase()
        ? rawEmail
        : 'sushoovandas@gmail.com';
    return {
      ...log,
      date: normalizedLogDate,
      employeeId: 'emp-sushoovan_das',
      memberId: 'emp-sushoovan_das',
      userId: 'emp-sushoovan_das',
      employeeName: !isGenericName ? rawName : 'Sushovan Das',
      memberEmail: cleanSushovanEmail,
      userEmail: cleanSushovanEmail,
    };
  }

  const cleanEmail = rawEmail === SUPER_ADMIN_EMAIL.toLowerCase() ? '' : rawEmail;
  let cleanEmpId = rawEmpId;
  if (
    !cleanEmpId ||
    lowerEmpId.includes('modelatech2026') ||
    lowerEmpId.includes('sushovan') ||
    lowerEmpId.includes('sushoovan')
  ) {
    cleanEmpId = cleanEmail
      ? `emp-${generateRequestDocId(cleanEmail)}`
      : !isGenericName
      ? `emp-${lowerName.replace(/[^a-z0-9]+/g, '_')}`
      : rawEmpId;
  }

  return {
    ...log,
    date: normalizedLogDate,
    employeeId: cleanEmpId,
    memberId: cleanEmpId,
    userId: cleanEmpId,
    memberEmail: cleanEmail,
    userEmail: cleanEmail,
  };
};

export const BimDataProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [projects, setProjects] = useState<BimProject[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return mergeWithMasterProjects(parsed);
        }
      }
    } catch {}
    return INITIAL_PROJECTS;
  });

  const [deletedMemberKeys, setDeletedMemberKeys] = useState<string[]>(() => {
    try {
      // Clear isolated local-storage deletion overrides so parallel Super Admin sessions never hide active roster members
      localStorage.removeItem(STORAGE_KEYS.DELETED_MEMBERS);
    } catch {}
    return [];
  });

  const deletedKeysSet = useMemo(() => new Set(deletedMemberKeys), [deletedMemberKeys]);
  const deletedKeysRef = React.useRef<Set<string>>(deletedKeysSet);
  useEffect(() => {
    deletedKeysRef.current = deletedKeysSet;
    try {
      localStorage.setItem(STORAGE_KEYS.DELETED_MEMBERS, JSON.stringify(deletedMemberKeys));
    } catch {}
  }, [deletedMemberKeys, deletedKeysSet]);

  const registerDeletedMemberKeys = React.useCallback(
    (params: { id?: string; email?: string; name?: string }) => {
      const keysToAdd: string[] = [];
      const rawId = (params.id || '').trim();
      const strippedId = rawId.replace(/^emp-/, '');
      const cleanEmail = (params.email || '').trim().toLowerCase();
      const detId = cleanEmail ? generateRequestDocId(cleanEmail) : '';
      const cleanName = (params.name || '').trim().toLowerCase();

      if (rawId) keysToAdd.push(rawId);
      if (strippedId) {
        keysToAdd.push(strippedId);
        keysToAdd.push(`emp-${strippedId}`);
      }
      if (cleanEmail) keysToAdd.push(cleanEmail);
      if (detId) {
        keysToAdd.push(detId);
        keysToAdd.push(`emp-${detId}`);
      }
      if (cleanName) keysToAdd.push(`name:${cleanName}`);

      const newKeys = keysToAdd.filter((k) => !deletedKeysRef.current.has(k));
      if (newKeys.length === 0) return;
      newKeys.forEach((k) => deletedKeysRef.current.add(k));
      setDeletedMemberKeys((prev) => Array.from(new Set([...prev, ...newKeys])));
    },
    []
  );

  const unregisterDeletedMemberKeys = React.useCallback(
    (params: { id?: string; email?: string; name?: string }) => {
      const keysToRemove = new Set<string>();
      const rawId = (params.id || '').trim();
      const strippedId = rawId.replace(/^emp-/, '');
      const cleanEmail = (params.email || '').trim().toLowerCase();
      const detId = cleanEmail ? generateRequestDocId(cleanEmail) : '';
      const cleanName = (params.name || '').trim().toLowerCase();

      if (rawId) keysToRemove.add(rawId);
      if (strippedId) {
        keysToRemove.add(strippedId);
        keysToRemove.add(`emp-${strippedId}`);
      }
      if (cleanEmail) keysToRemove.add(cleanEmail);
      if (detId) {
        keysToRemove.add(detId);
        keysToRemove.add(`emp-${detId}`);
      }
      if (cleanName) keysToRemove.add(`name:${cleanName}`);

      let hasExistingKey = false;
      keysToRemove.forEach((k) => {
        if (deletedKeysRef.current.has(k)) {
          hasExistingKey = true;
          deletedKeysRef.current.delete(k);
        }
      });
      if (!hasExistingKey) return;
      setDeletedMemberKeys((prev) => {
        const next = prev.filter((k) => !keysToRemove.has(k));
        return next.length === prev.length ? prev : next;
      });
    },
    []
  );

  const isMemberDeleted = React.useCallback(
    (item: {
      id?: string;
      employeeId?: string;
      memberId?: string;
      userId?: string;
      email?: string;
      memberEmail?: string;
      userEmail?: string;
      assignedToEmail?: string;
      name?: string;
      employeeName?: string;
      fullName?: string;
      status?: string;
      isDeleted?: boolean;
    }): boolean => {
      if (!item) return false;
      if (item.isDeleted) return true;
      if (isRemovedMockMember(item)) return true;
      const st = String(item.status || '').trim().toLowerCase();
      if (st === 'deleted' || st === 'suspended') return true;

      const activeSet = deletedKeysRef.current;
      const rawId = String(item.id || item.employeeId || item.memberId || item.userId || '').trim();
      const strippedId = rawId.replace(/^emp-/, '');
      const email = String(item.email || item.memberEmail || item.userEmail || item.assignedToEmail || '')
        .trim()
        .toLowerCase();
      if (email === 'modelatech2026@gmail.com') return false;
      const detEmailId = email ? generateRequestDocId(email) : '';
      const name = String(item.name || item.employeeName || item.fullName || '')
        .trim()
        .toLowerCase();

      if (rawId && (activeSet.has(rawId) || deletedKeysSet.has(rawId))) return true;
      if (strippedId && (activeSet.has(strippedId) || deletedKeysSet.has(strippedId))) return true;
      if (email && (activeSet.has(email) || deletedKeysSet.has(email))) return true;
      if (detEmailId && (activeSet.has(detEmailId) || deletedKeysSet.has(detEmailId))) return true;
      if (name && (activeSet.has(`name:${name}`) || deletedKeysSet.has(`name:${name}`))) return true;
      return false;
    },
    [deletedKeysSet]
  );

  const SUPER_ADMIN_EMPLOYEE_PROFILE: Employee = useMemo(
    () => ({
      id: 'emp-modelatech2026_gmail_com',
      name: SUPER_ADMIN_NAME,
      email: SUPER_ADMIN_EMAIL,
      role: 'SUPER_ADMIN',
      primaryDiscipline: 'BIM - ACS',
      discipline: 'BIM - ACS',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(SUPER_ADMIN_NAME)}`,
      weeklyCapacityHours: 40,
      experienceYears: 8,
      status: 'Active',
      activeProjectIds: ['proj-1'],
      skills: ['BIM - ACS', 'Revit 2026', 'Navisworks Manage', 'BIM Coordination'],
      phone: '+1 (555) 019-2834',
    }),
    []
  );

  const [employees, setEmployees] = useState<Employee[]>(() => {
    const defaultSuperAdmin: Employee = {
      id: 'emp-modelatech2026_gmail_com',
      name: SUPER_ADMIN_NAME,
      email: SUPER_ADMIN_EMAIL,
      role: 'SUPER_ADMIN',
      primaryDiscipline: 'BIM - ACS',
      discipline: 'BIM - ACS',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(SUPER_ADMIN_NAME)}`,
      weeklyCapacityHours: 40,
      experienceYears: 8,
      status: 'Active',
      activeProjectIds: ['proj-1'],
      skills: ['BIM - ACS', 'Revit 2026', 'Navisworks Manage', 'BIM Coordination'],
      phone: '+1 (555) 019-2834',
    };
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const filtered = parsed
            .filter((e) => {
              if (!e || e.isDeleted || String(e.status || '').toLowerCase() === 'deleted') return false;
              if (isRemovedMockMember(e)) return false;
              const email = (e.email || '').toLowerCase().trim();
              if (email === 'modelatech2026@gmail.com') return true;
              return email !== 'sushovan.das@bimworkspace.com' && email !== 'aditi@bimworkspace.com';
            })
            .map((e) => sanitizeEmployeeRecord(e));
          const hasSuperAdmin = filtered.some(
            (e) => (e.email || '').toLowerCase().trim() === 'modelatech2026@gmail.com'
          );
          return hasSuperAdmin ? filtered : [defaultSuperAdmin, ...filtered];
        }
      }
    } catch {}
    return [defaultSuperAdmin];
  });

  const [allWorkLogs, setAllWorkLogs] = useState<DailyWorkLog[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.WORK_LOGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((w) => !isRemovedMockMember(w))
            .map((w) => sanitizeWorkLogRecord(w));
        }
      }
    } catch {}
    return [];
  });

  const [resourceAllocations, setResourceAllocations] = useState<ResourceAllocationItem[]>(() => {
    try {
      const saved = localStorage.getItem('bim_resource_allocations_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((a) => !isRemovedMockMember(a));
        }
      }
    } catch {}
    return [];
  });

  const [disciplineAssignments, setDisciplineAssignments] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('bim_discipline_assignments_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch {}
    return {};
  });

  const [generatedReports, setGeneratedReports] = useState<
    GeneratedStakeholderReport[]
  >(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.REPORTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
      return [];
    } catch {
      return [];
    }
  });

  // Authentication and Onboarding state - Synchronized with Centralized AuthContext
  const auth = useOptionalAuth();

  const [localUser, setLocalUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.email) return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });

  const currentUser = auth ? auth.user : localUser;

  const setCurrentUser: React.Dispatch<React.SetStateAction<AuthUser | null>> = (
    userOrUpdater
  ) => {
    if (auth) {
      const nextUser =
        typeof userOrUpdater === 'function'
          ? (userOrUpdater as (prev: AuthUser | null) => AuthUser | null)(auth.user)
          : userOrUpdater;

      if (nextUser) {
        auth.updateCurrentUser(nextUser);
      } else {
        auth.logout();
      }
    } else {
      setLocalUser(userOrUpdater);
    }
  };

  const [onboardingRequests, setOnboardingRequests] = useState<OnboardingRequest[]>(() => {
    try {
      return mergeAccessRequestsWithLocal([], DEFAULT_ONBOARDING_REQUESTS);
    } catch {
      return DEFAULT_ONBOARDING_REQUESTS;
    }
  });

  // Global filtered, deduplicated, and role-synchronized active team members list used by all dropdowns, filters, and selectors
  const activeTeamMembers = useMemo(() => {
    const filtered = employees.filter(
      (member) =>
        !member.isDeleted &&
        member.status !== 'deleted' &&
        member.status !== 'Suspended' &&
        !isMemberDeleted(member)
    );
    const hasSuperAdmin = filtered.some(
      (m) =>
        (m.email || '').toLowerCase().trim() === 'modelatech2026@gmail.com' ||
        (m.name || '').toLowerCase().trim() === SUPER_ADMIN_NAME.toLowerCase()
    );
    const baseList = hasSuperAdmin ? filtered : [SUPER_ADMIN_EMPLOYEE_PROFILE, ...filtered];

    // Map latest synced roles from onboardingRequests (Admin Nexus Access Review) & deduplicate by normalized email / ID / name
    const reqRoleByEmail = new Map<string, UserRole>();
    const reqRoleByName = new Map<string, UserRole>();
    onboardingRequests.forEach((req) => {
      if (req.isDeleted || (req.status || '').toUpperCase() === 'REJECTED') return;
      const rEmail = (req.email || '').trim().toLowerCase();
      const rName = (req.fullName || req.name || '').trim().toLowerCase();
      const isSuperReq =
        isSuperAdminEmail(rEmail) || rName === SUPER_ADMIN_NAME.toLowerCase();
      const syncedRole = normalizeUserRole(req.assignedRole || req.role, isSuperReq);
      if (rEmail) {
        const prev = reqRoleByEmail.get(rEmail);
        if (!prev || syncedRole === 'SUPER_ADMIN') {
          reqRoleByEmail.set(rEmail, syncedRole);
        }
      }
      if (rName) {
        const prev = reqRoleByName.get(rName);
        if (!prev || syncedRole === 'SUPER_ADMIN') {
          reqRoleByName.set(rName, syncedRole);
        }
      }
    });

    const seenEmails = new Set<string>();
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const deduplicated: Employee[] = [];

    // Sort so Super Admin / canonical email records come first before deduplication
    const prioritized = [...baseList].sort((a, b) => {
      const aSuper =
        isSuperAdminEmail(a.email) ||
        (a.name || '').trim().toLowerCase() === SUPER_ADMIN_NAME.toLowerCase() ||
        String(a.role || '').toUpperCase() === 'SUPER_ADMIN';
      const bSuper =
        isSuperAdminEmail(b.email) ||
        (b.name || '').trim().toLowerCase() === SUPER_ADMIN_NAME.toLowerCase() ||
        String(b.role || '').toUpperCase() === 'SUPER_ADMIN';
      if (aSuper !== bSuper) return aSuper ? -1 : 1;
      const aCanonical = (a.email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
      const bCanonical = (b.email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
      if (aCanonical !== bCanonical) return aCanonical ? -1 : 1;
      return 0;
    });

    for (const rawMember of prioritized) {
      const member = sanitizeEmployeeRecord(rawMember);
      const cleanEmail = (member.email || '').trim().toLowerCase();
      const cleanName = (member.name || '').trim().toLowerCase();
      const normNameKey = cleanName.replace(/sushoovan/g, 'sushovan');
      const isAditi =
        !cleanName.includes('sushoovan') &&
        !cleanName.includes('sushovan') &&
        (cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase() ||
          cleanName === SUPER_ADMIN_NAME.toLowerCase());

      const normEmail = isAditi ? SUPER_ADMIN_EMAIL.toLowerCase() : cleanEmail;
      const normId = isAditi
        ? 'modelatech2026_gmail_com'
        : (member.id || '').trim().replace(/^emp-/, '').toLowerCase();
      const detId = normEmail ? generateRequestDocId(normEmail).toLowerCase() : '';

      if (
        (normEmail && seenEmails.has(normEmail)) ||
        (normId && seenIds.has(normId)) ||
        (detId && seenIds.has(detId)) ||
        (normNameKey && seenNames.has(normNameKey))
      ) {
        continue;
      }

      if (normEmail) seenEmails.add(normEmail);
      if (normId) seenIds.add(normId);
      if (detId) seenIds.add(detId);
      if (normNameKey) seenNames.add(normNameKey);

      const syncedRole: UserRole = isAditi
        ? 'SUPER_ADMIN'
        : (normEmail && reqRoleByEmail.get(normEmail)) ||
          (cleanName && reqRoleByName.get(cleanName)) ||
          normalizeUserRole(member.role || 'VIEWER', isSuperAdminEmail(normEmail));

      deduplicated.push({
        ...member,
        ...(isAditi
          ? {
              id: 'emp-modelatech2026_gmail_com',
              name: SUPER_ADMIN_NAME,
              email: SUPER_ADMIN_EMAIL,
            }
          : {}),
        role: syncedRole,
      });
    }

    return deduplicated;
  }, [employees, onboardingRequests, isMemberDeleted, SUPER_ADMIN_EMPLOYEE_PROFILE]);

  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return DEFAULT_AUDIT_LOGS;
    } catch {
      return DEFAULT_AUDIT_LOGS;
    }
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [currentTab, setCurrentTab] = useState<ViewTab>('dashboard');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');
  
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.THEME) as ThemeMode | null;
      if (saved === 'light' || saved === 'dark') return saved;
      return 'dark'; // Default dark mode
    } catch {
      return 'dark';
    }
  });

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Theme synchronization effect
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
    } catch (e) {
      console.error('Error saving theme', e);
    }
  }, [theme]);

  // Persistence effects
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
  }, [employees]);

  // Role-scoped workLogs view:
  // - Super Admins and Directors have global access to all organizational daily logs
  // - Other authenticated members access their own daily logs
  const workLogs = useMemo<DailyWorkLog[]>(() => {
    if (!currentUser) return [];
    if (isUserSuperAdmin(currentUser)) {
      return allWorkLogs;
    }
    return allWorkLogs.filter((l) => isRecordOwnedByMember(l, currentUser, employees));
  }, [allWorkLogs, currentUser, employees]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WORK_LOGS, JSON.stringify(allWorkLogs));
  }, [allWorkLogs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(generatedReports));
  }, [generatedReports]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
  }, [currentUser]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ONBOARDING, JSON.stringify(onboardingRequests));
    } catch {
      // ignore
    }
  }, [onboardingRequests]);

  // Synchronize Firestore access_requests collection into onboardingRequests in real-time
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    const formatFirestoreTimestamp = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'string') {
        if (val === 'SERVER_TIMESTAMP' || val === '[object Object]') return '';
        const parsed = new Date(val).getTime();
        return Number.isNaN(parsed) ? '' : val;
      }
      if (typeof val?.toDate === 'function') {
        try {
          return val.toDate().toISOString();
        } catch {
          return '';
        }
      }
      if (typeof val?.seconds === 'number') {
        return new Date(val.seconds * 1000).toISOString();
      }
      if (typeof val?._seconds === 'number') {
        return new Date(val._seconds * 1000).toISOString();
      }
      if (val instanceof Date) {
        return Number.isNaN(val.getTime()) ? '' : val.toISOString();
      }
      return '';
    };

    const isPendingStatus = (status?: string) => {
      if (!status) return true;
      if (status === 'pending') return true;
      const s = String(status).trim().toLowerCase();
      return s === 'pending' || s === 'pending_approval' || s.includes('pending');
    };

    const mapDocToRequest = (d: any): OnboardingRequest | null => {
      const data = typeof d.data === 'function' ? d.data({ serverTimestamps: 'estimate' }) : d;
      if (!data) return null;
      if (data.isDeleted || String(data.status || '').trim().toLowerCase() === 'deleted') return null;
      if (isRemovedMockMember({ ...data, id: d.id })) return null;
      const cleanEmail = String(data.email || data.userEmail || data.memberEmail || '').trim().toLowerCase();
      if (!cleanEmail) return null;
      if (
        !isPendingStatus(data.status) &&
        isMemberDeleted({
          id: d.id,
          email: cleanEmail,
          name: data.fullName || data.name,
          status: data.status,
          isDeleted: data.isDeleted,
        })
      ) {
        return null;
      }

      const fullName = String(data.fullName || data.name || cleanEmail.split('@')[0]).trim();
      const lowerFullName = fullName.toLowerCase();
      const isSushovan =
        lowerFullName.includes('sushovan') ||
        lowerFullName.includes('sushoovan') ||
        cleanEmail === 'sushoovandas@gmail.com' ||
        cleanEmail === 'sushovandas@gmail.com';
      const isAditiSuper =
        !isSushovan &&
        (cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase() ||
          lowerFullName === SUPER_ADMIN_NAME.toLowerCase());
      const effectiveEmail = isSushovan
        ? cleanEmail && cleanEmail !== SUPER_ADMIN_EMAIL.toLowerCase()
          ? cleanEmail
          : 'sushoovandas@gmail.com'
        : isAditiSuper
        ? cleanEmail || SUPER_ADMIN_EMAIL.toLowerCase()
        : cleanEmail;
      const isSuper = isAditiSuper || isSuperAdminEmail(effectiveEmail);
      const rawStatus = String(data.status || 'pending').trim().toLowerCase();
      const mappedStatus: UserApprovalStatus = isSuper
        ? 'APPROVED'
        : rawStatus === 'approved' || rawStatus === 'active'
        ? 'APPROVED'
        : rawStatus === 'rejected' || rawStatus === 'declined'
        ? 'REJECTED'
        : 'pending';

      const discipline = String(data.discipline || data.primaryDiscipline || data.organization || 'BIM - ACS');
      const reasonForAccess = String(
        data.reasonForAccess || data.accessReason || 'Sign-in Access Request for ProductionPulse BPMS'
      );
      const createdAt =
        formatFirestoreTimestamp(data.createdAt) ||
        formatFirestoreTimestamp(data.requestedAt) ||
        formatFirestoreTimestamp(data.timestamp) ||
        '1970-01-01T00:00:00.000Z';
      const updatedAt =
        formatFirestoreTimestamp(data.updatedAt) ||
        formatFirestoreTimestamp(data.reviewedAt) ||
        createdAt;

      const normalizedRole: UserRole = normalizeUserRole(
        data.assignedRole || data.role || data.appRole || data.requestedRole,
        isSuper
      );
      const calculatedAccessLevel: AccessLevel =
        (data.assignedAccessLevel as AccessLevel) || mapAppRoleToAccessLevel(normalizedRole);

      return {
        id: isSushovan ? 'sushoovan_das' : d.id || generateRequestDocId(effectiveEmail),
        googleId: isSushovan ? 'sushoovan_das' : data.uid || d.id || generateRequestDocId(effectiveEmail),
        email: effectiveEmail,
        name: isAditiSuper ? SUPER_ADMIN_NAME : fullName,
        fullName: isAditiSuper ? SUPER_ADMIN_NAME : fullName,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`,
        role: normalizedRole,
        requestedRole: data.requestedRole || mapAppRoleToDisplayRole(normalizedRole),
        assignedRole: normalizedRole,
        assignedAccessLevel: calculatedAccessLevel,
        primaryDiscipline: discipline,
        discipline: discipline,
        organization: data.organization || discipline,
        reasonForAccess: reasonForAccess,
        accessReason: reasonForAccess,
        createdAt: createdAt,
        requestedAt: createdAt,
        requestTimestamp: createdAt,
        timestamp: updatedAt,
        status: mappedStatus,
        reviewedBy: data.reviewedBy,
        reviewedAt: formatFirestoreTimestamp(data.reviewedAt) || undefined,
        notes: data.notes || 'Sign-in access request awaiting Super Admin review in Admin Nexus.',
      };
    };

    const deduplicateAndSortRequests = (rawList: OnboardingRequest[]): OnboardingRequest[] => {
      const byEmail = new Map<string, OnboardingRequest>();
      const rank = (s?: string) => {
        if (s === 'pending' || isPendingStatus(s)) return 3;
        const u = (s || '').toUpperCase();
        if (u === 'APPROVED' || u === 'ACTIVE') return 2;
        return 1;
      };

      // Deduplicate by email prioritizing SUPER_ADMIN first, then the strictly newest timestamp
      const sorted = [...rawList].sort((a, b) => {
        const aRoleSuper = a.assignedRole === 'SUPER_ADMIN' || normalizeUserRole(a.role) === 'SUPER_ADMIN';
        const bRoleSuper = b.assignedRole === 'SUPER_ADMIN' || normalizeUserRole(b.role) === 'SUPER_ADMIN';
        if (aRoleSuper !== bRoleSuper) return aRoleSuper ? -1 : 1;

        const tA = getRequestTimeMs(a);
        const tB = getRequestTimeMs(b);
        if (Math.abs(tB - tA) > 1000) {
          return tB - tA;
        }
        return rank(b.status) - rank(a.status);
      });

      const seenIds = new Set<string>();
      for (const req of sorted) {
        const key = (req.email || '').trim().toLowerCase();
        const idKey = String(req.id || '').trim().toLowerCase();
        if (!key) continue;
        if (!byEmail.has(key) && (!idKey || !seenIds.has(idKey))) {
          byEmail.set(key, req);
          if (idKey) seenIds.add(idKey);
        }
      }

      return Array.from(byEmail.values()).sort((a, b) => {
        const rA = rank(a.status);
        const rB = rank(b.status);
        if (rA !== rB) return rB - rA;
        return getRequestTimeMs(b) - getRequestTimeMs(a);
      });
    };

    try {
      const colRef = collection(db, 'access_requests');

      // Helper to synchronize access requests and role updates into active employees list
      const syncRequestsToEmployees = (reqList: OnboardingRequest[]) => {
        const activeReqs = reqList.filter(
          (r) =>
            !r.isDeleted &&
            !isMemberDeleted(r) &&
            (r.status || '').toUpperCase() !== 'REJECTED'
        );
        setEmployees((currentEmployees) => {
          let changed = false;
          const filteredCurrent = currentEmployees.filter(
            (e) => !e.isDeleted && e.status !== 'deleted' && !isMemberDeleted(e)
          );
          if (filteredCurrent.length !== currentEmployees.length) {
            changed = true;
          }
          const updated = [...filteredCurrent];
          activeReqs.forEach((req) => {
            const rawEmail = (req.email || '').toLowerCase().trim();
            if (!rawEmail || isMemberDeleted(req)) return;
            const name = (req.fullName || req.name || rawEmail.split('@')[0]).trim();
            const lowerReqName = name.toLowerCase();
            const isSushovan =
              lowerReqName.includes('sushovan') ||
              lowerReqName.includes('sushoovan') ||
              rawEmail === 'sushoovandas@gmail.com' ||
              rawEmail === 'sushovandas@gmail.com';
            const isAditiSuper =
              !isSushovan &&
              (rawEmail === SUPER_ADMIN_EMAIL.toLowerCase() ||
                lowerReqName === SUPER_ADMIN_NAME.toLowerCase());
            const email = isSushovan
              ? rawEmail !== SUPER_ADMIN_EMAIL.toLowerCase()
                ? rawEmail
                : 'sushoovandas@gmail.com'
              : isAditiSuper
              ? SUPER_ADMIN_EMAIL.toLowerCase()
              : rawEmail;
            const isSuper =
              isAditiSuper ||
              isSuperAdminEmail(email) ||
              req.assignedRole === 'SUPER_ADMIN';
            const isApproved =
              isSuper ||
              (req.status || '').toUpperCase() === 'APPROVED' ||
              (req.status || '').toLowerCase() === 'approved';
            const disc = ((req.discipline || req.primaryDiscipline || 'BIM - ACS') as Discipline);
            const role: UserRole = normalizeUserRole(req.assignedRole || req.role || 'EDITOR', isSuper);
            const targetEmpId = isAditiSuper
              ? 'emp-modelatech2026_gmail_com'
              : isSushovan
              ? 'emp-sushoovan_das'
              : `emp-${req.id || generateRequestDocId(email)}`;

            const idx = updated.findIndex(
              (e) =>
                e.id === targetEmpId ||
                (email && (e.email || '').toLowerCase().trim() === email) ||
                (name && (e.name || '').toLowerCase().trim() === lowerReqName)
            );

            if (idx === -1 && isApproved) {
              changed = true;
              updated.push(
                sanitizeEmployeeRecord({
                  id: targetEmpId,
                  name: isAditiSuper ? SUPER_ADMIN_NAME : name,
                  email: isAditiSuper ? SUPER_ADMIN_EMAIL : email,
                  role,
                  primaryDiscipline: disc,
                  discipline: disc,
                  avatar: req.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
                  weeklyCapacityHours: 40,
                  experienceYears: 4,
                  status: 'Active',
                  activeProjectIds: [projects[0]?.id || 'proj-1'],
                  skills: [disc, 'Revit 2026', 'Navisworks Manage', 'BIM Coordination'],
                  phone: '+1 (555) 019-2834',
                })
              );
            } else if (idx !== -1) {
              const roleChanged = updated[idx].role !== role;
              const discChanged = Boolean(
                disc &&
                  (updated[idx].discipline !== disc || updated[idx].primaryDiscipline !== disc)
              );
              if (roleChanged || discChanged) {
                changed = true;
                updated[idx] = sanitizeEmployeeRecord({
                  ...updated[idx],
                  ...(roleChanged ? { role } : {}),
                  ...(discChanged ? { discipline: disc, primaryDiscipline: disc } : {}),
                });
              }
            }
          });
          return changed ? updated.map((e) => sanitizeEmployeeRecord(e)) : currentEmployees;
        });
      };

      // Multi-collection real-time listener on access_requests, accessRequests, pendingUsers, and pendingSignups + SSE stream
      const collectionsToListen = ['access_requests', 'accessRequests', 'pendingUsers', 'pendingSignups'];
      const docsByCollection = new Map<string, Map<string, any>>();
      collectionsToListen.forEach((col) => docsByCollection.set(col, new Map()));
      docsByCollection.set('server_sse', new Map());
      let syncScheduled = false;
      let listenerActive = true;
      unsubs.push(() => {
        listenerActive = false;
      });

      const syncAllRequests = () => {
        syncScheduled = false;
        const allRaw: any[] = [];
        docsByCollection.forEach((colMap) => {
          colMap.forEach((docData) => allRaw.push(docData));
        });
        const rawList = allRaw.map(mapDocToRequest).filter(Boolean) as OnboardingRequest[];
        const list = deduplicateAndSortRequests(rawList);
        let latestMerged: OnboardingRequest[] | null = null;

        setOnboardingRequests((prev) => {
          const merged = deduplicateAndSortRequests(mergeAccessRequestsWithLocal(list, prev));
          latestMerged = merged;
          if (
            prev.length === merged.length &&
            prev.every(
              (item, idx) =>
                item.id === merged[idx]?.id &&
                item.email === merged[idx]?.email &&
                item.name === merged[idx]?.name &&
                item.status === merged[idx]?.status &&
                item.assignedRole === merged[idx]?.assignedRole &&
                item.createdAt === merged[idx]?.createdAt &&
                item.timestamp === merged[idx]?.timestamp
            )
          ) {
            return prev;
          }
          return merged;
        });

        if (latestMerged) {
          syncRequestsToEmployees(latestMerged);
        }
      };

      const scheduleSyncAllRequests = () => {
        if (syncScheduled) return;
        syncScheduled = true;
        queueMicrotask(syncAllRequests);
      };

      const subscribeCollectionWithRetry = (colName: string) => {
        if (!listenerActive) return;
        try {
          const u = onSnapshot(
            collection(db, colName),
            (snapshot) => {
              const colMap = docsByCollection.get(colName) || new Map();
              snapshot.docChanges().forEach((change) => {
                const cData = change.doc.data();
                if (
                  change.type === 'removed' ||
                  cData?.isDeleted ||
                  String(cData?.status || '').toLowerCase() === 'deleted'
                ) {
                  colMap.delete(change.doc.id);
                  const remEmail = String(cData?.email || cData?.userEmail || '').trim().toLowerCase();
                  const remName = String(cData?.fullName || cData?.name || '').trim();
                  registerDeletedMemberKeys({
                    id: change.doc.id,
                    email: remEmail,
                    name: remName,
                  });
                  setEmployees((prev) =>
                    prev.filter(
                      (e) =>
                        e.id !== change.doc.id &&
                        e.id !== `emp-${change.doc.id}` &&
                        (!remEmail || (e.email || '').toLowerCase().trim() !== remEmail) &&
                        (!remName || (e.name || '').toLowerCase().trim() !== remName.toLowerCase())
                    )
                  );
                } else {
                  colMap.set(change.doc.id, change.doc);
                }
              });
              snapshot.docs.forEach((d) => {
                colMap.set(d.id, d);
              });
              docsByCollection.set(colName, colMap);
              scheduleSyncAllRequests();
            },
            (err) => {
              console.warn(`[BimDataContext] Firestore ${colName} listener diagnostic:`, err?.message);
              if (listenerActive) {
                const retryTimer = setTimeout(() => subscribeCollectionWithRetry(colName), 2500);
                unsubs.push(() => clearTimeout(retryTimer));
              }
            }
          );
          if (u) unsubs.push(u);
        } catch (e) {
          console.warn(`[BimDataContext] Failed to attach listener for ${colName}:`, e);
        }
      };

      collectionsToListen.forEach((colName) => subscribeCollectionWithRetry(colName));

      // Active getDocs() + backend API polling & window focus re-hydration fallback
      const pollRemoteAndFirestore = async () => {
        if (!listenerActive) return;
        try {
          const [firestoreSnaps, apiData] = await Promise.all([
            Promise.allSettled(
              collectionsToListen.map((colName) => getDocs(collection(db, colName)))
            ),
            fetch(`/api/access-requests?_t=${Date.now()}`, { cache: 'no-store' })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ]);

          if (!listenerActive) return;

          firestoreSnaps.forEach((res, idx) => {
            const colName = collectionsToListen[idx];
            if (res.status === 'fulfilled' && res.value?.docs) {
              const colMap = docsByCollection.get(colName) || new Map();
              res.value.docs.forEach((d) => {
                const cData = d.data();
                if (!cData?.isDeleted && String(cData?.status || '').toLowerCase() !== 'deleted') {
                  colMap.set(d.id, d);
                }
              });
              docsByCollection.set(colName, colMap);
            }
          });

          if (Array.isArray(apiData?.requests)) {
            const sseMap = docsByCollection.get('server_sse') || new Map();
            apiData.requests.forEach((req: any) => {
              const docKey = req?.id || req?.uid || req?.email;
              if (docKey) {
                sseMap.set(docKey, {
                  id: docKey,
                  data: () => ({ ...req }),
                  ...req,
                });
              }
            });
            docsByCollection.set('server_sse', sseMap);
          }

          invalidateAccessRequestsCache();
          syncAllRequests();
        } catch {}
      };

      pollRemoteAndFirestore();
      const contextPollTimer = setInterval(pollRemoteAndFirestore, 3500);
      unsubs.push(() => clearInterval(contextPollTimer));

      const handleWindowFocusSync = () => {
        if (!listenerActive) return;
        pollRemoteAndFirestore();
      };
      window.addEventListener('focus', handleWindowFocusSync);
      unsubs.push(() => window.removeEventListener('focus', handleWindowFocusSync));

      // Subscribe to backend SSE stream and initial fetch for zero-latency cross-session sync
      if (typeof EventSource !== 'undefined') {
        try {
          const sse = new EventSource('/api/access-requests/stream');
          sse.onmessage = (ev) => {
            try {
              const payload = JSON.parse(ev.data);
              const sseMap = docsByCollection.get('server_sse') || new Map();
              if (payload?.type === 'INIT_REQUESTS' && Array.isArray(payload.requests)) {
                payload.requests.forEach((req: any) => {
                  const docKey = req?.id || req?.uid || req?.email;
                  if (docKey) {
                    sseMap.set(docKey, {
                      id: docKey,
                      data: () => ({ ...req }),
                      ...req,
                    });
                  }
                });
                docsByCollection.set('server_sse', sseMap);
                syncAllRequests();
              } else if (payload?.type === 'UPSERT_REQUEST' && payload?.request) {
                const req = payload.request;
                const docKey = req?.id || req?.uid || req?.email || `req_${Date.now()}`;
                sseMap.set(docKey, {
                  id: docKey,
                  data: () => ({ ...req }),
                  ...req,
                });
                docsByCollection.set('server_sse', sseMap);
                syncAllRequests();
              } else if (payload?.type === 'DELETE_REQUEST') {
                const delId = String(payload.id || '').toLowerCase();
                const delEmail = String(payload.email || '').toLowerCase();
                sseMap.forEach((val, key) => {
                  const vEmail = String(val?.email || '').toLowerCase();
                  if (key.toLowerCase() === delId || (delEmail && vEmail === delEmail)) {
                    sseMap.delete(key);
                  }
                });
                docsByCollection.set('server_sse', sseMap);
                syncAllRequests();
              }
            } catch {}
          };
          unsubs.push(() => sse.close());
        } catch {}
      }

      const handleCustomSubmit = (e: Event) => {
        const detail = (e as CustomEvent)?.detail;
        if (detail) {
          const colMap = docsByCollection.get('access_requests') || new Map();
          const docKey = detail.id || detail.uid || `req_${Date.now()}`;
          colMap.set(docKey, {
            id: docKey,
            data: () => ({ ...detail }),
            ...detail,
          });
          docsByCollection.set('access_requests', colMap);
          syncAllRequests();
        }
      };
      window.addEventListener('bim_access_request_submitted', handleCustomSubmit);
      unsubs.push(() => window.removeEventListener('bim_access_request_submitted', handleCustomSubmit));

      const handleStorageEvent = (e: StorageEvent) => {
        if (
          e.key === PENDING_ACCESS_REQUESTS_KEY ||
          e.key === STORAGE_KEYS.ONBOARDING ||
          e.key === DELETED_ACCESS_REQUESTS_KEY
        ) {
          syncAllRequests();
        }
      };
      window.addEventListener('storage', handleStorageEvent);
      unsubs.push(() => window.removeEventListener('storage', handleStorageEvent));

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel(ACCESS_REQUESTS_CHANNEL);
          bc.onmessage = (event) => {
            if (event.data?.type === 'UPSERT_REQUEST' && event.data?.request) {
              const req = event.data.request;
              const colMap = docsByCollection.get('access_requests') || new Map();
              const docKey = req.id || `req_${Date.now()}`;
              colMap.set(docKey, {
                id: docKey,
                data: () => ({ ...req }),
                ...req,
              });
              docsByCollection.set('access_requests', colMap);
              syncAllRequests();
            } else if (event.data?.type === 'DELETE_REQUEST') {
              syncAllRequests();
            }
          };
          unsubs.push(() => bc.close());
        } catch {}
      }
    } catch (e) {
      console.warn('Firestore onSnapshot listener error:', e);
    }

    return () => {
      unsubs.forEach((unsub) => {
        try {
          unsub();
        } catch {}
      });
    };
  }, []);

  // Synchronize role changes from onboardingRequests state and real-time 'bim_user_role_synced' events into employees immediately
  useEffect(() => {
    const handleRoleSyncedEvent = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (!detail || !detail.email) return;
      const cleanEmail = String(detail.email).trim().toLowerCase();
      const cleanName = String(detail.name || '').trim().toLowerCase();
      const isSuper =
        isSuperAdminEmail(cleanEmail) ||
        cleanName === SUPER_ADMIN_NAME.toLowerCase() ||
        detail.role === 'SUPER_ADMIN';
      const syncedRole: UserRole = normalizeUserRole(detail.role, isSuper);
      const syncedAccessLevel: AccessLevel =
        detail.accessLevel || mapAppRoleToAccessLevel(syncedRole);

      setOnboardingRequests((prev) =>
        prev.map((r) => {
          const rEmail = (r.email || '').trim().toLowerCase();
          const rName = (r.fullName || r.name || '').trim().toLowerCase();
          if (rEmail === cleanEmail || (cleanName && rName === cleanName)) {
            return {
              ...r,
              role: syncedRole,
              assignedRole: syncedRole,
              assignedAccessLevel: syncedAccessLevel,
              ...(detail.discipline
                ? { discipline: detail.discipline, primaryDiscipline: detail.discipline }
                : {}),
            };
          }
          return r;
        })
      );

      setEmployees((prev) =>
        prev.map((emp) => {
          const eEmail = (emp.email || '').trim().toLowerCase();
          const eName = (emp.name || '').trim().toLowerCase();
          const eIdStripped = (emp.id || '').replace(/^emp-/, '');
          if (
            eEmail === cleanEmail ||
            (detail.deterministicId && eIdStripped === detail.deterministicId) ||
            (detail.uid && eIdStripped === String(detail.uid).replace(/^emp-/, '')) ||
            (cleanName && eName === cleanName)
          ) {
            return {
              ...emp,
              role: syncedRole,
              ...(detail.discipline
                ? { discipline: detail.discipline, primaryDiscipline: detail.discipline }
                : {}),
            };
          }
          return emp;
        })
      );
    };

    window.addEventListener('bim_user_role_synced', handleRoleSyncedEvent);
    return () => {
      window.removeEventListener('bim_user_role_synced', handleRoleSyncedEvent);
    };
  }, []);

  // Real-time onSnapshot listener on Firestore 'users' & 'team_members' collections + SSOT SSE/Polling
  useEffect(() => {
    let unsubUsers: (() => void) | undefined;
    let unsubTeamMembers: (() => void) | undefined;

    const usersDocsMap = new Map<string, any>();
    const teamMembersDocsMap = new Map<string, any>();
    const ssotMembersMap = new Map<string, any>();

    const syncAllRosterDocs = () => {
      const combinedDocs: Array<{ docId: string; data: any }> = [];
      usersDocsMap.forEach((data, docId) => combinedDocs.push({ docId, data }));
      teamMembersDocsMap.forEach((data, docId) => combinedDocs.push({ docId, data }));
      ssotMembersMap.forEach((data, docId) => combinedDocs.push({ docId, data }));

      const activeUserDocs = combinedDocs.filter(({ docId, data }) => {
        if (!data || data.isDeleted === true || String(data.status || '').toLowerCase() === 'deleted') {
          return false;
        }
        if (isRemovedMockMember({ ...data, id: data.id || docId })) {
          deleteDoc(doc(db, 'users', docId)).catch(() => {});
          deleteDoc(doc(db, 'team_members', docId)).catch(() => {});
          return false;
        }
        const email = String(data.email || data.userEmail || '').trim().toLowerCase();
        if (email === 'sushovan.das@bimworkspace.com' || email === 'aditi@bimworkspace.com') {
          return false;
        }
        const statusUpper = String(data.status || '').trim().toUpperCase();
        if (statusUpper === 'REJECTED') {
          return false;
        }
        const rawName = String(data.fullName || data.name || '').trim();
        unregisterDeletedMemberKeys({
          id: data.id || docId,
          email,
          name: rawName,
        });
        return true;
      });

      if (activeUserDocs.length > 0) {
        const sortedUserDocs = [...activeUserDocs].sort((a, b) => {
          const aRole = normalizeUserRole(
            a.data.assignedRole || a.data.appRole || a.data.role,
            isSuperAdminEmail(a.data.email)
          );
          const bRole = normalizeUserRole(
            b.data.assignedRole || b.data.appRole || b.data.role,
            isSuperAdminEmail(b.data.email)
          );
          if ((aRole === 'SUPER_ADMIN') !== (bRole === 'SUPER_ADMIN')) {
            return aRole === 'SUPER_ADMIN' ? -1 : 1;
          }
          const aTime = new Date(a.data.updatedAt || a.data.createdAt || 0).getTime() || 0;
          const bTime = new Date(b.data.updatedAt || b.data.createdAt || 0).getTime() || 0;
          return bTime - aTime;
        });

        const dedupedUserDocs: Array<{ docId: string; data: any }> = [];
        const seenUserKeys = new Set<string>();
        for (const item of sortedUserDocs) {
          const rawEmail = String(item.data.email || item.data.userEmail || '').trim().toLowerCase();
          const name = String(item.data.fullName || item.data.name || '').trim().toLowerCase();
          const isSushovan =
            name.includes('sushovan') ||
            name.includes('sushoovan') ||
            name.includes('sushovon') ||
            rawEmail === 'sushoovandas@gmail.com' ||
            rawEmail === 'sushovandas@gmail.com';
          const isAditi =
            !isSushovan &&
            (rawEmail === SUPER_ADMIN_EMAIL.toLowerCase() ||
              name === SUPER_ADMIN_NAME.toLowerCase());
          const keyEmail = isSushovan
            ? 'sushoovandas@gmail.com'
            : isAditi
            ? SUPER_ADMIN_EMAIL.toLowerCase()
            : rawEmail;
          const keyName = isSushovan
            ? 'sushovan das'
            : isAditi
            ? SUPER_ADMIN_NAME.toLowerCase()
            : name;
          if ((keyEmail && seenUserKeys.has(keyEmail)) || (keyName && seenUserKeys.has(`name:${keyName}`))) {
            continue;
          }
          if (keyEmail) seenUserKeys.add(keyEmail);
          if (keyName) seenUserKeys.add(`name:${keyName}`);
          dedupedUserDocs.push(item);
        }

        setEmployees((currentEmployees) => {
          let changed = false;
          const filteredBase = currentEmployees.filter((e) => !isRemovedMockMember(e) && !isMemberDeleted(e));
          if (filteredBase.length !== currentEmployees.length) {
            changed = true;
          }
          const updated = filteredBase.map((e) => sanitizeEmployeeRecord(e));

          dedupedUserDocs.forEach(({ docId, data }) => {
            const rawEmail = String(data.email || data.userEmail || '').trim().toLowerCase();
            const name = String(
              data.fullName || data.name || (rawEmail ? rawEmail.split('@')[0] : '')
            ).trim();
            if (!name && !rawEmail) return;

            const lowerDocName = name.toLowerCase();
            const isSushovan =
              lowerDocName.includes('sushovan') ||
              lowerDocName.includes('sushoovan') ||
              lowerDocName.includes('sushovon') ||
              rawEmail === 'sushoovandas@gmail.com' ||
              rawEmail === 'sushovandas@gmail.com';
            const isAditiSuper =
              !isSushovan &&
              (rawEmail === SUPER_ADMIN_EMAIL.toLowerCase() ||
                lowerDocName === SUPER_ADMIN_NAME.toLowerCase());
            const email = isSushovan
              ? rawEmail && rawEmail !== SUPER_ADMIN_EMAIL.toLowerCase()
                ? rawEmail
                : 'sushoovandas@gmail.com'
              : isAditiSuper
              ? SUPER_ADMIN_EMAIL
              : rawEmail;
            const empId = isAditiSuper
              ? 'emp-modelatech2026_gmail_com'
              : isSushovan
              ? 'emp-sushoovan_das'
              : String(data.id || (docId.startsWith('emp-') ? docId : `emp-${docId}`)).trim();
            const disc = ((data.discipline || data.primaryDiscipline || 'BIM - ACS') as Discipline);
            const resolvedRole: UserRole = isAditiSuper
              ? 'SUPER_ADMIN'
              : normalizeUserRole(
                  data.assignedRole || data.appRole || data.role || 'VIEWER',
                  isSuperAdminEmail(email)
                );

            const sanitizedCandidate = sanitizeEmployeeRecord({
              id: empId,
              name: isAditiSuper ? SUPER_ADMIN_NAME : name,
              email,
              role: resolvedRole,
              primaryDiscipline: disc,
              discipline: disc,
              avatar:
                data.avatar ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                  isAditiSuper ? SUPER_ADMIN_NAME : name
                )}`,
              weeklyCapacityHours: Number(data.weeklyCapacityHours) || 40,
              experienceYears: Number(data.experienceYears) || 4,
              status: 'Active',
              activeProjectIds: Array.isArray(data.activeProjectIds)
                ? data.activeProjectIds
                : ['proj-1'],
              skills: [disc, 'Revit 2026', 'Navisworks Manage', 'BIM Coordination'],
              phone: data.phone || '+1 (555) 019-2834',
            });

            const idx = updated.findIndex(
              (e) =>
                e.id === sanitizedCandidate.id ||
                (sanitizedCandidate.email &&
                  (e.email || '').toLowerCase().trim() ===
                    sanitizedCandidate.email.toLowerCase().trim()) ||
                (sanitizedCandidate.name &&
                  (e.name || '').toLowerCase().trim() ===
                    sanitizedCandidate.name.toLowerCase().trim())
            );

            if (idx === -1) {
              changed = true;
              updated.push(sanitizedCandidate);
            } else {
              const currentEmp = updated[idx];
              const nextName = sanitizedCandidate.name || currentEmp.name;
              const nextRole = sanitizedCandidate.role || currentEmp.role;
              const nextId = sanitizedCandidate.id || currentEmp.id;
              const nextEmail = sanitizedCandidate.email || currentEmp.email;
              const nextDisc = sanitizedCandidate.discipline || currentEmp.discipline;
              if (
                currentEmp.name !== nextName ||
                currentEmp.role !== nextRole ||
                currentEmp.id !== nextId ||
                currentEmp.email !== nextEmail ||
                currentEmp.discipline !== nextDisc
              ) {
                changed = true;
                updated[idx] = {
                  ...currentEmp,
                  id: nextId,
                  name: nextName,
                  email: nextEmail,
                  role: nextRole,
                  discipline: nextDisc,
                  primaryDiscipline: nextDisc,
                };
              }
            }
          });

          return changed ? updated : currentEmployees;
        });
      }
    };

    const handleSnapshotRemoval = (snapshot: any, change: any) => {
      const data = change.doc.data() || {};
      const email = String(data.email || data.userEmail || '').trim().toLowerCase();
      if (email === 'modelatech2026@gmail.com') return;
      const name = String(data.fullName || data.name || '').trim();
      const docId = change.doc.id;
      const empId = String(data.id || data.assignedTo || `emp-${docId}`).trim();

      if (
        change.type === 'removed' ||
        data.isDeleted === true ||
        String(data.status || '').toLowerCase() === 'deleted'
      ) {
        const normName = name.toLowerCase().replace(/abhinandn/g, 'abhinandan').replace(/sushoovan|sushovon/g, 'sushovan');
        const normEmail = email.replace(/^abhinandnb@/, 'abhinandanb@').replace(/^sushovandas@/, 'sushoovandas@');
        const hasOtherActiveDoc = snapshot.docs.some((otherDoc: any) => {
          if (otherDoc.id === docId) return false;
          const oData = otherDoc.data() || {};
          if (oData.isDeleted === true || String(oData.status || '').toLowerCase() === 'deleted') {
            return false;
          }
          const oEmail = String(oData.email || oData.userEmail || '')
            .trim()
            .toLowerCase()
            .replace(/^abhinandnb@/, 'abhinandanb@')
            .replace(/^sushovandas@/, 'sushoovandas@');
          const oName = String(oData.fullName || oData.name || '')
            .trim()
            .toLowerCase()
            .replace(/abhinandn/g, 'abhinandan')
            .replace(/sushoovan|sushovon/g, 'sushovan');
          return (normEmail && oEmail === normEmail) || (normName && oName === normName);
        });

        if (!hasOtherActiveDoc) {
          registerDeletedMemberKeys({ id: empId || docId, email, name });
          setEmployees((prev) =>
            prev.filter(
              (e) =>
                e.id !== docId &&
                e.id !== empId &&
                e.id.replace(/^emp-/, '') !== docId.replace(/^emp-/, '') &&
                (!email || (e.email || '').toLowerCase().trim() !== email) &&
                (!name || (e.name || '').toLowerCase().trim() !== name.toLowerCase())
            )
          );
        }
      }
    };

    try {
      unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snapshot) => {
          snapshot.docChanges().forEach((change) => handleSnapshotRemoval(snapshot, change));
          usersDocsMap.clear();
          snapshot.docs.forEach((d) => usersDocsMap.set(d.id, d.data() || {}));
          syncAllRosterDocs();
        },
        (err) => console.warn('Firestore users listener notice:', err)
      );

      unsubTeamMembers = onSnapshot(
        collection(db, 'team_members'),
        (snapshot) => {
          snapshot.docChanges().forEach((change) => handleSnapshotRemoval(snapshot, change));
          teamMembersDocsMap.clear();
          snapshot.docs.forEach((d) => teamMembersDocsMap.set(d.id, d.data() || {}));
          syncAllRosterDocs();
        },
        (err) => console.warn('Firestore team_members listener notice:', err)
      );
    } catch (e) {
      console.warn('Firestore users/team_members setup notice:', e);
    }

    return () => {
      if (unsubUsers) unsubUsers();
      if (unsubTeamMembers) unsubTeamMembers();
    };
  }, [registerDeletedMemberKeys, unregisterDeletedMemberKeys]);

  // Real-time onSnapshot listener on Firestore 'disciplines' collection to hydrate assignment dropdowns
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onSnapshot(
        collection(db, 'disciplines'),
        (snapshot) => {
          const nextMap: Record<string, string> = {};
          snapshot.docs.forEach((d) => {
            const data = d.data();
            const assignedTo = String(
              data.assignedTo || data.assignedMemberId || data.employeeId || ''
            ).trim();
            const discKey = String(data.discipline || data.disciplineKey || d.id).trim();
            const projId = String(data.projectId || '').trim();
            if (assignedTo) {
              nextMap[d.id] = assignedTo;
              if (discKey) {
                nextMap[discKey] = assignedTo;
              }
              if (projId && discKey) {
                nextMap[`${projId}__${discKey}`] = assignedTo;
              }
            }
          });
          setDisciplineAssignments((prev) => {
            const merged = { ...prev, ...nextMap };
            try {
              localStorage.setItem('bim_discipline_assignments_v1', JSON.stringify(merged));
            } catch {}
            return merged;
          });
        },
        (err) => {
          console.warn('Firestore disciplines onSnapshot notice:', err);
        }
      );
    } catch (e) {
      console.warn('Firestore disciplines listener setup notice:', e);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Synchronize Firestore projects collection into state in real-time via onSnapshot
  const hasSeededProjectsRef = React.useRef(false);
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      const colRef = collection(db, 'projects');
      unsubscribe = onSnapshot(
        colRef,
        (snapshot) => {
          const firestoreDocsMap = new Map<string, Partial<BimProject> & { _createdAtMs?: number }>();
          snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const resolvedName = data.name || data.projectName;
            const resolvedEstHours =
              data.manualEstimatedHoursOverride !== undefined
                ? Number(data.manualEstimatedHoursOverride)
                : data.estimatedHours !== undefined
                ? Number(data.estimatedHours)
                : data.totalEstimatedHours !== undefined
                ? Number(data.totalEstimatedHours)
                : undefined;
            const resolvedChangedHours =
              data.manualChangedHoursOverride !== undefined
                ? Number(data.manualChangedHoursOverride)
                : data.changedHours !== undefined
                ? Number(data.changedHours)
                : data.additionalHours !== undefined
                ? Number(data.additionalHours)
                : undefined;
            const isExplicitLoggedOverride = Boolean(data.isManualLoggedOverride === true);
            const resolvedLoggedHours =
              isExplicitLoggedOverride && data.manualHoursOverride !== undefined
                ? Number(data.manualHoursOverride)
                : data.totalLogged !== undefined
                ? Number(data.totalLogged)
                : data.totalCompletedHours !== undefined
                ? Number(data.totalCompletedHours)
                : data.totalHoursLogged !== undefined
                ? Number(data.totalHoursLogged)
                : undefined;
            const resolvedPlannedDate = data.plannedDeliveryDate || data.targetCompletionDate;
            let createdAtMs = 0;
            if (data.createdAt) {
              if (typeof data.createdAt?.toMillis === 'function') {
                createdAtMs = data.createdAt.toMillis();
              } else if (typeof data.createdAt?.seconds === 'number') {
                createdAtMs = data.createdAt.seconds * 1000;
              } else {
                const parsed = new Date(data.createdAt).getTime();
                if (!Number.isNaN(parsed)) createdAtMs = parsed;
              }
            }

            firestoreDocsMap.set(docSnap.id, {
              id: docSnap.id,
              _createdAtMs: createdAtMs,
              ...(data.code !== undefined ? { code: data.code } : {}),
              ...(resolvedName !== undefined ? { name: resolvedName } : {}),
              ...(data.clientName !== undefined ? { clientName: data.clientName } : {}),
              ...(data.buildingType !== undefined ? { buildingType: data.buildingType } : {}),
              ...(data.location !== undefined ? { location: data.location } : {}),
              ...(data.grossFloorAreaSqm !== undefined ? { grossFloorAreaSqm: Number(data.grossFloorAreaSqm) } : {}),
              ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
              ...(resolvedPlannedDate !== undefined
                ? {
                    targetCompletionDate: data.targetCompletionDate || resolvedPlannedDate,
                    plannedDeliveryDate: resolvedPlannedDate,
                  }
                : {}),
              ...(data.actualDeliveredDate !== undefined ? { actualDeliveredDate: data.actualDeliveredDate } : {}),
              ...(data.status !== undefined ? { status: data.status } : {}),
              ...(resolvedEstHours !== undefined
                ? {
                    totalEstimatedHours: resolvedEstHours,
                    estimatedHours: resolvedEstHours,
                  }
                : {}),
              ...(data.manualEstimatedHoursOverride !== undefined
                ? { manualEstimatedHoursOverride: Number(data.manualEstimatedHoursOverride) }
                : {}),
              ...(resolvedChangedHours !== undefined
                ? {
                    changedHours: resolvedChangedHours,
                    additionalHours: resolvedChangedHours,
                    manualChangedHoursOverride: resolvedChangedHours,
                  }
                : {}),
              ...(resolvedLoggedHours !== undefined
                ? {
                    totalCompletedHours: resolvedLoggedHours,
                    totalLogged: resolvedLoggedHours,
                  }
                : {}),
              ...(isExplicitLoggedOverride && data.manualHoursOverride !== undefined
                ? {
                    isManualLoggedOverride: true,
                    manualHoursOverride: Number(data.manualHoursOverride),
                  }
                : {}),
              ...(data.manualHoursBaseLogged !== undefined ? { manualHoursBaseLogged: Number(data.manualHoursBaseLogged) } : {}),
              ...(data.currentLOD !== undefined ? { currentLOD: data.currentLOD } : {}),
              ...(data.targetLOD !== undefined ? { targetLOD: data.targetLOD } : {}),
              ...(data.budgetAmount !== undefined ? { budgetAmount: Number(data.budgetAmount) } : {}),
              ...(data.disciplines !== undefined ? { disciplines: data.disciplines } : {}),
              ...(data.milestones !== undefined ? { milestones: data.milestones } : {}),
              ...(data.tasks !== undefined ? { tasks: data.tasks } : {}),
              ...(data.clashes !== undefined ? { clashes: data.clashes } : {}),
              ...(data.assignedEmployeeIds !== undefined ? { assignedEmployeeIds: data.assignedEmployeeIds } : {}),
              ...(data.description !== undefined ? { description: data.description } : {}),
            });
          });

          setProjects((prev) => {
            const masterById = new Map(INITIAL_PROJECTS.map((mp) => [mp.id, mp]));
            const masterByName = new Map(
              INITIAL_PROJECTS.map((mp) => [normalizeProjectNameKey(mp.name), mp])
            );

            // Mark projects seeded without triggering automatic background writes on every snapshot
            if (!hasSeededProjectsRef.current && !snapshot.metadata.fromCache) {
              hasSeededProjectsRef.current = true;
            }

            if (firestoreDocsMap.size === 0) {
              return mergeWithMasterProjects(prev);
            }

            // Build a name lookup from remote docs in case a master project was stored under a custom ID
            const remoteByName = new Map<string, Partial<BimProject> & { _createdAtMs?: number }>();
            firestoreDocsMap.forEach((remote) => {
              const nKey = normalizeProjectNameKey(remote.name);
              if (nKey && !remoteByName.has(nKey)) {
                remoteByName.set(nKey, remote);
              }
            });

            const baseMerged = mergeWithMasterProjects(prev);
            const existingIds = new Set(baseMerged.map((p) => p.id));
            const existingNameKeys = new Set(
              baseMerged.map((p) => normalizeProjectNameKey(p.name)).filter(Boolean)
            );

            const merged = baseMerged.map((p) => {
              const nKey = normalizeProjectNameKey(p.name);
              const remote = firestoreDocsMap.get(p.id) || (nKey ? remoteByName.get(nKey) : undefined);
              if (!remote) return p;
              const { _createdAtMs, ...cleanRemote } = remote;
              const masterDef = masterById.get(p.id) || (nKey ? masterByName.get(nKey) : undefined);
              if (masterDef) {
                const resolvedEst =
                  cleanRemote.manualEstimatedHoursOverride !== undefined &&
                  !Number.isNaN(Number(cleanRemote.manualEstimatedHoursOverride))
                    ? Number(cleanRemote.manualEstimatedHoursOverride)
                    : cleanRemote.estimatedHours !== undefined &&
                      !Number.isNaN(Number(cleanRemote.estimatedHours)) &&
                      (Number(cleanRemote.estimatedHours) > 0 || masterDef.totalEstimatedHours === 0)
                    ? Number(cleanRemote.estimatedHours)
                    : cleanRemote.totalEstimatedHours !== undefined &&
                      !Number.isNaN(Number(cleanRemote.totalEstimatedHours)) &&
                      (Number(cleanRemote.totalEstimatedHours) > 0 || masterDef.totalEstimatedHours === 0)
                    ? Number(cleanRemote.totalEstimatedHours)
                    : p.manualEstimatedHoursOverride !== undefined &&
                      !Number.isNaN(Number(p.manualEstimatedHoursOverride))
                    ? Number(p.manualEstimatedHoursOverride)
                    : p.totalEstimatedHours !== undefined &&
                      !Number.isNaN(Number(p.totalEstimatedHours))
                    ? Number(p.totalEstimatedHours)
                    : masterDef.totalEstimatedHours;

                return {
                  ...p,
                  ...cleanRemote,
                  id: masterDef.id,
                  code: cleanRemote.code || p.code || masterDef.code,
                  name: cleanProjectName(cleanRemote.name || p.name || masterDef.name),
                  totalEstimatedHours: resolvedEst,
                  estimatedHours: resolvedEst,
                  plannedDeliveryDate:
                    cleanRemote.plannedDeliveryDate !== undefined && cleanRemote.plannedDeliveryDate !== ''
                      ? cleanRemote.plannedDeliveryDate
                      : p.plannedDeliveryDate || masterDef.plannedDeliveryDate,
                  targetCompletionDate:
                    cleanRemote.targetCompletionDate !== undefined && cleanRemote.targetCompletionDate !== ''
                      ? cleanRemote.targetCompletionDate
                      : cleanRemote.plannedDeliveryDate || p.targetCompletionDate || masterDef.targetCompletionDate,
                  actualDeliveredDate:
                    cleanRemote.actualDeliveredDate !== undefined
                      ? cleanRemote.actualDeliveredDate
                      : p.actualDeliveredDate ?? masterDef.actualDeliveredDate,
                  status:
                    !cleanRemote.status || cleanRemote.status === 'Not Started'
                      ? p.status || masterDef.status
                      : cleanRemote.status,
                };
              }
              return {
                ...p,
                ...cleanRemote,
                name: cleanProjectName(cleanRemote.name || p.name),
              };
            });

            const newRemoteEntries: Array<{ proj: BimProject; createdAtMs: number }> = [];
            firestoreDocsMap.forEach((remote, id) => {
              const nKey = normalizeProjectNameKey(remote.name);
              if (!existingIds.has(id) && (!nKey || !existingNameKeys.has(nKey)) && remote.name) {
                const cleanedName = cleanProjectName(remote.name);
                const defaultCode =
                  remote.code ||
                  `BIM-${cleanedName
                    .replace(/[^a-zA-Z0-9]/g, '')
                    .slice(0, 4)
                    .toUpperCase() || 'PRJ'}`;
                newRemoteEntries.push({
                  createdAtMs: remote._createdAtMs || 0,
                  proj: {
                    id,
                    code: defaultCode,
                    name: cleanedName,
                    clientName: remote.clientName || 'Enterprise Client',
                    buildingType: remote.buildingType || 'Commercial',
                    location: remote.location || 'Global',
                    grossFloorAreaSqm: remote.grossFloorAreaSqm || 1000,
                    startDate: remote.startDate || toLocalIsoDate(new Date()),
                    targetCompletionDate: remote.targetCompletionDate || remote.plannedDeliveryDate || '',
                    plannedDeliveryDate: remote.plannedDeliveryDate || remote.targetCompletionDate || '',
                    actualDeliveredDate: remote.actualDeliveredDate,
                    status: remote.status || 'WIP',
                    totalEstimatedHours: Number(remote.totalEstimatedHours) || 0,
                    totalCompletedHours: Number(remote.totalCompletedHours) || 0,
                    manualHoursOverride: remote.manualHoursOverride,
                    manualHoursBaseLogged: remote.manualHoursBaseLogged,
                    currentLOD: remote.currentLOD || 'LOD 300',
                    targetLOD: remote.targetLOD || 'LOD 350',
                    budgetAmount: Number(remote.budgetAmount) || 0,
                    disciplines:
                      Array.isArray(remote.disciplines) && remote.disciplines.length > 0
                        ? remote.disciplines
                        : ['BIM - ACS'],
                    milestones: Array.isArray(remote.milestones) ? remote.milestones : [],
                    tasks: Array.isArray(remote.tasks) ? remote.tasks : [],
                    clashes: Array.isArray(remote.clashes) ? remote.clashes : [],
                    assignedEmployeeIds: Array.isArray(remote.assignedEmployeeIds)
                      ? remote.assignedEmployeeIds
                      : [],
                    description: remote.description || '',
                  },
                });
              }
            });

            // Sort newest first so newly created projects appear at the top
            newRemoteEntries.sort((a, b) => b.createdAtMs - a.createdAtMs);
            return [...newRemoteEntries.map((e) => e.proj), ...merged];
          });
        },
        (err) => {
          console.warn('Firestore projects listener notice:', err);
        }
      );
    } catch (e) {
      console.warn('Firestore projects setup error:', e);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Synchronize Firestore work_logs, daily_logs, timesheets + Central SSOT SSE & 5-second polling fallback
  const hasBackfilledSessionToSsotRef = React.useRef(false);
  useEffect(() => {
    let unsubWorkLogs: (() => void) | undefined;
    let unsubDailyLogs: (() => void) | undefined;
    let unsubTimesheets: (() => void) | undefined;
    let sseConnection: EventSource | undefined;
    let pollInterval: ReturnType<typeof setInterval> | undefined;

    const workLogsMap = new Map<string, DailyWorkLog>();
    const dailyLogsMap = new Map<string, DailyWorkLog>();
    const timesheetsMap = new Map<string, DailyWorkLog>();
    const ssotLogsMap = new Map<string, DailyWorkLog>();
    const deletedLogIdsSet = new Set<string>();

    const parseRawLogRecord = (rawId: string, data: any): DailyWorkLog | null => {
      if (!data) return null;
      const docId = String(rawId || data.id || '').trim();
      if (!docId || deletedLogIdsSet.has(docId) || data.isDeleted === true) return null;
      if (isRemovedMockMember({ ...data, id: docId })) {
        deleteDoc(doc(db, 'work_logs', docId)).catch(() => {});
        deleteDoc(doc(db, 'daily_logs', docId)).catch(() => {});
        deleteDoc(doc(db, 'timesheets', docId)).catch(() => {});
        return null;
      }

      const rawEmployeeName = String(data.employeeName || 'BIM Modeler').trim();
      const isNameSuperAdmin = rawEmployeeName.toLowerCase() === SUPER_ADMIN_NAME.toLowerCase();
      const rawEmail = String(data.memberEmail || data.userEmail || '').trim().toLowerCase();
      const normalizedEmail =
        !isNameSuperAdmin &&
        rawEmployeeName !== 'BIM Modeler' &&
        rawEmail === SUPER_ADMIN_EMAIL.toLowerCase()
          ? ''
          : rawEmail;
      const resolvedCreatedAt =
        typeof data.createdAt === 'string'
          ? data.createdAt
          : typeof data.createdAt?.toDate === 'function'
          ? data.createdAt.toDate().toISOString()
          : typeof data.createdAt?.seconds === 'number'
          ? new Date(data.createdAt.seconds * 1000).toISOString()
          : data.timestamp || new Date().toISOString();
      const resolvedMemberId = data.employeeId || data.memberId || data.userId || '';
      const resolvedUserId =
        !isNameSuperAdmin &&
        rawEmployeeName !== 'BIM Modeler' &&
        (data.userId === 'usr_super_admin_sushoovan' ||
          data.userId === 'usr_super_admin_modelatech' ||
          data.userId === 'modelatech2026_gmail_com' ||
          data.userId === 'emp-modelatech2026_gmail_com')
          ? resolvedMemberId
          : data.userId || resolvedMemberId;
      return sanitizeWorkLogRecord({
        id: docId,
        employeeId: resolvedMemberId,
        memberId: data.memberId || resolvedMemberId,
        employeeName: rawEmployeeName,
        projectId: data.projectId || '',
        projectName: data.projectName || 'BIM Project',
        date: data.date || new Date().toISOString().slice(0, 10),
        hoursLogged: Number(data.hoursLogged !== undefined ? data.hoursLogged : data.hours) || 0,
        discipline: (data.discipline as Discipline) || 'BIM - ACS',
        activityType: (data.activityType as ActivityType) || '3D Detailed Modeling',
        taskName: data.taskName || '',
        lodStage: (data.lodStage as LODLevel) || 'LOD 350',
        notes: data.notes || '',
        billable: data.billable !== undefined ? Boolean(data.billable) : true,
        timestamp: data.timestamp || resolvedCreatedAt,
        memberEmail: normalizedEmail,
        userEmail: normalizedEmail,
        userId: resolvedUserId,
        isTestEntry: Boolean(data.isTestEntry ?? false),
        loggedBy: data.loggedBy || normalizedEmail || rawEmployeeName || '',
        createdAt: resolvedCreatedAt,
      });
    };

    const parseLogDoc = (docSnap: any): DailyWorkLog | null => {
      return parseRawLogRecord(docSnap.id, docSnap.data());
    };

    const pickNewerLog = (existing: DailyWorkLog | undefined, incoming: DailyWorkLog): DailyWorkLog => {
      if (!existing) return incoming;
      const existingTs = new Date((existing as any).updatedAt || existing.timestamp || existing.createdAt || 0).getTime() || 0;
      const incomingTs = new Date((incoming as any).updatedAt || incoming.timestamp || incoming.createdAt || 0).getTime() || 0;
      return incomingTs >= existingTs ? incoming : existing;
    };

    const syncMergedLogs = () => {
      const combined = new Map<string, DailyWorkLog>();
      workLogsMap.forEach((v, k) => {
        if (!deletedLogIdsSet.has(k)) combined.set(k, pickNewerLog(combined.get(k), v));
      });
      dailyLogsMap.forEach((v, k) => {
        if (!deletedLogIdsSet.has(k)) combined.set(k, pickNewerLog(combined.get(k), v));
      });
      timesheetsMap.forEach((v, k) => {
        if (!deletedLogIdsSet.has(k)) combined.set(k, pickNewerLog(combined.get(k), v));
      });
      ssotLogsMap.forEach((v, k) => {
        if (!deletedLogIdsSet.has(k)) combined.set(k, pickNewerLog(combined.get(k), v));
      });

      setAllWorkLogs((prev) => {
        const nextMap = new Map<string, DailyWorkLog>();
        (prev || []).forEach((w) => {
          if (w && w.id && !deletedLogIdsSet.has(w.id) && !isRemovedMockMember(w)) {
            nextMap.set(w.id, sanitizeWorkLogRecord(w));
          }
        });
        combined.forEach((v, k) => {
          if (!deletedLogIdsSet.has(k) && !isRemovedMockMember(v)) {
            nextMap.set(k, pickNewerLog(nextMap.get(k), v));
          }
        });
        const mergedList = Array.from(nextMap.values());
        mergedList.sort((a, b) => {
          const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
          if (dateDiff !== 0) return dateDiff;
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
        return mergedList;
      });

      const list = Array.from(combined.values());

      if (list.length > 0) {
        setEmployees((currentEmployees) => {
          let changed = false;
          const updated = currentEmployees.filter(
            (e) => !e.isDeleted && e.status !== 'deleted' && !isMemberDeleted(e)
          );
          if (updated.length !== currentEmployees.length) {
            changed = true;
          }

          list.forEach((log) => {
            const emailKey = (log.memberEmail || log.userEmail || '').trim().toLowerCase();
            const nameKey = (log.employeeName || '').trim().toLowerCase();
            const rawId = (log.employeeId || log.userId || '').trim();
            const strippedId = rawId.replace(/^emp-/, '');

            if (!emailKey && !nameKey && !rawId) return;
            if (emailKey === 'sushovan.das@bimworkspace.com' || emailKey === 'aditi@bimworkspace.com') return;
            if (
              isMemberDeleted({
                id: rawId,
                email: emailKey,
                name: log.employeeName,
              })
            ) {
              return;
            }

            const exists = updated.some((e) => {
              const eEmail = (e.email || '').trim().toLowerCase();
              const eName = (e.name || '').trim().toLowerCase();
              const eIdStripped = (e.id || '').replace(/^emp-/, '');
              return (
                (rawId && (e.id === rawId || eIdStripped === strippedId)) ||
                (emailKey && eEmail === emailKey) ||
                (nameKey && eName === nameKey)
              );
            });

            if (!exists && (nameKey || emailKey)) {
              changed = true;
              const empId = rawId.startsWith('emp-')
                ? rawId
                : rawId
                ? `emp-${rawId}`
                : emailKey
                ? `emp-${generateRequestDocId(emailKey)}`
                : `emp-${Date.now()}`;
              const displayName = log.employeeName || (emailKey ? emailKey.split('@')[0] : 'BIM Engineer');
              const disc = (log.discipline as Discipline) || 'BIM - ACS';

              updated.push(
                sanitizeEmployeeRecord({
                  id: empId,
                  name: displayName,
                  email: emailKey,
                  role: 'BIM Modeler' as any,
                  primaryDiscipline: disc,
                  discipline: disc,
                  avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`,
                  weeklyCapacityHours: 40,
                  experienceYears: 3,
                  status: 'Active',
                  activeProjectIds: log.projectId ? [log.projectId] : [],
                  skills: [disc],
                  phone: '',
                })
              );
            }
          });

          return changed ? updated.map((e) => sanitizeEmployeeRecord(e)) : currentEmployees;
        });

        // Also ensure no active project referenced in operational logs is orphaned from projects state
        setProjects((currentProjects) => {
          let projChanged = false;
          const existingIds = new Set(currentProjects.map((p) => p.id));
          const existingNameKeys = new Set(
            currentProjects.map((p) => normalizeProjectNameKey(p.name)).filter(Boolean)
          );
          const orphanedProjects: BimProject[] = [];

          list.forEach((log) => {
            if (!log || log.isTestEntry) return;
            const rawPid = String(log.projectId || '').trim();
            const rawPName = cleanProjectName(String(log.projectName || '').trim());
            const normPName = normalizeProjectNameKey(rawPName);
            if (!rawPid && !normPName) return;
            if (rawPName.toLowerCase() === 'bim project' || rawPName.toLowerCase() === 'unassigned project') {
              return;
            }
            const matchedExisting = currentProjects.some((p) =>
              doesLogBelongToProject(log, p)
            );
            if (
              !matchedExisting &&
              (!rawPid || !existingIds.has(rawPid)) &&
              (!normPName || !existingNameKeys.has(normPName))
            ) {
              const newId = rawPid || `proj-${normPName.replace(/[^a-z0-9]+/g, '-')}`;
              const displayName = rawPName || rawPid;
              existingIds.add(newId);
              if (normPName) existingNameKeys.add(normPName);
              projChanged = true;
              const disc = (log.discipline as Discipline) || 'BIM - ACS';
              orphanedProjects.push({
                id: newId,
                code: `BIM-${displayName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'PRJ'}`,
                name: displayName,
                clientName: 'Modela',
                buildingType: 'Commercial',
                location: 'Global',
                grossFloorAreaSqm: 1000,
                startDate: log.date || toLocalIsoDate(new Date()),
                targetCompletionDate: '',
                plannedDeliveryDate: '',
                status: 'WIP',
                totalEstimatedHours: 0,
                totalCompletedHours: 0,
                currentLOD: (log.lodStage as LODLevel) || 'LOD 300',
                targetLOD: 'LOD 350',
                budgetAmount: 0,
                disciplines: [disc],
                assignedEmployeeIds: log.employeeId ? [log.employeeId] : [],
                description: `${displayName} BIM modeling and coordination project.`,
                tasks: [],
                milestones: [],
                clashes: [],
              });
            }
          });

          return projChanged ? [...orphanedProjects, ...currentProjects] : currentProjects;
        });
      }
    };

    const mergeIncomingSsotProjects = (rawProjects: any[]) => {
      if (!Array.isArray(rawProjects) || rawProjects.length === 0) return;
      setProjects((prev) => {
        const byId = new Map<string, any>();
        const byName = new Map<string, any>();
        rawProjects.forEach((pr: any) => {
          if (!pr) return;
          if (pr.id) byId.set(String(pr.id), pr);
          const nKey = normalizeProjectNameKey(pr.name || pr.projectName);
          if (nKey && !byName.has(nKey)) byName.set(nKey, pr);
        });

        const existingIds = new Set(prev.map((p) => p.id));
        const existingNameKeys = new Set(
          prev.map((p) => normalizeProjectNameKey(p.name)).filter(Boolean)
        );

        const updated = prev.map((p) => {
          const nKey = normalizeProjectNameKey(p.name);
          const incoming = byId.get(p.id) || (nKey ? byName.get(nKey) : undefined);
          if (!incoming) return p;
          const nextEst =
            incoming.manualEstimatedHoursOverride !== undefined
              ? Number(incoming.manualEstimatedHoursOverride)
              : incoming.estimatedHours !== undefined
              ? Number(incoming.estimatedHours)
              : incoming.totalEstimatedHours !== undefined
              ? Number(incoming.totalEstimatedHours)
              : p.totalEstimatedHours;
          const nextChanged =
            incoming.manualChangedHoursOverride !== undefined
              ? Number(incoming.manualChangedHoursOverride)
              : incoming.changedHours !== undefined
              ? Number(incoming.changedHours)
              : incoming.additionalHours !== undefined
              ? Number(incoming.additionalHours)
              : undefined;
          const isExplicitLoggedOverride = Boolean(incoming.isManualLoggedOverride === true);
          const nextLogged =
            isExplicitLoggedOverride && incoming.manualHoursOverride !== undefined
              ? Number(incoming.manualHoursOverride)
              : incoming.totalLogged !== undefined
              ? Number(incoming.totalLogged)
              : incoming.totalCompletedHours !== undefined
              ? Number(incoming.totalCompletedHours)
              : incoming.totalHoursLogged !== undefined
              ? Number(incoming.totalHoursLogged)
              : undefined;
          return {
            ...p,
            ...incoming,
            id: p.id,
            name: cleanProjectName(incoming.name || incoming.projectName || p.name),
            totalEstimatedHours: nextEst,
            estimatedHours: nextEst,
            ...(nextChanged !== undefined
              ? {
                  changedHours: nextChanged,
                  additionalHours: nextChanged,
                  manualChangedHoursOverride: nextChanged,
                }
              : {}),
            ...(nextLogged !== undefined
              ? {
                  totalLogged: nextLogged,
                  totalCompletedHours: nextLogged,
                }
              : {}),
            ...(isExplicitLoggedOverride && incoming.manualHoursOverride !== undefined
              ? {
                  isManualLoggedOverride: true,
                  manualHoursOverride: Number(incoming.manualHoursOverride),
                }
              : {
                  isManualLoggedOverride: p.isManualLoggedOverride,
                  manualHoursOverride: p.isManualLoggedOverride ? p.manualHoursOverride : undefined,
                }),
          };
        });

        const newEntries: BimProject[] = [];
        rawProjects.forEach((incoming: any) => {
          if (!incoming) return;
          const incId = String(incoming.id || '').trim();
          const incName = cleanProjectName(String(incoming.name || incoming.projectName || '').trim());
          const nKey = normalizeProjectNameKey(incName);
          if (!incId && !incName) return;
          if (
            (!incId || !existingIds.has(incId)) &&
            (!nKey || !existingNameKeys.has(nKey))
          ) {
            const finalId = incId || `proj-${Date.now()}`;
            const finalName = incName || finalId;
            existingIds.add(finalId);
            if (nKey) existingNameKeys.add(nKey);
            const nextEst = Number(
              incoming.manualEstimatedHoursOverride ??
                incoming.estimatedHours ??
                incoming.totalEstimatedHours ??
                0
            );
            const nextLogged =
              incoming.manualHoursOverride !== undefined
                ? Number(incoming.manualHoursOverride)
                : incoming.totalLogged !== undefined
                ? Number(incoming.totalLogged)
                : incoming.totalCompletedHours !== undefined
                ? Number(incoming.totalCompletedHours)
                : incoming.totalHoursLogged !== undefined
                ? Number(incoming.totalHoursLogged)
                : undefined;

            newEntries.push({
              id: finalId,
              code:
                incoming.code ||
                `BIM-${finalName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'PRJ'}`,
              name: finalName,
              clientName: incoming.clientName || 'Modela',
              buildingType: incoming.buildingType || 'Commercial',
              location: incoming.location || 'Global',
              grossFloorAreaSqm: Number(incoming.grossFloorAreaSqm) || 1000,
              startDate: incoming.startDate || toLocalIsoDate(new Date()),
              targetCompletionDate: incoming.targetCompletionDate || incoming.plannedDeliveryDate || '',
              plannedDeliveryDate: incoming.plannedDeliveryDate || incoming.targetCompletionDate || '',
              actualDeliveredDate: incoming.actualDeliveredDate,
              status: incoming.status || 'WIP',
              totalEstimatedHours: nextEst,
              estimatedHours: nextEst,
              manualEstimatedHoursOverride: incoming.manualEstimatedHoursOverride,
              totalCompletedHours: nextLogged ?? 0,
              ...(nextLogged !== undefined
                ? {
                    totalLogged: nextLogged,
                    manualHoursOverride: incoming.manualHoursOverride,
                  }
                : {}),
              manualHoursBaseLogged: incoming.manualHoursBaseLogged,
              currentLOD: incoming.currentLOD || 'LOD 300',
              targetLOD: incoming.targetLOD || 'LOD 350',
              budgetAmount: Number(incoming.budgetAmount) || 0,
              disciplines:
                Array.isArray(incoming.disciplines) && incoming.disciplines.length > 0
                  ? incoming.disciplines
                  : ['BIM - ACS'],
              milestones: Array.isArray(incoming.milestones) ? incoming.milestones : [],
              tasks: Array.isArray(incoming.tasks) ? incoming.tasks : [],
              clashes: Array.isArray(incoming.clashes) ? incoming.clashes : [],
              assignedEmployeeIds: Array.isArray(incoming.assignedEmployeeIds)
                ? incoming.assignedEmployeeIds
                : [],
              description: incoming.description || '',
            });
          }
        });

        return newEntries.length > 0 ? [...newEntries, ...updated] : updated;
      });
    };

    const mergeIncomingTeamMembers = (rawMembers: any[]) => {
      if (!Array.isArray(rawMembers) || rawMembers.length === 0) return;
      setEmployees((currentEmployees) => {
        let changed = false;
        const filteredBase = currentEmployees.filter((e) => !isRemovedMockMember(e) && !isMemberDeleted(e));
        if (filteredBase.length !== currentEmployees.length) {
          changed = true;
        }
        const updated = filteredBase.map((e) => sanitizeEmployeeRecord(e));
        rawMembers.forEach((data) => {
          if (
            !data ||
            data.isDeleted === true ||
            String(data.status || '').toLowerCase() === 'deleted' ||
            isRemovedMockMember(data) ||
            isMemberDeleted(data)
          ) {
            return;
          }
          const rawEmail = String(data.email || data.userEmail || '').trim().toLowerCase();
          const name = String(data.fullName || data.name || (rawEmail ? rawEmail.split('@')[0] : '')).trim();
          if (!name && !rawEmail) return;
          const disc = ((data.discipline || data.primaryDiscipline || 'BIM - ACS') as Discipline);
          const candidate = sanitizeEmployeeRecord({
            id: String(data.id || (rawEmail ? `emp-${generateRequestDocId(rawEmail)}` : `emp-${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`)).trim(),
            name,
            email: rawEmail,
            role: (data.role || 'BIM Modeler') as any,
            primaryDiscipline: disc,
            discipline: disc,
            avatar: data.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
            weeklyCapacityHours: Number(data.weeklyCapacityHours) || 40,
            experienceYears: Number(data.experienceYears) || 4,
            status: 'Active',
            activeProjectIds: Array.isArray(data.activeProjectIds) ? data.activeProjectIds : ['proj-1'],
            skills: [disc],
            phone: data.phone || '',
          });
          const idx = updated.findIndex(
            (e) =>
              e.id === candidate.id ||
              (candidate.email && (e.email || '').toLowerCase().trim() === candidate.email.toLowerCase().trim()) ||
              (candidate.name && (e.name || '').toLowerCase().trim() === candidate.name.toLowerCase().trim())
          );
          if (idx === -1) {
            changed = true;
            updated.push(candidate);
          }
        });
        return changed ? updated : currentEmployees;
      });
    };

    // Backfill any locally cached records from this session to Central SSOT & Firestore once on load
    if (!hasBackfilledSessionToSsotRef.current) {
      hasBackfilledSessionToSsotRef.current = true;
      try {
        const localSavedLogs = localStorage.getItem(STORAGE_KEYS.WORK_LOGS);
        const localSavedEmps = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
        const parsedLogs: DailyWorkLog[] = localSavedLogs ? JSON.parse(localSavedLogs) : [];
        const parsedEmps: Employee[] = localSavedEmps ? JSON.parse(localSavedEmps) : [];

        if (Array.isArray(parsedLogs) && parsedLogs.length > 0) {
          const cleanLogs = parsedLogs
            .filter((l) => l && !isRemovedMockMember(l))
            .map((l) => JSON.parse(JSON.stringify(sanitizeWorkLogRecord(l))));
          if (cleanLogs.length > 0) {
            fetch('/api/ssot/timesheets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isBackfill: true, logs: cleanLogs }),
            }).catch(() => {});
            cleanLogs.forEach((l) => {
              if (l && l.id) {
                const payload = {
                  ...l,
                  hours: Number(l.hoursLogged) || 0,
                  hoursLogged: Number(l.hoursLogged) || 0,
                };
                setDoc(doc(db, 'timesheets', l.id), payload, { merge: true }).catch(() => {});
                setDoc(doc(db, 'daily_logs', l.id), payload, { merge: true }).catch(() => {});
                setDoc(doc(db, 'work_logs', l.id), payload, { merge: true }).catch(() => {});
              }
            });
          }
        }

        if (Array.isArray(parsedEmps) && parsedEmps.length > 0) {
          const cleanEmps = parsedEmps
            .filter(
              (e) =>
                e &&
                !e.isDeleted &&
                String(e.status || '').toLowerCase() !== 'deleted' &&
                !isRemovedMockMember(e) &&
                !isMemberDeleted(e)
            )
            .map((e) => JSON.parse(JSON.stringify(sanitizeEmployeeRecord(e))));
          if (cleanEmps.length > 0) {
            fetch('/api/ssot/team-members', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isBackfill: true, members: cleanEmps }),
            }).catch(() => {});
            cleanEmps.forEach((emp) => {
              if (!emp) return;
              const cleanEmail = (emp.email || '').trim().toLowerCase();
              const docId = cleanEmail ? generateRequestDocId(cleanEmail) : (emp.id || '').replace(/^emp-/, '');
              if (!docId) return;
              const payload = JSON.parse(
                JSON.stringify({
                  id: emp.id,
                  name: emp.name,
                  fullName: emp.name,
                  email: cleanEmail || emp.email || '',
                  role: emp.role || 'VIEWER',
                  discipline: emp.discipline || emp.primaryDiscipline || 'BIM - ACS',
                  primaryDiscipline: emp.primaryDiscipline || emp.discipline || 'BIM - ACS',
                  assignedTo: emp.id,
                  status: 'APPROVED',
                  isDeleted: false,
                })
              );
              setDoc(doc(db, 'team_members', docId), payload, { merge: true }).catch(() => {});
              setDoc(doc(db, 'users', docId), payload, { merge: true }).catch(() => {});
            });
          }
        }
      } catch {}
    }

    const fetchSsotAndFirestorePoll = async () => {
      try {
        const res = await fetch('/api/ssot/state', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.deletedLogIds)) {
            data.deletedLogIds.forEach((id: string) => {
              deletedLogIdsSet.add(String(id));
              ssotLogsMap.delete(String(id));
              workLogsMap.delete(String(id));
              dailyLogsMap.delete(String(id));
              timesheetsMap.delete(String(id));
            });
          }
          if (Array.isArray(data?.timesheets)) {
            ssotLogsMap.clear();
            data.timesheets.forEach((item: any) => {
              const parsed = parseRawLogRecord(item.id, item);
              if (parsed) ssotLogsMap.set(parsed.id, parsed);
            });
            syncMergedLogs();
          }
          if (Array.isArray(data?.teamMembers)) {
            mergeIncomingTeamMembers(data.teamMembers);
          }
          if (Array.isArray(data?.projects) && data.projects.length > 0) {
            mergeIncomingSsotProjects(data.projects);
          }
        }
      } catch {}

      try {
        const [wlSnap, dlSnap, tsSnap, tmSnap, uSnap] = await Promise.all([
          getDocs(collection(db, 'work_logs')).catch(() => null),
          getDocs(collection(db, 'daily_logs')).catch(() => null),
          getDocs(collection(db, 'timesheets')).catch(() => null),
          getDocs(collection(db, 'team_members')).catch(() => null),
          getDocs(collection(db, 'users')).catch(() => null),
        ]);
        let logsUpdated = false;
        if (wlSnap) {
          wlSnap.docs.forEach((d) => {
            const p = parseLogDoc(d);
            if (p) {
              workLogsMap.set(d.id, p);
              logsUpdated = true;
            }
          });
        }
        if (dlSnap) {
          dlSnap.docs.forEach((d) => {
            const p = parseLogDoc(d);
            if (p) {
              dailyLogsMap.set(d.id, p);
              logsUpdated = true;
            }
          });
        }
        if (tsSnap) {
          tsSnap.docs.forEach((d) => {
            const p = parseLogDoc(d);
            if (p) {
              timesheetsMap.set(d.id, p);
              logsUpdated = true;
            }
          });
        }
        if (logsUpdated) {
          syncMergedLogs();
        }
        const polledMembers: any[] = [];
        if (tmSnap) tmSnap.docs.forEach((d) => polledMembers.push({ id: d.id, ...d.data() }));
        if (uSnap) uSnap.docs.forEach((d) => polledMembers.push({ id: d.id, ...d.data() }));
        if (polledMembers.length > 0) {
          mergeIncomingTeamMembers(polledMembers);
        }
      } catch {}
    };

    try {
      unsubWorkLogs = onSnapshot(
        collection(db, 'work_logs'),
        (snapshot) => {
          workLogsMap.clear();
          snapshot.docs.forEach((docSnap) => {
            const p = parseLogDoc(docSnap);
            if (p) workLogsMap.set(docSnap.id, p);
          });
          syncMergedLogs();
        },
        (err) => {
          console.warn('Firestore work_logs real-time listener notice:', err);
        }
      );

      unsubDailyLogs = onSnapshot(
        collection(db, 'daily_logs'),
        (snapshot) => {
          dailyLogsMap.clear();
          snapshot.docs.forEach((docSnap) => {
            const p = parseLogDoc(docSnap);
            if (p) dailyLogsMap.set(docSnap.id, p);
          });
          syncMergedLogs();
        },
        (err) => {
          console.warn('Firestore daily_logs real-time listener notice:', err);
        }
      );

      unsubTimesheets = onSnapshot(
        collection(db, 'timesheets'),
        (snapshot) => {
          timesheetsMap.clear();
          snapshot.docs.forEach((docSnap) => {
            const p = parseLogDoc(docSnap);
            if (p) timesheetsMap.set(docSnap.id, p);
          });
          syncMergedLogs();
        },
        (err) => {
          console.warn('Firestore timesheets real-time listener notice:', err);
        }
      );

      if (typeof EventSource !== 'undefined') {
        sseConnection = new EventSource('/api/ssot/stream');
        sseConnection.onmessage = (ev) => {
          try {
            const payload = JSON.parse(ev.data);
            if (payload?.type === 'INIT_SSOT') {
              if (Array.isArray(payload.deletedLogIds)) {
                payload.deletedLogIds.forEach((id: string) => deletedLogIdsSet.add(String(id)));
              }
              if (Array.isArray(payload.timesheets)) {
                ssotLogsMap.clear();
                payload.timesheets.forEach((item: any) => {
                  const parsed = parseRawLogRecord(item.id, item);
                  if (parsed) ssotLogsMap.set(parsed.id, parsed);
                });
                syncMergedLogs();
              }
              if (Array.isArray(payload.teamMembers)) {
                mergeIncomingTeamMembers(payload.teamMembers);
              }
              if (Array.isArray(payload.projects) && payload.projects.length > 0) {
                mergeIncomingSsotProjects(payload.projects);
              }
            } else if (payload?.type === 'UPSERT_TIMESHEETS' && Array.isArray(payload.timesheets)) {
              payload.timesheets.forEach((item: any) => {
                if (item?.id) deletedLogIdsSet.delete(String(item.id));
                const parsed = parseRawLogRecord(item.id, item);
                if (parsed) ssotLogsMap.set(parsed.id, parsed);
              });
              syncMergedLogs();
            } else if (payload?.type === 'DELETE_TIMESHEET' && payload?.id) {
              const delId = String(payload.id);
              deletedLogIdsSet.add(delId);
              ssotLogsMap.delete(delId);
              workLogsMap.delete(delId);
              dailyLogsMap.delete(delId);
              timesheetsMap.delete(delId);
              syncMergedLogs();
            } else if (payload?.type === 'UPSERT_TEAM_MEMBERS' && Array.isArray(payload.teamMembers)) {
              mergeIncomingTeamMembers(payload.teamMembers);
            } else if (payload?.type === 'UPSERT_PROJECTS' && Array.isArray(payload.projects)) {
              mergeIncomingSsotProjects(payload.projects);
            } else if (payload?.type === 'DELETE_TEAM_MEMBER') {
              const delId = String(payload.id || '').trim();
              const delEmail = String(payload.email || '').trim().toLowerCase();
              const delName = String(payload.name || '').trim().toLowerCase();
              registerDeletedMemberKeys({ id: delId, email: delEmail, name: delName });
              setEmployees((prev) =>
                prev.filter(
                  (e) =>
                    e.id !== delId &&
                    e.id.replace(/^emp-/, '') !== delId.replace(/^emp-/, '') &&
                    (!delEmail || (e.email || '').toLowerCase().trim() !== delEmail) &&
                    (!delName || (e.name || '').toLowerCase().trim() !== delName)
                )
              );
            }
          } catch {}
        };
      }

      let ssotBroadcast: BroadcastChannel | undefined;
      if (typeof BroadcastChannel !== 'undefined') {
        ssotBroadcast = new BroadcastChannel('bim_ssot_realtime_channel');
        ssotBroadcast.onmessage = (event) => {
          const msg = event?.data;
          if (!msg) return;
          if (msg.type === 'UPSERT_LOG' && msg.log && msg.log.id) {
            const parsed = parseRawLogRecord(msg.log.id, msg.log);
            if (parsed) {
              deletedLogIdsSet.delete(parsed.id);
              ssotLogsMap.set(parsed.id, parsed);
              syncMergedLogs();
            }
          } else if (msg.type === 'DELETE_LOG' && msg.id) {
            const delId = String(msg.id);
            deletedLogIdsSet.add(delId);
            ssotLogsMap.delete(delId);
            workLogsMap.delete(delId);
            dailyLogsMap.delete(delId);
            timesheetsMap.delete(delId);
            syncMergedLogs();
          } else if (msg.type === 'REFRESH_SSOT') {
            fetchSsotAndFirestorePoll();
          }
        };
      }

      fetchSsotAndFirestorePoll();
      pollInterval = setInterval(fetchSsotAndFirestorePoll, 3000);
    } catch (e) {
      console.warn('Firestore work_logs/daily_logs/timesheets setup error:', e);
    }

    return () => {
      if (unsubWorkLogs) unsubWorkLogs();
      if (unsubDailyLogs) unsubDailyLogs();
      if (unsubTimesheets) unsubTimesheets();
      if (sseConnection) sseConnection.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [
    currentUser?.email,
    currentUser?.id,
    currentUser?.role,
    currentUser?.securityRole,
    currentUser?.appRole,
    currentUser?.accessLevel,
  ]);

  // Synchronize Firestore assigned_hours and project_assignments collections into resourceAllocations in real-time
  useEffect(() => {
    let unsubProjectAssignments: (() => void) | undefined;
    let unsubAssignedHours: (() => void) | undefined;
    let broadcastChannel: BroadcastChannel | undefined;

    const projectAssignmentsMap = new Map<string, ResourceAllocationItem>();
    const assignedHoursMap = new Map<string, ResourceAllocationItem>();

    const handleLocalAllocUpdate = (e: any) => {
      if (e?.detail && Array.isArray(e.detail)) {
        setResourceAllocations((prev) => mergeAllocationsWithLocal(e.detail, prev));
      }
    };
    window.addEventListener('bim_resource_allocations_updated', handleLocalAllocUpdate);

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'bim_resource_allocations_v2' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setResourceAllocations((prev) => mergeAllocationsWithLocal(parsed, prev));
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    try {
      if (typeof BroadcastChannel !== 'undefined') {
        broadcastChannel = new BroadcastChannel('bim_resource_allocations_channel');
        broadcastChannel.onmessage = (event) => {
          if (event?.data && Array.isArray(event.data)) {
            setResourceAllocations((prev) => mergeAllocationsWithLocal(event.data, prev));
          }
        };
      }
    } catch {}

    const parseAllocDoc = (docSnap: any): ResourceAllocationItem => {
      const data = docSnap.data();
      const rawMemberId = String(data.memberId || data.employeeId || data.assignedTo || '').trim();
      const rawEmail = String(data.assignedToEmail || data.memberEmail || '').trim().toLowerCase();
      const resolvedName = String(data.assignedToName || data.memberName || data.employeeName || '').trim();
      const lowerName = resolvedName.toLowerCase();
      const isSushovan =
        lowerName.includes('sushovan') ||
        lowerName.includes('sushoovan') ||
        rawEmail === 'sushoovandas@gmail.com' ||
        rawEmail === 'sushovandas@gmail.com';
      const isAditi =
        !isSushovan &&
        (lowerName === SUPER_ADMIN_NAME.toLowerCase() ||
          rawEmail === SUPER_ADMIN_EMAIL.toLowerCase());
      const resolvedMemberId = isAditi
        ? 'emp-modelatech2026_gmail_com'
        : isSushovan
        ? 'emp-sushoovan_das'
        : rawMemberId.toLowerCase().includes('modelatech2026') ||
          rawMemberId.toLowerCase().includes('sushovan') ||
          rawMemberId.toLowerCase().includes('sushoovan')
        ? rawEmail && rawEmail !== SUPER_ADMIN_EMAIL.toLowerCase()
          ? `emp-${generateRequestDocId(rawEmail)}`
          : `emp-${lowerName.replace(/[^a-z0-9]+/g, '_')}`
        : rawMemberId;
      const resolvedEmail = isAditi
        ? SUPER_ADMIN_EMAIL.toLowerCase()
        : isSushovan
        ? rawEmail && rawEmail !== SUPER_ADMIN_EMAIL.toLowerCase()
          ? rawEmail
          : 'sushoovandas@gmail.com'
        : rawEmail === SUPER_ADMIN_EMAIL.toLowerCase()
        ? ''
        : rawEmail;
      return {
        id: docSnap.id,
        projectId: data.projectId || '',
        projectName: data.projectName || 'Unassigned Project',
        employeeId: resolvedMemberId,
        memberId: resolvedMemberId,
        assignedTo: resolvedMemberId,
        employeeName: resolvedName,
        assignedToName: resolvedName,
        memberName: resolvedName,
        employeeRole: data.employeeRole || 'Editor',
        memberEmail: resolvedEmail,
        assignedToEmail: resolvedEmail,
        discipline: data.discipline === 'MEP' ? 'BIM - MEP' : (data.discipline || 'BIM - ACS'),
        lod: data.lod || 'LOD 350',
        projectPhase: data.projectPhase || 'Design Development',
        taskType: data.taskType || '3D Modeling',
        targetElementOrZone: data.targetElementOrZone || 'MOD-AR-LVL01-ZONE-A',
        assignedHours: Number(data.assignedHours) || 0,
        viewFrequency: data.viewFrequency || 'Weekly',
        startDate:
          normalizeDateToIso(data.startDate || data.start || data.timelineStart || data.targetDate || data.date) ||
          getCurrentWeekRange().startIso,
        dueDate:
          normalizeDateToIso(data.dueDate || data.due || data.endDate || data.end || data.timelineEnd || data.targetCompletionDate || data.targetDate || data.date) ||
          getCurrentWeekRange().endIso,
        ...(data.priority ? { priority: data.priority } : {}),
        status: data.status || 'Allocated',
        notes: data.notes || '',
        updatedAt: data.updatedAt || '',
      };
    };

    const syncMergedAllocations = () => {
      const combined = new Map<string, ResourceAllocationItem>();
      projectAssignmentsMap.forEach((v, k) => combined.set(k, v));
      assignedHoursMap.forEach((v, k) => {
        const existing = combined.get(k);
        if (!existing || !existing.updatedAt || (v.updatedAt && v.updatedAt >= existing.updatedAt)) {
          combined.set(k, v);
        }
      });
      const remoteAllocations = Array.from(combined.values());

      setResourceAllocations((prev) => {
        const merged = mergeAllocationsWithLocal(remoteAllocations, prev);
        try {
          localStorage.setItem('bim_resource_allocations_v2', JSON.stringify(merged));
        } catch {}
        return merged;
      });
    };

    try {
      unsubProjectAssignments = onSnapshot(
        collection(db, 'project_assignments'),
        (snapshot) => {
          projectAssignmentsMap.clear();
          snapshot.docs.forEach((docSnap) => {
            const parsed = parseAllocDoc(docSnap);
            if (isRemovedMockMember(parsed)) {
              deleteDoc(doc(db, 'project_assignments', docSnap.id)).catch(() => {});
              return;
            }
            projectAssignmentsMap.set(docSnap.id, parsed);
          });
          syncMergedAllocations();
        },
        (err) => {
          console.warn('Firestore project_assignments context listener notice:', err);
        }
      );

      unsubAssignedHours = onSnapshot(
        collection(db, 'assigned_hours'),
        (snapshot) => {
          assignedHoursMap.clear();
          snapshot.docs.forEach((docSnap) => {
            const parsed = parseAllocDoc(docSnap);
            if (isRemovedMockMember(parsed)) {
              deleteDoc(doc(db, 'assigned_hours', docSnap.id)).catch(() => {});
              return;
            }
            assignedHoursMap.set(docSnap.id, parsed);
          });
          syncMergedAllocations();
        },
        (err) => {
          console.warn('Firestore assigned_hours context listener notice:', err);
        }
      );
    } catch (e) {
      console.warn('Firestore assigned_hours context setup error:', e);
    }

    return () => {
      window.removeEventListener('bim_resource_allocations_updated', handleLocalAllocUpdate);
      window.removeEventListener('storage', handleStorageEvent);
      if (broadcastChannel) {
        try {
          broadcastChannel.close();
        } catch {}
      }
      if (unsubProjectAssignments) unsubProjectAssignments();
      if (unsubAssignedHours) unsubAssignedHours();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(auditLogs));
  }, [auditLogs]);

  // Auth & Onboarding Actions (Phase 1 Google OAuth & RBAC)
  const signInWithGoogle = (profile: {
    googleId?: string;
    email: string;
    name?: string;
    picture?: string;
    organization?: string;
    discipline?: string;
    accessReason?: string;
  }): { status: UserApprovalStatus; user: AuthUser } => {
    const trimmedEmail = profile.email.trim().toLowerCase();
    const isAditiSuper = trimmedEmail === SUPER_ADMIN_EMAIL.toLowerCase();
    const isSushoovan =
      !isAditiSuper &&
      (trimmedEmail === 'sushoovandas@gmail.com' ||
        profile.name?.toLowerCase().includes('sushoovan das'));
    const isSuperAdminUser = isAditiSuper || isSushoovan;

    // 1. Super Admin Bypass: immediate APPROVED + SUPER_ADMIN
    if (isSuperAdminUser) {
      const superAdminUser: AuthUser = {
        id: isAditiSuper ? 'emp-modelatech2026_gmail_com' : 'emp-sushoovan_das',
        googleId:
          profile.googleId ||
          (isAditiSuper ? 'emp-modelatech2026_gmail_com' : 'emp-sushoovan_das'),
        email: isAditiSuper ? SUPER_ADMIN_EMAIL : 'sushoovandas@gmail.com',
        name: isAditiSuper ? SUPER_ADMIN_NAME : profile.name || 'Sushoovan Das',
        role: 'Super Administrator & Lead Architect',
        appRole: 'SUPER_ADMIN',
        status: 'APPROVED',
        isAdmin: true,
        accessLevel: 'Super Admin',
        organization: 'BPMS Core Systems & Architecture',
        accessReason: 'Executive Super Administrator with master editing and governance access',
        requestTimestamp: '2026-08-23 09:00 AM',
        avatar: profile.picture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
      };
      setCurrentUser(superAdminUser);
      return { status: 'APPROVED', user: superAdminUser };
    }

    // 2. Check existing onboarding requests first so pending/rejected requests are respected
    const existingReq = onboardingRequests.find(
      (r) => r.email.toLowerCase() === trimmedEmail
    );

    if (existingReq) {
      const resolvedRole: UserRole =
        existingReq.assignedRole ||
        normalizeUserRole(existingReq.role || existingReq.requestedRole);
      const isApprovedReq =
        (existingReq.status || '').toUpperCase() === 'APPROVED' ||
        (existingReq.status || '').toUpperCase() === 'ACTIVE';

      const authUser: AuthUser = {
        id: existingReq.id,
        googleId: profile.googleId || existingReq.googleId,
        email: existingReq.email,
        name: profile.name || existingReq.name,
        role: mapAppRoleToDisplayRole(resolvedRole),
        appRole: resolvedRole,
        status: isApprovedReq ? 'APPROVED' : existingReq.status,
        isAdmin: resolvedRole === 'SUPER_ADMIN' || resolvedRole === 'DIRECTOR' || resolvedRole === 'PROJECT_MANAGER',
        accessLevel: existingReq.assignedAccessLevel || mapAppRoleToAccessLevel(resolvedRole),
        avatar: profile.picture || existingReq.avatar,
        organization: existingReq.organization || profile.organization || 'ProductionPulse Partner Network',
        accessReason: existingReq.accessReason || profile.accessReason || existingReq.notes,
        requestTimestamp: existingReq.requestTimestamp,
      };

      // Only add to active employees roster if the request is actually APPROVED
      if (isApprovedReq) {
        const existingEmp = employees.find(
          (e) => e.email.toLowerCase() === trimmedEmail
        );
        if (!existingEmp) {
          const newEmp: Employee = {
            id: `emp-${Date.now()}`,
            name: authUser.name,
            email: trimmedEmail,
            role: authUser.role || 'Editor',
            avatar: authUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(authUser.name)}`,
            primaryDiscipline: (profile.discipline as Discipline) || (existingReq.primaryDiscipline as Discipline) || 'BIM - ACS',
            discipline: (profile.discipline as Discipline) || (existingReq.primaryDiscipline as Discipline) || 'BIM - ACS',
            weeklyCapacityHours: 40,
            status: 'Active',
            activeProjectIds: [projects[0]?.id || 'proj-1'],
            skills: ['Revit 2026', 'Navisworks Manage', 'BIM 360'],
          };
          setEmployees((prev) => [...prev, newEmp]);
        }
      }

      setCurrentUser(authUser);
      return { status: authUser.status, user: authUser };
    }

    // 3. Check if user was already approved in employees roster
    const matchedEmployee = employees.find(
      (e) => e.email.toLowerCase() === trimmedEmail && e.status !== 'Suspended'
    );

    if (matchedEmployee) {
      const resolvedAppRole: UserRole = normalizeUserRole(matchedEmployee.role);
      const resolvedAccessLevel = mapAppRoleToAccessLevel(resolvedAppRole);
      const resolvedDisplayRole = mapAppRoleToDisplayRole(resolvedAppRole);

      const activeUser: AuthUser = {
        id: matchedEmployee.id,
        googleId: profile.googleId,
        email: matchedEmployee.email,
        name: matchedEmployee.name,
        role: resolvedDisplayRole,
        appRole: resolvedAppRole,
        status: 'APPROVED',
        isAdmin: resolvedAppRole === 'SUPER_ADMIN' || resolvedAppRole === 'DIRECTOR' || resolvedAppRole === 'PROJECT_MANAGER',
        accessLevel: resolvedAccessLevel,
        avatar: profile.picture || matchedEmployee.avatar,
        organization: profile.organization || 'BPMS Production Team',
        requestTimestamp: '2026-08-23 09:00 AM',
      };
      setCurrentUser(activeUser);
      return { status: 'APPROVED', user: activeUser };
    }

    // 4. New Google User -> default to PENDING hold state and add to Admin Nexus Queue
    const timestamp = new Date().toLocaleString([], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const formattedName =
      profile.name?.trim() ||
      trimmedEmail
        .split('@')[0]
        .split(/[._-]/)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');

    const isoTimestamp = new Date().toISOString();
    const requestId = generateRequestDocId(trimmedEmail);
    const newRequest: OnboardingRequest = {
      id: requestId,
      googleId: profile.googleId || requestId,
      email: trimmedEmail,
      name: formattedName,
      fullName: formattedName,
      avatar: profile.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(formattedName)}`,
      role: 'Editor',
      requestedRole: 'Editor',
      assignedRole: 'EDITOR',
      assignedAccessLevel: 'Editor',
      primaryDiscipline: (profile.discipline as Discipline) || 'BIM - ACS',
      discipline: (profile.discipline as Discipline) || 'BIM - ACS',
      createdAt: isoTimestamp,
      requestedAt: isoTimestamp,
      requestTimestamp: timestamp,
      timestamp: isoTimestamp,
      status: 'Pending',
      organization: profile.organization || 'Google Workspace Authenticated Partner',
      reasonForAccess: profile.accessReason || 'BIM Model Review, coordination, and production tracking access.',
      accessReason: profile.accessReason || 'BIM Model Review, coordination, and production tracking access.',
      notes: 'Authenticated via Google OAuth (Gmail). Awaiting Super Admin review in Nexus Admin Panel.',
    };

    setOnboardingRequests((prev) => [newRequest, ...prev.filter((r) => r.email.toLowerCase() !== trimmedEmail)]);

    // Save to Firestore access_requests collection
    try {
      const reqDoc = doc(db, 'access_requests', newRequest.id);
      setDoc(
        reqDoc,
        {
          id: newRequest.id,
          uid: profile.googleId || newRequest.id,
          name: formattedName,
          fullName: formattedName,
          email: trimmedEmail,
          role: 'Editor',
          assignedRole: 'EDITOR',
          requestedRole: 'Editor',
          discipline: (profile.discipline as Discipline) || 'BIM - ACS',
          primaryDiscipline: (profile.discipline as Discipline) || 'BIM - ACS',
          organization: profile.organization || 'Google Workspace Partner',
          reasonForAccess: profile.accessReason || 'BIM Model review & coordination',
          accessReason: profile.accessReason || 'BIM Model review & coordination',
          status: 'Pending',
          createdAt: isoTimestamp,
          requestedAt: isoTimestamp,
          timestamp: isoTimestamp,
          requestTimestamp: timestamp,
        },
        { merge: true }
      ).catch((err) => {
        console.warn('Firestore setDoc error in signInWithGoogle:', err);
      });
    } catch (err) {
      console.warn('Firestore error in signInWithGoogle:', err);
    }

    // Immediately record to Admin Audit Trail
    const newAudit: AdminAuditLog = {
      id: `audit-${Date.now()}`,
      action: 'joined',
      targetUserEmail: trimmedEmail,
      targetUserName: formattedName,
      performedBy: 'Google Workspace SSO (Gmail)',
      timestamp,
      details: `New external user authenticated via Google SSO: ${trimmedEmail} (${formattedName}). Org: ${profile.organization || 'Google Workspace'}. Registered in Admin Nexus awaiting Super Admin review and access level assignment.`,
    };
    setAuditLogs((prev) => [newAudit, ...prev]);

    const newPendingUser: AuthUser = {
      id: newRequest.id,
      googleId: profile.googleId,
      email: newRequest.email,
      name: newRequest.name,
      avatar: newRequest.avatar,
      role: newRequest.requestedRole,
      appRole: 'VIEWER',
      status: 'PENDING',
      isAdmin: false,
      accessLevel: 'Viewer',
      organization: newRequest.organization,
      accessReason: newRequest.accessReason,
      requestTimestamp: timestamp,
    };

    setCurrentUser(newPendingUser);
    return { status: 'PENDING', user: newPendingUser };
  };

  const signInWithEmail = (
    email: string,
    name?: string
  ): { status: UserApprovalStatus; user: AuthUser } => {
    return signInWithGoogle({
      email,
      name,
    });
  };

  const requestAccess = (params: {
    name: string;
    email: string;
    requestedRole: string;
    primaryDiscipline: Discipline;
    organization?: string;
    accessReason?: string;
  }): { status: UserApprovalStatus; user: AuthUser } => {
    return signInWithGoogle({
      email: params.email,
      name: params.name,
      organization: params.organization,
      discipline: params.primaryDiscipline,
      accessReason: params.accessReason,
    });
  };

  const updateAccessRequestReason = (
    requestId: string,
    accessReason: string,
    organization?: string
  ) => {
    setOnboardingRequests((prev) =>
      prev.map((r) =>
        r.id === requestId || (currentUser && r.email.toLowerCase() === currentUser.email.toLowerCase())
          ? {
              ...r,
              accessReason,
              ...(organization ? { organization } : {}),
            }
          : r
      )
    );

    if (currentUser) {
      setCurrentUser({
        ...currentUser,
        accessReason,
        ...(organization ? { organization } : {}),
      });
    }
  };

  const checkUserStatus = () => {
    if (!currentUser) return;

    if (
      isSuperAdminEmail(currentUser.email) ||
      currentUser.name.toLowerCase().includes('sushoovan das')
    ) {
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              status: 'APPROVED',
              appRole: 'SUPER_ADMIN',
              isAdmin: true,
              accessLevel: 'Super Admin',
            }
          : null
      );
      return;
    }

    // Check onboarding requests
    const matchingReq = onboardingRequests.find(
      (r) => r.email.toLowerCase() === currentUser.email.toLowerCase()
    );
    if (matchingReq) {
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              status: matchingReq.status,
              role: matchingReq.requestedRole,
              appRole: (matchingReq.assignedRole as UserRole) || prev.appRole,
              accessLevel: matchingReq.assignedAccessLevel || prev.accessLevel,
              organization: matchingReq.organization || prev.organization,
              accessReason: matchingReq.accessReason || prev.accessReason,
            }
          : null
      );
    }
  };

  /**
   * Register direct access request submitted from landing page contact/submission form.
   * Ensures instant sync across state, localStorage, audit logs, and Firestore.
   */
  const registerAccessRequest = async (params: {
    name: string;
    email: string;
    fullName?: string;
    discipline?: string;
    reasonForAccess?: string;
    uid?: string;
    organization?: string;
    accessReason?: string;
    existingDbRecord?: DatabaseRoleResult;
    skipFirestoreWrite?: boolean;
  }): Promise<OnboardingRequest> => {
    const trimmedEmail = params.email.trim().toLowerCase();
    const formattedName = (params.fullName || params.name || '').trim() || trimmedEmail.split('@')[0];
    const requestId = params.uid || generateRequestDocId(trimmedEmail);
    const timestamp = new Date().toLocaleString([], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const isoTimestamp = new Date().toISOString();
    const discipline = params.discipline || params.organization || 'BIM - ACS';
    const reasonForAccess = params.reasonForAccess || params.accessReason || 'Sign-in Access Request for ProductionPulse BPMS';

    // Check if an access request already exists in memory
    const existingReq = onboardingRequests.find(
      (r) => (r.email || '').toLowerCase().trim() === trimmedEmail || r.id === requestId
    );
    const dbRecord = params.existingDbRecord;

    const preservedAppRole: UserRole =
      existingReq?.assignedRole ||
      (dbRecord && dbRecord.source !== 'default' ? dbRecord.role : 'EDITOR');

    const preservedStatus: UserApprovalStatus =
      params.existingDbRecord?.status === 'APPROVED' ? 'APPROVED' : 'pending';

    const preservedAccessLevel: AccessLevel =
      existingReq?.assignedAccessLevel ||
      (dbRecord && dbRecord.source !== 'default' ? dbRecord.accessLevel : mapAppRoleToAccessLevel(preservedAppRole));

    const preservedDisplayRole: string =
      existingReq?.role ||
      (dbRecord && dbRecord.source !== 'default' ? dbRecord.displayRole : mapAppRoleToDisplayRole(preservedAppRole));

    const effectiveDocId = params.uid || existingReq?.id || requestId;

    const newRequest: OnboardingRequest = {
      id: effectiveDocId,
      googleId: existingReq?.googleId || effectiveDocId,
      email: trimmedEmail,
      name: formattedName,
      fullName: formattedName,
      avatar: existingReq?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(formattedName)}`,
      role: preservedDisplayRole,
      requestedRole: existingReq?.requestedRole || 'Editor',
      assignedRole: preservedAppRole,
      assignedAccessLevel: preservedAccessLevel,
      primaryDiscipline: existingReq?.primaryDiscipline || discipline,
      discipline: existingReq?.discipline || discipline,
      createdAt: isoTimestamp,
      requestedAt: isoTimestamp,
      requestTimestamp: timestamp,
      timestamp: isoTimestamp,
      status: preservedStatus,
      organization: existingReq?.organization || discipline,
      reasonForAccess: reasonForAccess || existingReq?.reasonForAccess,
      accessReason: reasonForAccess || existingReq?.accessReason,
      notes: 'Sign-in access request awaiting Super Admin review in Admin Nexus.',
      reviewedBy: preservedStatus === 'pending' ? undefined : existingReq?.reviewedBy,
      reviewedAt: preservedStatus === 'pending' ? undefined : existingReq?.reviewedAt,
    };

    // 1. Persist to local storage & broadcast channel immediately and update React state so Pending Queue (N) updates without manual refresh
    saveLocalAccessRequest(newRequest);
    setOnboardingRequests((prev) => [
      newRequest,
      ...prev.filter((r) => (r.email || '').toLowerCase().trim() !== trimmedEmail && r.id !== effectiveDocId),
    ]);

    // 2. Log to Admin Audit Trail
    const newAudit: AdminAuditLog = {
      id: `audit-${Date.now()}`,
      action: 'joined',
      targetUserEmail: trimmedEmail,
      targetUserName: formattedName,
      performedBy: 'Sign-in Access Gateway',
      timestamp,
      details: `New access request submitted from sign-in: ${formattedName} (${trimmedEmail}). Registered in Admin Nexus awaiting Super Admin approval.`,
    };
    setAuditLogs((prev) => [newAudit, ...prev]);

    // 3. Save to central database collections ('access_requests' and 'accessRequests') in Firestore non-blockingly unless caller already wrote it
    if (!params.skipFirestoreWrite) {
      if (preservedStatus === 'APPROVED') {
        for (const colName of ['access_requests', 'accessRequests']) {
          setDoc(
            doc(db, colName, effectiveDocId),
            {
              id: effectiveDocId,
              uid: effectiveDocId,
              fullName: formattedName,
              name: formattedName,
              email: trimmedEmail,
              lastLoginAt: isoTimestamp,
              lastActive: isoTimestamp,
              updatedAt: isoTimestamp,
            },
            { merge: true }
          ).catch((err) => console.warn(`[BimDataContext] Firestore ${colName} update diagnostic:`, err?.message || err));
        }
      } else {
        const firestorePayload = {
          id: effectiveDocId,
          uid: effectiveDocId,
          name: formattedName,
          fullName: formattedName,
          email: trimmedEmail,
          discipline,
          primaryDiscipline: discipline,
          organization: discipline,
          reasonForAccess,
          accessReason: reasonForAccess,
          status: 'pending',
          role: 'Editor',
          assignedRole: 'EDITOR',
          requestedRole: 'Editor',
          assignedAccessLevel: 'Editor',
          createdAt: serverTimestamp(),
          requestedAt: isoTimestamp,
          timestamp: isoTimestamp,
          requestTimestamp: timestamp,
          updatedAt: isoTimestamp,
        };
        for (const colName of ['access_requests', 'accessRequests']) {
          setDoc(doc(db, colName, effectiveDocId), firestorePayload, { merge: true }).catch(
            (err) => console.warn(`[BimDataContext] Firestore ${colName} write diagnostic:`, err?.message || err)
          );
        }
      }
    }

    return newRequest;
  };

  const approveOnboardingRequest = (
    requestId: string,
    assignedRole: UserRole | string = 'EDITOR',
    assignedAccessLevel?: AccessLevel,
    assignedDiscipline?: Discipline | string
  ) => {
    let approvedReq: OnboardingRequest | undefined;

    const actionTimestamp = new Date().toLocaleString([], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const nowIso = new Date().toISOString();

    const validatedRole: UserRole =
      assignedRole === 'SUPER_ADMIN' || assignedRole === 'DIRECTOR' || assignedRole === 'PROJECT_MANAGER' || assignedRole === 'EDITOR' || assignedRole === 'VIEWER'
        ? assignedRole
        : normalizeUserRole(assignedRole);

    const calculatedAccessLevel: AccessLevel =
      assignedAccessLevel || mapAppRoleToAccessLevel(validatedRole);

    const displayRole = mapAppRoleToDisplayRole(validatedRole);

    const reqTarget = onboardingRequests.find((r) => r.id === requestId);
    const targetDiscipline: Discipline =
      (assignedDiscipline as Discipline) ||
      (reqTarget?.assignedDiscipline as Discipline) ||
      (reqTarget?.discipline as Discipline) ||
      (reqTarget?.primaryDiscipline as Discipline) ||
      'BIM - ACS';

    setOnboardingRequests((prev) =>
      prev.map((r) => {
        if (r.id === requestId || (reqTarget && r.email.toLowerCase() === reqTarget.email.toLowerCase())) {
          approvedReq = {
            ...r,
            status: 'APPROVED',
            reviewedBy: `${SUPER_ADMIN_NAME} (Super Admin)`,
            reviewedAt: actionTimestamp,
            timestamp: nowIso,
            assignedRole: validatedRole,
            assignedAccessLevel: calculatedAccessLevel,
            requestedRole: displayRole,
            role: displayRole,
            discipline: targetDiscipline,
            primaryDiscipline: targetDiscipline,
            assignedDiscipline: targetDiscipline,
            orgDiscipline: targetDiscipline,
            organization: targetDiscipline,
          };
          return approvedReq;
        }
        return r;
      })
    );

    const effectiveReq = approvedReq || reqTarget;

    if (effectiveReq) {
      saveLocalAccessRequest({
        ...effectiveReq,
        status: 'APPROVED',
        reviewedBy: `${SUPER_ADMIN_NAME} (Super Admin)`,
        reviewedAt: actionTimestamp,
        timestamp: nowIso,
        assignedRole: validatedRole,
        assignedAccessLevel: calculatedAccessLevel,
        requestedRole: displayRole,
        role: displayRole,
        discipline: targetDiscipline,
        primaryDiscipline: targetDiscipline,
        assignedDiscipline: targetDiscipline,
        orgDiscipline: targetDiscipline,
        organization: targetDiscipline,
      });

      // Identity Sync: strict field mapping between access request and member profile
      const applicantFullName = (effectiveReq.fullName || effectiveReq.name || effectiveReq.email.split('@')[0]).trim();
      const applicantEmail = effectiveReq.email.trim().toLowerCase();
      unregisterDeletedMemberKeys({
        id: effectiveReq.id,
        email: applicantEmail,
        name: applicantFullName,
      });

      // 1. Dynamic Onboarding: Populate directly into active Team Member List (Team Efficiency)
      setEmployees((prev) => {
        const existingIdx = prev.findIndex(
          (e) =>
            (e.email || '').toLowerCase().trim() === applicantEmail ||
            (applicantFullName && (e.name || '').toLowerCase().trim() === applicantFullName.toLowerCase()) ||
            e.id === effectiveReq.id ||
            e.id === `emp-${effectiveReq.id}`
        );
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            name: applicantFullName,
            email: applicantEmail,
            role: validatedRole,
            discipline: targetDiscipline,
            primaryDiscipline: targetDiscipline,
            status: 'Active',
          };
          return updated;
        } else {
          const newEmp: Employee = {
            id: `emp-${generateRequestDocId(applicantEmail) || Date.now()}`,
            name: applicantFullName,
            role: validatedRole,
            email: applicantEmail,
            avatar:
              effectiveReq.avatar ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(applicantFullName)}`,
            primaryDiscipline: targetDiscipline,
            discipline: targetDiscipline,
            weeklyCapacityHours: 40,
            experienceYears: 4,
            status: 'Active',
            activeProjectIds: [projects[0]?.id || 'proj-1'],
            skills: [targetDiscipline, 'Revit 2026', 'Navisworks Manage', 'BIM Coordination'],
            phone: '+1 (555) 019-2834',
          };
          return [...prev, newEmp];
        }
      });

      // 2. Add Audit Log
      const newAudit: AdminAuditLog = {
        id: `audit-${Date.now()}`,
        action: 'approved',
        targetUserEmail: applicantEmail,
        targetUserName: applicantFullName,
        performedBy: `${SUPER_ADMIN_NAME} (Super Admin)`,
        timestamp: actionTimestamp,
        details: `Approved access request as ${displayRole} [${targetDiscipline}] with [${calculatedAccessLevel}] permissions. Added directly to active Team Member List.`,
      };
      setAuditLogs((prev) => [newAudit, ...prev]);

      // 3. Update current active user session if matching
      if (currentUser && currentUser.email.toLowerCase() === applicantEmail) {
        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                status: 'APPROVED',
                role: displayRole,
                appRole: validatedRole,
                accessLevel: calculatedAccessLevel,
              }
            : null
        );
      }

      // 4. Persist status and assigned role in Firestore access_requests & users collection
      persistUserRoleToDatabase({
        email: applicantEmail,
        role: validatedRole,
        status: 'APPROVED',
        accessLevel: calculatedAccessLevel,
        name: applicantFullName,
        discipline: targetDiscipline,
        uid: effectiveReq.googleId || effectiveReq.id,
      }).catch((err) => {
        console.error('persistUserRoleToDatabase error in approve:', err);
      });
    }
  };

  const rejectOnboardingRequest = (requestId: string, notes?: string) => {
    let rejectedReq: OnboardingRequest | undefined;

    const actionTimestamp = new Date().toLocaleString([], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const nowIso = new Date().toISOString();

    const reqTarget = onboardingRequests.find((r) => r.id === requestId);

    setOnboardingRequests((prev) =>
      prev.map((r) => {
        if (r.id === requestId || (reqTarget && r.email.toLowerCase() === reqTarget.email.toLowerCase())) {
          rejectedReq = {
            ...r,
            status: 'REJECTED',
            reviewedBy: `${SUPER_ADMIN_NAME} (Super Admin)`,
            reviewedAt: actionTimestamp,
            timestamp: nowIso,
            notes: notes || 'Access request rejected by Super Admin.',
          };
          return rejectedReq;
        }
        return r;
      })
    );

    const effectiveReq = rejectedReq || reqTarget;

    if (effectiveReq) {
      saveLocalAccessRequest({
        ...effectiveReq,
        status: 'REJECTED',
        reviewedBy: `${SUPER_ADMIN_NAME} (Super Admin)`,
        reviewedAt: actionTimestamp,
        timestamp: nowIso,
        notes: notes || 'Access request rejected by Super Admin.',
      });

      const applicantEmail = effectiveReq.email.trim().toLowerCase();
      const newAudit: AdminAuditLog = {
        id: `audit-${Date.now()}`,
        action: 'rejected',
        targetUserEmail: applicantEmail,
        targetUserName: effectiveReq.name,
        performedBy: `${SUPER_ADMIN_NAME} (Super Admin)`,
        timestamp: actionTimestamp,
        details: `Declined access request: ${notes || 'Access request declined by administrator.'}`,
      };
      setAuditLogs((prev) => [newAudit, ...prev]);

      // If user is registered in employees, suspend active status
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.email.toLowerCase() === applicantEmail ||
          emp.id === effectiveReq.id ||
          (effectiveReq.googleId && emp.id === effectiveReq.googleId)
            ? { ...emp, status: 'Suspended' }
            : emp
        )
      );

      if (currentUser && currentUser.email.toLowerCase() === applicantEmail) {
        setCurrentUser((prev) => (prev ? { ...prev, status: 'REJECTED' } : null));
      }

      // Persist rejected status in Firestore access_requests & users collection
      persistUserRoleToDatabase({
        email: applicantEmail,
        role: (effectiveReq.assignedRole as UserRole) || 'VIEWER',
        status: 'REJECTED',
        name: effectiveReq.name,
        uid: effectiveReq.googleId || effectiveReq.id,
        notes: notes || 'Access request rejected by Super Admin.',
      }).catch((err) => {
        console.error('persistUserRoleToDatabase error in reject:', err);
      });
    }
  };

  const reopenOnboardingRequest = (requestId: string) => {
    let reopenedReq: OnboardingRequest | undefined;
    const actionTimestamp = new Date().toLocaleString([], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const nowIso = new Date().toISOString();

    const reqTarget = onboardingRequests.find((r) => r.id === requestId);

    setOnboardingRequests((prev) =>
      prev.map((r) => {
        if (r.id === requestId || (reqTarget && r.email.toLowerCase() === reqTarget.email.toLowerCase())) {
          reopenedReq = {
            ...r,
            status: 'pending',
            reviewedBy: undefined,
            reviewedAt: undefined,
            timestamp: nowIso,
            notes: 'Re-opened and restored to Pending Queue by Super Admin.',
          };
          return reopenedReq;
        }
        return r;
      })
    );

    const effectiveReq = reopenedReq || reqTarget;

    if (effectiveReq) {
      saveLocalAccessRequest({
        ...effectiveReq,
        status: 'pending',
        reviewedBy: undefined,
        reviewedAt: undefined,
        timestamp: nowIso,
        notes: 'Re-opened and restored to Pending Queue by Super Admin.',
      });

      const applicantEmail = effectiveReq.email.trim().toLowerCase();
      const newAudit: AdminAuditLog = {
        id: `audit-${Date.now()}`,
        action: 'role_changed',
        targetUserEmail: applicantEmail,
        targetUserName: effectiveReq.name,
        performedBy: `${SUPER_ADMIN_NAME} (Super Admin)`,
        timestamp: actionTimestamp,
        details: `Re-opened declined access request for ${effectiveReq.name} (${applicantEmail}).`,
      };
      setAuditLogs((prev) => [newAudit, ...prev]);

      persistUserRoleToDatabase({
        email: applicantEmail,
        role: (effectiveReq.assignedRole as UserRole) || 'EDITOR',
        status: 'PENDING',
        name: effectiveReq.name,
        uid: effectiveReq.googleId || effectiveReq.id,
        notes: 'Re-opened and restored to Pending Queue by Super Admin.',
      }).catch((err) => {
        console.error('persistUserRoleToDatabase error in reopen:', err);
      });
    }
  };

  const deleteOnboardingRequest = (requestId: string) => {
    const strippedReqId = (requestId || '').replace(/^emp-/, '');
    const matchedEmp = employees.find(
      (e) => e.id === requestId || e.id.replace(/^emp-/, '') === strippedReqId
    );
    const target =
      onboardingRequests.find(
        (r) => r.id === requestId || r.id.replace(/^emp-/, '') === strippedReqId
      ) ||
      (matchedEmp
        ? onboardingRequests.find(
            (r) => r.email.trim().toLowerCase() === matchedEmp.email.trim().toLowerCase()
          )
        : undefined);

    const targetEmail = (target?.email || matchedEmp?.email || '').trim().toLowerCase();
    const targetName = (target?.name || matchedEmp?.name || targetEmail || '').trim();
    if (!target && !matchedEmp && !targetEmail) return;

    removeLocalAccessRequest(requestId, targetEmail);
    registerDeletedMemberKeys({
      id: matchedEmp?.id || requestId,
      email: targetEmail,
      name: targetName,
    });

    setOnboardingRequests((prev) =>
      prev.filter(
        (r) =>
          r.id !== requestId &&
          r.id.replace(/^emp-/, '') !== strippedReqId &&
          (!targetEmail || r.email.trim().toLowerCase() !== targetEmail)
      )
    );

    setEmployees((prev) =>
      prev.filter(
        (e) =>
          e.id !== requestId &&
          e.id.replace(/^emp-/, '') !== strippedReqId &&
          (!targetEmail || e.email.toLowerCase().trim() !== targetEmail) &&
          (!targetName || e.name.toLowerCase().trim() !== targetName.toLowerCase())
      )
    );

    try {
      const detId = targetEmail ? generateRequestDocId(targetEmail) : strippedReqId;
      const candidateDocIds = Array.from(
        new Set([requestId, strippedReqId, `emp-${strippedReqId}`, detId, `emp-${detId}`].filter(Boolean))
      );
      candidateDocIds.forEach((cid) => {
        ['access_requests', 'accessRequests', 'pendingUsers', 'pendingSignups', 'users'].forEach((colName) => {
          deleteDoc(doc(db, colName, cid)).catch(() => {});
        });
      });

      if (targetEmail) {
        ['access_requests', 'accessRequests', 'pendingUsers', 'users'].forEach((colName) => {
          getDocs(query(collection(db, colName), where('email', '==', targetEmail)))
            .then((snap) => {
              snap.docs.forEach((d) => {
                deleteDoc(doc(db, colName, d.id)).catch(() => {});
              });
            })
            .catch(() => {});
        });
      }
    } catch {
      // ignore
    }

    const newAudit: AdminAuditLog = {
      id: `audit-${Date.now()}`,
      action: 'user_deleted',
      targetUserEmail: targetEmail || requestId,
      targetUserName: targetName,
      performedBy: `${SUPER_ADMIN_NAME} (Super Admin)`,
      timestamp: new Date().toLocaleString([], {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      details: `Removed access request record for ${targetEmail || requestId}`,
    };
    setAuditLogs((prev) => [newAudit, ...prev]);

    if (currentUser && targetEmail && currentUser.email.toLowerCase() === targetEmail) {
      setCurrentUser(null);
    }
  };

  const addAuditLog = (log: Omit<AdminAuditLog, 'id' | 'timestamp'>) => {
    const timestamp = new Date().toLocaleString([], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const newAudit: AdminAuditLog = {
      ...log,
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp,
    };
    setAuditLogs((prev) => [newAudit, ...prev]);
  };

  const setSimulatedAuthStatus = (status: UserApprovalStatus) => {
    setCurrentUser((prev) =>
      prev
        ? {
            ...prev,
            status,
          }
        : null
    );
  };

  const switchUser = (userUpdates: Partial<AuthUser>) => {
    setCurrentUser((prev) => {
      if (!prev) {
        return {
          id: 'emp-custom',
          email: userUpdates.email || 'user@productionpulse.com',
          name: userUpdates.name || 'BIM Member',
          role: userUpdates.role || 'BIM Modeler',
          status: userUpdates.status || 'active',
          isAdmin: !!userUpdates.isAdmin,
          accessLevel: userUpdates.accessLevel || 'Editor',
          ...userUpdates,
        };
      }
      return {
        ...prev,
        ...userUpdates,
      };
    });
  };

  const signOut = () => {
    if (auth) {
      auth.logout();
    }
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    localStorage.removeItem('bim_auth_user_central_v1');
    localStorage.removeItem('bim_auth_session_central_v1');
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('bpms_redirect_target');
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new Event('popstate'));
    }
  };
  // Project Helpers
  const getProjectById = (id: string) => projects.find((p) => p.id === id);
  const getEmployeeById = (id: string) => employees.find((e) => e.id === id);

  const getProjectCompletedHours = (projectId: string): number => {
    const project = getProjectById(projectId);
    if (!project) return 0;

    // Deduplicate all active operational daily hour tracking logs across allWorkLogs and workLogs
    const logMap = new Map<string, DailyWorkLog>();
    (workLogs || []).forEach((w) => {
      if (w && w.id && !(w as any).isDeleted) logMap.set(w.id, w);
    });
    (allWorkLogs || []).forEach((w) => {
      if (w && w.id && !(w as any).isDeleted) logMap.set(w.id, w);
    });

    const logsSum = Array.from(logMap.values())
      .filter((w) => !w.isTestEntry && doesLogBelongToProject(w, project))
      .reduce((sum, w) => sum + (Number(w.hoursLogged) || 0), 0);

    if (
      project.isManualLoggedOverride === true &&
      project.manualHoursOverride !== undefined &&
      project.manualHoursOverride !== null &&
      !Number.isNaN(Number(project.manualHoursOverride))
    ) {
      const baseLogged = Number(project.manualHoursBaseLogged ?? logsSum);
      const delta = logsSum - baseLogged;
      return Math.max(0, Number(project.manualHoursOverride) + delta);
    }

    return logsSum;
  };

  const getEmployeeLoggedHours = (
    employeeId: string,
    filterRange: string = 'this-week'
  ): number => {
    const strippedEmpId = (employeeId || '').trim().replace(/^emp-/, '');
    const emp =
      activeTeamMembers.find(
        (e) =>
          e.id === employeeId ||
          (e.id || '').replace(/^emp-/, '') === strippedEmpId
      ) ||
      employees.find(
        (e) =>
          e.id === employeeId ||
          (e.id || '').replace(/^emp-/, '') === strippedEmpId
      );
    const sanitizedEmp = emp ? sanitizeEmployeeRecord(emp) : undefined;
    const empName = (sanitizedEmp?.name || '').toLowerCase().trim();
    const empEmail = (sanitizedEmp?.email || '').toLowerCase().trim();
    const detEmailId = empEmail ? generateRequestDocId(empEmail) : '';

    const matchesMember = (item: {
      employeeId?: string;
      userId?: string;
      employeeName?: string;
      memberEmail?: string;
      userEmail?: string;
    }): boolean => {
      const itemName = (item.employeeName || '').toLowerCase().trim();
      if (
        empName &&
        itemName &&
        itemName !== 'bim modeler' &&
        itemName !== 'team member' &&
        empName !== itemName
      ) {
        return false;
      }

      const itemEmail = (item.memberEmail || item.userEmail || '').toLowerCase().trim();
      if (empEmail && itemEmail && empEmail !== itemEmail) {
        return false;
      }

      const itemEmpId = (item.employeeId || '').trim();
      const itemEmpIdStripped = itemEmpId.replace(/^emp-/, '');

      if (
        (employeeId && itemEmpId === employeeId) ||
        (strippedEmpId && itemEmpIdStripped === strippedEmpId) ||
        (detEmailId && itemEmpIdStripped === detEmailId)
      ) {
        return true;
      }
      if (empEmail && itemEmail && empEmail === itemEmail) {
        return true;
      }
      if (empName && itemName && empName === itemName) {
        return true;
      }
      return false;
    };

    const weekRange = getCurrentWeekRange();
    const todayIso = toLocalIsoDate(new Date());

    // Exclude test entries from operational employee logged hours & capacity calculations
    const matchingLogs = (allWorkLogs || [])
      .map((w) => sanitizeWorkLogRecord(w))
      .filter((w) => !w.isTestEntry && matchesMember(w));

    if (filterRange === 'all') {
      return matchingLogs.reduce((sum, l) => sum + (Number(l.hoursLogged) || 0), 0);
    }

    if (filterRange === 'today') {
      return matchingLogs
        .filter((w) => getEffectiveLogDate(w, weekRange) === todayIso)
        .reduce((sum, l) => sum + (Number(l.hoursLogged) || 0), 0);
    }

    if (filterRange === 'this-month') {
      const now = new Date();
      return matchingLogs
        .filter((w) => {
          const effDate = getEffectiveLogDate(w, weekRange);
          const logDate = new Date(`${effDate}T00:00:00`);
          return (
            !Number.isNaN(logDate.getTime()) &&
            logDate.getMonth() === now.getMonth() &&
            logDate.getFullYear() === now.getFullYear()
          );
        })
        .reduce((sum, l) => sum + (Number(l.hoursLogged) || 0), 0);
    }

    // Default: 'this-week' -> Global Real-Time Weekly Capacity Load calculation
    // Dynamically aggregate and sum the user's assigned hours (from project_assignments)
    // and/or logged hours for the current week (from work_logs).
    const currentWeekLogs = matchingLogs.filter((w) => {
      const effDate = getEffectiveLogDate(w, weekRange);
      return effDate >= weekRange.startIso && effDate <= weekRange.endIso;
    });

    const weeklyLoggedHours = (currentWeekLogs.length > 0 ? currentWeekLogs : matchingLogs).reduce(
      (sum, l) => sum + (Number(l.hoursLogged) || 0),
      0
    );

    const matchingAllocations = (resourceAllocations || []).filter(
      (a) => a.status !== 'Completed' && matchesMember(a)
    );

    const weeklyAssignedHours = matchingAllocations.reduce(
      (sum, a) => sum + (Number(a.assignedHours) || 0),
      0
    );

    if (weeklyAssignedHours > 0 && weeklyLoggedHours > 0) {
      // Aggregate per-project maximum of assigned vs logged hours so unallocated project logs add onto assigned capacity
      const normProj = (pid?: string) =>
        (pid || '').startsWith('proj-') ? (pid || '') : (pid || '').replace(/^p(\d+)$/, 'proj-$1');
      const byProject = new Map<string, { assigned: number; logged: number }>();

      matchingAllocations.forEach((a) => {
        const key = normProj(a.projectId) || '__unassigned__';
        const cur = byProject.get(key) || { assigned: 0, logged: 0 };
        cur.assigned += Number(a.assignedHours) || 0;
        byProject.set(key, cur);
      });

      const activeLogsForWeek = currentWeekLogs.length > 0 ? currentWeekLogs : matchingLogs;
      activeLogsForWeek.forEach((l) => {
        const key = normProj(l.projectId) || '__unassigned__';
        const cur = byProject.get(key) || { assigned: 0, logged: 0 };
        cur.logged += Number(l.hoursLogged) || 0;
        byProject.set(key, cur);
      });

      let combinedTotal = 0;
      byProject.forEach(({ assigned, logged }) => {
        combinedTotal += Math.max(assigned, logged);
      });
      return combinedTotal;
    }

    return weeklyAssignedHours > 0 ? weeklyAssignedHours : weeklyLoggedHours;
  };

  // Actions
  const addProject = (projectData: Omit<BimProject, 'id'>): BimProject => {
    const newProj: BimProject = {
      ...projectData,
      id: `proj-${Date.now()}`,
      status: projectData.status || 'WIP',
      totalEstimatedHours: Number(projectData.totalEstimatedHours) || 0,
      totalCompletedHours: Number(projectData.totalCompletedHours) || 0,
      plannedDeliveryDate:
        projectData.plannedDeliveryDate ||
        projectData.targetCompletionDate ||
        new Date().toISOString().slice(0, 10),
    };

    // Immediate optimistic update so all views and dropdowns reflect the new project right away
    setProjects((prev) => [newProj, ...prev.filter((p) => p.id !== newProj.id)]);

    try {
      // Strip undefined values so Firestore setDoc never rejects optional fields
      const sanitizedProj = JSON.parse(JSON.stringify(newProj));
      const ssotPayload = {
        ...sanitizedProj,
        projectName: newProj.name,
        status: newProj.status || 'WIP',
        estimatedHours: Number(newProj.totalEstimatedHours) || 0,
        totalHoursLogged: Number(newProj.totalCompletedHours) || 0,
        plannedDeliveryDate:
          newProj.plannedDeliveryDate ||
          newProj.targetCompletionDate ||
          new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString(),
      };
      fetch('/api/ssot/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ssotPayload),
      }).catch(() => {});

      const firestorePayload = {
        ...ssotPayload,
        createdAt: serverTimestamp(),
      };
      setDoc(doc(db, 'projects', newProj.id), firestorePayload, { merge: true }).catch((err) =>
        console.warn('Firestore addProject sync notice:', err)
      );
    } catch (e) {
      console.warn('Firestore addProject notice:', e);
    }
    return newProj;
  };

  const updateProject = (id: string, updates: Partial<BimProject>) => {
    const existingProj = projects.find((p) => p.id === id);
    const normalizedUpdates: Partial<BimProject> = { ...updates };

    if (normalizedUpdates.estimatedHours !== undefined || normalizedUpdates.totalEstimatedHours !== undefined) {
      const estVal = Number(
        normalizedUpdates.estimatedHours ?? normalizedUpdates.totalEstimatedHours ?? 0
      );
      normalizedUpdates.totalEstimatedHours = estVal;
      normalizedUpdates.estimatedHours = estVal;
      normalizedUpdates.manualEstimatedHoursOverride = estVal;
    }

    if (
      normalizedUpdates.changedHours !== undefined ||
      normalizedUpdates.additionalHours !== undefined ||
      normalizedUpdates.manualChangedHoursOverride !== undefined
    ) {
      const chgVal = Number(
        normalizedUpdates.changedHours ??
          normalizedUpdates.manualChangedHoursOverride ??
          normalizedUpdates.additionalHours ??
          0
      );
      normalizedUpdates.changedHours = chgVal;
      normalizedUpdates.additionalHours = chgVal;
      normalizedUpdates.manualChangedHoursOverride = chgVal;
    }

    if (
      normalizedUpdates.totalLogged !== undefined ||
      normalizedUpdates.totalCompletedHours !== undefined ||
      normalizedUpdates.manualHoursOverride !== undefined
    ) {
      const logVal = Number(
        normalizedUpdates.totalLogged ??
          normalizedUpdates.manualHoursOverride ??
          normalizedUpdates.totalCompletedHours ??
          0
      );
      normalizedUpdates.totalLogged = logVal;
      normalizedUpdates.totalCompletedHours = logVal;
      if (normalizedUpdates.isManualLoggedOverride === true || normalizedUpdates.manualHoursOverride !== undefined) {
        normalizedUpdates.manualHoursOverride = logVal;
        normalizedUpdates.isManualLoggedOverride = true;
      }
    }

    let updatedDoc: BimProject | undefined = existingProj
      ? { ...existingProj, ...normalizedUpdates }
      : undefined;

    setProjects((prev) => {
      const next = prev.map((p) => {
        if (p.id === id) {
          updatedDoc = { ...p, ...normalizedUpdates };
          return updatedDoc;
        }
        return p;
      });
      try {
        localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(next));
      } catch {}
      return next;
    });

    try {
      const base = updatedDoc ? { ...updatedDoc, ...normalizedUpdates } : { id, ...normalizedUpdates };
      const sanitizedPayload = JSON.parse(JSON.stringify(base));
      if (sanitizedPayload.name !== undefined) {
        sanitizedPayload.projectName = sanitizedPayload.name;
      }
      if (sanitizedPayload.totalEstimatedHours !== undefined) {
        sanitizedPayload.estimatedHours = Number(sanitizedPayload.totalEstimatedHours) || 0;
        sanitizedPayload.manualEstimatedHoursOverride = Number(sanitizedPayload.totalEstimatedHours) || 0;
      }
      if (
        sanitizedPayload.changedHours !== undefined ||
        sanitizedPayload.additionalHours !== undefined ||
        sanitizedPayload.manualChangedHoursOverride !== undefined
      ) {
        const chgVal = Number(
          sanitizedPayload.changedHours ??
            sanitizedPayload.manualChangedHoursOverride ??
            sanitizedPayload.additionalHours ??
            0
        );
        sanitizedPayload.changedHours = chgVal;
        sanitizedPayload.additionalHours = chgVal;
        sanitizedPayload.manualChangedHoursOverride = chgVal;
      }
      if (sanitizedPayload.totalCompletedHours !== undefined) {
        sanitizedPayload.totalHoursLogged = Number(sanitizedPayload.totalCompletedHours) || 0;
        sanitizedPayload.totalLogged = Number(sanitizedPayload.totalCompletedHours) || 0;
        if (sanitizedPayload.isManualLoggedOverride === true) {
          sanitizedPayload.manualHoursOverride = Number(sanitizedPayload.totalCompletedHours) || 0;
        }
      }
      if ('plannedDeliveryDate' in normalizedUpdates) {
        sanitizedPayload.plannedDeliveryDate = normalizedUpdates.plannedDeliveryDate || '';
        sanitizedPayload.targetCompletionDate =
          normalizedUpdates.targetCompletionDate !== undefined
            ? normalizedUpdates.targetCompletionDate || ''
            : normalizedUpdates.plannedDeliveryDate || '';
      }
      if ('actualDeliveredDate' in normalizedUpdates) {
        sanitizedPayload.actualDeliveredDate = normalizedUpdates.actualDeliveredDate || '';
      }
      sanitizedPayload.updatedAt = new Date().toISOString();

      fetch('/api/ssot/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedPayload),
      }).catch(() => {});

      setDoc(doc(db, 'projects', id), sanitizedPayload, { merge: true }).catch((err) =>
        console.warn('Firestore updateProject sync notice:', err)
      );
    } catch (e) {
      console.warn('Firestore updateProject notice:', e);
    }
  };

  const updateProjectStatus = (id: string, status: BimProject['status']) => {
    let updatedDoc: BimProject | undefined;
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          updatedDoc = { ...p, status };
          return updatedDoc;
        }
        return p;
      })
    );
    try {
      const payload = updatedDoc ? { ...updatedDoc, status } : { id, status };
      const sanitizedPayload = JSON.parse(JSON.stringify(payload));
      fetch('/api/ssot/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedPayload),
      }).catch(() => {});
      setDoc(doc(db, 'projects', id), sanitizedPayload, { merge: true }).catch((err) =>
        console.warn('Firestore updateProjectStatus sync notice:', err)
      );
    } catch (e) {
      console.warn('Firestore updateProjectStatus notice:', e);
    }
  };

  const deleteProject = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setAllWorkLogs((prev) => prev.filter((w) => w.projectId !== id));
    if (selectedProjectId === id) {
      setSelectedProjectId('all');
    }
    try {
      deleteDoc(doc(db, 'projects', id)).catch((err) =>
        console.warn('Firestore deleteProject sync notice:', err)
      );
    } catch (e) {
      console.warn('Firestore deleteProject notice:', e);
    }
  };

  const addWorkLog = (
    logData: Omit<DailyWorkLog, 'id' | 'timestamp'>
  ): DailyWorkLog => {
    const logId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const rawTargetId = (
      logData.employeeId ||
      (logData as any).memberId ||
      (logData as any).userId ||
      ''
    ).trim();
    const rawTargetIdStripped = rawTargetId.replace(/^emp-/, '');
    const rawTargetName = (logData.employeeName || '').trim();
    const lowerTargetName = rawTargetName.toLowerCase();
    const rawTargetEmail = (
      logData.memberEmail ||
      (logData as any).userEmail ||
      ''
    )
      .trim()
      .toLowerCase();

    const isGenericTargetName =
      !lowerTargetName ||
      lowerTargetName === 'bim modeler' ||
      lowerTargetName === 'team member' ||
      lowerTargetName === 'bim engineer';

    // Match strictly against deduplicated/sanitized activeTeamMembers, enforcing name agreement when a name is provided
    const matchedTargetEmp = activeTeamMembers.find((e) => {
      const eName = (e.name || '').trim().toLowerCase();
      const eEmail = (e.email || '').trim().toLowerCase();
      if (!isGenericTargetName && eName && eName !== lowerTargetName) {
        return false;
      }
      return (
        (!isGenericTargetName && eName === lowerTargetName) ||
        (rawTargetId &&
          (e.id === rawTargetId || e.id.replace(/^emp-/, '') === rawTargetIdStripped)) ||
        (rawTargetEmail && eEmail === rawTargetEmail)
      );
    });

    const isForCurrentUser = Boolean(
      !rawTargetId && isGenericTargetName && !rawTargetEmail
        ? true
        : (currentUser?.name &&
            !isGenericTargetName &&
            currentUser.name.trim().toLowerCase() === lowerTargetName) ||
          (currentUser?.email &&
            isGenericTargetName &&
            rawTargetEmail &&
            currentUser.email.trim().toLowerCase() === rawTargetEmail)
    );

    const userEmail = (
      rawTargetEmail ||
      matchedTargetEmp?.email ||
      (isForCurrentUser ? currentUser?.email : '') ||
      ''
    )
      .trim()
      .toLowerCase();

    const resolvedMemberId =
      matchedTargetEmp?.id ||
      rawTargetId ||
      (isForCurrentUser ? currentUser?.id : '') ||
      '';

    const resolvedEmployeeName = !isGenericTargetName
      ? matchedTargetEmp?.name || rawTargetName
      : matchedTargetEmp?.name ||
        (isForCurrentUser ? currentUser?.name : '') ||
        'BIM Modeler';

    const userId =
      resolvedMemberId ||
      (logData as any).userId ||
      '';

    const hoursValue = Number(logData.hoursLogged) || 0;
    const isoNow = new Date().toISOString();
    const isTestEntryFlag = Boolean(logData.isTestEntry ?? false);
    const loggedByValue =
      logData.loggedBy ||
      (currentUser?.email || '').trim().toLowerCase() ||
      currentUser?.name ||
      userEmail ||
      resolvedEmployeeName ||
      '';
    const createdAtValue = logData.createdAt || isoNow;

    const newLog: DailyWorkLog = sanitizeWorkLogRecord({
      ...logData,
      id: logId,
      employeeId: resolvedMemberId,
      memberId: resolvedMemberId,
      employeeName: resolvedEmployeeName,
      hoursLogged: hoursValue,
      memberEmail: userEmail,
      userEmail: userEmail,
      userId: userId,
      timestamp: isoNow,
      isTestEntry: isTestEntryFlag,
      loggedBy: loggedByValue,
      createdAt: createdAtValue,
    });

    // 1. Optimistic state update in allWorkLogs
    setAllWorkLogs((prev) => [newLog, ...prev.filter((w) => w.id !== logId)]);

    // 2. Persist lean payload to Firestore timesheets, daily_logs, work_logs, and Central SSOT store
    try {
      const payload = JSON.parse(
        JSON.stringify({
          ...newLog,
          employeeId: newLog.employeeId,
          memberId: newLog.employeeId,
          userId: newLog.employeeId,
          employeeName: newLog.employeeName,
          memberEmail: newLog.memberEmail || '',
          userEmail: newLog.userEmail || '',
          hours: hoursValue,
          hoursLogged: hoursValue,
          isTestEntry: isTestEntryFlag,
          loggedBy: loggedByValue,
          createdAt: createdAtValue,
          updatedAt: isoNow,
        })
      );
      fetch('/api/ssot/timesheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const ch = new BroadcastChannel('bim_ssot_realtime_channel');
          ch.postMessage({ type: 'UPSERT_LOG', log: payload });
          ch.close();
        } catch {}
      }
      setDoc(doc(db, 'timesheets', logId), payload, { merge: true }).catch((err) =>
        console.warn('Firestore timesheets addWorkLog sync notice:', err)
      );
      setDoc(doc(db, 'daily_logs', logId), payload, { merge: true }).catch((err) =>
        console.warn('Firestore daily_logs addWorkLog sync notice:', err)
      );
      setDoc(doc(db, 'work_logs', logId), payload, { merge: true }).catch((err) =>
        console.warn('Firestore work_logs addWorkLog sync notice:', err)
      );
    } catch (fsErr) {
      console.warn('Firestore addWorkLog error:', fsErr);
    }

    // 3. Synchronize project total logged hours and task completed hours in real time
    if (!isTestEntryFlag) {
      const nextAllLogs = [newLog, ...(allWorkLogs || []).filter((w) => w.id !== logId)];
      setProjects((prev) =>
        prev.map((proj) => {
          if (!doesLogBelongToProject(newLog, proj)) return proj;
          const updatedTasks = (proj.tasks || []).map((task) => {
            if (task.name === logData.taskName) {
              const newCompleted = (task.completedHours || 0) + hoursValue;
              return {
                ...task,
                completedHours: newCompleted,
                status:
                  newCompleted >= task.estimatedHours
                    ? ('Completed' as const)
                    : ('In Progress' as const),
              };
            }
            return task;
          });
          const dynamicTotal = nextAllLogs
            .filter((w) => !w.isTestEntry && !(w as any).isDeleted && doesLogBelongToProject(w, proj))
            .reduce((sum, w) => sum + (Number(w.hoursLogged) || 0), 0);
          const updatedProj: BimProject = {
            ...proj,
            tasks: updatedTasks,
            totalCompletedHours: dynamicTotal,
            totalLogged: dynamicTotal,
            isManualLoggedOverride: false,
            manualHoursOverride: undefined,
          };
          try {
            updateDoc(doc(db, 'projects', proj.id), {
              tasks: updatedTasks,
              totalCompletedHours: dynamicTotal,
              totalHoursLogged: dynamicTotal,
              totalLogged: dynamicTotal,
              isManualLoggedOverride: false,
            }).catch(() => {});
          } catch {}
          return updatedProj;
        })
      );
    }

    return newLog;
  };

  const updateWorkLog = (id: string, updates: Partial<DailyWorkLog>) => {
    const previousLog = allWorkLogs.find((w) => w.id === id);
    const fullUpdated: DailyWorkLog | undefined = previousLog
      ? sanitizeWorkLogRecord({ ...previousLog, ...updates })
      : undefined;

    const nextAllLogs = (allWorkLogs || []).map((w) =>
      w.id === id ? sanitizeWorkLogRecord({ ...w, ...updates }) : w
    );
    setAllWorkLogs(nextAllLogs);
    try {
      const nowIso = new Date().toISOString();
      const basePayload = fullUpdated
        ? { ...fullUpdated }
        : sanitizeWorkLogRecord({ ...(updates as DailyWorkLog), id });
      const sanitizedUpdates = JSON.parse(
        JSON.stringify({
          ...basePayload,
          updatedAt: nowIso,
          timestamp: nowIso,
          ...(basePayload.hoursLogged !== undefined
            ? { hours: Number(basePayload.hoursLogged) || 0, hoursLogged: Number(basePayload.hoursLogged) || 0 }
            : {}),
        })
      );
      fetch('/api/ssot/timesheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedUpdates),
      }).catch(() => {});
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const ch = new BroadcastChannel('bim_ssot_realtime_channel');
          ch.postMessage({ type: 'UPSERT_LOG', log: sanitizedUpdates });
          ch.close();
        } catch {}
      }
      setDoc(doc(db, 'timesheets', id), sanitizedUpdates, { merge: true }).catch((err) =>
        console.warn('Firestore timesheets updateWorkLog sync notice:', err)
      );
      setDoc(doc(db, 'daily_logs', id), sanitizedUpdates, { merge: true }).catch((err) =>
        console.warn('Firestore daily_logs updateWorkLog sync notice:', err)
      );
      setDoc(doc(db, 'work_logs', id), sanitizedUpdates, { merge: true }).catch((err) =>
        console.warn('Firestore work_logs updateWorkLog sync notice:', err)
      );
    } catch (e) {
      console.warn('Firestore updateWorkLog notice:', e);
    }

    if (previousLog || fullUpdated) {
      const prevOperationalHours = previousLog?.isTestEntry ? 0 : Number(previousLog?.hoursLogged) || 0;
      const nextOperationalHours = fullUpdated?.isTestEntry ? 0 : Number(fullUpdated?.hoursLogged) || 0;
      const hoursDelta = nextOperationalHours - prevOperationalHours;

      setProjects((prev) =>
        prev.map((proj) => {
          const matchesPrev = previousLog ? doesLogBelongToProject(previousLog, proj) : false;
          const matchesNext = fullUpdated ? doesLogBelongToProject(fullUpdated, proj) : false;
          if (!matchesPrev && !matchesNext) return proj;

          const updatedTasks = (proj.tasks || []).map((task) => {
            if (task.name === (fullUpdated?.taskName || previousLog?.taskName)) {
              const newCompleted = Math.max(0, (task.completedHours || 0) + hoursDelta);
              return {
                ...task,
                completedHours: newCompleted,
                status:
                  newCompleted >= task.estimatedHours
                    ? ('Completed' as const)
                    : ('In Progress' as const),
              };
            }
            return task;
          });
          const dynamicTotal = nextAllLogs
            .filter((w) => !w.isTestEntry && !(w as any).isDeleted && doesLogBelongToProject(w, proj))
            .reduce((sum, w) => sum + (Number(w.hoursLogged) || 0), 0);
          const updatedProj: BimProject = {
            ...proj,
            totalCompletedHours: dynamicTotal,
            totalLogged: dynamicTotal,
            isManualLoggedOverride: false,
            manualHoursOverride: undefined,
            tasks: updatedTasks,
          };
          try {
            updateDoc(doc(db, 'projects', proj.id), {
              tasks: updatedTasks,
              totalCompletedHours: dynamicTotal,
              totalHoursLogged: dynamicTotal,
              totalLogged: dynamicTotal,
              isManualLoggedOverride: false,
            }).catch(() => {});
          } catch {}
          return updatedProj;
        })
      );
    }
  };

  const deleteWorkLog = (id: string) => {
    const deletedLog = allWorkLogs.find((w) => w.id === id);
    const nextAllLogs = (allWorkLogs || []).filter((w) => w.id !== id);
    setAllWorkLogs(nextAllLogs);
    try {
      fetch(`/api/ssot/timesheets/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => {});
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const ch = new BroadcastChannel('bim_ssot_realtime_channel');
          ch.postMessage({ type: 'DELETE_LOG', id });
          ch.close();
        } catch {}
      }
      deleteDoc(doc(db, 'timesheets', id)).catch((err) =>
        console.warn('Firestore timesheets deleteWorkLog sync notice:', err)
      );
      deleteDoc(doc(db, 'daily_logs', id)).catch((err) =>
        console.warn('Firestore daily_logs deleteWorkLog sync notice:', err)
      );
      deleteDoc(doc(db, 'work_logs', id)).catch((err) =>
        console.warn('Firestore work_logs deleteWorkLog sync notice:', err)
      );
    } catch (e) {
      console.warn('Firestore deleteWorkLog notice:', e);
    }

    if (deletedLog && !deletedLog.isTestEntry) {
      const removedHours = Number(deletedLog.hoursLogged) || 0;
      setProjects((prev) =>
        prev.map((proj) => {
          if (!doesLogBelongToProject(deletedLog, proj)) return proj;
          const updatedTasks = (proj.tasks || []).map((task) => {
            if (task.name === deletedLog?.taskName) {
              const newCompleted = Math.max(0, (task.completedHours || 0) - removedHours);
              return {
                ...task,
                completedHours: newCompleted,
                status:
                  newCompleted >= task.estimatedHours
                    ? ('Completed' as const)
                    : ('In Progress' as const),
              };
            }
            return task;
          });
          const dynamicTotal = nextAllLogs
            .filter((w) => !w.isTestEntry && !(w as any).isDeleted && doesLogBelongToProject(w, proj))
            .reduce((sum, w) => sum + (Number(w.hoursLogged) || 0), 0);
          const updatedProj: BimProject = {
            ...proj,
            totalCompletedHours: dynamicTotal,
            totalLogged: dynamicTotal,
            isManualLoggedOverride: false,
            manualHoursOverride: undefined,
            tasks: updatedTasks,
          };
          try {
            updateDoc(doc(db, 'projects', proj.id), {
              tasks: updatedTasks,
              totalCompletedHours: dynamicTotal,
              totalHoursLogged: dynamicTotal,
              totalLogged: dynamicTotal,
              isManualLoggedOverride: false,
            }).catch(() => {});
          } catch {}
          return updatedProj;
        })
      );
    }
  };

  const addEmployee = (empData: Omit<Employee, 'id'>): Employee => {
    const newEmp: Employee = {
      ...empData,
      id: `emp-${Date.now()}`,
      isDeleted: false,
    };
    unregisterDeletedMemberKeys({
      id: newEmp.id,
      email: newEmp.email,
      name: newEmp.name,
    });
    setEmployees((prev) => [...prev, newEmp]);

    // Persist new team member and discipline assignment to Firestore & Central SSOT
    const cleanEmail = (newEmp.email || '').trim().toLowerCase();
    const docId = cleanEmail ? generateRequestDocId(cleanEmail) : newEmp.id;
    const payload = JSON.parse(
      JSON.stringify({
        id: newEmp.id,
        name: newEmp.name,
        fullName: newEmp.name,
        email: cleanEmail || newEmp.email || '',
        role: newEmp.role || 'VIEWER',
        discipline: newEmp.discipline || newEmp.primaryDiscipline || 'BIM - ACS',
        primaryDiscipline: newEmp.primaryDiscipline || newEmp.discipline || 'BIM - ACS',
        assignedTo: newEmp.id,
        status: 'APPROVED',
        isDeleted: false,
        updatedAt: new Date().toISOString(),
      })
    );
    try {
      fetch('/api/ssot/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
      setDoc(doc(db, 'team_members', docId), payload, { merge: true }).catch(() => {});
      setDoc(doc(db, 'users', docId), payload, { merge: true }).catch(() => {});
    } catch {}
    return newEmp;
  };

  const updateEmployee = (id: string, updates: Partial<Employee>) => {
    let targetEmp: Employee | undefined;
    setEmployees((prev) =>
      prev.map((e) => {
        if (e.id === id) {
          targetEmp = { ...e, ...updates };
          return targetEmp;
        }
        return e;
      })
    );

    const emp = targetEmp || employees.find((e) => e.id === id);
    if (emp) {
      const cleanEmail = (updates.email || emp.email || '').trim().toLowerCase();
      const docId = cleanEmail ? generateRequestDocId(cleanEmail) : id.replace(/^emp-/, '');
      const updatedDiscipline = updates.discipline || updates.primaryDiscipline || emp.discipline || emp.primaryDiscipline || 'BIM - ACS';
      const firestoreUpdates: Record<string, any> = JSON.parse(
        JSON.stringify({
          ...emp,
          ...updates,
          id: emp.id || id,
          assignedTo: id,
          discipline: updatedDiscipline,
          primaryDiscipline: updatedDiscipline,
          updatedAt: new Date().toISOString(),
        })
      );
      try {
        fetch('/api/ssot/team-members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(firestoreUpdates),
        }).catch(() => {});
        setDoc(doc(db, 'team_members', docId), firestoreUpdates, { merge: true }).catch(() => {});
        setDoc(doc(db, 'users', docId), firestoreUpdates, { merge: true }).catch(() => {});
        updateDoc(doc(db, 'access_requests', docId), {
          discipline: updatedDiscipline,
          primaryDiscipline: updatedDiscipline,
          assignedTo: id,
          ...(updates.role ? { role: updates.role } : {}),
          ...(updates.name ? { name: updates.name, fullName: updates.name } : {}),
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      } catch (err) {
        console.warn('Firestore updateEmployee sync notice:', err);
      }
    }
  };

  const deleteEmployee = (id: string) => {
    const strippedId = (id || '').replace(/^emp-/, '');
    const targetEmp = employees.find(
      (e) => e.id === id || e.id.replace(/^emp-/, '') === strippedId
    );
    const targetReq = onboardingRequests.find(
      (r) =>
        r.id === id ||
        r.id === strippedId ||
        (targetEmp?.email && r.email.toLowerCase().trim() === targetEmp.email.toLowerCase().trim())
    );
    const targetName = (targetEmp?.name || targetReq?.name || '').toLowerCase().trim();
    const targetEmail = (targetEmp?.email || targetReq?.email || '').toLowerCase().trim();
    const detEmailId = targetEmail ? generateRequestDocId(targetEmail) : '';

    registerDeletedMemberKeys({
      id,
      email: targetEmail,
      name: targetEmp?.name || targetReq?.name,
    });

    const matchesDeletedTarget = (item: {
      id?: string;
      employeeId?: string;
      memberId?: string;
      userId?: string;
      assignedTo?: string;
      email?: string;
      memberEmail?: string;
      userEmail?: string;
      assignedToEmail?: string;
      name?: string;
      employeeName?: string;
    }) => {
      const iId = String(
        item.employeeId || item.memberId || item.userId || item.assignedTo || item.id || ''
      ).trim();
      const iStripped = iId.replace(/^emp-/, '');
      const iEmail = String(
        item.email || item.memberEmail || item.userEmail || item.assignedToEmail || ''
      )
        .toLowerCase()
        .trim();
      const iName = String(item.name || item.employeeName || '').toLowerCase().trim();

      return (
        (id && (iId === id || iStripped === strippedId)) ||
        (detEmailId && iStripped === detEmailId) ||
        (targetEmail && iEmail && iEmail === targetEmail) ||
        (targetName && iName && iName === targetName)
      );
    };

    // 1. Remove from active employees & onboardingRequests state
    setEmployees((prev) =>
      prev.filter(
        (e) =>
          e.id !== id &&
          e.id.replace(/^emp-/, '') !== strippedId &&
          (!targetEmail || e.email.toLowerCase().trim() !== targetEmail) &&
          (!targetName || e.name.toLowerCase().trim() !== targetName)
      )
    );
    setOnboardingRequests((prev) =>
      prev.filter(
        (r) =>
          r.id !== id &&
          r.id.replace(/^emp-/, '') !== strippedId &&
          (!targetEmail || r.email.toLowerCase().trim() !== targetEmail)
      )
    );

    // 2. Cascade cleanup on projects: unlink member from project assignments and active task allocations
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        assignedEmployeeIds: p.assignedEmployeeIds.filter(
          (empId) => empId !== id && empId.replace(/^emp-/, '') !== strippedId
        ),
        tasks: p.tasks.filter(
          (t) => t.assignedEmployeeId !== id && t.assignedEmployeeId.replace(/^emp-/, '') !== strippedId
        ),
        clashes: p.clashes.map((c) =>
          c.assignedToEmployeeId === id || c.assignedToEmployeeId.replace(/^emp-/, '') === strippedId
            ? { ...c, assignedToEmployeeId: '' }
            : c
        ),
      }))
    );

    // 3. Cascade cleanup on workLogs: remove timesheet logs for deleted member
    const logsToRemove = allWorkLogs.filter((log) => matchesDeletedTarget(log));
    setAllWorkLogs((prev) => prev.filter((log) => !matchesDeletedTarget(log)));

    // 4. Cascade cleanup on resourceAllocations & disciplineAssignments
    const allocsToRemove = resourceAllocations.filter((a) => matchesDeletedTarget(a));
    const remainingAllocs = resourceAllocations.filter((a) => !matchesDeletedTarget(a));
    setResourceAllocations(remainingAllocs);

    setDisciplineAssignments((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        const val = String(next[k] || '').trim();
        if (val === id || val.replace(/^emp-/, '') === strippedId || (detEmailId && val.replace(/^emp-/, '') === detEmailId)) {
          delete next[k];
        }
      });
      try {
        localStorage.setItem('bim_discipline_assignments_v1', JSON.stringify(next));
      } catch {}
      return next;
    });

    try {
      ['bim_resource_allocations_v1', 'bim_resource_allocations_v2'].forEach((storageKey) => {
        const savedAlloc = localStorage.getItem(storageKey);
        if (savedAlloc) {
          const parsed = JSON.parse(savedAlloc);
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((a) => !matchesDeletedTarget(a));
            localStorage.setItem(storageKey, JSON.stringify(filtered));
            window.dispatchEvent(new CustomEvent('bim_resource_allocations_updated', { detail: filtered }));
          }
        }
      });
    } catch (e) {
      console.warn('Cascade allocation cleanup notice:', e);
    }

    // 5. Cascade delete from Firestore collections (users, access_requests, assigned_hours, project_assignments, allocations, daily_logs, work_logs, disciplines)
    try {
      const candidateUserDocIds = Array.from(
        new Set([id, strippedId, `emp-${strippedId}`, detEmailId, `emp-${detEmailId}`, targetReq?.id || ''].filter(Boolean))
      );
      fetch(
        `/api/ssot/team-members/${encodeURIComponent(id)}?email=${encodeURIComponent(targetEmail)}&name=${encodeURIComponent(targetName)}`,
        { method: 'DELETE' }
      ).catch(() => {});

      candidateUserDocIds.forEach((docId) => {
        deleteDoc(doc(db, 'team_members', docId)).catch(() => {});
        deleteDoc(doc(db, 'users', docId)).catch(() => {});
        deleteDoc(doc(db, 'access_requests', docId)).catch(() => {});
      });

      if (targetEmail) {
        getDocs(query(collection(db, 'team_members'), where('email', '==', targetEmail)))
          .then((snap) => snap.docs.forEach((d) => deleteDoc(doc(db, 'team_members', d.id)).catch(() => {})))
          .catch(() => {});
        getDocs(query(collection(db, 'users'), where('email', '==', targetEmail)))
          .then((snap) => snap.docs.forEach((d) => deleteDoc(doc(db, 'users', d.id)).catch(() => {})))
          .catch(() => {});
        getDocs(query(collection(db, 'access_requests'), where('email', '==', targetEmail)))
          .then((snap) => snap.docs.forEach((d) => deleteDoc(doc(db, 'access_requests', d.id)).catch(() => {})))
          .catch(() => {});
      }

      allocsToRemove.forEach((a) => {
        deleteDoc(doc(db, 'assigned_hours', a.id)).catch(() => {});
        deleteDoc(doc(db, 'project_assignments', a.id)).catch(() => {});
        deleteDoc(doc(db, 'allocations', a.id)).catch(() => {});
      });

      logsToRemove.forEach((l) => {
        fetch(`/api/ssot/timesheets/${encodeURIComponent(l.id)}`, { method: 'DELETE' }).catch(() => {});
        deleteDoc(doc(db, 'timesheets', l.id)).catch(() => {});
        deleteDoc(doc(db, 'daily_logs', l.id)).catch(() => {});
        deleteDoc(doc(db, 'work_logs', l.id)).catch(() => {});
      });
    } catch (fsErr) {
      console.warn('Firestore deleteEmployee cascade notice:', fsErr);
    }

    // 6. Add audit log
    if (targetEmp || targetEmail || targetName) {
      const newAudit: AdminAuditLog = {
        id: `audit-${Date.now()}`,
        action: 'user_deleted',
        targetUserEmail: targetEmp?.email || targetEmail || id,
        targetUserName: targetEmp?.name || targetReq?.name || id,
        performedBy: `${SUPER_ADMIN_NAME} (Super Admin)`,
        timestamp: new Date().toLocaleString([], {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
        details: `Deleted team member ${targetEmp?.name || targetName || id} (${targetEmp?.email || targetEmail || id}). Cascaded cleanup across dropdowns, task allocations, timesheets, and project teams.`,
      };
      setAuditLogs((prev) => [newAudit, ...prev]);
    }
  };

  const addMilestone = (projectId: string, milestone: Omit<Milestone, 'id'>) => {
    const newMs: Milestone = {
      ...milestone,
      id: `ms-${Date.now()}`,
    };
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? { ...p, milestones: [...p.milestones, newMs] }
          : p
      )
    );
  };

  const updateMilestoneStatus = (
    projectId: string,
    milestoneId: string,
    status: Milestone['status']
  ) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const updatedMs = p.milestones.map((m) =>
          m.id === milestoneId
            ? {
                ...m,
                status,
                completionDate:
                  status === 'completed' ? '2026-08-18' : m.completionDate,
              }
            : m
        );
        return { ...p, milestones: updatedMs };
      })
    );
  };

  const addClash = (projectId: string, clash: Omit<ClashRecord, 'id'>) => {
    const newClash: ClashRecord = {
      ...clash,
      id: `clash-${Date.now()}`,
    };
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, clashes: [newClash, ...p.clashes] } : p
      )
    );
  };

  const updateClashStatus = (
    projectId: string,
    clashId: string,
    status: ClashRecord['status']
  ) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const updated = p.clashes.map((c) =>
          c.id === clashId
            ? {
                ...c,
                status,
                resolvedDate:
                  status === 'Resolved' ? '2026-08-18' : c.resolvedDate,
              }
            : c
        );
        return { ...p, clashes: updated };
      })
    );
  };

  const addTask = (
    projectId: string,
    task: Omit<TaskItem, 'id' | 'projectId'>
  ) => {
    const newTask: TaskItem = {
      ...task,
      id: `tsk-${Date.now()}`,
      projectId,
    };
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const nextTasks = [...p.tasks, newTask];
        const nextAssignedIds =
          newTask.assignedEmployeeId && !p.assignedEmployeeIds.includes(newTask.assignedEmployeeId)
            ? [...p.assignedEmployeeIds, newTask.assignedEmployeeId]
            : p.assignedEmployeeIds;
        try {
          updateDoc(doc(db, 'projects', projectId), {
            tasks: nextTasks,
            assignedEmployeeIds: nextAssignedIds,
            assignedTo: newTask.assignedEmployeeId || '',
            discipline: newTask.discipline,
          }).catch(() => {});
        } catch {}
        return { ...p, tasks: nextTasks, assignedEmployeeIds: nextAssignedIds };
      })
    );
  };

  const updateTask = (
    projectId: string,
    taskId: string,
    updates: Partial<TaskItem>
  ) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        let updatedTaskItem: TaskItem | undefined;
        const updated = p.tasks.map((t) => {
          if (t.id === taskId) {
            updatedTaskItem = { ...t, ...updates };
            return updatedTaskItem;
          }
          return t;
        });
        const nextAssignedIds =
          updates.assignedEmployeeId && !p.assignedEmployeeIds.includes(updates.assignedEmployeeId)
            ? [...p.assignedEmployeeIds, updates.assignedEmployeeId]
            : p.assignedEmployeeIds;
        try {
          updateDoc(doc(db, 'projects', projectId), {
            tasks: updated,
            assignedEmployeeIds: nextAssignedIds,
            ...(updatedTaskItem?.assignedEmployeeId
              ? { assignedTo: updatedTaskItem.assignedEmployeeId }
              : {}),
            ...(updatedTaskItem?.discipline ? { discipline: updatedTaskItem.discipline } : {}),
          }).catch(() => {});
        } catch (err) {
          console.warn('Firestore updateTask sync notice:', err);
        }
        return { ...p, tasks: updated, assignedEmployeeIds: nextAssignedIds };
      })
    );
  };

  const handleMemberSelect = async (
    disciplineKey: string,
    memberId: string,
    projectId?: string
  ): Promise<void> => {
    const cleanKey = (disciplineKey || 'BIM - ACS').trim();
    const compositeKey = projectId ? `${projectId}__${cleanKey}` : cleanKey;
    const docId = compositeKey.replace(/[^a-zA-Z0-9_-]/g, '_');

    // 1. Immediate React state update for controlled select components
    setDisciplineAssignments((prev) => {
      const next = {
        ...prev,
        [cleanKey]: memberId,
        [compositeKey]: memberId,
        [docId]: memberId,
      };
      try {
        localStorage.setItem('bim_discipline_assignments_v1', JSON.stringify(next));
      } catch {}
      return next;
    });

    const selectedEmp = employees.find(
      (e) => e.id === memberId || e.id.replace(/^emp-/, '') === memberId.replace(/^emp-/, '')
    );

    // If projectId is provided, also keep project assignedEmployeeIds & matching discipline tasks synced
    if (projectId && memberId) {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p;
          const nextAssigned = p.assignedEmployeeIds.includes(memberId)
            ? p.assignedEmployeeIds
            : [...p.assignedEmployeeIds, memberId];
          const nextTasks = p.tasks.map((t) =>
            t.discipline === cleanKey || t.id === cleanKey
              ? { ...t, assignedEmployeeId: memberId }
              : t
          );
          return { ...p, assignedEmployeeIds: nextAssigned, tasks: nextTasks };
        })
      );
    }

    // 2. Persist assignedTo and discipline to Firestore inside a try/catch block via updateDoc
    const payload = {
      assignedTo: memberId,
      assignedMemberId: memberId,
      employeeId: memberId,
      employeeName: selectedEmp?.name || '',
      memberEmail: selectedEmp?.email || '',
      discipline: cleanKey,
      disciplineKey: cleanKey,
      ...(projectId ? { projectId } : {}),
      updatedAt: new Date().toISOString(),
    };

    try {
      const discRef = doc(db, 'disciplines', docId);
      try {
        await updateDoc(discRef, payload);
      } catch {
        await setDoc(discRef, payload, { merge: true });
      }

      if (projectId) {
        const projRef = doc(db, 'projects', projectId);
        await updateDoc(projRef, {
          assignedTo: memberId,
          discipline: cleanKey,
          [`disciplineAssignments.${cleanKey}`]: memberId,
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('Firestore handleMemberSelect persistence notice:', err);
    }
  };

  const saveStakeholderReport = (report: GeneratedStakeholderReport) => {
    setGeneratedReports((prev) => [report, ...prev]);
  };

  const resetToMockData = () => {
    setProjects(INITIAL_PROJECTS);
    setEmployees([]);
    setAllWorkLogs([]);
    setGeneratedReports([]);
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(INITIAL_PROJECTS));
    localStorage.removeItem(STORAGE_KEYS.EMPLOYEES);
    localStorage.removeItem(STORAGE_KEYS.WORK_LOGS);
    localStorage.removeItem(STORAGE_KEYS.REPORTS);
    localStorage.removeItem('bim_resource_allocations_v2');
    localStorage.removeItem('bim_project_feedbacks_v2');
    window.dispatchEvent(new CustomEvent('bim_resource_allocations_updated', { detail: [] }));
    window.dispatchEvent(new Event('bim_feedback_updated'));
  };

  // Overall Computed Metrics
  const overallMetrics = useMemo(() => {
    const targetProjects =
      selectedProjectId === 'all'
        ? projects
        : projects.filter((p) => p.id === selectedProjectId);

    const totalEstimated = targetProjects.reduce(
      (sum, p) => sum + getProjectTargetHours(p),
      0
    );

    const totalCompleted = targetProjects.reduce((sum, p) => {
      return sum + getProjectCompletedHours(p.id);
    }, 0);

    const hoursVariance = totalEstimated - totalCompleted;
    const completionPercentage =
      totalEstimated > 0
        ? Math.min(100, Math.round((totalCompleted / totalEstimated) * 100))
        : 0;

    let criticalClashes = 0;
    let totalClashes = 0;
    let resolvedClashes = 0;

    targetProjects.forEach((p) => {
      p.clashes.forEach((c) => {
        totalClashes++;
        if (c.severity === 'Critical' && c.status !== 'Resolved') {
          criticalClashes++;
        }
        if (c.status === 'Resolved') {
          resolvedClashes++;
        }
      });
    });

    // Employee capacity utilization (logged hours in current week / capacity)
    const totalWeeklyCapacity = employees.length * 40;
    const totalLoggedThisWeek = employees.reduce(
      (sum, emp) => sum + getEmployeeLoggedHours(emp.id, 'this-week'),
      0
    );
    const avgUtilizationRate =
      totalWeeklyCapacity > 0
        ? Math.round((totalLoggedThisWeek / totalWeeklyCapacity) * 100)
        : 0;

    return {
      totalEstimatedHours: totalEstimated,
      totalCompletedHours: totalCompleted,
      hoursVariance,
      completionPercentage,
      activeProjectsCount: targetProjects.length,
      totalEmployeesCount: activeTeamMembers.length,
      criticalClashesCount: criticalClashes,
      totalClashesCount: totalClashes,
      resolvedClashesCount: resolvedClashes,
      avgUtilizationRate,
    };
  }, [projects, activeTeamMembers, workLogs, allWorkLogs, resourceAllocations, selectedProjectId]);

  return (
    <BimDataContext.Provider
      value={{
        projects,
        employees: activeTeamMembers,
        workLogs,
        allWorkLogs,
        resourceAllocations,
        generatedReports,
        savedReports: generatedReports,
        selectedProjectId,
        setSelectedProjectId,
        currentTab,
        setCurrentTab,
        dateFilter,
        setDateFilter,
        globalSearchQuery,
        setGlobalSearchQuery,
        theme,
        setTheme,
        toggleTheme,
        currentUser,
        setCurrentUser,
        onboardingRequests,
        setOnboardingRequests,
        registerAccessRequest,
        auditLogs,
        setAuditLogs,
        addAuditLog,
        signInWithGoogle,
        signInWithEmail,
        requestAccess,
        updateAccessRequestReason,
        checkUserStatus,
        approveOnboardingRequest,
        rejectOnboardingRequest,
        reopenOnboardingRequest,
        deleteOnboardingRequest,
        setSimulatedAuthStatus,
        switchUser,
        signOut,
        addProject,
        updateProject,
        updateProjectStatus,
        deleteProject,
        addWorkLog,
        updateWorkLog,
        deleteWorkLog,
        addEmployee,
        updateEmployee,
        deleteEmployee,
        addMilestone,
        updateMilestoneStatus,
        addClash,
        updateClashStatus,
        addTask,
        updateTask,
        disciplineAssignments,
        handleMemberSelect,
        saveStakeholderReport,
        resetToMockData,
        getProjectById,
        getEmployeeById,
        getProjectCompletedHours,
        getEmployeeLoggedHours,
        overallMetrics,
      }}
    >
      {children}
    </BimDataContext.Provider>
  );
};

export const useBimData = () => {
  const context = useContext(BimDataContext);
  if (!context) {
    throw new Error('useBimData must be used within a BimDataProvider');
  }
  return context;
};

export const useTeamMembers = () => {
  const { employees } = useBimData();
  return employees;
};
