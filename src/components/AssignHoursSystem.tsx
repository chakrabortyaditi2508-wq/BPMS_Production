import React, { useState, useMemo, useEffect } from 'react';
import {
  Clock,
  Layers,
  Users,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Plus,
  Search,
  Calendar,
  AlertCircle,
  TrendingUp,
  ShieldCheck,
  ChevronDown,
  Trash2,
  Edit2,
  Check,
  X,
  Sparkles,
  ArrowRight,
  SlidersHorizontal,
  Info,
  Building,
  Briefcase
} from 'lucide-react';
import {
  useBimData,
  isUserSuperAdmin,
  getCurrentWeekRange,
  cleanProjectName,
  getMemberLabel,
  sanitizeEmployeeRecord,
  sanitizeWorkLogRecord,
  normalizeDateToIso,
  mergeAllocationsWithLocal,
  getDeletedAllocationIds,
  registerDeletedAllocationId,
  isRemovedMockMember,
} from '../context/BimDataContext';
import { db } from '../firebase/config';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import {
  Discipline,
  LODLevel,
  BimTaskType,
  ActivityType,
  AllocationPriority,
  ResourceAllocationItem,
  BimProject,
  Employee,
  DailyWorkLog,
} from '../types';
import { generateRequestDocId } from '../auth/roleSync';

interface AssignHoursSystemProps {
  onSelectProject?: (project: BimProject) => void;
}

const matchProjectId = (idA?: string, idB?: string): boolean => {
  if (!idA || !idB) return false;
  if (idA === idB) return true;
  const normA = idA.startsWith('proj-') ? idA : idA.replace(/^p(\d+)$/, 'proj-$1');
  const normB = idB.startsWith('proj-') ? idB : idB.replace(/^p(\d+)$/, 'proj-$1');
  return normA === normB;
};

const getInitials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

export const toUtcMidnightTimestamp = (dateInput: any): number | null => {
  if (!dateInput) return null;
  const iso = normalizeDateToIso(dateInput);
  if (!iso) return null;
  const parts = iso.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return Date.UTC(y, m, d);
    }
  }
  return null;
};

const normalizePersonName = (name?: string): string =>
  (name || '')
    .trim()
    .toLowerCase()
    .replace(/sushoovan|sushovon/g, 'sushovan')
    .replace(/abhinandn/g, 'abhinandan')
    .replace(/\s+/g, ' ');

const normalizePersonEmail = (email?: string): string =>
  (email || '')
    .trim()
    .toLowerCase()
    .replace(/^abhinandnb@/, 'abhinandanb@')
    .replace(/^sushovandas@/, 'sushoovandas@');

const normalizeAllocationDiscipline = (
  disc?: string
): ResourceAllocationItem['discipline'] => {
  const trimmed = (disc || '').trim();
  if (!trimmed) return 'BIM - ACS';
  if (trimmed === 'MEP') return 'BIM - MEP';
  return trimmed as ResourceAllocationItem['discipline'];
};

const INITIAL_ALLOCATIONS: ResourceAllocationItem[] = [];

