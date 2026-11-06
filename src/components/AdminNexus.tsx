import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  useBimData,
  mergeAccessRequestsWithLocal,
  invalidateAccessRequestsCache,
  saveLocalAccessRequest,
  getRequestTimeMs,
  PENDING_ACCESS_REQUESTS_KEY,
  DELETED_ACCESS_REQUESTS_KEY,
  ACCESS_REQUESTS_CHANNEL,
  isRemovedMockMember,
} from '../context/BimDataContext';
import { UserAccessRecord, AccessLevel, OnboardingRequest, UserRole, PRIMARY_DISCIPLINES, Discipline } from '../types';
import {
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  UserPlus,
  KeyRound,
  Edit3,
  Trash2,
  Search,
  CheckCircle2,
  XCircle,
  Lock,
  Building2,
  Sparkles,
  RefreshCw,
  RotateCcw,
  Clock,
  Check,
  X,
  Layers,
  ArrowRight,
  FileText,
  Activity,
  UserX,
  AlertTriangle,
  Mail,
  User,
  SlidersHorizontal,
} from 'lucide-react';
import {
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_NAME,
  isSuperAdminEmail,
  mapAppRoleToAccessLevel,
  mapAppRoleToDisplayRole,
  normalizeUserRole,
} from '../auth/googleAuth';
import { persistUserRoleToDatabase } from '../auth/roleSync';
import { SecuritySettingsModal } from './SecuritySettingsModal';
import { db } from '../firebase/config';
import { collection, doc, getDocs, getDocsFromServer, onSnapshot, updateDoc } from 'firebase/firestore';