export const AssignHoursSystem: React.FC<AssignHoursSystemProps> = ({ onSelectProject }) => {
  const {
    projects,
    employees,
    workLogs,
    allWorkLogs,
    resourceAllocations,
    theme,
    currentUser,
    disciplineAssignments,
    handleMemberSelect: syncDisciplineMemberToFirestore,
  } = useBimData();
  const isLight = theme === 'light';
  const isSuperAdmin = isUserSuperAdmin(currentUser);
  const canManageAllocations = useMemo(() => {
    if (isSuperAdmin) return true;
    const role = (
      currentUser?.securityRole ||
      currentUser?.accessLevel ||
      currentUser?.role ||
      ''
    ).toLowerCase();
    const appRole = (currentUser?.appRole || '').toUpperCase();
    return (
      role.includes('admin') ||
      role.includes('director') ||
      role.includes('manager') ||
      appRole === 'SUPER_ADMIN' ||
      appRole === 'DIRECTOR' ||
      appRole === 'PROJECT_MANAGER'
    );
  }, [currentUser, isSuperAdmin]);
  // Real-time Firestore state for daily_logs / work_logs directly bound in AssignHoursSystem
  const [realtimeDailyLogs, setRealtimeDailyLogs] = useState<DailyWorkLog[]>([]);

  const activeWorkLogs = useMemo(() => {
    const mergedMap = new Map<string, DailyWorkLog>();
    (workLogs || []).forEach((l) => {
      if (l && l.id) mergedMap.set(l.id, l);
    });
    (allWorkLogs || []).forEach((l) => {
      if (l && l.id) mergedMap.set(l.id, l);
    });
    (realtimeDailyLogs || []).forEach((l) => {
      if (l && l.id) mergedMap.set(l.id, l);
    });
    return Array.from(mergedMap.values());
  }, [workLogs, allWorkLogs, realtimeDailyLogs]);

  const activeTeamMembers = useMemo(() => {
    const raw = (employees || [])
      .filter((member) => !member.isDeleted && member.status !== 'deleted' && !isRemovedMockMember(member))
      .map((member) => sanitizeEmployeeRecord({ ...member }));
    const seen = new Set<string>();
    return raw.filter((member) => {
      const emailKey = normalizePersonEmail(member.email);
      const idKey = (member.id || '').trim();
      const strippedId = idKey.replace(/^emp-/, '');
      const detId = emailKey ? generateRequestDocId(emailKey) : '';
      const nameKey = normalizePersonName(member.name);
      if (
        (emailKey && seen.has(emailKey)) ||
        (idKey && seen.has(idKey)) ||
        (strippedId && seen.has(strippedId)) ||
        (detId && seen.has(detId)) ||
        (nameKey && seen.has(nameKey))
      ) {
        return false;
      }
      if (emailKey) seen.add(emailKey);
      if (idKey) seen.add(idKey);
      if (strippedId) seen.add(strippedId);
      if (detId) seen.add(detId);
      if (nameKey) seen.add(nameKey);
      return true;
    });
  }, [employees]);
  const activeMembers = activeTeamMembers;

  // Exclude allocations explicitly marked as deleted while keeping all live active allocations visible
  const isLiveActiveMember = (item: ResourceAllocationItem) => {
    if (!item) return false;
    if (isRemovedMockMember(item)) return false;
    if (getDeletedAllocationIds().has(item.id)) return false;
    if ((item as any).isDeleted === true) return false;
    if (String(item.status || '').trim().toLowerCase() === 'deleted') return false;
    return true;
  };

  // State
  const [allocations, setAllocations] = useState<ResourceAllocationItem[]>(() => {
    // Purge legacy allocations key if present
    try {
      localStorage.removeItem('bim_resource_allocations_v1');
    } catch {}

    const saved = localStorage.getItem('bim_resource_allocations_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => ({
            ...item,
            discipline: normalizeAllocationDiscipline(item.discipline),
            startDate:
              normalizeDateToIso(
                item.startDate ||
                (item as any).start ||
                (item as any).timelineStart ||
                (item as any).targetStartDate ||
                (item as any).targetDate ||
                (item as any).date
              ) || getCurrentWeekRange().startIso,
            dueDate:
              normalizeDateToIso(
                item.dueDate ||
                (item as any).due ||
                (item as any).endDate ||
                (item as any).end ||
                (item as any).timelineEnd ||
                (item as any).targetCompletionDate ||
                (item as any).targetDate ||
                (item as any).date
              ) || getCurrentWeekRange().endIso,
          }));
        }
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const hasInitialSeededRef = React.useRef(false);

  // Real-time Firestore onSnapshot listeners on BOTH assigned_hours (and project_assignments) AND daily_logs (and work_logs) collections
  useEffect(() => {
    let unsubAssignedHours: (() => void) | undefined;
    let unsubProjectAssignments: (() => void) | undefined;
    let unsubDailyLogs: (() => void) | undefined;
    let unsubWorkLogs: (() => void) | undefined;

    const assignedHoursMap = new Map<string, ResourceAllocationItem>();
    const projectAssignmentsMap = new Map<string, ResourceAllocationItem>();
    const dailyLogsMap = new Map<string, DailyWorkLog>();
    const workLogsMap = new Map<string, DailyWorkLog>();

    const parseSnapshotDoc = (docSnap: any): ResourceAllocationItem => {
      const data = docSnap.data();
      const matchedProj = projects.find((p) => matchProjectId(p.id, data.projectId));
      const resolvedEmpId = String(data.memberId || data.employeeId || data.assignedTo || '').trim();
      const resolvedEmail = (data.assignedToEmail || data.memberEmail || '').trim().toLowerCase();
      const rawDocName = String(data.assignedToName || data.memberName || data.employeeName || '').trim();
      const lowerDocName = rawDocName.toLowerCase();

      const sanitizedEmployees = employees.map((e) => sanitizeEmployeeRecord(e));
      const normDocName = normalizePersonName(rawDocName);
      const normDocEmail = normalizePersonEmail(resolvedEmail);
      const matchedEmpByName = normDocName
        ? sanitizedEmployees.find((e) => normalizePersonName(e.name) === normDocName)
        : undefined;
      const matchedEmpByIdOrEmail = sanitizedEmployees.find((e) => {
        if (normDocName && normalizePersonName(e.name) !== normDocName) {
          return false;
        }
        return (
          (resolvedEmpId &&
            (e.id === resolvedEmpId ||
              e.id.replace(/^emp-/, '') === resolvedEmpId.replace(/^emp-/, ''))) ||
          (normDocEmail && normalizePersonEmail(e.email) === normDocEmail)
        );
      });
      const matchedEmp = matchedEmpByName || matchedEmpByIdOrEmail;
      const isSushovan =
        lowerDocName.includes('sushovan') ||
        lowerDocName.includes('sushoovan') ||
        resolvedEmail === 'sushoovandas@gmail.com' ||
        resolvedEmail === 'sushovandas@gmail.com';
      const isAditi =
        !isSushovan &&
        (lowerDocName === 'aditi chakraborty' ||
          (!lowerDocName && resolvedEmail === 'modelatech2026@gmail.com'));
      const finalMemberId =
        matchedEmp?.id ||
        (isAditi
          ? 'emp-modelatech2026_gmail_com'
          : isSushovan
          ? 'emp-sushoovan_das'
          : resolvedEmpId);
      const finalEmail =
        matchedEmp?.email ||
        (isAditi
          ? 'modelatech2026@gmail.com'
          : isSushovan
          ? 'sushoovandas@gmail.com'
          : resolvedEmail === 'modelatech2026@gmail.com'
          ? ''
          : resolvedEmail);
      const finalName =
        matchedEmp?.name ||
        rawDocName ||
        '';
      const activeMatchedName =
        matchedEmp && !matchedEmp.isDeleted && matchedEmp.status !== 'deleted'
          ? matchedEmp.name
          : employees.length === 0
          ? finalName
          : finalName;
      return {
        id: docSnap.id,
        projectId: data.projectId || matchedProj?.id || '',
        projectName: data.projectName || matchedProj?.name || 'Unassigned Project',
        employeeId: finalMemberId,
        memberId: finalMemberId,
        assignedTo: finalMemberId,
        employeeName: activeMatchedName || finalName,
        assignedToName: activeMatchedName,
        memberName: activeMatchedName || finalName,
        employeeRole: matchedEmp?.role || data.employeeRole || 'Editor',
        memberEmail: finalEmail,
        assignedToEmail: finalEmail,
        discipline: normalizeAllocationDiscipline(data.discipline || matchedEmp?.discipline || 'BIM - ACS'),
        lod: data.lod || 'LOD 350',
        projectPhase: data.projectPhase || 'Design Development',
        taskType: data.taskType || '3D Modeling',
        targetElementOrZone: data.targetElementOrZone || 'MOD-AR-LVL01-ZONE-A',
        assignedHours: Number(data.assignedHours) || 0,
        viewFrequency: data.viewFrequency || 'Weekly',
        startDate:
          normalizeDateToIso(
            data.startDate ||
            data.start ||
            data.timelineStart ||
            data.targetStartDate ||
            data.targetDate ||
            data.date
          ) || getCurrentWeekRange().startIso,
        dueDate:
          normalizeDateToIso(
            data.dueDate ||
            data.due ||
            data.endDate ||
            data.end ||
            data.timelineEnd ||
            data.targetCompletionDate ||
            data.targetDate ||
            data.date
          ) || getCurrentWeekRange().endIso,
        ...(data.priority ? { priority: data.priority } : {}),
        status: data.status || 'Allocated',
        notes: data.notes || '',
        updatedAt: data.updatedAt || '',
      };
    };

    const parseDailyLogDoc = (docSnap: any): DailyWorkLog => {
      const data = docSnap.data();
      const rawEmployeeName = (data.employeeName || 'BIM Modeler').trim();
      const lowerEmpName = rawEmployeeName.toLowerCase();
      const rawEmail = (data.memberEmail || data.userEmail || '').trim().toLowerCase();
      const isDifferentNamedEmployee =
        Boolean(lowerEmpName) &&
        lowerEmpName !== 'bim modeler' &&
        lowerEmpName !== 'team member' &&
        !lowerEmpName.includes('aditi');
      const normalizedEmail =
        isDifferentNamedEmployee && rawEmail === 'modelatech2026@gmail.com' ? '' : rawEmail;
      const resolvedMemberId = data.employeeId || data.memberId || data.userId || '';
      const rawUserId = data.userId || resolvedMemberId;
      const sanitizedUserId =
        isDifferentNamedEmployee &&
        (rawUserId.includes('modelatech2026') || rawUserId === 'usr_super_admin_modelatech2026_gmail_com')
          ? data.employeeId || data.memberId || ''
          : rawUserId;
      const resolvedCreatedAt =
        typeof data.createdAt === 'string'
          ? data.createdAt
          : typeof data.createdAt?.toDate === 'function'
          ? data.createdAt.toDate().toISOString()
          : typeof data.createdAt?.seconds === 'number'
          ? new Date(data.createdAt.seconds * 1000).toISOString()
          : data.timestamp || new Date().toISOString();
      return sanitizeWorkLogRecord({
        id: docSnap.id,
        employeeId: resolvedMemberId,
        memberId: data.memberId || resolvedMemberId,
        employeeName: rawEmployeeName,
        projectId: data.projectId || '',
        projectName: data.projectName || 'BIM Project',
        date: data.date || new Date().toISOString().slice(0, 10),
        hoursLogged: Number(data.hoursLogged !== undefined ? data.hoursLogged : data.hours) || 0,
        discipline: (data.discipline as Discipline) || 'BIM - ACS',
        activityType: (data.activityType as ActivityType) || '3D Detailed Modeling',
        taskName: data.taskName || 'BIM Modeling Task',
        lodStage: (data.lodStage as LODLevel) || 'LOD 350',
        notes: data.notes || '',
        billable: data.billable !== undefined ? Boolean(data.billable) : true,
        timestamp: data.timestamp || resolvedCreatedAt,
        memberEmail: normalizedEmail,
        userEmail: normalizedEmail,
        userId: sanitizedUserId,
        isTestEntry: Boolean(data.isTestEntry ?? false),
        loggedBy: data.loggedBy || normalizedEmail || rawEmployeeName || '',
        createdAt: resolvedCreatedAt,
      });
    };

    const syncMerged = (fromCache: boolean) => {
      const combined = new Map<string, ResourceAllocationItem>();
      projectAssignmentsMap.forEach((v, k) => combined.set(k, v));
      assignedHoursMap.forEach((v, k) => {
        const existing = combined.get(k);
        if (!existing || !existing.updatedAt || (v.updatedAt && v.updatedAt >= existing.updatedAt)) {
          combined.set(k, v);
        }
      });
      const remoteAllocations = Array.from(combined.values());

      if (remoteAllocations.length > 0 || !fromCache) {
        setAllocations((prev) => {
          hasInitialSeededRef.current = true;
          const merged = mergeAllocationsWithLocal(remoteAllocations, prev);
          try {
            localStorage.setItem('bim_resource_allocations_v2', JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    };

    const syncMergedDailyLogs = () => {
      const combinedLogs = new Map<string, DailyWorkLog>();
      workLogsMap.forEach((v, k) => combinedLogs.set(k, v));
      dailyLogsMap.forEach((v, k) => combinedLogs.set(k, v));
      setRealtimeDailyLogs(Array.from(combinedLogs.values()));
    };

    try {
      unsubAssignedHours = onSnapshot(
        collection(db, 'assigned_hours'),
        (snapshot) => {
          assignedHoursMap.clear();
          snapshot.docs.forEach((docSnap) => {
            const parsed = parseSnapshotDoc(docSnap);
            if (!isRemovedMockMember(parsed)) {
              assignedHoursMap.set(docSnap.id, parsed);
            }
          });
          syncMerged(snapshot.metadata.fromCache);
        },
        (err) => {
          console.warn('Firestore assigned_hours listener notice:', err);
        }
      );

      unsubProjectAssignments = onSnapshot(
        collection(db, 'project_assignments'),
        (snapshot) => {
          projectAssignmentsMap.clear();
          snapshot.docs.forEach((docSnap) => {
            const parsed = parseSnapshotDoc(docSnap);
            if (!isRemovedMockMember(parsed)) {
              projectAssignmentsMap.set(docSnap.id, parsed);
            }
          });
          syncMerged(snapshot.metadata.fromCache);
        },
        (err) => {
          console.warn('Firestore project_assignments listener notice:', err);
        }
      );

      unsubDailyLogs = onSnapshot(
        collection(db, 'daily_logs'),
        (snapshot) => {
          dailyLogsMap.clear();
          snapshot.docs.forEach((docSnap) => {
            const parsed = parseDailyLogDoc(docSnap);
            if (!isRemovedMockMember(parsed)) {
              dailyLogsMap.set(docSnap.id, parsed);
            }
          });
          syncMergedDailyLogs();
        },
        (err) => {
          console.warn('Firestore daily_logs listener in AssignHoursSystem notice:', err);
        }
      );

      unsubWorkLogs = onSnapshot(
        collection(db, 'work_logs'),
        (snapshot) => {
          workLogsMap.clear();
          snapshot.docs.forEach((docSnap) => {
            const parsed = parseDailyLogDoc(docSnap);
            if (!isRemovedMockMember(parsed)) {
              workLogsMap.set(docSnap.id, parsed);
            }
          });
          syncMergedDailyLogs();
        },
        (err) => {
          console.warn('Firestore work_logs listener in AssignHoursSystem notice:', err);
        }
      );
    } catch (e) {
      console.warn('Firestore assigned_hours/daily_logs setup error:', e);
    }
    return () => {
      if (unsubAssignedHours) unsubAssignedHours();
      if (unsubProjectAssignments) unsubProjectAssignments();
      if (unsubDailyLogs) unsubDailyLogs();
      if (unsubWorkLogs) unsubWorkLogs();
    };
  }, [projects, employees]);

  // Sync allocations with context resourceAllocations, custom events, storage events, and BroadcastChannel
  useEffect(() => {
    if (Array.isArray(resourceAllocations) && resourceAllocations.length > 0) {
      setAllocations((prev) => mergeAllocationsWithLocal(resourceAllocations, prev));
    }
  }, [resourceAllocations]);

  useEffect(() => {
    let broadcastChannel: BroadcastChannel | undefined;
    const handleAllocUpdate = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        setAllocations((prev) => mergeAllocationsWithLocal(e.detail, prev));
      }
    };
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === 'bim_resource_allocations_v2' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setAllocations((prev) => mergeAllocationsWithLocal(parsed, prev));
          }
        } catch {}
      }
    };
    window.addEventListener('bim_resource_allocations_updated', handleAllocUpdate);
    window.addEventListener('storage', handleStorageEvent);
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        broadcastChannel = new BroadcastChannel('bim_resource_allocations_channel');
        broadcastChannel.onmessage = (event) => {
          if (event?.data && Array.isArray(event.data)) {
            setAllocations((prev) => mergeAllocationsWithLocal(event.data, prev));
          }
        };
      }
    } catch {}
    return () => {
      window.removeEventListener('bim_resource_allocations_updated', handleAllocUpdate);
      window.removeEventListener('storage', handleStorageEvent);
      if (broadcastChannel) {
        try {
          broadcastChannel.close();
        } catch {}
      }
    };
  }, [activeMembers, isSuperAdmin]);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('bim_resource_allocations_v2', JSON.stringify(allocations));
  }, [allocations]);

  // Synchronize any rows with missing or legacy member bindings to their active selected member
  useEffect(() => {
    if (!canManageAllocations || activeTeamMembers.length === 0 || allocations.length === 0) return;

    let hasChanges = false;
    const itemsToSync: ResourceAllocationItem[] = [];

    const normalizedList = allocations.map((alloc) => {
      const matchedProject = projects.find((p) => matchProjectId(p.id, alloc.projectId));
      const resolvedProjectId = matchedProject?.id || alloc.projectId;

      const rawRowMemberId = (alloc.memberId || alloc.employeeId || alloc.assignedTo || '').trim();
      const strippedRowMemberId = rawRowMemberId.replace(/^emp-/, '');
      const rawRowEmail = (alloc.assignedToEmail || alloc.memberEmail || '').trim().toLowerCase();
      const rawRowName = (
        alloc.assignedToName ||
        alloc.memberName ||
        alloc.employeeName ||
        ''
      )
        .trim()
        .toLowerCase();

      const normRowName = normalizePersonName(rawRowName);
      const normRowEmail = normalizePersonEmail(rawRowEmail);
      const matchedByName = normRowName
        ? activeTeamMembers.find((emp) => normalizePersonName(emp.name) === normRowName)
        : undefined;
      const matchedById =
        !matchedByName && rawRowMemberId
          ? activeTeamMembers.find((emp) => {
              if (normRowName && normalizePersonName(emp.name) !== normRowName) {
                return false;
              }
              return (
                emp.id === rawRowMemberId || emp.id.replace(/^emp-/, '') === strippedRowMemberId
              );
            })
          : undefined;
      const matchedByEmail =
        !matchedByName && !matchedById && normRowEmail
          ? activeTeamMembers.find((emp) => {
              if (normRowName && normalizePersonName(emp.name) !== normRowName) {
                return false;
              }
              return normalizePersonEmail(emp.email) === normRowEmail;
            })
          : undefined;

      const directRowMember = matchedByName || matchedById || matchedByEmail;
      // Only fall back to discipline assignment or first team member when the allocation has NO explicit employee name
      const selectedMember =
        directRowMember ||
        (!rawRowName
          ? activeTeamMembers.find(
              (emp) =>
                emp.id === disciplineAssignments[`${resolvedProjectId}__${alloc.discipline}`] ||
                emp.id === disciplineAssignments[alloc.discipline]
            ) || activeTeamMembers[0]
          : undefined);

      if (!selectedMember) return alloc;

      if (
        (!alloc.employeeId && selectedMember.id) ||
        (!alloc.employeeName && selectedMember.name)
      ) {
        hasChanges = true;
        const healed: ResourceAllocationItem = {
          ...alloc,
          assignedTo: alloc.assignedTo || selectedMember.id,
          employeeId: alloc.employeeId || selectedMember.id,
          memberId: alloc.memberId || selectedMember.id,
          assignedToName: alloc.assignedToName || selectedMember.name,
          memberName: alloc.memberName || selectedMember.name,
          employeeName: alloc.employeeName || selectedMember.name,
          employeeRole: alloc.employeeRole || selectedMember.role,
          memberEmail: alloc.memberEmail || selectedMember.email,
          assignedToEmail: alloc.assignedToEmail || selectedMember.email,
        };
        itemsToSync.push(healed);
        return healed;
      }
      return alloc;
    });

    if (hasChanges) {
      setAllocations(normalizedList);
      localStorage.setItem('bim_resource_allocations_v2', JSON.stringify(normalizedList));
      window.dispatchEvent(
        new CustomEvent('bim_resource_allocations_updated', { detail: normalizedList })
      );
    }
  }, [allocations, activeTeamMembers, canManageAllocations, disciplineAssignments, projects]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
  const [filterDiscipline, setFilterDiscipline] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewFrequency, setViewFrequency] = useState<'Daily' | 'Weekly'>('Weekly');

  // Date Range Calendar Filter State
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const datePickerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false);
      }
    };
    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDatePicker]);

  // Modal / Add Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [allocationToDelete, setAllocationToDelete] = useState<ResourceAllocationItem | null>(null);
  const [deleteSuccessNotice, setDeleteSuccessNotice] = useState<string | null>(null);

  // Form Inputs
  const [formProject, setFormProject] = useState(projects[0]?.id || 'p1');
  const [formEmployee, setFormEmployee] = useState(employees[0]?.id || 'emp-2');

  useEffect(() => {
    if (!editingId && projects.length > 0 && !projects.some((p) => p.id === formProject)) {
      setFormProject(projects[0].id);
    }
  }, [projects, formProject, editingId]);

  useEffect(() => {
    if (!editingId && activeTeamMembers.length > 0 && !activeTeamMembers.some((e) => e.id === formEmployee)) {
      setFormEmployee(activeTeamMembers[0].id);
    }
  }, [activeTeamMembers, formEmployee, editingId]);

  useEffect(() => {
    if (
      selectedEmployeeId !== 'all' &&
      !activeTeamMembers.some((e) => e.id === selectedEmployeeId)
    ) {
      setSelectedEmployeeId('all');
    }
  }, [activeTeamMembers, selectedEmployeeId]);

  const [formDiscipline, setFormDiscipline] = useState<ResourceAllocationItem['discipline']>('BIM - ACS');
  const [formLOD, setFormLOD] = useState<ResourceAllocationItem['lod']>('LOD 350');
  const [formPhase, setFormPhase] = useState<ResourceAllocationItem['projectPhase']>('Design Development');
  const [formTaskType, setFormTaskType] = useState<BimTaskType>('3D Modeling');
  const [formTargetZone, setFormTargetZone] = useState('MOD-AR-LVL01-ZONE-A');
  const [formHours, setFormHours] = useState<number>(20);
  const [formStartDate, setFormStartDate] = useState(() => getCurrentWeekRange().startIso);
  const [formDueDate, setFormDueDate] = useState(() => getCurrentWeekRange().endIso);
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Persist allocations to state, localStorage, BroadcastChannel, and Firestore assigned_hours & project_assignments
  const saveAllocations = (newAllocations: ResourceAllocationItem[], changedItem?: ResourceAllocationItem) => {
    const cleanAllocations = newAllocations.filter(isLiveActiveMember);
    setAllocations(cleanAllocations);
    try {
      localStorage.setItem('bim_resource_allocations_v2', JSON.stringify(cleanAllocations));
    } catch {}
    window.dispatchEvent(new CustomEvent('bim_resource_allocations_updated', { detail: cleanAllocations }));
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('bim_resource_allocations_channel');
        bc.postMessage(cleanAllocations);
        bc.close();
      }
    } catch {}
    if (changedItem) {
      try {
        const resolvedName =
          changedItem.assignedToName || changedItem.memberName || changedItem.employeeName || '';
        const resolvedEmail = changedItem.assignedToEmail || changedItem.memberEmail || '';
        const resolvedMemberId = changedItem.memberId || changedItem.employeeId;
        const sanitized = {
          ...JSON.parse(JSON.stringify(changedItem)),
          assignedTo: resolvedMemberId,
          memberId: resolvedMemberId,
          employeeId: resolvedMemberId,
          assignedToName: resolvedName,
          memberName: resolvedName,
          employeeName: resolvedName,
          memberEmail: resolvedEmail,
          assignedToEmail: resolvedEmail,
          discipline: normalizeAllocationDiscipline(changedItem.discipline || 'BIM - ACS'),
          lod: changedItem.lod || 'LOD 350',
          projectPhase: changedItem.projectPhase || 'Design Development',
          taskType: changedItem.taskType || '3D Modeling',
          targetElementOrZone: changedItem.targetElementOrZone || 'MOD-AR-LVL01-ZONE-A',
          updatedAt: changedItem.updatedAt || new Date().toISOString(),
        };
        const assignedHoursRef = doc(db, 'assigned_hours', changedItem.id);
        setDoc(assignedHoursRef, sanitized, { merge: true }).catch((err) =>
          console.warn('Firestore saveAllocation assigned_hours sync notice:', err)
        );
        const targetRef = doc(db, 'project_assignments', changedItem.id);
        setDoc(targetRef, sanitized, { merge: true }).catch((err) =>
          console.warn('Firestore saveAllocation project_assignments sync notice:', err)
        );
      } catch (e) {
        console.warn('Firestore saveAllocation error:', e);
      }
    }
  };

  // Handle team member selection for a discipline or allocation row and persist via updateDoc in try/catch
  const handleMemberSelect = async (
    disciplineKey: string,
    memberId: string,
    allocationId?: string
  ) => {
    const emp =
      activeTeamMembers.find(
        (e) => e.id === memberId || e.id.replace(/^emp-/, '') === memberId.replace(/^emp-/, '')
      ) ||
      employees.find(
        (e) => e.id === memberId || e.id.replace(/^emp-/, '') === memberId.replace(/^emp-/, '')
      );
    const resolvedDiscipline = normalizeAllocationDiscipline(
      emp?.discipline ||
      emp?.primaryDiscipline ||
      disciplineKey ||
      'BIM - ACS'
    );

    if (!allocationId) {
      setFormEmployee(memberId);
      if (emp?.discipline || emp?.primaryDiscipline) {
        setFormDiscipline(resolvedDiscipline);
      }
      try {
        await syncDisciplineMemberToFirestore(resolvedDiscipline, memberId, formProject);
      } catch (err) {
        console.warn('Firestore modal member select sync notice:', err);
      }
      return;
    }

    const nowIso = new Date().toISOString();
    const resolvedId = emp?.id || memberId;
    const resolvedName = emp?.name || '';
    const resolvedRole = emp?.role || 'Editor';
    const resolvedEmail = emp?.email || '';

    let updatedTarget: ResourceAllocationItem | undefined;
    const updatedList = allocations.map((item) => {
      if (item.id === allocationId) {
        const finalName = resolvedName || item.assignedToName || item.employeeName;
        const finalEmail = resolvedEmail || item.assignedToEmail || item.memberEmail;
        updatedTarget = {
          ...item,
          assignedTo: resolvedId,
          employeeId: resolvedId,
          memberId: resolvedId,
          assignedToName: finalName,
          memberName: finalName,
          employeeName: finalName,
          employeeRole: resolvedRole || item.employeeRole,
          memberEmail: finalEmail,
          assignedToEmail: finalEmail,
          discipline: resolvedDiscipline,
          updatedAt: nowIso,
        };
        return updatedTarget;
      }
      return item;
    });

    setAllocations(updatedList);
    localStorage.setItem('bim_resource_allocations_v2', JSON.stringify(updatedList));
    window.dispatchEvent(new CustomEvent('bim_resource_allocations_updated', { detail: updatedList }));

    try {
      const assignRef = doc(db, 'project_assignments', allocationId);
      const assignedHoursRef = doc(db, 'assigned_hours', allocationId);
      const finalName = resolvedName || updatedTarget?.assignedToName || updatedTarget?.employeeName || '';
      const finalEmail = resolvedEmail || updatedTarget?.assignedToEmail || updatedTarget?.memberEmail || '';
      const updatePayload = {
        assignedTo: resolvedId,
        employeeId: resolvedId,
        memberId: resolvedId,
        assignedToName: finalName,
        memberName: finalName,
        employeeName: finalName,
        employeeRole: resolvedRole || updatedTarget?.employeeRole || 'Editor',
        memberEmail: finalEmail,
        assignedToEmail: finalEmail,
        discipline: resolvedDiscipline,
        updatedAt: nowIso,
      };
      await Promise.all([
        updateDoc(assignedHoursRef, updatePayload).catch(() =>
          setDoc(assignedHoursRef, { ...(updatedTarget || {}), ...updatePayload }, { merge: true })
        ),
        updateDoc(assignRef, updatePayload).catch(() =>
          setDoc(assignRef, { ...(updatedTarget || {}), ...updatePayload }, { merge: true })
        ),
      ]);
      await syncDisciplineMemberToFirestore(
        resolvedDiscipline,
        resolvedId,
        updatedTarget?.projectId
      );
    } catch (err) {
      console.warn('Firestore handleMemberSelect updateDoc notice:', err);
    }
  };

  const isFullAccessRole = useMemo(() => {
    if (isSuperAdmin) return true;
    const role = (currentUser?.role || '').toUpperCase();
    const appRole = (currentUser?.appRole || '').toUpperCase();
    const accessLevel = (currentUser?.accessLevel || '').toUpperCase();
    const securityRole = (currentUser?.securityRole || '').toUpperCase();
    return (
      role === 'SUPER_ADMIN' ||
      role === 'DIRECTOR' ||
      role === 'SUPER ADMIN' ||
      appRole === 'SUPER_ADMIN' ||
      appRole === 'DIRECTOR' ||
      accessLevel === 'SUPER ADMIN' ||
      accessLevel === 'DIRECTOR' ||
      securityRole === 'SUPER ADMIN' ||
      securityRole === 'DIRECTOR'
    );
  }, [currentUser, isSuperAdmin]);

  const hasAssignedHoursAccess = useMemo(() => {
    if (isSuperAdmin || isFullAccessRole) return true;
    const authorizedRoles = [
      'MANAGER',
      'PROJECT_MANAGER',
      'PROJECT MANAGER',
      'DIRECTOR',
      'SUPER_ADMIN',
      'SUPER ADMIN',
    ];
    const role = (currentUser?.role || '').trim().toUpperCase();
    const appRole = (currentUser?.appRole || '').trim().toUpperCase();
    const accessLevel = (currentUser?.accessLevel || '').trim().toUpperCase();
    const securityRole = (currentUser?.securityRole || '').trim().toUpperCase();
    return (
      authorizedRoles.includes(role) ||
      authorizedRoles.includes(appRole) ||
      authorizedRoles.includes(accessLevel) ||
      authorizedRoles.includes(securityRole)
    );
  }, [currentUser, isSuperAdmin, isFullAccessRole]);

  const isViewer = useMemo(() => {
    if (isSuperAdmin || isFullAccessRole) return false;
    if (!currentUser) return false;
    const role = (currentUser.role || '').toUpperCase();
    const appRole = (currentUser.appRole || '').toUpperCase();
    const accessLevel = (currentUser.accessLevel || '').toUpperCase();
    const securityRole = (currentUser.securityRole || '').toUpperCase();
    return (
      role === 'VIEWER' ||
      role === 'VIEWER' ||
      appRole === 'VIEWER' ||
      accessLevel === 'VIEWER' ||
      securityRole === 'VIEWER'
    );
  }, [currentUser, isSuperAdmin, isFullAccessRole]);

  const viewerMatchedEmployees = useMemo(() => {
    if (!currentUser) return [];
    const userId = (currentUser.id || '').trim();
    const userIdStripped = userId.replace(/^emp-/, '');
    const userEmail = normalizePersonEmail(currentUser.email);
    const userName = normalizePersonName(currentUser.name);
    const detEmailId = userEmail ? generateRequestDocId(userEmail) : '';

    const combinedPool = [...activeTeamMembers, ...employees];
    return combinedPool.filter((e) => {
      const empId = (e.id || '').trim();
      const empIdStripped = empId.replace(/^emp-/, '');
      const empEmail = normalizePersonEmail(e.email);
      const empName = normalizePersonName(e.name);
      return (
        (userId && (empId === userId || empIdStripped === userIdStripped)) ||
        (detEmailId && (empId === detEmailId || empIdStripped === detEmailId)) ||
        (userEmail && empEmail && empEmail === userEmail) ||
        (userName && empName && empName === userName)
      );
    });
  }, [currentUser, activeTeamMembers, employees]);

  const viewerMatchedEmployee = useMemo(
    () => viewerMatchedEmployees[0],
    [viewerMatchedEmployees]
  );

  const visibleAssignments = useMemo(() => {
    const allAssignments = allocations.filter(isLiveActiveMember);
    // For SUPER_ADMIN / DIRECTOR: full access to view, manage, and filter all organizational work allocations
    if (
      isFullAccessRole ||
      currentUser?.role === 'SUPER_ADMIN' ||
      currentUser?.role === 'DIRECTOR'
    ) {
      return allAssignments;
    }
    if (!currentUser) return [];

    // For VIEWER (and non-admin team members): strictly filter by the logged-in user's identifiers
    const userId = (currentUser.id || '').trim();
    const userIdStripped = userId.replace(/^emp-/, '');
    const userGoogleId = String((currentUser as any).googleId || (currentUser as any).uid || '').trim();
    const userEmail = normalizePersonEmail(currentUser.email);
    const userName = normalizePersonName(currentUser.name);
    const detEmailId = userEmail ? generateRequestDocId(userEmail) : '';

    const allowedIds = new Set<string>();
    if (userId) {
      allowedIds.add(userId);
      allowedIds.add(userIdStripped);
    }
    if (userGoogleId) {
      allowedIds.add(userGoogleId);
      allowedIds.add(userGoogleId.replace(/^emp-/, ''));
    }
    if (detEmailId) {
      allowedIds.add(detEmailId);
      allowedIds.add(`emp-${detEmailId}`);
    }
    const allowedEmails = new Set<string>();
    if (userEmail) allowedEmails.add(userEmail);

    const allowedNames = new Set<string>();
    if (userName) allowedNames.add(userName);

    viewerMatchedEmployees.forEach((emp) => {
      const empId = (emp.id || '').trim();
      if (empId) {
        allowedIds.add(empId);
        allowedIds.add(empId.replace(/^emp-/, ''));
      }
      const empGoogleId = String((emp as any).googleId || (emp as any).uid || '').trim();
      if (empGoogleId) {
        allowedIds.add(empGoogleId);
        allowedIds.add(empGoogleId.replace(/^emp-/, ''));
      }
      const empEmail = normalizePersonEmail(emp.email);
      if (empEmail) {
        allowedEmails.add(empEmail);
        const empDetId = generateRequestDocId(empEmail);
        allowedIds.add(empDetId);
        allowedIds.add(`emp-${empDetId}`);
      }
      const empName = normalizePersonName(emp.name);
      if (empName) allowedNames.add(empName);
    });

    return allAssignments.filter((item) => {
      const rawItem = item as any;
      const candidateIds = [
        item.employeeId,
        item.memberId,
        rawItem.assignedTo,
        rawItem.userId,
      ]
        .map((v) => String(v || '').trim())
        .filter(Boolean);

      for (const cid of candidateIds) {
        const stripped = cid.replace(/^emp-/, '');
        if (allowedIds.has(cid) || (stripped && allowedIds.has(stripped))) {
          return true;
        }
      }

      const itemEmail = normalizePersonEmail(
        item.memberEmail || rawItem.assignedToEmail || rawItem.userEmail
      );
      if (itemEmail && allowedEmails.has(itemEmail)) {
        return true;
      }

      const itemName = normalizePersonName(
        item.employeeName || rawItem.memberName || rawItem.assignedToName
      );
      if (itemName && allowedNames.has(itemName)) {
        return true;
      }

      return false;
    });
  }, [allocations, currentUser, isFullAccessRole, viewerMatchedEmployees]);

  // All allocations synced from Firestore assigned_hours & project_assignments
  const liveActiveAllocations = useMemo(() => {
    return visibleAssignments;
  }, [visibleAssignments]);

  // Helper to get total weekly hours assigned to an employee
  const getEmployeeWeeklyHours = useMemo(() => {
    const map: Record<string, number> = {};
    liveActiveAllocations.forEach((alloc) => {
      if (alloc.status !== 'Completed') {
        map[alloc.employeeId] = (map[alloc.employeeId] || 0) + Number(alloc.assignedHours || 0);
      }
    });
    return map;
  }, [liveActiveAllocations]);

  // Cross-Collection Data Aggregation helper:
  // Fetches and aggregates all daily log entries submitted by the assigned team member
  // for that specific project during the filtered window or task timeline window.
  const getLoggedHoursForAssignment = React.useCallback(
    (
      assignment: ResourceAllocationItem,
      filterStart: string = filterStartDate,
      filterEnd: string = filterEndDate
    ): number => {
      if (!assignment) return 0;
      const rawAlloc = assignment as any;

      // 1. Resolve Assigned Team Member Identifiers
      const assignmentMemberId = (assignment.memberId || rawAlloc.memberId || assignment.employeeId || rawAlloc.assignedTo || '').trim();
      const assignmentEmpId = (assignment.employeeId || assignmentMemberId).trim();
      const assignmentIdStripped = assignmentMemberId.replace(/^emp-/, '');
      const assignmentEmpIdStripped = assignmentEmpId.replace(/^emp-/, '');

      const matchedEmp = employees.find(
        (e) =>
          (assignmentMemberId && (e.id === assignmentMemberId || e.id.replace(/^emp-/, '') === assignmentIdStripped)) ||
          (assignmentEmpId && (e.id === assignmentEmpId || e.id.replace(/^emp-/, '') === assignmentEmpIdStripped)) ||
          (assignment.memberEmail && normalizePersonEmail(e.email) === normalizePersonEmail(assignment.memberEmail)) ||
          (assignment.employeeName && normalizePersonName(e.name) === normalizePersonName(assignment.employeeName))
      );

      const targetEmail = normalizePersonEmail(
        assignment.memberEmail ||
        rawAlloc.assignedToEmail ||
        matchedEmp?.email ||
        ''
      );
      const detEmailId = targetEmail ? generateRequestDocId(targetEmail) : '';
      const targetName = (assignment.employeeName || matchedEmp?.name || '').trim().toLowerCase();
      const normTargetName = normalizePersonName(targetName);

      // 2. Resolve Project Identifiers
      const matchedProj = projects.find((p) => matchProjectId(p.id, assignment.projectId));
      const targetProjId = assignment.projectId || matchedProj?.id || '';
      const targetProjNameClean = cleanProjectName(matchedProj?.name || assignment.projectName || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      // 3. Resolve Timeline Window Bounds for this assignment
      const rawStart =
        assignment.startDate ||
        rawAlloc.start ||
        rawAlloc.timelineStart ||
        rawAlloc.targetStartDate ||
        rawAlloc.targetDate ||
        rawAlloc.date;
      const rawDue =
        assignment.dueDate ||
        rawAlloc.due ||
        rawAlloc.endDate ||
        rawAlloc.end ||
        rawAlloc.timelineEnd ||
        rawAlloc.targetCompletionDate ||
        rawAlloc.targetDate ||
        rawAlloc.date;
      let taskStart = normalizeDateToIso(rawStart);
      let taskDue = normalizeDateToIso(rawDue);
      if (taskStart && taskDue && taskStart > taskDue) {
        const tmp = taskStart;
        taskStart = taskDue;
        taskDue = tmp;
      }

      let fStart = filterStart ? normalizeDateToIso(filterStart) : '';
      let fEnd = filterEnd ? normalizeDateToIso(filterEnd) : '';
      if (fStart && fEnd && fStart > fEnd) {
        const tmp = fStart;
        fStart = fEnd;
        fEnd = tmp;
      }

      const matchingLogs = activeWorkLogs.filter((log) => {
        // A. Project Match: project ID, normalized ID, or clean project name
        const logProjId = log.projectId || '';
        const sameProjId =
          logProjId === targetProjId ||
          logProjId === assignment.projectId ||
          matchProjectId(logProjId, targetProjId) ||
          matchProjectId(logProjId, assignment.projectId);

        const logProjNameClean = cleanProjectName(log.projectName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const sameProjName =
          Boolean(targetProjNameClean) &&
          targetProjNameClean !== 'unassignedproject' &&
          targetProjNameClean !== 'bimproject' &&
          (logProjNameClean === targetProjNameClean ||
            (targetProjNameClean.length > 4 && logProjNameClean.includes(targetProjNameClean)) ||
            (logProjNameClean.length > 4 && targetProjNameClean.includes(logProjNameClean)));

        if (!sameProjId && !sameProjName) return false;

        // B. Team Member Match
        const logEmpId = (log.employeeId || '').trim();
        const logMemberId = ((log as any).memberId || log.userId || '').trim();
        const logEmpIdStripped = logEmpId.replace(/^emp-/, '');
        const logMemberIdStripped = logMemberId.replace(/^emp-/, '');

        const directMemberMatch =
          Boolean(assignmentMemberId) &&
          (logEmpId === assignmentMemberId ||
            logEmpId === assignmentEmpId ||
            logMemberId === assignmentMemberId ||
            logMemberId === assignmentEmpId);

        const strippedIdMatch =
          (Boolean(assignmentIdStripped) &&
            (logEmpIdStripped === assignmentIdStripped ||
              logMemberIdStripped === assignmentIdStripped)) ||
          (Boolean(assignmentEmpIdStripped) &&
            (logEmpIdStripped === assignmentEmpIdStripped ||
              logMemberIdStripped === assignmentEmpIdStripped)) ||
          (Boolean(detEmailId) &&
            (logEmpIdStripped === detEmailId || logMemberIdStripped === detEmailId)) ||
          (Boolean(matchedEmp?.id) &&
            (logEmpId === matchedEmp.id ||
              logEmpIdStripped === matchedEmp.id.replace(/^emp-/, '')));

        const logEmail = normalizePersonEmail(log.memberEmail || (log as any).userEmail || '');
        const emailMatch = Boolean(targetEmail) && Boolean(logEmail) && logEmail === targetEmail;

        const logName = (log.employeeName || '').trim().toLowerCase();
        const normLogName = normalizePersonName(logName);
        const nameMatch =
          Boolean(targetName) &&
          Boolean(logName) &&
          (logName === targetName ||
            normLogName === normTargetName ||
            (normTargetName.length > 4 && normLogName.includes(normTargetName)) ||
            (normLogName.length > 4 && normTargetName.includes(normLogName)));

        const memberMatched = directMemberMatch || strippedIdMatch || emailMatch || nameMatch;
        if (!memberMatched) return false;

        // C. Date Window Match
        const rawLogDate = log.date || (log as any).workDate || (log as any).entryDate || log.timestamp || (log as any).createdAt;
        const logDateIso = normalizeDateToIso(rawLogDate);
        if (!logDateIso) return false;

        // If a calendar date filter is active, evaluate within the filtered window
        if (fStart || fEnd) {
          if (fStart && logDateIso < fStart) return false;
          if (fEnd && logDateIso > fEnd) return false;
        } else if (taskStart || taskDue) {
          // If no top calendar filter is active, evaluate within the task's timeline
          if (taskStart && logDateIso < taskStart) return false;
          if (taskDue && logDateIso > taskDue) return false;
        }

        return true;
      });

      if (matchingLogs.length === 0) {
        return 0;
      }

      const operationalLogs = matchingLogs.filter((l) => !l.isTestEntry);
      const targetList = operationalLogs.length > 0 ? operationalLogs : matchingLogs;
      const totalHours = targetList.reduce(
        (sum, w) => sum + (Number(w.hoursLogged !== undefined ? w.hoursLogged : (w as any).hours) || 0),
        0
      );
      return Number(totalHours.toFixed(1));
    },
    [activeWorkLogs, employees, projects, filterStartDate, filterEndDate]
  );

  // Helper to determine if a task's timeline overlaps with the calendar date filter range
  // Formula: IsVisible = (task.startDate <= filterEnd) AND (task.dueDate >= filterStart)
  const doesTaskTimelineOverlapFilter = React.useCallback(
    (task: ResourceAllocationItem, filterStart: string, filterEnd: string): boolean => {
      if (!filterStart && !filterEnd) return true;

      const rawFStartUtc = filterStart ? toUtcMidnightTimestamp(filterStart) : null;
      const rawFEndUtc = filterEnd ? toUtcMidnightTimestamp(filterEnd) : null;

      let fStartUtc = rawFStartUtc;
      let fEndUtc = rawFEndUtc;

      // Handle inverted date range bounds gracefully (e.g. user selected filterStart > filterEnd)
      if (fStartUtc !== null && fEndUtc !== null && fStartUtc > fEndUtc) {
        const tmp = fStartUtc;
        fStartUtc = fEndUtc;
        fEndUtc = tmp;
      }

      if (fStartUtc === null && fEndUtc === null) return true;

      // Extract task dates across possible field variants and fallbacks
      const rawStart =
        task.startDate ||
        (task as any).start ||
        (task as any).timelineStart ||
        (task as any).targetStartDate ||
        (task as any).targetDate ||
        (task as any).date;

      const rawDue =
        task.dueDate ||
        (task as any).due ||
        (task as any).endDate ||
        (task as any).end ||
        (task as any).timelineEnd ||
        (task as any).targetCompletionDate ||
        (task as any).targetDate ||
        (task as any).date;

      let taskStartUtc = rawStart ? toUtcMidnightTimestamp(rawStart) : null;
      let taskDueUtc = rawDue ? toUtcMidnightTimestamp(rawDue) : null;

      // Check task timeline string (e.g. "2026-10-26 → 2026-11-01" or "2026-10-26 - 2026-11-01")
      if ((taskStartUtc === null || taskDueUtc === null) && typeof (task as any).timeline === 'string') {
        const parts = (task as any).timeline.split(/→|至|to|[-–—]/i).map((s: string) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          if (taskStartUtc === null) taskStartUtc = toUtcMidnightTimestamp(parts[0]);
          if (taskDueUtc === null) taskDueUtc = toUtcMidnightTimestamp(parts[1]);
        } else if (parts.length === 1) {
          if (taskStartUtc === null) taskStartUtc = toUtcMidnightTimestamp(parts[0]);
          if (taskDueUtc === null) taskDueUtc = toUtcMidnightTimestamp(parts[0]);
        }
      }

      // If one date boundary is present, use it for both (single-day schedule point)
      if (taskStartUtc === null && taskDueUtc !== null) taskStartUtc = taskDueUtc;
      if (taskDueUtc === null && taskStartUtc !== null) taskDueUtc = taskStartUtc;

      // Ensure task start is not after task due
      if (taskStartUtc !== null && taskDueUtc !== null && taskStartUtc > taskDueUtc) {
        const tmp = taskStartUtc;
        taskStartUtc = taskDueUtc;
        taskDueUtc = tmp;
      }

      // If task has no discernible dates at all, keep it visible
      if (taskStartUtc === null && taskDueUtc === null) return true;

      // Robust Date-Range Overlap Evaluation:
      // IsVisible = (task.startDate <= filterEnd) AND (task.dueDate >= filterStart)
      if (fStartUtc !== null && fEndUtc !== null) {
        return (
          (taskStartUtc !== null ? taskStartUtc <= fEndUtc : true) &&
          (taskDueUtc !== null ? taskDueUtc >= fStartUtc : true)
        );
      } else if (fStartUtc !== null) {
        return taskDueUtc !== null ? taskDueUtc >= fStartUtc : true;
      } else if (fEndUtc !== null) {
        return taskStartUtc !== null ? taskStartUtc <= fEndUtc : true;
      }

      return true;
    },
    []
  );

  // Helper to match an allocation against a selected employee ID across duplicate Firestore user IDs, emails, and names
  const doesAllocationMatchEmployee = React.useCallback(
    (alloc: ResourceAllocationItem, targetEmpId: string): boolean => {
      if (!targetEmpId || targetEmpId === 'all') return true;
      const rawAlloc = alloc as any;
      const allocEmpId = (alloc.employeeId || alloc.memberId || rawAlloc.assignedTo || '').trim();
      const allocStripped = allocEmpId.replace(/^emp-/, '');
      const targetStripped = targetEmpId.replace(/^emp-/, '');
      if (allocEmpId === targetEmpId || (allocStripped && allocStripped === targetStripped)) {
        return true;
      }
      const targetEmp =
        activeTeamMembers.find(
          (e) => e.id === targetEmpId || e.id.replace(/^emp-/, '') === targetStripped
        ) ||
        employees.find(
          (e) => e.id === targetEmpId || e.id.replace(/^emp-/, '') === targetStripped
        );
      if (targetEmp) {
        const targetEmail = normalizePersonEmail(targetEmp.email);
        const allocEmail = normalizePersonEmail(alloc.memberEmail || rawAlloc.assignedToEmail);
        if (targetEmail && allocEmail && targetEmail === allocEmail) return true;

        const targetName = normalizePersonName(targetEmp.name);
        const allocName = normalizePersonName(
          alloc.employeeName || rawAlloc.memberName || rawAlloc.assignedToName
        );
        if (targetName && allocName && targetName === allocName) return true;
      }
      return false;
    },
    [activeTeamMembers, employees]
  );

  // Overall Workspace Metrics & Efficiency Dashboard based on table parameters and date range
  const workspaceMetrics = useMemo(() => {
    let budgetHours = 0;
    if (selectedProjectId === 'all') {
      if (selectedEmployeeId !== 'all') {
        const emp = employees.find((e) => e.id === selectedEmployeeId);
        budgetHours = emp?.weeklyCapacityHours || 40;
      } else {
        budgetHours = projects.reduce((sum, p) => sum + (p.totalEstimatedHours || 0), 0);
      }
    } else {
      const proj = projects.find((p) => matchProjectId(p.id, selectedProjectId));
      budgetHours = proj?.totalEstimatedHours || 0;
    }

    const relevantAllocations = selectedProjectId === 'all'
      ? liveActiveAllocations
      : liveActiveAllocations.filter((a) => matchProjectId(a.projectId, selectedProjectId));

    const filteredByEmployee = !isFullAccessRole || selectedEmployeeId === 'all'
      ? relevantAllocations
      : relevantAllocations.filter((a) => doesAllocationMatchEmployee(a, selectedEmployeeId));

    // Apply date range filter to metrics calculations using overlap rule: (task.startDate <= filterEnd) AND (task.dueDate >= filterStart)
    const filteredForMetrics = filteredByEmployee.filter((a) =>
      doesTaskTimelineOverlapFilter(a, filterStartDate, filterEndDate)
    );

    const allocatedHours = filteredForMetrics.reduce((sum, a) => sum + (Number(a.assignedHours) || 0), 0);

    // Dynamically aggregate total logged hours across daily_logs for all matching assignments
    const loggedHours = filteredForMetrics.reduce(
      (sum, alloc) => sum + getLoggedHoursForAssignment(alloc, filterStartDate, filterEndDate),
      0
    );

    // Dynamic Available Remaining Hours: Assigned Hours - Logged Hours
    const remainingHours = Number((allocatedHours - loggedHours).toFixed(1));
    const utilizationPct = budgetHours > 0 ? Math.round((allocatedHours / budgetHours) * 100) : 0;

    // Efficiency & Status Metrics
    const completedTasks = filteredForMetrics.filter((a) => a.status === 'Completed');
    const completedHours = completedTasks.reduce((sum, a) => sum + (Number(a.assignedHours) || 0), 0);
    const inProgressTasks = filteredForMetrics.filter((a) => a.status === 'In Progress');
    const inProgressHours = inProgressTasks.reduce((sum, a) => sum + (Number(a.assignedHours) || 0), 0);
    const criticalTasks = filteredForMetrics.filter((a) => a.priority === 'Critical' || a.priority === 'High');
    const delayedTasks = filteredForMetrics.filter((a) => a.status === 'Delayed');

    const completionRate = allocatedHours > 0 ? Math.round((completedHours / allocatedHours) * 100) : 0;

    // Discipline breakdown
    const disciplineBreakdown: Record<string, number> = {
      Architectural: 0,
      Structural: 0,
      'BIM - MEP': 0,
      MEP: 0,
      Infrastructure: 0,
      'Coordination & QA': 0,
      'AI & Automation': 0,
      Estimation: 0
    };

    filteredForMetrics.forEach((a) => {
      const normDisc = normalizeAllocationDiscipline(a.discipline);
      if (disciplineBreakdown[normDisc] !== undefined) {
        disciplineBreakdown[normDisc] += Number(a.assignedHours || 0);
      }
    });

    // Priority breakdown
    const priorityBreakdown = {
      Critical: filteredForMetrics.filter(a => a.priority === 'Critical').length,
      High: filteredForMetrics.filter(a => a.priority === 'High').length,
      Medium: filteredForMetrics.filter(a => a.priority === 'Medium').length,
      Low: filteredForMetrics.filter(a => a.priority === 'Low').length,
    };

    // Overallocated staff count
    const overallocatedStaff = Object.entries(getEmployeeWeeklyHours).filter(([_, hrs]) => Number(hrs) > 40).length;

    return {
      budgetHours,
      allocatedHours,
      loggedHours,
      remainingHours,
      utilizationPct,
      disciplineBreakdown,
      overallocatedStaff,
      completedHours,
      inProgressHours,
      completedCount: completedTasks.length,
      inProgressCount: inProgressTasks.length,
      delayedCount: delayedTasks.length,
      criticalCount: criticalTasks.length,
      completionRate,
      priorityBreakdown
    };
  }, [projects, employees, liveActiveAllocations, activeWorkLogs, selectedProjectId, selectedEmployeeId, getEmployeeWeeklyHours, getLoggedHoursForAssignment, isFullAccessRole, filterStartDate, filterEndDate, doesTaskTimelineOverlapFilter, doesAllocationMatchEmployee]);

  // Filtered Allocations based on Dropdowns (Project + Team Member + Date Range) and Search
  const filteredAllocations = useMemo(() => {
    return visibleAssignments.filter((a) => {
      const matchesProj = selectedProjectId === 'all' || matchProjectId(a.projectId, selectedProjectId);
      const matchesEmp = !isFullAccessRole || selectedEmployeeId === 'all' || doesAllocationMatchEmployee(a, selectedEmployeeId);
      const matchesDisc =
        filterDiscipline === 'all' ||
        normalizeAllocationDiscipline(a.discipline) === normalizeAllocationDiscipline(filterDiscipline);
      const matchesStatus = filterStatus === 'all' || a.status === filterStatus;
      const matchesPriority = filterPriority === 'all' || a.priority === filterPriority;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (a.projectName || '').toLowerCase().includes(q) ||
        (a.employeeName || '').toLowerCase().includes(q) ||
        (a.employeeRole || '').toLowerCase().includes(q) ||
        (a.discipline || '').toLowerCase().includes(q) ||
        (a.status || '').toLowerCase().includes(q) ||
        (a.priority || '').toLowerCase().includes(q);

      // Date Range Filter check against allocation timeline using overlap rule:
      // Render a task if (task.startDate <= filterEnd) AND (task.dueDate >= filterStart)
      const matchesDateRange = doesTaskTimelineOverlapFilter(a, filterStartDate, filterEndDate);

      return matchesProj && matchesEmp && matchesDisc && matchesStatus && matchesPriority && matchesSearch && matchesDateRange;
    });
  }, [visibleAssignments, isFullAccessRole, selectedProjectId, selectedEmployeeId, filterDiscipline, filterStatus, filterPriority, searchQuery, filterStartDate, filterEndDate, doesTaskTimelineOverlapFilter, doesAllocationMatchEmployee]);

  // Open Modal in Create Mode
  const handleOpenCreateModal = () => {
    if (!canManageAllocations) return;
    setEditingId(null);
    setFormError(null);
    setFormProject(projects[0]?.id || 'p1');
    setFormEmployee(activeTeamMembers[0]?.id || employees[0]?.id || 'emp-2');
    setFormDiscipline('BIM - ACS');
    setFormLOD('LOD 350');
    setFormPhase('Design Development');
    setFormTaskType('3D Modeling');
    setFormTargetZone('MOD-AR-LVL01-ZONE-A');
    setFormHours(20);
    setFormStartDate(getCurrentWeekRange().startIso);
    setFormDueDate(getCurrentWeekRange().endIso);
    setFormNotes('');
    setShowAddModal(true);
  };

  // Open Modal in Edit Mode pre-populated with row details
  const handleOpenEditModal = (
    targetAlloc: ResourceAllocationItem,
    resolvedProjId?: string,
    resolvedEmpId?: string
  ) => {
    if (!canManageAllocations) return;
    setEditingId(targetAlloc.id);
    setFormError(null);

    const matchedProj = projects.find(
      (p) =>
        p.id === (resolvedProjId || targetAlloc.projectId) ||
        matchProjectId(p.id, resolvedProjId || targetAlloc.projectId)
    );
    setFormProject(matchedProj?.id || resolvedProjId || targetAlloc.projectId || projects[0]?.id || 'p1');

    const rawEmpId = (
      resolvedEmpId ||
      targetAlloc.employeeId ||
      targetAlloc.memberId ||
      (targetAlloc as any).assignedTo ||
      ''
    ).trim();
    const strippedEmpId = rawEmpId.replace(/^emp-/, '');
    const matchedMember =
      activeTeamMembers.find(
        (m) =>
          (rawEmpId && (m.id === rawEmpId || m.id.replace(/^emp-/, '') === strippedEmpId)) ||
          (targetAlloc.memberEmail &&
            normalizePersonEmail(m.email) === normalizePersonEmail(targetAlloc.memberEmail)) ||
          (targetAlloc.employeeName &&
            normalizePersonName(m.name) === normalizePersonName(targetAlloc.employeeName))
      ) ||
      employees.find(
        (m) =>
          (rawEmpId && (m.id === rawEmpId || m.id.replace(/^emp-/, '') === strippedEmpId)) ||
          (targetAlloc.memberEmail &&
            normalizePersonEmail(m.email) === normalizePersonEmail(targetAlloc.memberEmail)) ||
          (targetAlloc.employeeName &&
            normalizePersonName(m.name) === normalizePersonName(targetAlloc.employeeName))
      );

    setFormEmployee(matchedMember?.id || rawEmpId || activeTeamMembers[0]?.id || '');
    setFormDiscipline(normalizeAllocationDiscipline(targetAlloc.discipline || 'BIM - ACS'));
    setFormLOD((targetAlloc.lod || 'LOD 350') as ResourceAllocationItem['lod']);
    setFormPhase(
      (targetAlloc.projectPhase || 'Design Development') as ResourceAllocationItem['projectPhase']
    );
    setFormTaskType(((targetAlloc.taskType as BimTaskType) || '3D Modeling') as BimTaskType);
    setFormTargetZone(targetAlloc.targetElementOrZone || 'MOD-AR-LVL01-ZONE-A');
    setFormHours(Number(targetAlloc.assignedHours) || 0);
    setFormStartDate(
      normalizeDateToIso(targetAlloc.startDate) || getCurrentWeekRange().startIso
    );
    setFormDueDate(
      normalizeDateToIso(targetAlloc.dueDate) || getCurrentWeekRange().endIso
    );
    setFormNotes(targetAlloc.notes || '');
    setShowAddModal(true);
  };

  // Handle Form Submission (Create or Update Allocation)
  const handleAddAllocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageAllocations) return;
    setFormError(null);

    // Validation Guards
    if (formHours <= 0) {
      setFormError('Assigned hours must be greater than 0.');
      return;
    }
    if (new Date(formDueDate) < new Date(formStartDate)) {
      setFormError('Due date cannot be earlier than start date.');
      return;
    }

    const existingItem = editingId ? allocations.find((a) => a.id === editingId) : undefined;
    const proj =
      projects.find((p) => p.id === formProject || matchProjectId(p.id, formProject)) ||
      (existingItem
        ? { id: existingItem.projectId, name: existingItem.projectName }
        : projects[0]);
    const targetEmpStripped = (formEmployee || '').trim().replace(/^emp-/, '');
    const emp =
      activeTeamMembers.find(
        (m) =>
          m.id === formEmployee ||
          (targetEmpStripped && m.id.replace(/^emp-/, '') === targetEmpStripped)
      ) ||
      employees.find(
        (m) =>
          m.id === formEmployee ||
          (targetEmpStripped && m.id.replace(/^emp-/, '') === targetEmpStripped)
      ) ||
      activeTeamMembers[0] ||
      employees[0];

    if (!proj) {
      setFormError('Please select a valid target project.');
      return;
    }
    if (!emp) {
      setFormError('Please select an active team member.');
      return;
    }

    const sanitizedEmp = sanitizeEmployeeRecord(emp);
    const resolvedEmpId = sanitizedEmp.id || emp.id;
    const resolvedEmpName = sanitizedEmp.name || emp.name;
    const resolvedEmpEmail = normalizePersonEmail(sanitizedEmp.email || emp.email);
    const nowIso = new Date().toISOString();

    if (editingId && existingItem) {
      const updatedItem: ResourceAllocationItem = {
        ...existingItem,
        id: existingItem.id,
        projectId: proj.id,
        projectName: proj.name,
        employeeId: resolvedEmpId,
        memberId: resolvedEmpId,
        assignedTo: resolvedEmpId,
        employeeName: resolvedEmpName,
        assignedToName: resolvedEmpName,
        memberName: resolvedEmpName,
        employeeRole: emp.role || existingItem.employeeRole || 'Editor',
        memberEmail: resolvedEmpEmail,
        assignedToEmail: resolvedEmpEmail,
        discipline: formDiscipline,
        lod: formLOD,
        projectPhase: formPhase,
        taskType: formTaskType,
        targetElementOrZone:
          formTargetZone || existingItem.targetElementOrZone || 'MOD-AR-LVL01-ZONE-A',
        assignedHours: Number(formHours),
        viewFrequency: existingItem.viewFrequency || viewFrequency,
        startDate: normalizeDateToIso(formStartDate) || formStartDate,
        dueDate: normalizeDateToIso(formDueDate) || formDueDate,
        status: existingItem.status || 'Allocated',
        notes: formNotes,
        updatedAt: nowIso,
      };

      if (selectedProjectId !== 'all' && !matchProjectId(proj.id, selectedProjectId)) {
        setSelectedProjectId('all');
      }
      if (selectedEmployeeId !== 'all' && !doesAllocationMatchEmployee(updatedItem, selectedEmployeeId)) {
        setSelectedEmployeeId('all');
      }
      if (
        (filterStartDate || filterEndDate) &&
        !doesTaskTimelineOverlapFilter(updatedItem, filterStartDate, filterEndDate)
      ) {
        setFilterStartDate('');
        setFilterEndDate('');
      }

      const updatedAllocations = allocations.map((a) =>
        a.id === editingId ? updatedItem : a
      );
      saveAllocations(updatedAllocations, updatedItem);
      setEditingId(null);
      setShowAddModal(false);
      setFormNotes('');
      setDeleteSuccessNotice('Record successfully updated');
      window.setTimeout(() => {
        setDeleteSuccessNotice((cur) =>
          cur === 'Record successfully updated' ? null : cur
        );
      }, 4000);
      return;
    }

    const newItem: ResourceAllocationItem = {
      id: `alloc-${Date.now()}`,
      projectId: proj.id,
      projectName: proj.name,
      employeeId: resolvedEmpId,
      memberId: resolvedEmpId,
      assignedTo: resolvedEmpId,
      employeeName: resolvedEmpName,
      assignedToName: resolvedEmpName,
      memberName: resolvedEmpName,
      employeeRole: emp.role || 'Editor',
      memberEmail: resolvedEmpEmail,
      assignedToEmail: resolvedEmpEmail,
      discipline: formDiscipline,
      lod: formLOD,
      projectPhase: formPhase,
      taskType: formTaskType,
      targetElementOrZone: formTargetZone || 'MOD-AR-LVL01-ZONE-A',
      assignedHours: Number(formHours),
      viewFrequency,
      startDate: normalizeDateToIso(formStartDate) || formStartDate,
      dueDate: normalizeDateToIso(formDueDate) || formDueDate,
      status: 'Allocated',
      notes: formNotes,
      updatedAt: nowIso,
    };

    // Ensure active filters do not hide the newly allocated work item
    if (selectedProjectId !== 'all' && !matchProjectId(proj.id, selectedProjectId)) {
      setSelectedProjectId('all');
    }
    if (selectedEmployeeId !== 'all' && !doesAllocationMatchEmployee(newItem, selectedEmployeeId)) {
      setSelectedEmployeeId('all');
    }
    if (
      (filterStartDate || filterEndDate) &&
      !doesTaskTimelineOverlapFilter(newItem, filterStartDate, filterEndDate)
    ) {
      setFilterStartDate('');
      setFilterEndDate('');
    }

    saveAllocations([newItem, ...allocations], newItem);
    setEditingId(null);
    setShowAddModal(false);
    setFormNotes('');
  };

  // Inline Quick Update for Project
  const handleInlineProjectChange = (id: string, newProjectId: string) => {
    const proj = projects.find((p) => p.id === newProjectId || matchProjectId(p.id, newProjectId));
    if (!proj) return;
    let updatedItem: ResourceAllocationItem | undefined;
    const updated = allocations.map((a) => {
      if (a.id === id) {
        updatedItem = { ...a, projectId: proj.id, projectName: proj.name };
        return updatedItem;
      }
      return a;
    });
    saveAllocations(updated, updatedItem);
  };

  // Inline Quick Update for hours
  const handleInlineHoursChange = (id: string, newHours: number) => {
    if (newHours < 0) return;
    let updatedItem: ResourceAllocationItem | undefined;
    const updated = allocations.map((a) => {
      if (a.id === id) {
        updatedItem = { ...a, assignedHours: newHours };
        return updatedItem;
      }
      return a;
    });
    saveAllocations(updated, updatedItem);
  };

  // Inline Priority Update
  const handleInlinePriorityChange = (id: string, priority: AllocationPriority) => {
    let updatedItem: ResourceAllocationItem | undefined;
    const updated = allocations.map((a) => {
      if (a.id === id) {
        updatedItem = { ...a, priority };
        return updatedItem;
      }
      return a;
    });
    saveAllocations(updated, updatedItem);
  };

  // Inline Status Update
  const handleInlineStatusChange = (id: string, status: ResourceAllocationItem['status']) => {
    let updatedItem: ResourceAllocationItem | undefined;
    const updated = allocations.map((a) => {
      if (a.id === id) {
        updatedItem = { ...a, status };
        return updatedItem;
      }
      return a;
    });
    saveAllocations(updated, updatedItem);
  };

  // Delete Allocation with Firestore deleteDoc
  const handleDeleteAllocation = async (id: string) => {
    registerDeletedAllocationId(id);
    const updated = allocations.filter((a) => a.id !== id);
    saveAllocations(updated);
    setAllocationToDelete(null);
    setDeleteSuccessNotice('Record successfully deleted');
    window.setTimeout(() => {
      setDeleteSuccessNotice((cur) => (cur === 'Record successfully deleted' ? null : cur));
    }, 4000);
    try {
      await deleteDoc(doc(db, 'assigned_hours', id));
    } catch (err) {
      console.warn('Firestore deleteAllocation assigned_hours notice:', err);
    }
    try {
      await deleteDoc(doc(db, 'allocations', id));
    } catch (err) {
      console.warn('Firestore deleteAllocation allocations notice:', err);
    }
    try {
      await deleteDoc(doc(db, 'project_assignments', id));
    } catch (err) {
      console.warn('Firestore deleteAllocation project_assignments notice:', err);
    }
  };

  // Discipline Badge Styles
  const getDisciplineBadge = (disc: string) => {
    switch (disc) {
      case 'Architectural':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/30';
      case 'Structural':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/30';
      case 'BIM - MEP':
      case 'MEP':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
      case 'Infrastructure':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
      case 'Coordination & QA':
        return 'bg-purple-500/10 text-purple-400 border border-purple-500/30';
      default:
        return 'bg-slate-700 text-slate-300 border border-slate-600';
    }
  };

  // Priority Badge Styles
  const getPriorityBadge = (priority: AllocationPriority) => {
    switch (priority) {
      case 'Critical':
        return 'bg-red-500/20 text-red-400 border border-red-500/40 font-bold';
      case 'High':
        return 'bg-orange-500/20 text-orange-400 border border-orange-500/40';
      case 'Medium':
        return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
      case 'Low':
        return 'bg-slate-700/50 text-slate-400 border border-slate-600/50';
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {deleteSuccessNotice && (
        <div
          role="status"
          className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-300 shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-top-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{deleteSuccessNotice}</span>
          <button
            type="button"
            onClick={() => setDeleteSuccessNotice(null)}
            className="ml-2 p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* 1. WORKSPACE & METRICS HEADER */}
      <div className={`p-5 rounded-2xl border ${
        isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                <SlidersHorizontal className="w-3 h-3" />
                BIM Efficiency & Resource Engine
              </span>
              {workspaceMetrics.overallocatedStaff > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1 animate-pulse">
                  <AlertTriangle className="w-3 h-3" />
                  {workspaceMetrics.overallocatedStaff} Overallocated Specialists
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight mt-1.5 flex items-center gap-2">
              Assigned Hours System
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Track allocated hours, timeline efficiency, delivery throughput, and specialist capacities across all BIM disciplines.
            </p>
          </div>

          {/* Action & View Frequency */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Daily / Weekly toggle */}
            <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
              <button
                onClick={() => setViewFrequency('Daily')}
                className={`px-3 py-1 rounded font-semibold transition ${
                  viewFrequency === 'Daily' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Daily
              </button>
              <button
                onClick={() => setViewFrequency('Weekly')}
                className={`px-3 py-1 rounded font-semibold transition ${
                  viewFrequency === 'Weekly' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Weekly
              </button>
            </div>

            {canManageAllocations && (
              <button
                onClick={handleOpenCreateModal}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md transition"
              >
                <Plus className="w-4 h-4" />
                <span>Assign New Hours</span>
              </button>
            )}
          </div>
        </div>

        {/* Primary Top Metrics (Visible exclusively to Manager, Director, and Super Admin roles) */}
        {hasAssignedHoursAccess && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-5 pt-5 border-t border-slate-800">
            <div className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Assigned / Allocated Hours
                </span>
                {workspaceMetrics.allocatedHours > 0 && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                    {canManageAllocations ? 'Work Assigned to Team' : 'Work Assigned to You'}
                  </span>
                )}
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <div className="text-xl font-bold text-blue-400 font-mono">
                  {workspaceMetrics.allocatedHours.toFixed(1)} <span className="text-xs font-normal text-slate-400">hrs</span>
                </div>
                <Clock className="w-4 h-4 text-blue-400" />
              </div>
              <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1.5">
                <div
                  className="bg-blue-500 h-full rounded-full"
                  style={{ width: `${Math.min(100, workspaceMetrics.utilizationPct)}%` }}
                />
              </div>
            </div>

            <div className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Available Remaining Hours
                </span>
                <span className="text-[10px] font-semibold font-mono bg-emerald-500/15 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                  {workspaceMetrics.loggedHours > 0
                    ? `Daily Hours Logged • Hours Logged: ${workspaceMetrics.loggedHours.toFixed(1)}h`
                    : `Hours Logged: 0.0h`}
                </span>
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <div className={`text-xl font-bold font-mono ${
                  workspaceMetrics.remainingHours < 0
                    ? 'text-rose-400'
                    : workspaceMetrics.remainingHours < 20
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}>
                  {workspaceMetrics.remainingHours.toFixed(1)} <span className="text-xs font-normal text-slate-400">hrs</span>
                </div>
                <CheckCircle2 className={`w-4 h-4 ${
                  workspaceMetrics.remainingHours < 0
                    ? 'text-rose-400'
                    : workspaceMetrics.remainingHours < 20
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`} />
              </div>
              <p className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                <span>{workspaceMetrics.allocatedHours.toFixed(1)}h assigned − {workspaceMetrics.loggedHours.toFixed(1)}h logged</span>
                <span className="font-mono text-slate-500">
                  {workspaceMetrics.allocatedHours > 0
                    ? `${Math.round((workspaceMetrics.loggedHours / workspaceMetrics.allocatedHours) * 100)}% logged`
                    : '0% logged'}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* REDESIGNED SEARCH & 2-DROPDOWN FILTER SYSTEM */}
      <div className={`p-4 rounded-xl border flex flex-col lg:flex-row items-center justify-between gap-3 ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
      }`}>
        {/* Search */}
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search assignee, project, discipline, status..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg pl-9 pr-3 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
          />
        </div>

        {/* 2-Dropdown Filter System (Project Dropdown + Team Member Dropdown) */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end text-xs">
          {/* Dropdown 1: Project Filter */}
          <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
            <Building className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Project:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All Projects ({projects.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900">
                  {cleanProjectName(p.name)}
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown 2: Team Member Filter */}
          <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
            <Users className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Team Member:</span>
            {isFullAccessRole ? (
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900">All Team Members ({activeTeamMembers.length})</option>
                {activeTeamMembers.map((e) => (
                  <option key={e.id} value={e.id} className="bg-slate-900">
                    {e.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={viewerMatchedEmployee?.id || currentUser?.id || 'viewer-self'}
                disabled
                aria-label="Team Member Filter (Locked to current user)"
                className="bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-default opacity-90"
              >
                <option value={viewerMatchedEmployee?.id || currentUser?.id || 'viewer-self'} className="bg-slate-900">
                  {viewerMatchedEmployee?.name || currentUser?.name || currentUser?.email || 'My Assigned Tasks'}
                </option>
              </select>
            )}
          </div>

          {/* Dropdown 3: Date Range Calendar Filter Dropdown */}
          <div className="relative" ref={datePickerRef}>
            <div
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition ${
                filterStartDate || filterEndDate
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:border-slate-600'
              }`}
            >
              <button
                type="button"
                onClick={() => setShowDatePicker((prev) => !prev)}
                aria-label="Filter by Timeline Date Range"
                className="flex items-center gap-1.5 focus:outline-none cursor-pointer"
              >
                <Calendar className={`w-3.5 h-3.5 ${filterStartDate || filterEndDate ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Timeline:</span>
                <span className="max-w-[145px] truncate font-mono text-[11px]">
                  {filterStartDate && filterEndDate
                    ? `${filterStartDate} → ${filterEndDate}`
                    : filterStartDate
                    ? `From ${filterStartDate}`
                    : filterEndDate
                    ? `Until ${filterEndDate}`
                    : 'All Dates'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
              </button>
              {(filterStartDate || filterEndDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterStartDate('');
                    setFilterEndDate('');
                  }}
                  className="p-0.5 rounded hover:bg-emerald-500/20 text-emerald-400 hover:text-white transition ml-0.5 cursor-pointer"
                  title="Reset date filter"
                  aria-label="Reset date filter"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Date Range Popover */}
            {showDatePicker && (
              <div className="absolute right-0 top-full mt-2 z-50 w-80 p-4 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl text-slate-200 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Date Range Filter</span>
                  </div>
                  {(filterStartDate || filterEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilterStartDate('');
                        setFilterEndDate('');
                      }}
                      className="text-[11px] text-slate-400 hover:text-emerald-400 transition font-medium"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Quick Presets */}
                <div className="mb-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Quick Presets
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const today = new Date().toISOString().split('T')[0];
                        setFilterStartDate(today);
                        setFilterEndDate(today);
                      }}
                      className={`px-2 py-1.5 rounded text-[11px] font-medium transition text-center ${
                        filterStartDate === new Date().toISOString().split('T')[0] &&
                        filterEndDate === new Date().toISOString().split('T')[0]
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const curWeek = getCurrentWeekRange();
                        setFilterStartDate(curWeek.startIso);
                        setFilterEndDate(curWeek.endIso);
                      }}
                      className={`px-2 py-1.5 rounded text-[11px] font-medium transition text-center ${
                        filterStartDate === getCurrentWeekRange().startIso &&
                        filterEndDate === getCurrentWeekRange().endIso
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      This Week
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                        const pad = (n: number) => String(n).padStart(2, '0');
                        setFilterStartDate(`${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-${pad(firstDay.getDate())}`);
                        setFilterEndDate(`${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`);
                      }}
                      className="px-2 py-1.5 rounded text-[11px] font-medium transition text-center bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      This Month
                    </button>
                  </div>
                </div>

                {/* Custom Date Inputs */}
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      From (Start Date)
                    </label>
                    <input
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      To (Due Date)
                    </label>
                    <input
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterStartDate('');
                      setFilterEndDate('');
                      setShowDatePicker(false);
                    }}
                    className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white text-xs transition"
                  >
                    Reset Filter
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition"
                  >
                    Apply Filter
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Clear Filters button if filtered */}
          {(selectedProjectId !== 'all' || (isFullAccessRole && selectedEmployeeId !== 'all') || searchQuery || filterStartDate || filterEndDate) && (
            <button
              onClick={() => {
                setSelectedProjectId('all');
                if (isFullAccessRole) {
                  setSelectedEmployeeId('all');
                }
                setSearchQuery('');
                setFilterStartDate('');
                setFilterEndDate('');
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700 transition"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* 2. EFFICIENCY MANAGEMENT DATA GRID TABLE */}
      <div className={`rounded-xl border overflow-hidden shadow-sm ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/90 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700 text-[11px]">
              <tr>
                <th className="py-3 px-3.5 min-w-[200px]">Team Member</th>
                <th className="py-3 px-3 min-w-[180px]">Project</th>
                {hasAssignedHoursAccess && <th className="py-3 px-3 min-w-[130px]">Assigned Hours</th>}
                <th className="py-3 px-3 min-w-[130px]">Logged Hours</th>
                <th className="py-3 px-3 min-w-[160px]">Timeline (Start - Due)</th>
                <th className="py-3 px-3.5 text-right min-w-[90px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-normal">
              {filteredAllocations.length === 0 ? (
                <tr>
                  <td colSpan={hasAssignedHoursAccess ? 6 : 5} className="py-12 text-center text-slate-500">
                    <p className="text-sm font-semibold text-slate-400">No resource hour allocations found.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {filterStartDate || filterEndDate
                        ? `No assignments match the selected timeline date range (${filterStartDate || 'start'} to ${filterEndDate || 'end'}). Try clearing or widening the date filter.`
                        : 'Click "Assign Hours" above to allocate hours to project members.'}
                    </p>
                    {(selectedProjectId !== 'all' || (isFullAccessRole && selectedEmployeeId !== 'all') || searchQuery || filterStartDate || filterEndDate) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProjectId('all');
                          if (isFullAccessRole) setSelectedEmployeeId('all');
                          setSearchQuery('');
                          setFilterStartDate('');
                          setFilterEndDate('');
                        }}
                        className="mt-3 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-semibold border border-slate-700 transition"
                      >
                        Reset All Filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredAllocations.map((alloc) => {
                  if (!isSuperAdmin && activeMembers.length > 0 && !isLiveActiveMember(alloc)) return null;

                  const matchedProject = projects.find((p) => matchProjectId(p.id, alloc.projectId));
                  const resolvedProjectId = matchedProject?.id || alloc.projectId;
                  const resolvedProjectName = matchedProject?.name || alloc.projectName || 'Unassigned Project';

                  const rawRowMemberId = (alloc.memberId || alloc.employeeId || alloc.assignedTo || '').trim();
                  const strippedRowMemberId = rawRowMemberId.replace(/^emp-/, '');
                  const rawRowEmail = normalizePersonEmail(alloc.assignedToEmail || alloc.memberEmail || '');
                  const rawRowName = normalizePersonName(
                    alloc.assignedToName ||
                    alloc.memberName ||
                    alloc.employeeName ||
                    ''
                  );

                  const matchedById = rawRowMemberId
                    ? activeTeamMembers.find(
                        (emp) =>
                          emp.id === rawRowMemberId ||
                          emp.id.replace(/^emp-/, '') === strippedRowMemberId
                      ) ||
                      employees.find(
                        (emp) =>
                          emp.id === rawRowMemberId ||
                          emp.id.replace(/^emp-/, '') === strippedRowMemberId
                      )
                    : undefined;

                  const matchedByEmail =
                    !matchedById && rawRowEmail
                      ? activeTeamMembers.find(
                          (emp) => normalizePersonEmail(emp.email) === rawRowEmail
                        ) ||
                        employees.find(
                          (emp) => normalizePersonEmail(emp.email) === rawRowEmail
                        )
                      : undefined;

                  const matchedByName =
                    !matchedById && !matchedByEmail && rawRowName
                      ? activeTeamMembers.find(
                          (emp) => normalizePersonName(emp.name) === rawRowName
                        ) ||
                        employees.find(
                          (emp) => normalizePersonName(emp.name) === rawRowName
                        )
                      : undefined;

                  const directRowMember = matchedById || matchedByEmail || matchedByName;
                  // Canonicalize directRowMember to the corresponding deduplicated entry in activeTeamMembers if available
                  const canonicalActiveMember = directRowMember
                    ? activeTeamMembers.find(
                        (emp) =>
                          emp.id === directRowMember.id ||
                          (emp.email &&
                            directRowMember.email &&
                            normalizePersonEmail(emp.email) ===
                              normalizePersonEmail(directRowMember.email)) ||
                          (emp.name &&
                            directRowMember.name &&
                            normalizePersonName(emp.name) ===
                              normalizePersonName(directRowMember.name))
                      ) || directRowMember
                    : undefined;

                  const selectedMember =
                    canonicalActiveMember ||
                    (!rawRowName && !rawRowMemberId
                      ? activeTeamMembers.find(
                          (emp) =>
                            emp.id ===
                              disciplineAssignments[`${resolvedProjectId}__${alloc.discipline}`] ||
                            emp.id === disciplineAssignments[alloc.discipline]
                        ) || activeTeamMembers[0]
                      : undefined);

                  const row =
                    selectedMember && alloc.assignedToName !== selectedMember.name
                      ? {
                          ...alloc,
                          employeeId: selectedMember.id,
                          memberId: selectedMember.id,
                          assignedToName: selectedMember.name,
                          memberName: selectedMember.name,
                          employeeName: selectedMember.name,
                          memberEmail: selectedMember.email || alloc.memberEmail,
                          assignedToEmail: selectedMember.email || alloc.assignedToEmail,
                        }
                      : alloc;

                  // Dynamic row-level name binding for status badge and avatar initials
                  const assignedName = row.assignedToName || selectedMember?.name || 'Member';
                  const badgeText = `Work Assigned to ${assignedName}`;
                  const avatarInitials = getInitials(assignedName);

                  const loggedHours = getLoggedHoursForAssignment(row, filterStartDate, filterEndDate);

                  return (
                    <tr
                      key={alloc.id}
                      className="hover:bg-slate-800/40 transition group"
                    >
                      {/* Team Member (Synced with Firestore assignedTo / discipline) */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-[11px] shrink-0 shadow-xs">
                            {avatarInitials}
                          </div>
                          <div>
                            {canManageAllocations && activeTeamMembers.length > 0 ? (
                              <select
                                aria-label={`Assigned team member for ${alloc.discipline || 'BIM - ACS'}`}
                                value={selectedMember?.id || row.employeeId || ''}
                                onChange={(e) =>
                                  handleMemberSelect(
                                    alloc.discipline || 'BIM - ACS',
                                    e.target.value,
                                    alloc.id
                                  )
                                }
                                className="px-2 py-1 text-[13px] font-semibold rounded bg-slate-800 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                              >
                                {!(activeTeamMembers.some(
                                  (emp) => emp.id === (selectedMember?.id || row.employeeId || '')
                                )) &&
                                  (selectedMember?.id || row.employeeId) && (
                                    <option
                                      value={selectedMember?.id || row.employeeId || ''}
                                      className="bg-slate-900"
                                    >
                                      {assignedName}
                                    </option>
                                  )}
                                {activeTeamMembers.map((emp) => (
                                  <option key={emp.id} value={emp.id} className="bg-slate-900">
                                    {emp.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="font-semibold text-white text-[13px]">
                                {assignedName}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Project & Detailed Work Breakdown (Synced with Firestore projectId / projectName / task details) */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-1">
                          {canManageAllocations ? (
                            <div className="flex items-center gap-1.5">
                              <Building className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <select
                                aria-label={`Assigned project for ${assignedName}`}
                                value={resolvedProjectId}
                                onChange={(e) => handleInlineProjectChange(alloc.id, e.target.value)}
                                className="px-2 py-1 text-xs font-semibold rounded bg-slate-800 border border-slate-700 text-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer max-w-[200px] truncate"
                              >
                                {!projects.some((p) => p.id === resolvedProjectId) && resolvedProjectId && (
                                  <option value={resolvedProjectId} className="bg-slate-900">
                                    {cleanProjectName(resolvedProjectName)}
                                  </option>
                                )}
                                {projects.map((p) => (
                                  <option key={p.id} value={p.id} className="bg-slate-900">
                                    {cleanProjectName(p.name)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 font-semibold text-blue-300 text-xs">
                              <Building className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span className="truncate max-w-[200px]" title={cleanProjectName(resolvedProjectName)}>
                                {cleanProjectName(resolvedProjectName)}
                              </span>
                            </div>
                          )}
                          {(row.taskType || row.projectPhase || row.lod || row.notes) && (
                            <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-400 pl-5">
                              {row.taskType && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/70 text-slate-300 font-medium">
                                  {row.taskType}
                                </span>
                              )}
                              {row.lod && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-mono">
                                  {row.lod}
                                </span>
                              )}
                              {row.projectPhase && (
                                <span className="text-slate-400 truncate max-w-[140px]" title={row.projectPhase}>
                                  • {row.projectPhase}
                                </span>
                              )}
                              {row.notes && (
                                <span className="text-slate-300/90 italic truncate max-w-[180px]" title={row.notes}>
                                  — "{row.notes}"
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Assigned Hours (Visible exclusively to Manager, Director, and Super Admin roles) */}
                      {hasAssignedHoursAccess && (
                        <td className="py-3 px-3">
                          {canManageAllocations ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0.5}
                                step={0.5}
                                value={alloc.assignedHours}
                                onChange={(e) => handleInlineHoursChange(alloc.id, parseFloat(e.target.value) || 0)}
                                className="w-16 px-2 py-1 text-xs font-mono font-bold rounded bg-slate-800 border border-slate-700 text-white text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <span className="text-[10px] text-slate-400">hrs</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-white">
                              <span>{Number(alloc.assignedHours || 0).toFixed(1)}</span>
                              <span className="text-[10px] font-normal text-slate-400">hrs</span>
                            </div>
                          )}
                        </td>
                      )}

                      {/* Logged Hours */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col items-start gap-1">
                          <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-emerald-400">
                            <Clock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>{loggedHours.toFixed(1)}h Logged</span>
                          </div>
                          {loggedHours > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Daily Hours Logged</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/80">
                              0.0h Logged • Awaiting Daily Log
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Timeline */}
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-300">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          <span>{alloc.startDate}</span>
                          <span className="text-slate-500 mx-1">→</span>
                          <span>{alloc.dueDate}</span>
                        </div>
                      </td>

                      {/* Action (Status Label + Edit & Delete Allocation for Admins) */}
                      <td className="py-3 px-3.5 text-right">
                        {canManageAllocations ? (
                          <div className="inline-flex items-center justify-end gap-2">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 whitespace-nowrap">
                              {badgeText}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenEditModal(
                                  row,
                                  resolvedProjectId,
                                  selectedMember?.id || row.employeeId
                                )
                              }
                              className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 border border-blue-500/20 hover:border-blue-500/40 transition inline-flex items-center justify-center shrink-0"
                              title={`Edit allocation for ${assignedName}`}
                              aria-label={`Edit allocation for ${assignedName}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setAllocationToDelete(row)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 transition inline-flex items-center justify-center shrink-0"
                              title={`Delete allocation for ${assignedName}`}
                              aria-label={`Delete allocation for ${assignedName}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 whitespace-nowrap">
                            Work Assigned to You
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DELETE ALLOCATION CONFIRMATION PROMPT MODAL */}
      {allocationToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full text-slate-100 shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Delete Hour Allocation</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    This action removes the assignment from Firestore in real time.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAllocationToDelete(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-800/70 border border-slate-700/70 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Team Member:</span>
                <span className="font-semibold text-white">{allocationToDelete.employeeName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Project:</span>
                <span className="font-semibold text-blue-300">
                  {projects.find((p) => matchProjectId(p.id, allocationToDelete.projectId))?.name ||
                    allocationToDelete.projectName ||
                    'Unassigned Project'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Assigned Hours:</span>
                <span className="font-mono font-bold text-white">{allocationToDelete.assignedHours} hrs</span>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Are you sure you want to delete this hour allocation?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setAllocationToDelete(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteAllocation(allocationToDelete.id)}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Allocation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT ALLOCATION MODAL */}
      {showAddModal && canManageAllocations && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full text-slate-100 shadow-2xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  {editingId ? (
                    <Edit2 className="w-4 h-4 text-blue-400" />
                  ) : (
                    <SlidersHorizontal className="w-4 h-4 text-blue-400" />
                  )}
                  {editingId
                    ? 'Edit BIM Task & Resource Hours'
                    : 'Assign BIM Task & Resource Hours'}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {editingId
                    ? 'Modify allocated hours, project, discipline, and timeline for this assignment.'
                    : 'Allocate hours to team specialists with automatic capacity verification.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setShowAddModal(false);
                }}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddAllocation} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Project & Specialist Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Project
                  </label>
                  <select
                    value={formProject}
                    onChange={(e) => setFormProject(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {!projects.some((p) => p.id === formProject) && formProject && (
                      <option value={formProject}>
                        {cleanProjectName(
                          allocations.find((a) => a.id === editingId)?.projectName || formProject
                        )}
                      </option>
                    )}
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {cleanProjectName(p.name)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Assignee Specialist
                  </label>
                  <select
                    value={formEmployee || ''}
                    onChange={(e) => handleMemberSelect(formDiscipline, e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {!activeTeamMembers.some((e) => e.id === formEmployee) && formEmployee && (
                      <option value={formEmployee}>
                        {allocations.find((a) => a.id === editingId)?.employeeName || formEmployee}
                      </option>
                    )}
                    {activeTeamMembers.map((e) => (
                      <option key={e.id} value={e.id}>
                        {getMemberLabel(e)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Task Type */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Task Type
                </label>
                <select
                  value={formTaskType}
                  onChange={(e) => setFormTaskType(e.target.value as BimTaskType)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="3D Modeling">3D Modeling</option>
                  <option value="Clash Detection">Clash Detection</option>
                  <option value="Parameter Population">Parameter Population</option>
                  <option value="2D Sheet Generation">2D Sheet Generation</option>
                  <option value="QC/QA Audit">QC/QA Audit</option>
                  <option value="COBie Data Entry">COBie Data Entry</option>
                  <option value="AI & Automation">AI & Automation</option>
                </select>
              </div>

              {/* Discipline & Phase */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Discipline
                  </label>
                  <select
                    value={formDiscipline}
                    onChange={(e) => setFormDiscipline(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="BIM - ACS">BIM - ACS</option>
                    <option value="Structural">Structural</option>
                    <option value="BIM - MEP">BIM - MEP</option>
                    <option value="Infrastructure">Infrastructure</option>
                    <option value="Coordination & QA">Coordination & QA</option>
                    <option value="AI & Automation">AI & Automation</option>
                    <option value="Estimation">Estimation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Project Phase
                  </label>
                  <select
                    value={formPhase}
                    onChange={(e) => setFormPhase(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Schematic Design">Schematic Design</option>
                    <option value="Design Development">Design Development</option>
                    <option value="Construction Documentation">Construction Documentation</option>
                    <option value="Fabrication / As-Built">Fabrication / As-Built</option>
                  </select>
                </div>
              </div>

              {/* Hours & Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Assigned Hours
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={formHours}
                    onChange={(e) => setFormHours(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Deliverable Specifies
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. Include Navisworks clash checks and family parameter population..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setShowAddModal(false);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingId ? 'Save Changes' : 'Allocate Hours'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