export const AdminNexus: React.FC = () => {
  const {
    projects,
    employees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    onboardingRequests,
    setOnboardingRequests,
    auditLogs,
    addAuditLog,
    approveOnboardingRequest,
    rejectOnboardingRequest,
    reopenOnboardingRequest,
    deleteOnboardingRequest,
    registerAccessRequest,
    signInWithGoogle,
    theme,
    currentUser,
    setCurrentUser,
  } = useBimData();
  const isLight = theme === 'light';

  // Sub-tabs: 'active-users' | 'pending-onboarding' | 'rejected-logs' | 'audit-logs'
  const [activeSubTab, setActiveSubTab] = useState<
    'active-users' | 'pending-onboarding' | 'rejected-logs' | 'audit-logs'
  >('pending-onboarding');

  // Selected role for each pending request
  const [pendingRoleMap, setPendingRoleMap] = useState<Record<string, UserRole>>({});
  // Selected discipline for each pending request
  const [pendingDisciplineMap, setPendingDisciplineMap] = useState<Record<string, Discipline>>({});

  // Audit search & filter state
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditFilterAction, setAuditFilterAction] = useState<string>('all');

  // Rejected logs search filter
  const [rejectedSearchQuery, setRejectedSearchQuery] = useState('');

  // Onboarding status filter state: default 'pending' to strictly show active pending requests
  const [onboardingFilter, setOnboardingFilter] = useState<'pending' | 'approved'>('pending');
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

  // Stored permissions map keyed by user/employee id
  const [permissionsMap, setPermissionsMap] = useState<Record<string, Partial<UserAccessRecord>>>(() => {
    try {
      const saved = localStorage.getItem('bim_tracker_permissions_map_v5');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      'emp-2': {
        accessLevel: 'Super Admin',
        canEditProjects: true,
        canEditHours: true,
        canManageTeam: true,
        canDeleteRecords: true,
        canExportReports: true,
      },
      'emp-aditi': {
        accessLevel: 'Editor',
        canEditProjects: true,
        canEditHours: true,
        canManageTeam: false,
        canDeleteRecords: false,
        canExportReports: true,
      },
    };
  });

  useEffect(() => {
    localStorage.setItem('bim_tracker_permissions_map_v5', JSON.stringify(permissionsMap));
  }, [permissionsMap]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

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

  const isReqPending = (status?: string) => {
    if (!status) return true;
    if (status === 'pending') return true;
    const s = String(status).trim().toLowerCase();
    return s === 'pending' || s === 'pending_approval' || s.includes('pending');
  };

  const normalizeRawRequest = (raw: any): OnboardingRequest | null => {
    if (!raw) return null;
    const rawStatus = String(raw.status || 'pending').trim().toLowerCase();
    if (raw.isDeleted === true || rawStatus === 'deleted' || isRemovedMockMember(raw)) return null;

    const cleanEmail = String(raw.email || raw.userEmail || raw.memberEmail || '').trim().toLowerCase();
    if (!cleanEmail) return null;

    // Only apply deleted member tombstone if the request is NOT an active pending submission
    if (!isReqPending(rawStatus)) {
      try {
        const saved = localStorage.getItem('bim_deleted_members_v1');
        if (saved) {
          const deletedSet = new Set<string>(
            JSON.parse(saved).map((v: string) => String(v).trim().toLowerCase())
          );
          const rawId = String(raw.id || '').trim().toLowerCase();
          const rawName = String(raw.fullName || raw.name || '').trim().toLowerCase();
          if (
            deletedSet.has(cleanEmail) ||
            (rawId && deletedSet.has(rawId)) ||
            (rawName && deletedSet.has(rawName))
          ) {
            return null;
          }
        }
      } catch {}
    }

    const isSuper = isSuperAdminEmail(cleanEmail);
    const mappedStatus = isSuper
      ? 'APPROVED'
      : rawStatus === 'approved' || rawStatus === 'active'
      ? 'APPROVED'
      : rawStatus === 'rejected' || rawStatus === 'declined'
      ? 'REJECTED'
      : 'pending';

    const fullName = String(raw.fullName || raw.name || cleanEmail.split('@')[0]).trim();
    const discipline = String(
      raw.assignedDiscipline || raw.discipline || raw.primaryDiscipline || raw.orgDiscipline || raw.organization || 'BIM - ACS'
    );
    const orgDiscipline = String(
      raw.orgDiscipline || raw.assignedDiscipline || raw.discipline || raw.primaryDiscipline || raw.organization || discipline
    );
    const reasonForAccess = String(
      raw.reasonForAccess || raw.accessReason || 'Sign-in Access Request for ProductionPulse BPMS'
    );
    const createdAt =
      formatFirestoreTimestamp(raw.createdAt) ||
      formatFirestoreTimestamp(raw.requestedAt) ||
      formatFirestoreTimestamp(raw.timestamp) ||
      '1970-01-01T00:00:00.000Z';
    const updatedAt =
      formatFirestoreTimestamp(raw.updatedAt) ||
      formatFirestoreTimestamp(raw.reviewedAt) ||
      createdAt;

    const normalizedRole = normalizeUserRole(
      raw.assignedRole || raw.role || raw.appRole || raw.requestedRole,
      isSuper
    );
    const calculatedAccessLevel =
      (raw.assignedAccessLevel as AccessLevel) || mapAppRoleToAccessLevel(normalizedRole);

    return {
      id: raw.id,
      googleId: raw.uid || raw.id,
      email: cleanEmail,
      name: fullName,
      fullName: fullName,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fullName)}`,
      role: raw.role || (mappedStatus === 'pending' ? 'Editor' : mapAppRoleToDisplayRole(normalizedRole)),
      requestedRole: raw.requestedRole || raw.role || (mappedStatus === 'pending' ? 'Editor' : mapAppRoleToDisplayRole(normalizedRole)),
      assignedRole: normalizedRole,
      assignedAccessLevel: calculatedAccessLevel,
      primaryDiscipline: discipline,
      discipline: discipline,
      assignedDiscipline: discipline,
      orgDiscipline: orgDiscipline,
      organization: orgDiscipline,
      reasonForAccess: reasonForAccess,
      accessReason: reasonForAccess,
      createdAt: createdAt,
      requestedAt: createdAt,
      requestTimestamp: createdAt,
      timestamp: updatedAt,
      status: mappedStatus as any,
      reviewedBy: raw.reviewedBy,
      reviewedAt: formatFirestoreTimestamp(raw.reviewedAt) || undefined,
      notes: raw.notes || 'Sign-in access request awaiting Super Admin review in Admin Nexus.',
    };
  };

  const deduplicateAndSortRequests = (rawList: OnboardingRequest[]): OnboardingRequest[] => {
    const byEmail = new Map<string, OnboardingRequest>();
    const rank = (s?: string) => {
      if (s === 'pending' || isReqPending(s)) return 3;
      const u = (s || '').toUpperCase();
      if (u === 'APPROVED' || u === 'ACTIVE') return 2;
      return 1;
    };

    // Deduplicate by email keeping the most recent state (by timestamp)
    const sortedByTime = [...rawList].sort((a, b) => {
      const tDiff = getRequestTimeMs(b) - getRequestTimeMs(a);
      if (Math.abs(tDiff) > 1000) return tDiff;
      return rank(b.status) - rank(a.status);
    });

    const seenIds = new Set<string>();
    for (const req of sortedByTime) {
      const key = (req.email || '').trim().toLowerCase();
      const idKey = String(req.id || '').trim().toLowerCase();
      if (!key) continue;
      if (!byEmail.has(key) && (!idKey || !seenIds.has(idKey))) {
        byEmail.set(key, req);
        if (idKey) seenIds.add(idKey);
      }
    }

    // Sort deduplicated records so pending requests appear first, newest first
    return Array.from(byEmail.values()).sort((a, b) => {
      const rA = rank(a.status);
      const rB = rank(b.status);
      if (rA !== rB) {
        return rB - rA;
      }
      return getRequestTimeMs(b) - getRequestTimeMs(a);
    });
  };

  const docsMapRef = useRef<Map<string, Map<string, any>>>(new Map());

  const setAccessRequests = useCallback(
    (rawRequests: any[], forceInvalidate = false) => {
      if (forceInvalidate) {
        invalidateAccessRequestsCache();
      }
      const mapped = rawRequests.map(normalizeRawRequest).filter(Boolean) as OnboardingRequest[];
      const list = deduplicateAndSortRequests(mapped);
      setOnboardingRequests((prev) => {
        const merged = deduplicateAndSortRequests(mergeAccessRequestsWithLocal(list, prev));
        if (
          !forceInvalidate &&
          prev.length === merged.length &&
          prev.every(
            (item, idx) =>
              item.id === merged[idx]?.id &&
              item.email === merged[idx]?.email &&
              item.name === merged[idx]?.name &&
              item.status === merged[idx]?.status &&
              item.assignedRole === merged[idx]?.assignedRole &&
              item.discipline === merged[idx]?.discipline &&
              item.assignedDiscipline === merged[idx]?.assignedDiscipline &&
              item.orgDiscipline === merged[idx]?.orgDiscipline &&
              item.createdAt === merged[idx]?.createdAt &&
              item.timestamp === merged[idx]?.timestamp
          )
        ) {
          return prev;
        }
        return [...merged];
      });
    },
    [setOnboardingRequests]
  );

  const setAccessRequestsRef = useRef(setAccessRequests);
  setAccessRequestsRef.current = setAccessRequests;

  // Force-refresh & re-hydration handler (used by Live Sync button, window focus, and Pending Queue polling)
  const fetchPendingRequests = useCallback(async (silent = false) => {
    if (!silent) {
      setIsSyncing(true);
      setSyncError(null);
    }
    invalidateAccessRequestsCache();
    try {
      const collectionsToQuery = ['access_requests', 'accessRequests', 'pendingUsers', 'pendingSignups'];
      const fetchCollectionDocs = async (colName: string) => {
        try {
          // Race getDocsFromServer with a short 1000ms timeout and always fallback to fast getDocs()
          const serverOrFallback = await Promise.race([
            getDocsFromServer(collection(db, colName)),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
          ]);
          if (serverOrFallback) return serverOrFallback;
          return await getDocs(collection(db, colName));
        } catch {
          return await getDocs(collection(db, colName));
        }
      };

      const [firestoreResults, apiResponse] = await Promise.all([
        Promise.allSettled(collectionsToQuery.map((colName) => fetchCollectionDocs(colName))),
        fetch(`/api/access-requests?_t=${Date.now()}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);

      const docsMap = docsMapRef.current;
      if (Array.isArray(apiResponse?.requests)) {
        const sseMap = docsMap.get('server_sse') || new Map();
        apiResponse.requests.forEach((req: any) => {
          const docKey = req?.id || req?.uid || req?.email;
          if (docKey) {
            sseMap.set(docKey, { id: docKey, ...req });
          }
        });
        docsMap.set('server_sse', sseMap);
      }

      firestoreResults.forEach((res, idx) => {
        const colName = collectionsToQuery[idx] || 'access_requests';
        if (res.status === 'fulfilled' && res.value?.docs) {
          const colMap = docsMap.get(colName) || new Map();
          res.value.docs.forEach((d: any) => {
            colMap.set(d.id, {
              id: d.id,
              ...d.data({ serverTimestamps: 'estimate' }),
            });
          });
          docsMap.set(colName, colMap);
        }
      });

      const allRaw: any[] = [];
      docsMap.forEach((colDocs) => {
        colDocs.forEach((docData) => allRaw.push(docData));
      });
      setAccessRequestsRef.current(allRaw, true);
    } catch (err: any) {
      console.error('Admin Nexus pending fetch error:', err);
      const allRaw: any[] = [];
      docsMapRef.current.forEach((colDocs) => {
        colDocs.forEach((docData) => allRaw.push(docData));
      });
      setAccessRequestsRef.current(allRaw, true);
    }
    if (!silent) {
      setIsSyncing(false);
    }
    setLastSyncTime(new Date().toLocaleTimeString());
  }, []);

  const fetchPendingRequestsRef = useRef(fetchPendingRequests);
  fetchPendingRequestsRef.current = fetchPendingRequests;

  // Auto-polling fallback interval (every 3000ms) executing fresh getDocs() whenever active tab is set to Pending Queue,
  // plus immediate force-refresh on tab switch
  useEffect(() => {
    if (activeSubTab !== 'pending-onboarding') return;

    // Immediate force-refresh when switching to Access Review / Pending Queue tab
    fetchPendingRequestsRef.current(true);

    if (onboardingFilter !== 'pending') return;

    let isPollingActive = true;
    const collectionsToPoll = ['access_requests', 'accessRequests', 'pendingUsers', 'pendingSignups'];

    const executeGetDocsPoll = async () => {
      if (!isPollingActive) return;
      try {
        const [snapshots, apiData] = await Promise.all([
          Promise.allSettled(collectionsToPoll.map((colName) => getDocs(collection(db, colName)))),
          fetch(`/api/access-requests?_t=${Date.now()}`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);

        if (!isPollingActive) return;

        const docsMap = docsMapRef.current;
        snapshots.forEach((res, idx) => {
          const colName = collectionsToPoll[idx] || 'access_requests';
          if (res.status === 'fulfilled' && res.value?.docs) {
            const colMap = docsMap.get(colName) || new Map();
            res.value.docs.forEach((docSnap: any) => {
              colMap.set(docSnap.id, {
                id: docSnap.id,
                ...docSnap.data({ serverTimestamps: 'estimate' }),
              });
            });
            docsMap.set(colName, colMap);
          }
        });

        if (Array.isArray(apiData?.requests)) {
          const sseMap = docsMap.get('server_sse') || new Map();
          apiData.requests.forEach((req: any) => {
            const docKey = req?.id || req?.uid || req?.email;
            if (docKey) {
              sseMap.set(docKey, { id: docKey, ...req });
            }
          });
          docsMap.set('server_sse', sseMap);
        }

        const allRaw: any[] = [];
        docsMap.forEach((colDocs) => {
          colDocs.forEach((docData) => allRaw.push(docData));
        });
        setAccessRequestsRef.current(allRaw, true);
        setLastSyncTime(new Date().toLocaleTimeString());
      } catch (err) {
        console.warn('[AdminNexus] Auto-polling getDocs fallback diagnostic:', err);
      }
    };

    const pollIntervalId = setInterval(executeGetDocsPoll, 3000);

    return () => {
      isPollingActive = false;
      clearInterval(pollIntervalId);
    };
  }, [activeSubTab, onboardingFilter]);

  // Persistent multi-collection real-time onSnapshot listener + SSE stream + reconnect/resubscribe handler
  // Empty dependency array [] guarantees tab switches or re-renders NEVER detach or unbind the listener
  useEffect(() => {
    let isMounted = true;
    invalidateAccessRequestsCache();

    const collectionsToListen = ['access_requests', 'accessRequests', 'pendingUsers', 'pendingSignups'];
    const docsMap = docsMapRef.current;
    collectionsToListen.forEach((name) => {
      if (!docsMap.has(name)) docsMap.set(name, new Map());
    });
    if (!docsMap.has('server_sse')) docsMap.set('server_sse', new Map());

    let updateScheduled = false;

    const updateState = (forceInvalidate = false) => {
      if (!isMounted) return;
      updateScheduled = false;
      const allRaw: any[] = [];
      docsMap.forEach((colDocs) => {
        colDocs.forEach((docData) => allRaw.push(docData));
      });
      setAccessRequestsRef.current(allRaw, forceInvalidate);
      setLastSyncTime(new Date().toLocaleTimeString());
    };

    const scheduleUpdateState = () => {
      if (updateScheduled || !isMounted) return;
      updateScheduled = true;
      queueMicrotask(() => updateState(false));
    };

    // Hydrate immediately on mount
    updateState(true);

    const activeUnsubs = new Map<string, () => void>();
    const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const attachFirestoreListener = (colName: string, forceResubscribe = false) => {
      if (!isMounted) return;
      if (activeUnsubs.has(colName) && !forceResubscribe) return;
      const existingUnsub = activeUnsubs.get(colName);
      if (existingUnsub) {
        try {
          existingUnsub();
        } catch {}
        activeUnsubs.delete(colName);
      }
      const existingTimer = retryTimers.get(colName);
      if (existingTimer) {
        clearTimeout(existingTimer);
        retryTimers.delete(colName);
      }

      try {
        const unsub = onSnapshot(
          collection(db, colName),
          (snapshot) => {
            if (!isMounted) return;
            setSyncError(null);
            const colMap = docsMap.get(colName) || new Map();
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'removed') {
                colMap.delete(change.doc.id);
              } else {
                colMap.set(change.doc.id, {
                  id: change.doc.id,
                  ...change.doc.data({ serverTimestamps: 'estimate' }),
                });
              }
            });
            snapshot.docs.forEach((docSnap) => {
              colMap.set(docSnap.id, {
                id: docSnap.id,
                ...docSnap.data({ serverTimestamps: 'estimate' }),
              });
            });
            docsMap.set(colName, colMap);
            scheduleUpdateState();
          },
          (err: any) => {
            console.warn(`[AdminNexus] onSnapshot diagnostic on ${colName}:`, err?.message || err);
            activeUnsubs.delete(colName);
            if (isMounted) {
              const timer = setTimeout(() => attachFirestoreListener(colName, true), 2500);
              retryTimers.set(colName, timer);
            }
          }
        );
        activeUnsubs.set(colName, unsub);
      } catch (e) {
        console.warn(`[AdminNexus] Failed to attach onSnapshot to ${colName}:`, e);
      }
    };

    collectionsToListen.forEach((colName) => attachFirestoreListener(colName, true));

    // Real-time Server-Sent Events (SSE) subscription with auto-reconnect
    let eventSource: EventSource | null = null;
    const connectEventSource = () => {
      if (!isMounted || typeof EventSource === 'undefined') return;
      if (eventSource && eventSource.readyState !== EventSource.CLOSED) return;
      try {
        eventSource = new EventSource('/api/access-requests/stream');
        eventSource.onmessage = (ev) => {
          if (!isMounted) return;
          try {
            const payload = JSON.parse(ev.data);
            const sseMap = docsMap.get('server_sse') || new Map();
            if (payload?.type === 'INIT_REQUESTS' && Array.isArray(payload.requests)) {
              payload.requests.forEach((req: any) => {
                const docKey = req?.id || req?.uid || req?.email;
                if (docKey) {
                  sseMap.set(docKey, { id: docKey, ...req });
                }
              });
              docsMap.set('server_sse', sseMap);
              updateState(true);
            } else if (payload?.type === 'UPSERT_REQUEST' && payload?.request) {
              const req = payload.request;
              const docKey = req?.id || req?.uid || req?.email || `req_${Date.now()}`;
              sseMap.set(docKey, { id: docKey, ...req });
              docsMap.set('server_sse', sseMap);
              updateState(true);
            } else if (payload?.type === 'DELETE_REQUEST') {
              const delId = String(payload.id || '').toLowerCase();
              const delEmail = String(payload.email || '').toLowerCase();
              sseMap.forEach((val, key) => {
                const vEmail = String(val?.email || '').toLowerCase();
                if (key.toLowerCase() === delId || (delEmail && vEmail === delEmail)) {
                  sseMap.delete(key);
                }
              });
              docsMap.set('server_sse', sseMap);
              updateState(true);
            }
          } catch {}
        };
        eventSource.onerror = () => {
          try {
            eventSource?.close();
          } catch {}
        };
      } catch {}
    };

    connectEventSource();
    fetchPendingRequestsRef.current(true);

    const handleCustomSubmit = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail) {
        const colMap = docsMap.get('access_requests') || new Map();
        const docKey = detail.id || detail.uid || `req_${Date.now()}`;
        colMap.set(docKey, {
          id: docKey,
          ...detail,
        });
        docsMap.set('access_requests', colMap);
        updateState(true);
      }
    };
    window.addEventListener('bim_access_request_submitted', handleCustomSubmit);

    const handleStorageChange = (e: StorageEvent) => {
      if (
        e.key === PENDING_ACCESS_REQUESTS_KEY ||
        e.key === 'bim_tracker_onboarding_v8' ||
        e.key === 'bim_tracker_onboarding_v7' ||
        e.key === DELETED_ACCESS_REQUESTS_KEY
      ) {
        updateState(true);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Explicit reconnect / resubscribe & force-reload handler on window focus, network online, or tab visibility restore
    const handleReconnectAndResubscribe = () => {
      if (!isMounted) return;
      collectionsToListen.forEach((colName) => {
        if (!activeUnsubs.has(colName)) {
          attachFirestoreListener(colName, true);
        }
      });
      connectEventSource();
      fetchPendingRequestsRef.current(true);
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        handleReconnectAndResubscribe();
      }
    };

    window.addEventListener('focus', handleReconnectAndResubscribe);
    window.addEventListener('online', handleReconnectAndResubscribe);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel(ACCESS_REQUESTS_CHANNEL);
        bc.onmessage = (event) => {
          if (event.data?.type === 'UPSERT_REQUEST' && event.data?.request) {
            const req = event.data.request;
            const colMap = docsMap.get('access_requests') || new Map();
            const docKey = req.id || `req_${Date.now()}`;
            colMap.set(docKey, {
              id: docKey,
              ...req,
            });
            docsMap.set('access_requests', colMap);
            updateState(true);
          } else if (event.data?.type === 'DELETE_REQUEST') {
            updateState(true);
          }
        };
      } catch {}
    }

    return () => {
      isMounted = false;
      activeUnsubs.forEach((unsub) => {
        try {
          unsub();
        } catch {}
      });
      activeUnsubs.clear();
      retryTimers.forEach((t) => clearTimeout(t));
      retryTimers.clear();
      if (eventSource) {
        try {
          eventSource.close();
        } catch {}
      }
      window.removeEventListener('bim_access_request_submitted', handleCustomSubmit);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleReconnectAndResubscribe);
      window.removeEventListener('online', handleReconnectAndResubscribe);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (bc) {
        try {
          bc.close();
        } catch {}
      }
    };
  }, []);

  // Dynamic Team Efficiency reference
  const members = employees;

  // Synchronize users automatically with Team Efficiency (employees) and any pending onboarding requests
  const users: UserAccessRecord[] = useMemo(() => {
    const list: UserAccessRecord[] = employees.map((emp, index) => {
      const customPerm = permissionsMap[emp.id] || {};
      const isSuperAdminUser =
        isSuperAdminEmail(emp.email) ||
        emp.name.toLowerCase().includes('sushoovan') ||
        emp.role?.toLowerCase().includes('super admin');

      const matchedReq = onboardingRequests.find(
        (r) => r.email.toLowerCase() === emp.email.toLowerCase()
      );

      const defaultAccessLevel: AccessLevel = isSuperAdminUser
        ? 'Super Admin'
        : matchedReq?.assignedAccessLevel
        ? matchedReq.assignedAccessLevel
        : emp.role?.toLowerCase().includes('viewer') || (matchedReq && isReqPending(matchedReq.status))
        ? 'Viewer'
        : 'Editor';

      const accessLevel = customPerm.accessLevel || defaultAccessLevel;
      const isSuper = accessLevel === 'Super Admin';
      const isDirector = accessLevel === 'Director';
      const isAdmin = accessLevel === 'BIM Admin';
      const isEditor = accessLevel === 'Editor';
      const isPM = accessLevel === 'Project Manager';

      return {
        id: emp.id,
        name: emp.name,
        email: emp.email,
        role: emp.role,
        accessLevel,
        canEditProjects: customPerm.canEditProjects ?? (isSuper || isDirector || isAdmin || isEditor || isPM),
        canEditHours: customPerm.canEditHours ?? true,
        canManageTeam: customPerm.canManageTeam ?? (isSuper || isDirector || isAdmin),
        canDeleteRecords: customPerm.canDeleteRecords ?? (isSuper || isDirector),
        canExportReports: customPerm.canExportReports ?? true,
        assignedProjectIds: ['all'],
        status: matchedReq && isReqPending(matchedReq.status) ? 'Pending Approval' : emp.status === 'Suspended' ? 'Suspended' : 'Active',
        lastActive: isSuperAdminUser ? 'Active (Super Admin)' : `${(index + 1) * 14} mins ago`,
      };
    });

    // Also include any external Google onboarding requests not yet in employees (strictly exclude rejected)
    onboardingRequests.forEach((req) => {
      if ((req.status || '').toUpperCase() === 'REJECTED') return;
      const reqIdLower = String(req.id || '').trim().toLowerCase();
      const reqEmailLower = (req.email || '').trim().toLowerCase();
      const alreadyInList = list.some(
        (u) =>
          (reqEmailLower && (u.email || '').trim().toLowerCase() === reqEmailLower) ||
          (reqIdLower && (
            String(u.id || '').trim().toLowerCase() === reqIdLower ||
            String(u.id || '').trim().replace(/^emp-/, '').toLowerCase() === reqIdLower.replace(/^emp-/, '')
          ))
      );
      if (!alreadyInList) {
        const customPerm = permissionsMap[req.id] || {};
        const isSuper = (customPerm.accessLevel || req.assignedAccessLevel) === 'Super Admin';
        const isDirector = (customPerm.accessLevel || req.assignedAccessLevel) === 'Director';
        const isAdmin = (customPerm.accessLevel || req.assignedAccessLevel) === 'BIM Admin';
        const isEditor = (customPerm.accessLevel || req.assignedAccessLevel) === 'Editor';
        const isPM = (customPerm.accessLevel || req.assignedAccessLevel) === 'Project Manager';
        const accessLevel =
          customPerm.accessLevel ||
          req.assignedAccessLevel ||
          (isReqPending(req.status) ? 'Viewer' : 'Editor');

        list.push({
          id: req.id,
          name: req.name,
          email: req.email,
          role: req.requestedRole || 'External Partner (Google SSO)',
          accessLevel,
          canEditProjects: customPerm.canEditProjects ?? (isSuper || isDirector || isAdmin || isEditor || isPM),
          canEditHours: customPerm.canEditHours ?? true,
          canManageTeam: customPerm.canManageTeam ?? (isSuper || isDirector || isAdmin),
          canDeleteRecords: customPerm.canDeleteRecords ?? (isSuper || isDirector),
          canExportReports: customPerm.canExportReports ?? true,
          assignedProjectIds: ['all'],
          status: isReqPending(req.status) ? 'Pending Approval' : 'Active',
          lastActive: 'Just registered via Google',
        });
      }
    });

    const seenUserIds = new Set<string>();
    const seenUserEmails = new Set<string>();
    return list.filter((u) => {
      const idKey = String(u.id || '').trim().toLowerCase();
      const emailKey = String(u.email || '').trim().toLowerCase();
      if ((idKey && seenUserIds.has(idKey)) || (emailKey && seenUserEmails.has(emailKey))) {
        return false;
      }
      if (idKey) seenUserIds.add(idKey);
      if (emailKey) seenUserEmails.add(emailKey);
      return true;
    });
  }, [employees, onboardingRequests, permissionsMap]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccessFilter, setSelectedAccessFilter] = useState<string>('all');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // New user form state
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('BIM Specialist');
  const [newUserAccessLevel, setNewUserAccessLevel] = useState<AccessLevel>('Editor');

  // Simulation state
  const [simName, setSimName] = useState('Alex Rivera');
  const [simEmail, setSimEmail] = useState('alex.rivera.bim@gmail.com');
  const [simDiscipline, setSimDiscipline] = useState('Structure');
  const [simReason, setSimReason] = useState('Structural LOD 350 model review & clash coordination');

  const showNotification = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const handleUpdateAccessLevel = (
    userId: string,
    newLevel: AccessLevel,
    explicitTarget?: { email: string; name: string }
  ) => {
    const isSuper = newLevel === 'Super Admin';
    const isDirector = newLevel === 'Director';
    const isAdmin = newLevel === 'BIM Admin';
    const isEditor = newLevel === 'Editor';
    const isPM = newLevel === 'Project Manager';
    const isViewer = newLevel === 'Viewer';

    const targetUser = users.find((u) => u.id === userId);
    const targetEmail = explicitTarget?.email || targetUser?.email;
    const targetName = explicitTarget?.name || targetUser?.name || 'User';

    // 1. Update permissionsMap
    setPermissionsMap((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        accessLevel: newLevel,
        canEditProjects: isSuper || isDirector || isAdmin || isEditor || isPM,
        canEditHours: true,
        canManageTeam: isSuper || isDirector || isAdmin,
        canDeleteRecords: isSuper || isDirector,
        canExportReports: isSuper || isDirector || isAdmin || isEditor || isPM,
      },
    }));

    if (targetEmail) {
      // 2. Update Employee record
      const matchedEmp = employees.find(
        (e) => e.email.toLowerCase() === targetEmail.toLowerCase()
      );
      if (matchedEmp) {
        updateEmployee(matchedEmp.id, {
          role: isSuper
            ? 'Super Administrator'
            : isDirector
            ? 'Director'
            : isAdmin
            ? 'BIM Administrator'
            : isPM
            ? 'Senior BIM Project Manager'
            : isEditor
            ? 'BIM Specialist / Modeler'
            : 'Viewer (Read Only)',
        });
      }

      // 3. Mark Onboarding Request as APPROVED with assigned access level
      setOnboardingRequests((prev) =>
        prev.map((r) => {
          if (r.email.toLowerCase() === targetEmail.toLowerCase() || r.id === userId) {
            return {
              ...r,
              status: 'APPROVED',
              assignedAccessLevel: newLevel,
              assignedRole: isSuper
                ? 'SUPER_ADMIN'
                : isDirector
                ? 'DIRECTOR'
                : isPM
                ? 'PROJECT_MANAGER'
                : isViewer
                ? 'VIEWER'
                : 'EDITOR',
              reviewedBy: `${SUPER_ADMIN_NAME} (Super Admin)`,
              reviewedAt: new Date().toLocaleString([], {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              }),
            };
          }
          return r;
        })
      );

      // 4. Record to Audit Log
      addAuditLog({
        action: 'role_changed',
        targetUserEmail: targetEmail,
        targetUserName: targetName,
        performedBy: `${SUPER_ADMIN_NAME} (Super Admin)`,
        details: `Modified access level to [${newLevel}] and synchronized system capabilities for ${targetName}.`,
      });

      // 5. Update session if active
      const roleToSet: UserRole = isSuper
        ? 'SUPER_ADMIN'
        : isDirector
        ? 'DIRECTOR'
        : isPM
        ? 'PROJECT_MANAGER'
        : isViewer
        ? 'VIEWER'
        : 'EDITOR';

      persistUserRoleToDatabase({
        email: targetEmail,
        role: roleToSet,
        status: 'APPROVED',
        accessLevel: newLevel,
        name: targetName,
        uid: userId,
      }).catch((e: any) => {
        console.warn('persistUserRoleToDatabase in handleUpdateAccessLevel notice:', e);
        setSyncError(e?.message || 'Failed to persist updated role to Firestore.');
      });

      if (currentUser && currentUser.email.toLowerCase() === targetEmail.toLowerCase()) {
        setCurrentUser({
          ...currentUser,
          accessLevel: newLevel,
          appRole: roleToSet,
          isAdmin: isSuper || isDirector,
          status: 'APPROVED',
        });
      }
    }

    showNotification(`Updated ${targetName}'s access level to ${newLevel}`);
  };

  const handleTogglePermission = (
    userId: string,
    field: 'canEditProjects' | 'canEditHours' | 'canManageTeam' | 'canExportReports'
  ) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    const currentVal = targetUser[field];
    const nextVal = !currentVal;

    setPermissionsMap((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: nextVal,
      },
    }));

    addAuditLog({
      action: 'permission_toggled',
      targetUserEmail: targetUser.email,
      targetUserName: targetUser.name,
      performedBy: `${SUPER_ADMIN_NAME} (Super Admin)`,
      details: `${nextVal ? 'Granted' : 'Revoked'} permission [${field}] for ${targetUser.name} (${targetUser.email}).`,
    });

    showNotification(`Updated ${field} permission for ${targetUser.name}`);
  };

  const handleDeleteUser = (userId: string) => {
    const target = users.find((e) => e.id === userId);
    if (isSuperAdminEmail(target?.email)) {
      setSyncError('Cannot delete a primary Super Admin account.');
      return;
    }

    if (confirm(`Are you sure you want to remove ${target?.name || 'this member'} from Admin Nexus and revoke access?`)) {
      if (target) {
        const targetEmailLower = (target.email || '').trim().toLowerCase();
        const targetNameLower = (target.name || '').trim().toLowerCase();

        deleteEmployee(userId);
        deleteOnboardingRequest(userId);

        employees.forEach((emp) => {
          if (
            emp.id === userId ||
            (targetEmailLower && (emp.email || '').trim().toLowerCase() === targetEmailLower) ||
            (targetNameLower && (emp.name || '').trim().toLowerCase() === targetNameLower)
          ) {
            deleteEmployee(emp.id);
          }
        });

        onboardingRequests.forEach((req) => {
          if (
            req.id === userId ||
            (targetEmailLower && (req.email || '').trim().toLowerCase() === targetEmailLower) ||
            (targetNameLower && (req.name || '').trim().toLowerCase() === targetNameLower)
          ) {
            deleteOnboardingRequest(req.id);
          }
        });

        setPermissionsMap((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });

        addAuditLog({
          action: 'user_deleted',
          targetUserEmail: target.email,
          targetUserName: target.name,
          performedBy: `${SUPER_ADMIN_NAME} (Super Admin)`,
          details: `Revoked access and removed user profile for ${target.name} (${target.email}).`,
        });

        showNotification('User access revoked and member removed');
      }
    }
  };

  const handlePurgeOtherAccounts = () => {
    if (
      confirm(
        'Are you sure you want to delete all other team members and accounts, leaving ONLY Super Admin accounts with master privileges?'
      )
    ) {
      employees.forEach((emp) => {
        if (!isSuperAdminEmail(emp.email)) {
          deleteEmployee(emp.id);
        }
      });
      onboardingRequests.forEach((req) => {
        if (!isSuperAdminEmail(req.email)) {
          deleteOnboardingRequest(req.id);
        }
      });
      showNotification('All other team members have been purged.');
    }
  };

  const handleInviteUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;

    const cleanName = newUserName.trim();
    const cleanEmail = newUserEmail.trim().toLowerCase();

    const newEmp = addEmployee({
      name: cleanName,
      email: cleanEmail,
      role: newUserRole.trim(),
      primaryDiscipline: 'BIM - ACS',
      weeklyCapacityHours: 40,
      status: 'Active',
      activeProjectIds: [projects[0]?.id || 'p1'],
      skills: ['Revit 2026', 'Navisworks Manage', 'Solibri'],
    });

    handleUpdateAccessLevel(newEmp.id, newUserAccessLevel, {
      email: cleanEmail,
      name: cleanName,
    });
    setIsInviteModalOpen(false);
    setNewUserName('');
    setNewUserEmail('');
    showNotification(`Added ${newEmp.name} to Team Efficiency and Admin Nexus`);
  };

  const handleSimulateRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simEmail.trim()) return;
    try {
      await registerAccessRequest({
        email: simEmail.trim().toLowerCase(),
        name: simName.trim() || simEmail.trim().split('@')[0],
        fullName: simName.trim() || simEmail.trim().split('@')[0],
        discipline: simDiscipline,
        organization: 'External Contractor / Modeling Partner',
        reasonForAccess: simReason.trim(),
        accessReason: simReason.trim(),
      });
      setIsSimulateModalOpen(false);
      setActiveSubTab('pending-onboarding');
      showNotification(`Access request registered in Firestore for ${simEmail}`);
    } catch (err: any) {
      showNotification(`Failed to register access request: ${err?.message || 'Permission error'}`);
    }
  };

  const handleDisciplineChange = useCallback(
    async (requestId: string, newDiscipline: Discipline, isApprovedRequest = false) => {
      setPendingDisciplineMap((prev) => ({
        ...prev,
        [requestId]: newDiscipline,
      }));

      const nowIso = new Date().toISOString();
      const targetReq = onboardingRequests.find((r) => r.id === requestId);

      // Update local docsMapRef cache so background polling / snapshots stay in sync
      docsMapRef.current.forEach((colMap) => {
        colMap.forEach((docVal, key) => {
          const dEmail = String(docVal?.email || '').trim().toLowerCase();
          if (
            key === requestId ||
            docVal?.id === requestId ||
            (targetReq?.email && dEmail === targetReq.email.trim().toLowerCase())
          ) {
            colMap.set(key, {
              ...docVal,
              discipline: newDiscipline,
              primaryDiscipline: newDiscipline,
              assignedDiscipline: newDiscipline,
              orgDiscipline: newDiscipline,
              organization: newDiscipline,
              updatedAt: nowIso,
              timestamp: nowIso,
            });
          }
        });
      });

      setOnboardingRequests((prev) =>
        prev.map((req) => {
          if (
            req.id === requestId ||
            (targetReq?.email && req.email.toLowerCase() === targetReq.email.toLowerCase())
          ) {
            const updatedReq: OnboardingRequest = {
              ...req,
              assignedDiscipline: newDiscipline,
              orgDiscipline: newDiscipline,
              discipline: newDiscipline,
              primaryDiscipline: newDiscipline,
              organization: newDiscipline,
              timestamp: nowIso,
            };
            saveLocalAccessRequest(updatedReq);
            return updatedReq;
          }
          return req;
        })
      );

      if (isApprovedRequest && targetReq) {
        const currentRole =
          pendingRoleMap[requestId] ||
          targetReq.assignedRole ||
          normalizeUserRole(targetReq.role) ||
          'EDITOR';
        const accessLevel = mapAppRoleToAccessLevel(currentRole);
        approveOnboardingRequest(requestId, currentRole, accessLevel, newDiscipline);
        showNotification(`Updated ${targetReq.name}'s discipline to ${newDiscipline}`);
      } else {
        try {
          for (const colName of ['access_requests', 'accessRequests']) {
            await updateDoc(doc(db, colName, requestId), {
              discipline: newDiscipline,
              primaryDiscipline: newDiscipline,
              assignedDiscipline: newDiscipline,
              orgDiscipline: newDiscipline,
              organization: newDiscipline,
              assignedTo: requestId,
              timestamp: nowIso,
              updatedAt: nowIso,
            }).catch(() => {});
          }
        } catch (err) {
          console.warn('Firestore discipline updateDoc notice:', err);
        }
      }
    },
    [onboardingRequests, pendingRoleMap, approveOnboardingRequest, setOnboardingRequests]
  );

  const handleToggleAccessRequest = useCallback(
    (requestId: string, applicantName: string, decision: 'accept' | 'reject') => {
      if (decision === 'accept') {
        const req = onboardingRequests.find((r) => r.id === requestId);
        const selectedRole =
          pendingRoleMap[requestId] ||
          req?.assignedRole ||
          normalizeUserRole(req?.role) ||
          'EDITOR';
        const accessLevel = mapAppRoleToAccessLevel(selectedRole);
        const selectedDiscipline =
          pendingDisciplineMap[requestId] ||
          (req?.assignedDiscipline as Discipline) ||
          (req?.discipline as Discipline) ||
          (req?.primaryDiscipline as Discipline) ||
          'BIM - ACS';

        approveOnboardingRequest(requestId, selectedRole, accessLevel, selectedDiscipline);
        showNotification(`Access granted for ${applicantName} (${selectedRole} - ${selectedDiscipline})`);
      } else {
        rejectOnboardingRequest(requestId, 'Declined by administrator via interactive toggle.');
        showNotification(`Access declined for ${applicantName} — moved to Rejected Logs`);
      }
    },
    [
      onboardingRequests,
      pendingRoleMap,
      pendingDisciplineMap,
      approveOnboardingRequest,
      rejectOnboardingRequest,
    ]
  );

  const handleApproveWithRole = useCallback(
    (requestId: string, applicantName: string) => {
      const req = onboardingRequests.find((r) => r.id === requestId);
      const selectedRole =
        pendingRoleMap[requestId] ||
        req?.assignedRole ||
        normalizeUserRole(req?.role) ||
        'EDITOR';
      const accessLevel = mapAppRoleToAccessLevel(selectedRole);
      const selectedDiscipline =
        pendingDisciplineMap[requestId] ||
        (req?.assignedDiscipline as Discipline) ||
        (req?.discipline as Discipline) ||
        (req?.primaryDiscipline as Discipline) ||
        'BIM - ACS';

      approveOnboardingRequest(requestId, selectedRole, accessLevel, selectedDiscipline);
      showNotification(`Approved ${applicantName} as ${selectedRole} [${selectedDiscipline}] (${accessLevel})`);
    },
    [onboardingRequests, pendingRoleMap, pendingDisciplineMap, approveOnboardingRequest]
  );

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return users.filter((u) => {
      const matchesSearch =
        !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchesAccess =
        selectedAccessFilter === 'all' || u.accessLevel === selectedAccessFilter;
      return matchesSearch && matchesAccess;
    });
  }, [users, searchQuery, selectedAccessFilter]);

  const pendingRequests = useMemo(
    () => onboardingRequests.filter((r) => r.status === 'pending' || isReqPending(r.status)),
    [onboardingRequests]
  );
  const pendingCount = pendingRequests.length;

  const approvedRequests = useMemo(
    () => onboardingRequests.filter((r) => (r.status || '').toUpperCase() === 'APPROVED'),
    [onboardingRequests]
  );

  const rejectedRequests = useMemo(
    () => onboardingRequests.filter((r) => (r.status || '').toUpperCase() === 'REJECTED'),
    [onboardingRequests]
  );

  // Access Review table filter: strictly displays active/pending requests (request.status === 'pending')
  const filteredOnboarding = useMemo(() => {
    if (onboardingFilter === 'approved') return approvedRequests;
    return pendingRequests;
  }, [onboardingFilter, approvedRequests, pendingRequests]);

  const filteredRejectedRequests = useMemo(() => {
    const q = rejectedSearchQuery.trim().toLowerCase();
    if (!q) return rejectedRequests;
    return rejectedRequests.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.primaryDiscipline || '').toLowerCase().includes(q) ||
        (r.requestedRole || '').toLowerCase().includes(q)
    );
  }, [rejectedRequests, rejectedSearchQuery]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearchQuery.toLowerCase();
    return auditLogs.filter((log) => {
      const matchesSearch =
        !q ||
        log.targetUserName.toLowerCase().includes(q) ||
        log.targetUserEmail.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.performedBy.toLowerCase().includes(q);

      const matchesAction = auditFilterAction === 'all' || log.action === auditFilterAction;

      return matchesSearch && matchesAction;
    });
  }, [auditLogs, auditSearchQuery, auditFilterAction]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-2xl text-xs font-semibold animate-bounce">
          <CheckCircle2 className="w-4 h-4" />
          <span>{successToast}</span>
        </div>
      )}

      {syncError && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{syncError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncError(null)}
            className="text-rose-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className={`p-6 rounded-3xl border transition-colors ${
        isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className={`text-xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Admin Nexus
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  Synced with Team Efficiency ({members.filter(m => m.status === 'Active').length} members)
                </span>
                {pendingCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSubTab('pending-onboarding');
                      setOnboardingFilter('pending');
                    }}
                    className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse hover:bg-amber-500/30 transition cursor-pointer flex items-center gap-1"
                    title="Click to open pending access review queue"
                  >
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>{pendingCount} Pending Approvals (Review Queue)</span>
                  </button>
                )}
              </div>
              <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Role governance, access request approval gating, and ISO 19650 audit trail for Google Workspace & Gmail sign-ins.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setIsSecurityModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
              title="Configure 2FA & Centralized Security Settings"
            >
              <KeyRound className="w-4 h-4 text-emerald-400" />
              <span>2FA & Security Settings</span>
            </button>

            <button
              onClick={handlePurgeOtherAccounts}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/80 text-xs font-semibold transition"
              title="Delete all other accounts leaving only sushoovan Das as Super Admin"
            >
              <UserX className="w-4 h-4 text-rose-400" />
              <span>Purge Other Accounts</span>
            </button>

            <button
              onClick={() => setIsSimulateModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span>Simulate External Google Sign-Up</span>
            </button>

            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition"
            >
              <UserPlus className="w-4 h-4" />
              <span>Grant Access / Add Member</span>
            </button>
          </div>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-slate-800/80 flex-wrap">
          <button
            onClick={() => setActiveSubTab('active-users')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeSubTab === 'active-users'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Active Team & Permissions ({members.filter(m => m.status === 'Active').length})</span>
          </button>

          <button
            onClick={() => {
              setActiveSubTab('pending-onboarding');
              setOnboardingFilter('pending');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 relative ${
              activeSubTab === 'pending-onboarding'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Access Review & Gating ({pendingCount})</span>
            {pendingCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('rejected-logs')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 relative ${
              activeSubTab === 'rejected-logs'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <XCircle className="w-4 h-4 text-rose-400" />
            <span>Rejected Logs ({rejectedRequests.length})</span>
            {rejectedRequests.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold text-[10px] flex items-center justify-center">
                {rejectedRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('audit-logs')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeSubTab === 'audit-logs'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Activity className="w-4 h-4 text-indigo-400" />
            <span>Admin Audit Trail ({auditLogs.length})</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'active-users' ? (
        <>
          {/* Pending Requests Alert Notification Banner */}
          {pendingCount > 0 && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="font-bold text-amber-200 text-sm">
                    {pendingCount} Access {pendingCount === 1 ? 'Request is' : 'Requests are'} Awaiting Super Admin Review
                  </div>
                  <div className="text-slate-400 text-xs mt-0.5">
                    Applicants have submitted access requests from the landing page. Click below to review and approve/reject.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveSubTab('pending-onboarding');
                  setOnboardingFilter('pending');
                }}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md shadow-amber-600/30 transition flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <span>Review Pending Queue ({pendingCount})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Control Bar: Search & Filter */}
          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search team members by name or Google email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full text-xs font-medium pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 transition ${
                  isLight
                    ? 'bg-slate-100 text-slate-900 border border-slate-200'
                    : 'bg-slate-800 text-slate-100 border border-slate-700'
                }`}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider shrink-0">
                Filter Role:
              </span>
              <select
                value={selectedAccessFilter}
                onChange={(e) => setSelectedAccessFilter(e.target.value)}
                className={`text-xs font-medium px-3 py-2.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 text-slate-900 border border-slate-200'
                    : 'bg-slate-800 text-slate-200 border border-slate-700'
                }`}
              >
                <option value="all">All Roles ({users.length})</option>
                <option value="Super Admin">Super Admin</option>
                <option value="Director">Director</option>
                <option value="BIM Admin">BIM Admin</option>
                <option value="Project Manager">Project Manager</option>
                <option value="Editor">Editor</option>
                <option value="Viewer">Viewer</option>
              </select>
            </div>
          </div>

          {/* User Access Table */}
          <div className={`border rounded-2xl overflow-hidden shadow-sm ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700 text-[11px]">
                  <tr>
                    <th className="py-3 px-4 min-w-[220px]">User & Identity</th>
                    <th className="py-3 px-3 min-w-[120px]">Account Status</th>
                    <th className="py-3 px-3 min-w-[180px]">Access Level / Role</th>
                    <th className="py-3 px-3 min-w-[100px] text-center">Edit Projects</th>
                    <th className="py-3 px-3 min-w-[100px] text-center">Manage Team</th>
                    <th className="py-3 px-3 min-w-[120px] text-center">Log Daily Hours</th>
                    <th className="py-3 px-4 min-w-[80px] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredUsers.map((user) => {
                    const isSuper = user.accessLevel === 'Super Admin';
                    const isDirector = user.accessLevel === 'Director';
                    const isAdmin = user.accessLevel === 'BIM Admin';
                    const isEditor = user.accessLevel === 'Editor';
                    const isPM = user.accessLevel === 'Project Manager';
                    const isViewer = user.accessLevel === 'Viewer';
                    const isPending = user.status === 'Pending Approval';

                    return (
                      <tr key={user.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm tracking-wide">
                              {user.name}
                            </span>
                            {isSuper && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                                SUPER ADMIN
                              </span>
                            )}
                            {isDirector && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                DIRECTOR
                              </span>
                            )}
                            {isAdmin && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                BIM ADMIN
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono mt-0.5">
                            <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                            <span>{user.email}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          {isPending ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                                Pending
                              </span>
                              <div
                                role="group"
                                aria-label="Quick Access Decision Toggle"
                                className="inline-flex items-center p-0.5 rounded-lg bg-slate-950/80 border border-slate-800"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    const matched = onboardingRequests.find(
                                      (r) => r.email.toLowerCase() === user.email.toLowerCase() || r.id === user.id
                                    );
                                    if (matched) {
                                      handleToggleAccessRequest(matched.id, user.name, 'accept');
                                    } else {
                                      handleUpdateAccessLevel(user.id, user.accessLevel || 'Editor');
                                    }
                                  }}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/20 flex items-center gap-0.5 transition cursor-pointer"
                                  title="Accept Access"
                                >
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Accept</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const matched = onboardingRequests.find(
                                      (r) => r.email.toLowerCase() === user.email.toLowerCase() || r.id === user.id
                                    );
                                    if (matched) {
                                      handleToggleAccessRequest(matched.id, user.name, 'reject');
                                    } else {
                                      deleteEmployee(user.id);
                                      showNotification(`Access declined for ${user.name}`);
                                    }
                                  }}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-400 hover:text-rose-300 hover:bg-rose-500/20 flex items-center gap-0.5 transition cursor-pointer"
                                  title="Reject Access"
                                >
                                  <X className="w-3 h-3 text-rose-400" />
                                  <span>Reject</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <Check className="w-3 h-3" />
                              Active Member
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <select
                              value={user.accessLevel}
                              onChange={(e) => handleUpdateAccessLevel(user.id, e.target.value as AccessLevel)}
                              className={`text-xs font-semibold px-2.5 py-1.5 rounded-xl border cursor-pointer focus:outline-none transition w-full ${
                                isSuper
                                  ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700'
                                  : isDirector
                                  ? 'bg-amber-950/80 text-amber-300 border-amber-700'
                                  : isAdmin
                                  ? 'bg-blue-950/80 text-blue-300 border-blue-700'
                                  : isPM
                                  ? 'bg-purple-950/80 text-purple-300 border-purple-700'
                                  : isEditor
                                  ? 'bg-cyan-950/80 text-cyan-300 border-cyan-700'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              <option value="Super Admin" className="bg-slate-900 text-indigo-300">👑 Super Admin</option>
                              <option value="Director" className="bg-slate-900 text-amber-300">⭐ Director</option>
                              <option value="BIM Admin" className="bg-slate-900 text-blue-300">🛡️ BIM Admin</option>
                              <option value="Project Manager" className="bg-slate-900 text-purple-300">💼 Project Manager</option>
                              <option value="Editor" className="bg-slate-900 text-cyan-300">✏️ Editor (Edit Access)</option>
                              <option value="Viewer" className="bg-slate-900 text-slate-300">👁️ Viewer (Read Only)</option>
                            </select>
                            <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                              Current Role: {user.role}
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleTogglePermission(user.id, 'canEditProjects')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                              user.canEditProjects
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-500 border border-slate-700'
                            }`}
                          >
                            {user.canEditProjects ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>

                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleTogglePermission(user.id, 'canManageTeam')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                              user.canManageTeam
                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                : 'bg-slate-800 text-slate-500 border border-slate-700'
                            }`}
                          >
                            {user.canManageTeam ? 'Admin' : 'No'}
                          </button>
                        </td>

                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleTogglePermission(user.id, 'canEditHours')}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                              user.canEditHours
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : 'bg-slate-800 text-slate-500 border border-slate-700'
                            }`}
                          >
                            {user.canEditHours ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>

                        <td className="py-3 px-4 text-right">
                          {!isSuper && (
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition"
                              title="Revoke Member Access"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeSubTab === 'pending-onboarding' ? (
        /* GATING & PENDING ONBOARDING WORKFLOW SECTION */
        <div className="space-y-4">
          <div className={`p-5 rounded-2xl border ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Access Review & Gating Queue
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Review external Gmail & Google Workspace user registrations. Strictly displays active and pending requests.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
                  <button
                    onClick={() => setOnboardingFilter('pending')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                      onboardingFilter === 'pending' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Pending Queue ({pendingCount})
                  </button>
                  <button
                    onClick={() => setOnboardingFilter('approved')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                      onboardingFilter === 'approved' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Approved History ({approvedRequests.length})
                  </button>
                  <button
                    onClick={() => setActiveSubTab('rejected-logs')}
                    className="px-2.5 py-1 rounded-lg font-semibold transition text-slate-400 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Rejected Logs ({rejectedRequests.length})</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => fetchPendingRequests()}
                  disabled={isSyncing}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm disabled:opacity-50"
                  title={lastSyncTime ? `Last synced at ${lastSyncTime}` : 'Real-time re-fetch from access_requests database'}
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Syncing...' : 'Live Sync'}</span>
                </button>

                <button
                  onClick={() => setIsSimulateModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 self-start shadow-md shadow-blue-600/20"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Simulate New Sign-Up</span>
                </button>
              </div>
            </div>
          </div>

          <div className={`border rounded-2xl overflow-hidden shadow-sm ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700 text-[11px]">
                  <tr>
                    <th className="py-3 px-4 min-w-[220px]">Applicant & Corporate Email</th>
                    <th className="py-3 px-3 min-w-[140px]">Discipline & Org</th>
                    <th className="py-3 px-3 min-w-[220px]">Reason for Access</th>
                    <th className="py-3 px-3 min-w-[110px] text-center">Status</th>
                    <th className="py-3 px-4 min-w-[280px] text-right">
                      {onboardingFilter === 'approved' ? 'Assigned Role & Actions' : 'Role & Access Decision'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredOnboarding.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No requests found for this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredOnboarding.map((req) => {
                      const isPending = isReqPending(req.status);
                      const isApproved = req.status.toUpperCase() === 'APPROVED' || req.status.toLowerCase() === 'approved';
                      const isRejected = req.status.toUpperCase() === 'REJECTED' || req.status.toLowerCase() === 'rejected';
                      const activeDiscipline = (
                        pendingDisciplineMap[req.id] ||
                        req.assignedDiscipline ||
                        req.discipline ||
                        req.primaryDiscipline ||
                        'BIM - ACS'
                      ) as Discipline;
                      const activeOrgDiscipline =
                        pendingDisciplineMap[req.id] ||
                        req.orgDiscipline ||
                        req.assignedDiscipline ||
                        req.discipline ||
                        req.primaryDiscipline ||
                        'BIM - ACS';

                      return (
                        <tr key={req.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-white text-[13px]">{req.fullName || req.name}</div>
                            <div className="font-mono text-slate-400 text-[11px] mt-0.5 flex items-center gap-1">
                              <Mail className="w-3 h-3 text-slate-500" />
                              <span>{req.email}</span>
                            </div>
                            <div className="text-[10px] text-blue-400 font-medium mt-0.5">
                              Requested: {req.requestedRole}
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-medium block w-fit">
                              {activeDiscipline}
                            </span>
                            <span className="text-[10px] text-slate-400 block mt-1">
                              {activeOrgDiscipline}
                            </span>
                          </td>

                          <td className="py-3 px-3">
                            <p className="text-slate-300 text-xs italic line-clamp-2 max-w-xs">
                              "{req.reasonForAccess || req.accessReason || req.notes || 'Sign-in Access Request'}"
                            </p>
                            <span className="text-[10px] text-slate-500 block mt-1 font-mono">
                              Submitted: {req.createdAt || req.requestTimestamp || req.requestedAt}
                            </span>
                          </td>

                          <td className="py-3 px-3 text-center">
                            {isPending && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                                Pending Review
                              </span>
                            )}
                            {isApproved && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                <Check className="w-3 h-3" />
                                Approved ({req.assignedRole || req.assignedAccessLevel || 'Editor'})
                              </span>
                            )}
                            {isRejected && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                <X className="w-3 h-3" />
                                Declined
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {/* Role selector dropdown */}
                              <select
                                value={
                                  pendingRoleMap[req.id] ||
                                  req.assignedRole ||
                                  normalizeUserRole(req.role)
                                }
                                onChange={async (e) => {
                                  const newRole = e.target.value as UserRole;
                                  setPendingRoleMap((prev) => ({
                                    ...prev,
                                    [req.id]: newRole,
                                  }));

                                  const accessLevel = mapAppRoleToAccessLevel(newRole);
                                  const currentDiscipline = activeDiscipline;

                                  persistUserRoleToDatabase({
                                    email: req.email,
                                    role: newRole,
                                    status: isApproved ? 'APPROVED' : 'pending',
                                    accessLevel,
                                    name: req.fullName || req.name,
                                    discipline: currentDiscipline,
                                    uid: req.googleId || req.id,
                                  }).catch((err) => console.warn('Role update persistence notice:', err));

                                  if (isApproved) {
                                    approveOnboardingRequest(req.id, newRole, accessLevel, currentDiscipline);
                                  }
                                  showNotification(`Updated ${req.name}'s role to ${newRole}`);
                                }}
                                disabled={isRejected}
                                className={`text-[11px] font-semibold px-2 py-1.5 rounded-xl border transition cursor-pointer ${
                                  isRejected
                                    ? 'bg-slate-800/40 border-slate-800 text-slate-500 cursor-not-allowed'
                                    : 'bg-slate-800 border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500'
                                }`}
                                title={isApproved ? 'Change assigned role' : 'Role to assign upon acceptance'}
                              >
                                <option value="SUPER_ADMIN">Role: Super Admin</option>
                                <option value="DIRECTOR">Role: Director</option>
                                <option value="PROJECT_MANAGER">Role: Project Manager</option>
                                <option value="EDITOR">Role: Editor</option>
                                <option value="VIEWER">Role: Viewer (Read-only)</option>
                              </select>

                              {/* Discipline selector dropdown */}
                              <select
                                value={activeDiscipline}
                                onChange={(e) => {
                                  handleDisciplineChange(req.id, e.target.value as Discipline, isApproved);
                                }}
                                disabled={isRejected}
                                className={`text-[11px] font-semibold px-2 py-1.5 rounded-xl border transition cursor-pointer ${
                                  isRejected
                                    ? 'bg-slate-800/40 border-slate-800 text-slate-500 cursor-not-allowed'
                                    : 'bg-slate-800 border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500'
                                }`}
                                title={isApproved ? 'Change assigned discipline' : 'Discipline to assign upon acceptance'}
                              >
                                {PRIMARY_DISCIPLINES.map((d) => (
                                  <option key={d} value={d}>
                                    Discipline: {d}
                                  </option>
                                ))}
                              </select>

                              {/* Decision Actions: ONLY shown for Pending requests, NOT in approved history */}
                              {isPending && (
                                <div
                                  role="group"
                                  aria-label="Access Decision Actions"
                                  className="inline-flex items-center p-0.5 rounded-xl bg-slate-950/80 border border-slate-800 shadow-inner"
                                >
                                  {/* Accept Action */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAccessRequest(req.id, req.name, 'accept')}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-emerald-600/90 hover:bg-emerald-600 text-white shadow-sm transition-all cursor-pointer active:scale-95"
                                    title="Accept & Grant Access"
                                  >
                                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                    <span>Accept</span>
                                  </button>

                                  {/* Reject Action */}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAccessRequest(req.id, req.name, 'reject')}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 text-slate-400 hover:text-rose-300 hover:bg-rose-500/20 transition-all cursor-pointer active:scale-95"
                                    title="Reject & Decline Request"
                                  >
                                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                                    <span>Reject</span>
                                  </button>
                                </div>
                              )}

                              {/* Approved History: Active status badge & Revoke option instead of toggle keys */}
                              {isApproved && (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                    <span>Access Active</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      rejectOnboardingRequest(req.id, 'Access revoked from Approved History by Super Admin.');
                                      showNotification(`Revoked access for ${req.name} — moved to Rejected Logs`);
                                    }}
                                    className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-rose-300 hover:text-rose-100 hover:bg-rose-500/20 border border-rose-500/30 transition cursor-pointer"
                                    title="Revoke member access"
                                  >
                                    Revoke
                                  </button>
                                </>
                              )}

                              {/* Delete Request Record */}
                              <button
                                onClick={() => {
                                  deleteOnboardingRequest(req.id);
                                  showNotification(`Removed request record for ${req.email}`);
                                }}
                                className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                                title="Delete Request Record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeSubTab === 'rejected-logs' ? (
        /* REJECTED & ARCHIVED LOGS VIEW */
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className={`p-5 rounded-2xl border ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-400" />
                  Archived & Rejected Access Logs ({rejectedRequests.length})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Historical log of rejected Google OAuth and external onboarding requests. Access is blocked across all BPMS workspaces.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search rejected requests..."
                    value={rejectedSearchQuery}
                    onChange={(e) => setRejectedSearchQuery(e.target.value)}
                    className="text-xs font-medium pl-8 pr-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={`border rounded-2xl overflow-hidden shadow-sm ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700 text-[11px]">
                  <tr>
                    <th className="py-3 px-4 min-w-[220px]">Applicant & Corporate Email</th>
                    <th className="py-3 px-3 min-w-[140px]">Discipline & Org</th>
                    <th className="py-3 px-3 min-w-[220px]">Original Reason & Submission</th>
                    <th className="py-3 px-3 min-w-[140px] text-center">Status</th>
                    <th className="py-3 px-4 min-w-[200px] text-right">Archived Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredRejectedRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        <div className="max-w-xs mx-auto text-center space-y-1">
                          <XCircle className="w-8 h-8 text-slate-600 mx-auto" />
                          <p className="text-xs font-semibold text-slate-300">No Rejected Requests Found</p>
                          <p className="text-[11px] text-slate-500">
                            When access requests are declined in the Access Review table, they are removed from the active queue and archived here.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRejectedRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white text-[13px]">{req.name}</div>
                          <div className="font-mono text-slate-400 text-[11px] mt-0.5 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-slate-500" />
                            <span>{req.email}</span>
                          </div>
                          <div className="text-[10px] text-rose-400 font-medium mt-0.5">
                            Requested: {req.requestedRole}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-medium block w-fit">
                            {req.primaryDiscipline || 'BIM - ACS'}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-1">
                            {req.organization || 'External Partner'}
                          </span>
                        </td>

                        <td className="py-3 px-3">
                          <p className="text-slate-300 text-xs italic line-clamp-2 max-w-xs">
                            "{req.accessReason || req.notes || 'BIM review'}"
                          </p>
                          <span className="text-[10px] text-slate-500 block mt-1 font-mono">
                            Declined: {req.reviewedAt || req.requestTimestamp}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            <X className="w-3 h-3" />
                            Declined & Archived
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                reopenOnboardingRequest(req.id);
                                showNotification(`Re-opened request for ${req.name} — restored to Pending Queue`);
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 flex items-center gap-1.5 transition cursor-pointer"
                              title="Reconsider and restore to Pending Queue"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Re-open</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                deleteOnboardingRequest(req.id);
                                showNotification(`Permanently removed archived request for ${req.email}`);
                              }}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* AUDIT TRAIL LOGS VIEW */
        <div className="space-y-4">
          <div className={`p-5 rounded-2xl border ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  Administrative Audit Logs & Governance History
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Immutable real-time audit record of all Google Workspace SSO sign-ins, access approvals, role adjustments, and security revocations.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={auditSearchQuery}
                    onChange={(e) => setAuditSearchQuery(e.target.value)}
                    className="text-xs pl-8 pr-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <select
                  value={auditFilterAction}
                  onChange={(e) => setAuditFilterAction(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="all">All Actions</option>
                  <option value="joined">Google SSO Joined</option>
                  <option value="approved">Approved</option>
                  <option value="role_changed">Role / Access Changed</option>
                  <option value="permission_toggled">Permission Toggled</option>
                  <option value="rejected">Rejected</option>
                  <option value="user_deleted">Revoked</option>
                </select>
              </div>
            </div>
          </div>

          <div className={`border rounded-2xl overflow-hidden shadow-sm ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700 text-[11px]">
                  <tr>
                    <th className="py-3 px-4 min-w-[140px]">Action & Event</th>
                    <th className="py-3 px-3 min-w-[180px]">Target User</th>
                    <th className="py-3 px-3 min-w-[240px]">Details & Scope</th>
                    <th className="py-3 px-3 min-w-[160px]">Admin Actor</th>
                    <th className="py-3 px-4 min-w-[140px] text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No audit records match the current search query.
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map((log) => {
                      const isApproved = log.action === 'approved';
                      const isRejected = log.action === 'rejected';
                      const isDeleted = log.action === 'user_deleted';
                      const isRoleChanged = log.action === 'role_changed' || log.action === 'access_level_changed';
                      const isPermToggled = log.action === 'permission_toggled' || log.action === 'permission_changed';
                      const isJoined = log.action === 'joined' || log.action === 'user_joined' || log.action === 'access_requested';

                      return (
                        <tr key={log.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3.5 px-4">
                            {isJoined && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                <Sparkles className="w-3 h-3 text-cyan-400" />
                                Google SSO Join
                              </span>
                            )}
                            {isApproved && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" />
                                Access Approved
                              </span>
                            )}
                            {isRoleChanged && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                <ShieldCheck className="w-3 h-3" />
                                Role Changed
                              </span>
                            )}
                            {isPermToggled && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                <SlidersHorizontal className="w-3 h-3" />
                                Permission Toggled
                              </span>
                            )}
                            {isRejected && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                <XCircle className="w-3 h-3" />
                                Rejected
                              </span>
                            )}
                            {isDeleted && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                <UserX className="w-3 h-3" />
                                Revoked
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <div className="font-bold text-white">{log.targetUserName}</div>
                            <div className="text-[11px] font-mono text-slate-400">{log.targetUserEmail}</div>
                          </td>

                          <td className="py-3 px-3 text-slate-200">
                            {log.details}
                          </td>

                          <td className="py-3 px-3 text-indigo-300 font-medium">
                            {log.performedBy}
                          </td>

                          <td className="py-3 px-4 text-right text-slate-400 font-mono text-[11px]">
                            {log.timestamp}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Invite User Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Grant Access / Add Member</h3>
                  <p className="text-xs text-slate-400">Directly adds member to Team Efficiency & Admin Nexus</p>
                </div>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInviteUser} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jason Thorne"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full text-xs bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Corporate Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="j.thorne@productionpulse.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full text-xs bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Job Title / Role
                  </label>
                  <input
                    type="text"
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="w-full text-xs bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Initial Access Level
                  </label>
                  <select
                    value={newUserAccessLevel}
                    onChange={(e) => setNewUserAccessLevel(e.target.value as AccessLevel)}
                    className="w-full text-xs bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500"
                  >
                    <option value="Super Admin">Super Admin</option>
                    <option value="Director">Director</option>
                    <option value="BIM Admin">BIM Admin</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Editor">Editor (Edit Access)</option>
                    <option value="Viewer">Viewer (Read Only)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md"
                >
                  Confirm & Sync
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Simulate Onboarding Modal */}
      {isSimulateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Simulate Registration</h3>
                  <p className="text-xs text-slate-400">Creates a pending request in Admin Nexus</p>
                </div>
              </div>
              <button
                onClick={() => setIsSimulateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSimulateRegistration} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Applicant Name
                </label>
                <input
                  type="text"
                  required
                  value={simName}
                  onChange={(e) => setSimName(e.target.value)}
                  className="w-full text-xs bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Google (Gmail) Account
                </label>
                <input
                  type="email"
                  required
                  value={simEmail}
                  onChange={(e) => setSimEmail(e.target.value)}
                  className="w-full text-xs bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    BIM Discipline
                  </label>
                  <select
                    value={simDiscipline}
                    onChange={(e) => setSimDiscipline(e.target.value)}
                    className="w-full text-xs bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500"
                  >
                    <option value="Architecture">Architecture</option>
                    <option value="Structure">Structure</option>
                    <option value="HVAC">HVAC</option>
                    <option value="Electrical">Electrical</option>
                    <option value="Plumbing">Plumbing</option>
                    <option value="Fire Protection">Fire Protection</option>
                    <option value="Civil / Site">Civil / Site</option>
                    <option value="Coordination">Coordination</option>
                    <option value="AI & Automation">AI & Automation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Requested Access
                  </label>
                  <input
                    type="text"
                    required
                    value={simReason}
                    onChange={(e) => setSimReason(e.target.value)}
                    placeholder="e.g. Model validation"
                    className="w-full text-xs bg-slate-800 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSimulateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-xl shadow-md"
                >
                  Submit Simulated Sign-Up
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Security & 2FA Settings Modal */}
      <SecuritySettingsModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
      />
    </div>
  );
};