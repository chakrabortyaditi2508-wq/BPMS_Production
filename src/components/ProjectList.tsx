import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Search,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  Building,
  ArrowRight,
  Sparkles,
  Timer,
  CheckCircle,
  AlertCircle,
  PauseCircle,
  Clock3,
  TrendingUp,
  ChevronDown,
  Lock,
  ShieldCheck,
  Edit3,
  Trash2,
  X,
  Check
} from 'lucide-react';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import {
  useBimData,
  isUserSuperAdmin,
  sanitizeWorkLogRecord,
  doesLogBelongToProject,
  getProjectEstimatedHours,
  getProjectChangedHours,
  getProjectTargetHours,
  isRemovedMockMember,
} from '../context/BimDataContext';
import { BimProject, ProjectStatus, PROJECT_STATUS_OPTIONS, ResourceAllocationItem, DailyWorkLog } from '../types';
import { calculateDeliveryVariance, getProjectStatusStyle } from '../utils/deliveryVariance';
import { NewProjectModal } from './NewProjectModal';

interface ProjectListProps {
  onSelectProject: (project: BimProject) => void;
  onOpenNewProjectModal: () => void;
  onOpenReportModalWithProject: (projectId: string) => void;
}

const matchProjectId = (idA?: string, idB?: string): boolean => {
  if (!idA || !idB) return false;
  if (idA === idB) return true;
  const normA = idA.startsWith('proj-') ? idA : idA.replace(/^p(\d+)$/, 'proj-$1');
  const normB = idB.startsWith('proj-') ? idB : idB.replace(/^p(\d+)$/, 'proj-$1');
  return normA === normB;
};

const normalizeProjectNameKey = (name?: string): string =>
  (name || '')
    .trim()
    .replace(/^BIM[\s-_]+/i, '')
    .trim()
    .toLowerCase();

export const ProjectList: React.FC<ProjectListProps> = ({
  onSelectProject,
  onOpenNewProjectModal,
  onOpenReportModalWithProject,
}) => {
  const {
    projects,
    workLogs,
    allWorkLogs,
    resourceAllocations,
    getProjectCompletedHours,
    employees,
    updateProjectStatus,
    updateProject,
    deleteProject,
    currentUser,
    selectedProjectId,
  } = useBimData();

  // Direct real-time Firestore onSnapshot subscription for assigned_hours & project_assignments
  const [liveAssignedHours, setLiveAssignedHours] = useState<ResourceAllocationItem[]>([]);

  useEffect(() => {
    let unsubAssigned: (() => void) | undefined;
    let unsubProjectAssignments: (() => void) | undefined;

    const assignedMap = new Map<string, ResourceAllocationItem>();
    const projectAssignMap = new Map<string, ResourceAllocationItem>();

    const syncSnapshots = () => {
      const merged = new Map<string, ResourceAllocationItem>();
      projectAssignMap.forEach((v, k) => merged.set(k, v));
      assignedMap.forEach((v, k) => {
        const existing = merged.get(k);
        if (!existing || !existing.updatedAt || (v.updatedAt && v.updatedAt >= existing.updatedAt)) {
          merged.set(k, v);
        }
      });
      setLiveAssignedHours(Array.from(merged.values()));
    };

    const parseDoc = (docSnap: any): ResourceAllocationItem => {
      const d = docSnap.data();
      const resolvedMemberId = d.memberId || d.employeeId || d.assignedTo || '';
      const resolvedEmail = d.assignedToEmail || d.memberEmail || '';
      const resolvedName = d.assignedToName || d.memberName || d.employeeName || '';
      return {
        id: docSnap.id,
        projectId: d.projectId || '',
        projectName: d.projectName || 'Unassigned Project',
        employeeId: resolvedMemberId,
        memberId: resolvedMemberId,
        assignedTo: resolvedMemberId,
        employeeName: resolvedName,
        assignedToName: resolvedName,
        memberName: resolvedName,
        employeeRole: d.employeeRole || 'Editor',
        memberEmail: resolvedEmail,
        assignedToEmail: resolvedEmail,
        discipline: d.discipline || 'BIM - ACS',
        lod: d.lod || 'LOD 350',
        projectPhase: d.projectPhase || 'Design Development',
        taskType: d.taskType || '3D Modeling',
        targetElementOrZone: d.targetElementOrZone || '',
        assignedHours: Number(d.assignedHours) || 0,
        viewFrequency: d.viewFrequency || 'Weekly',
        startDate: d.startDate || '',
        dueDate: d.dueDate || '',
        status: d.status || 'Allocated',
        notes: d.notes || '',
        updatedAt: d.updatedAt || '',
      };
    };

    try {
      unsubAssigned = onSnapshot(
        collection(db, 'assigned_hours'),
        (snap) => {
          assignedMap.clear();
          snap.docs.forEach((docSnap) => assignedMap.set(docSnap.id, parseDoc(docSnap)));
          syncSnapshots();
        },
        (err) => console.warn('ProjectList assigned_hours listener notice:', err)
      );

      unsubProjectAssignments = onSnapshot(
        collection(db, 'project_assignments'),
        (snap) => {
          projectAssignMap.clear();
          snap.docs.forEach((docSnap) => projectAssignMap.set(docSnap.id, parseDoc(docSnap)));
          syncSnapshots();
        },
        (err) => console.warn('ProjectList project_assignments listener notice:', err)
      );
    } catch (e) {
      console.warn('ProjectList assigned_hours setup notice:', e);
    }

    return () => {
      if (unsubAssigned) unsubAssigned();
      if (unsubProjectAssignments) unsubProjectAssignments();
    };
  }, []);

  // Merge context resourceAllocations with liveAssignedHours snapshot
  const activeAllocations = useMemo(() => {
    const source =
      liveAssignedHours.length > 0 ? liveAssignedHours : resourceAllocations || [];
    return source.filter((item) => {
      if (isRemovedMockMember(item)) return false;
      try {
        const saved = localStorage.getItem('bim_deleted_members_v1');
        if (saved) {
          const deletedSet = new Set<string>(JSON.parse(saved));
          const empId = (item.employeeId || item.memberId || '').trim().toLowerCase();
          const empIdStripped = empId.replace(/^emp-/, '');
          const email = (item.memberEmail || item.assignedToEmail || '').trim().toLowerCase();
          const name = (item.employeeName || '').trim().toLowerCase();
          if (
            (empId && deletedSet.has(empId)) ||
            (empIdStripped && deletedSet.has(empIdStripped)) ||
            (email && deletedSet.has(email)) ||
            (name && deletedSet.has(name))
          ) {
            return false;
          }
        }
      } catch {}
      return true;
    });
  }, [liveAssignedHours, resourceAllocations]);

  // Aggregate total Assigned Hours (H_assigned) for a target project
  const getProjectAssignedHours = (project: BimProject): number => {
    const targetNameKey = normalizeProjectNameKey(project.name);
    return activeAllocations
      .filter(
        (alloc) =>
          matchProjectId(alloc.projectId, project.id) ||
          (targetNameKey &&
            alloc.projectName &&
            normalizeProjectNameKey(alloc.projectName) === targetNameKey)
      )
      .reduce((sum, alloc) => sum + (Number(alloc.assignedHours) || 0), 0);
  };

  // Direct real-time Firestore onSnapshot subscription for work_logs, daily_logs, timesheets + SSOT & BroadcastChannel
  const [liveWorkLogs, setLiveWorkLogs] = useState<DailyWorkLog[]>([]);
  const [deletedLogIds, setDeletedLogIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let unsubWorkLogs: (() => void) | undefined;
    let unsubDailyLogs: (() => void) | undefined;
    let unsubTimesheets: (() => void) | undefined;
    let sseSource: EventSource | undefined;
    let bcChannel: BroadcastChannel | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const workLogsMap = new Map<string, DailyWorkLog>();
    const dailyLogsMap = new Map<string, DailyWorkLog>();
    const timesheetsMap = new Map<string, DailyWorkLog>();
    const ssotLogsMap = new Map<string, DailyWorkLog>();
    const deletedIds = new Set<string>();

    const parseRawLog = (docId: string, data: any): DailyWorkLog | null => {
      if (!data || data.isDeleted === true || deletedIds.has(docId) || isRemovedMockMember({ ...data, id: docId })) return null;
      const resolvedCreatedAt =
        typeof data.createdAt === 'string'
          ? data.createdAt
          : typeof data.createdAt?.toDate === 'function'
          ? data.createdAt.toDate().toISOString()
          : typeof data.createdAt?.seconds === 'number'
          ? new Date(data.createdAt.seconds * 1000).toISOString()
          : data.timestamp || '';
      return sanitizeWorkLogRecord({
        id: docId,
        employeeId: data.employeeId || data.memberId || data.userId || '',
        memberId: data.memberId || data.employeeId || data.userId || '',
        employeeName: data.employeeName || 'BIM Modeler',
        projectId: data.projectId || '',
        projectName: data.projectName || '',
        discipline: data.discipline || 'BIM - ACS',
        activityType: data.activityType || '3D Detailed Modeling',
        taskName: data.taskName || '',
        lodStage: data.lodStage || 'LOD 350',
        hoursLogged: Number(data.hoursLogged !== undefined ? data.hoursLogged : data.hours) || 0,
        notes: data.notes || '',
        billable: data.billable !== undefined ? Boolean(data.billable) : true,
        isTestEntry: Boolean(data.isTestEntry ?? false),
        date: data.date || (resolvedCreatedAt ? resolvedCreatedAt.slice(0, 10) : ''),
        timestamp: data.updatedAt || data.timestamp || resolvedCreatedAt || '',
        createdAt: resolvedCreatedAt,
      });
    };

    const parseLogDoc = (docSnap: any): DailyWorkLog | null => {
      return parseRawLog(docSnap.id, docSnap.data() || {});
    };

    const pickLatest = (existing: DailyWorkLog | undefined, incoming: DailyWorkLog): DailyWorkLog => {
      if (!existing) return incoming;
      const existingTs = new Date((existing as any).updatedAt || existing.timestamp || existing.createdAt || 0).getTime() || 0;
      const incomingTs = new Date((incoming as any).updatedAt || incoming.timestamp || incoming.createdAt || 0).getTime() || 0;
      return incomingTs >= existingTs ? incoming : existing;
    };

    const syncLogsSnapshots = () => {
      const merged = new Map<string, DailyWorkLog>();
      workLogsMap.forEach((v, k) => {
        if (!deletedIds.has(k)) merged.set(k, pickLatest(merged.get(k), v));
      });
      dailyLogsMap.forEach((v, k) => {
        if (!deletedIds.has(k)) merged.set(k, pickLatest(merged.get(k), v));
      });
      timesheetsMap.forEach((v, k) => {
        if (!deletedIds.has(k)) merged.set(k, pickLatest(merged.get(k), v));
      });
      ssotLogsMap.forEach((v, k) => {
        if (!deletedIds.has(k)) merged.set(k, pickLatest(merged.get(k), v));
      });
      setDeletedLogIds(new Set(deletedIds));
      setLiveWorkLogs(Array.from(merged.values()));
    };

    const pollSsotState = async () => {
      try {
        const res = await fetch('/api/ssot/state', { cache: 'no-store' });
        if (res.ok) {
          const payload = await res.json();
          if (Array.isArray(payload?.deletedLogIds)) {
            payload.deletedLogIds.forEach((id: string) => {
              const delId = String(id);
              deletedIds.add(delId);
              ssotLogsMap.delete(delId);
              workLogsMap.delete(delId);
              dailyLogsMap.delete(delId);
              timesheetsMap.delete(delId);
            });
          }
          if (Array.isArray(payload?.timesheets)) {
            ssotLogsMap.clear();
            payload.timesheets.forEach((item: any) => {
              if (item?.id) {
                const parsed = parseRawLog(String(item.id), item);
                if (parsed) ssotLogsMap.set(parsed.id, parsed);
              }
            });
            syncLogsSnapshots();
          }
        }
      } catch {}
    };

    try {
      unsubWorkLogs = onSnapshot(
        collection(db, 'work_logs'),
        (snap) => {
          workLogsMap.clear();
          snap.docs.forEach((docSnap) => {
            const p = parseLogDoc(docSnap);
            if (p) workLogsMap.set(docSnap.id, p);
          });
          syncLogsSnapshots();
        },
        (err) => console.warn('ProjectList work_logs listener notice:', err)
      );

      unsubDailyLogs = onSnapshot(
        collection(db, 'daily_logs'),
        (snap) => {
          dailyLogsMap.clear();
          snap.docs.forEach((docSnap) => {
            const p = parseLogDoc(docSnap);
            if (p) dailyLogsMap.set(docSnap.id, p);
          });
          syncLogsSnapshots();
        },
        (err) => console.warn('ProjectList daily_logs listener notice:', err)
      );

      unsubTimesheets = onSnapshot(
        collection(db, 'timesheets'),
        (snap) => {
          timesheetsMap.clear();
          snap.docs.forEach((docSnap) => {
            const p = parseLogDoc(docSnap);
            if (p) timesheetsMap.set(docSnap.id, p);
          });
          syncLogsSnapshots();
        },
        (err) => console.warn('ProjectList timesheets listener notice:', err)
      );

      if (typeof EventSource !== 'undefined') {
        sseSource = new EventSource('/api/ssot/stream');
        sseSource.onmessage = (ev) => {
          try {
            const payload = JSON.parse(ev.data);
            if (payload?.type === 'INIT_SSOT' && Array.isArray(payload.timesheets)) {
              if (Array.isArray(payload.deletedLogIds)) {
                payload.deletedLogIds.forEach((id: string) => deletedIds.add(String(id)));
              }
              ssotLogsMap.clear();
              payload.timesheets.forEach((item: any) => {
                if (item?.id) {
                  const parsed = parseRawLog(String(item.id), item);
                  if (parsed) ssotLogsMap.set(parsed.id, parsed);
                }
              });
              syncLogsSnapshots();
            } else if (payload?.type === 'UPSERT_TIMESHEETS' && Array.isArray(payload.timesheets)) {
              payload.timesheets.forEach((item: any) => {
                if (item?.id) {
                  deletedIds.delete(String(item.id));
                  const parsed = parseRawLog(String(item.id), item);
                  if (parsed) ssotLogsMap.set(parsed.id, parsed);
                }
              });
              syncLogsSnapshots();
            } else if (payload?.type === 'DELETE_TIMESHEET' && payload?.id) {
              const delId = String(payload.id);
              deletedIds.add(delId);
              ssotLogsMap.delete(delId);
              workLogsMap.delete(delId);
              dailyLogsMap.delete(delId);
              timesheetsMap.delete(delId);
              syncLogsSnapshots();
            }
          } catch {}
        };
      }

      if (typeof BroadcastChannel !== 'undefined') {
        bcChannel = new BroadcastChannel('bim_ssot_realtime_channel');
        bcChannel.onmessage = (event) => {
          const msg = event?.data;
          if (!msg) return;
          if (msg.type === 'UPSERT_LOG' && msg.log && msg.log.id) {
            deletedIds.delete(String(msg.log.id));
            const parsed = parseRawLog(String(msg.log.id), msg.log);
            if (parsed) {
              ssotLogsMap.set(parsed.id, parsed);
              syncLogsSnapshots();
            }
          } else if (msg.type === 'DELETE_LOG' && msg.id) {
            const delId = String(msg.id);
            deletedIds.add(delId);
            ssotLogsMap.delete(delId);
            workLogsMap.delete(delId);
            dailyLogsMap.delete(delId);
            timesheetsMap.delete(delId);
            syncLogsSnapshots();
          } else if (msg.type === 'REFRESH_SSOT') {
            pollSsotState();
          }
        };
      }

      pollSsotState();
      pollTimer = setInterval(pollSsotState, 3000);
    } catch (e) {
      console.warn('ProjectList work_logs setup notice:', e);
    }

    return () => {
      if (unsubWorkLogs) unsubWorkLogs();
      if (unsubDailyLogs) unsubDailyLogs();
      if (unsubTimesheets) unsubTimesheets();
      if (sseSource) sseSource.close();
      if (bcChannel) bcChannel.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  const combinedWorkLogs = useMemo(() => {
    const map = new Map<string, DailyWorkLog>();
    const upsert = (raw: DailyWorkLog) => {
      if (!raw || !raw.id || (raw as any).isDeleted || deletedLogIds.has(raw.id)) return;
      const sanitized = sanitizeWorkLogRecord(raw);
      const existing = map.get(sanitized.id);
      if (!existing) {
        map.set(sanitized.id, sanitized);
        return;
      }
      const existingTs = new Date((existing as any).updatedAt || existing.timestamp || existing.createdAt || 0).getTime() || 0;
      const incomingTs = new Date((sanitized as any).updatedAt || sanitized.timestamp || sanitized.createdAt || 0).getTime() || 0;
      if (incomingTs >= existingTs) {
        map.set(sanitized.id, sanitized);
      }
    };
    (workLogs || []).forEach(upsert);
    (allWorkLogs || []).forEach(upsert);
    liveWorkLogs.forEach(upsert);
    return Array.from(map.values());
  }, [allWorkLogs, workLogs, liveWorkLogs, deletedLogIds]);

  // Dynamically aggregate total Logged Hours for a project by summing all active Daily Hour Tracking entries
  const getProjectDynamicLoggedHours = (project: BimProject): number => {
    const logsSum = combinedWorkLogs
      .filter((w) => !w.isTestEntry && !(w as any).isDeleted && doesLogBelongToProject(w, project))
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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');
  const [adminEditUnlocked, setAdminEditUnlocked] = useState(true);
  const [editingActualDateProject, setEditingActualDateProject] = useState<BimProject | null>(null);
  const [newPlannedDateValue, setNewPlannedDateValue] = useState('');
  const [newActualDateValue, setNewActualDateValue] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<BimProject | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<BimProject | null>(null);
  const [deletedProjectIds, setDeletedProjectIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('bim_deleted_project_ids_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // Inline hours editing draft state keyed by `${projectId}:logged` or `${projectId}:estimated`
  const [inlineDrafts, setInlineDrafts] = useState<Record<string, string>>({});
  const [activeInlineKey, setActiveInlineKey] = useState<string | null>(null);

  const isStrictSuperAdminRole = useMemo(() => {
    if (!currentUser) return false;
    const rawRole = String(currentUser.role || '').trim();
    const rawAppRole = String(currentUser.appRole || '').trim();
    const rawSecurityRole = String(currentUser.securityRole || '').trim();
    const rawAccessLevel = String(currentUser.accessLevel || '').trim();

    const nonSuperAdminRoles = [
      'DIRECTOR',
      'Director',
      'PROJECT_MANAGER',
      'Project Manager',
      'MANAGER',
      'Manager',
      'BIM Project Manager',
      'Assistant Manager',
      'BIM Specialist',
      'Lead Coordinator',
      'EDITOR',
      'Editor',
      'VIEWER',
      'Viewer',
    ];
    if (
      nonSuperAdminRoles.includes(rawSecurityRole) ||
      nonSuperAdminRoles.includes(rawAppRole) ||
      nonSuperAdminRoles.includes(rawRole) ||
      nonSuperAdminRoles.includes(rawAccessLevel)
    ) {
      return false;
    }

    return (
      rawRole === 'SUPER_ADMIN' ||
      rawAppRole === 'SUPER_ADMIN' ||
      rawSecurityRole === 'Super Admin' ||
      rawRole === 'Super Admin' ||
      rawAccessLevel === 'Super Admin'
    );
  }, [currentUser]);

  const hasSuperAdminOrDirectorRole = isStrictSuperAdminRole;
  const isSuperAdmin = isStrictSuperAdminRole && adminEditUnlocked;
  const isOnlySuperAdmin = isSuperAdmin;
  const canEditHours = isSuperAdmin;

  useEffect(() => {
    if (!isSuperAdmin) {
      setActiveInlineKey(null);
      setInlineDrafts({});
      setEditingActualDateProject(null);
      setProjectToDelete(null);
      setProjectToEdit(null);
    }
  }, [isSuperAdmin]);

  const handleStatusChange = (projectId: string, newStatus: ProjectStatus) => {
    if (!isSuperAdmin) {
      console.warn('Security Guard: Project status modification is restricted to SUPER_ADMIN.');
      return;
    }
    updateProjectStatus(projectId, newStatus);
  };

  const handleOpenDateOverride = (project: BimProject) => {
    if (!isSuperAdmin) {
      console.warn('Security Guard: Delivery date modification is restricted to SUPER_ADMIN.');
      return;
    }
    setEditingActualDateProject(project);
    setNewPlannedDateValue(project.plannedDeliveryDate || project.targetCompletionDate || '');
    setNewActualDateValue(project.actualDeliveredDate || '');
  };

  const handleSaveDateOverride = () => {
    if (!isSuperAdmin || !editingActualDateProject) {
      console.warn('Security Guard: Saving delivery dates is restricted to SUPER_ADMIN.');
      return;
    }
    const trimmedPlanned = newPlannedDateValue.trim();
    const trimmedActual = newActualDateValue.trim();
    updateProject(editingActualDateProject.id, {
      plannedDeliveryDate: trimmedPlanned,
      targetCompletionDate: trimmedPlanned,
      actualDeliveredDate: trimmedActual || undefined,
    });
    setEditingActualDateProject(null);
  };

  const handleConfirmDeleteProject = async () => {
    if (!isSuperAdmin || !projectToDelete) {
      console.warn('Security Guard: Project deletion is restricted to SUPER_ADMIN.');
      return;
    }
    const targetId = projectToDelete.id;
    setDeletedProjectIds((prev) => {
      const next = prev.includes(targetId) ? prev : [...prev, targetId];
      try {
        localStorage.setItem('bim_deleted_project_ids_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
    deleteProject(targetId);
    setProjectToDelete(null);
    try {
      await deleteDoc(doc(db, 'projects', targetId));
    } catch (err) {
      console.warn('Firestore deleteProject notice:', err);
    }
  };

  const handleHoursChange = async (
    projectId: string,
    field: 'totalLogged' | 'estimatedHours' | 'changedHours',
    value: number
  ) => {
    if (!isSuperAdmin) {
      console.warn('Security Guard: Project hours modification is restricted to SUPER_ADMIN.');
      return;
    }
    if (Number.isNaN(value) || value < 0) return;
    const targetProj = projects.find((p) => p.id === projectId);
    if (!targetProj) return;

    if (field === 'totalLogged') {
      const currentLoggedFromWorkLogs = combinedWorkLogs
        .filter((w) => !w.isTestEntry && !(w as any).isDeleted && doesLogBelongToProject(w, targetProj))
        .reduce((sum, w) => sum + (Number(w.hoursLogged) || 0), 0);

      // 1. Update local state immediately for instant UI feedback
      updateProject(projectId, {
        totalLogged: value,
        totalCompletedHours: value,
        manualHoursOverride: value,
        manualHoursBaseLogged: currentLoggedFromWorkLogs,
        isManualLoggedOverride: true,
      });

      // 2. Persist update to central database
      const payload = {
        id: targetProj.id,
        name: targetProj.name,
        projectName: targetProj.name,
        status: targetProj.status || 'WIP',
        estimatedHours: getProjectEstimatedHours(targetProj),
        totalEstimatedHours: getProjectEstimatedHours(targetProj),
        changedHours: getProjectChangedHours(targetProj),
        additionalHours: getProjectChangedHours(targetProj),
        totalLogged: value,
        totalHoursLogged: value,
        totalCompletedHours: value,
        manualHoursOverride: value,
        manualHoursBaseLogged: currentLoggedFromWorkLogs,
        isManualLoggedOverride: true,
        updatedAt: new Date().toISOString(),
      };
      try {
        fetch('/api/ssot/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {});
        await setDoc(doc(db, 'projects', projectId), payload, { merge: true });
      } catch (err) {
        console.warn('Firestore handleHoursChange totalLogged sync notice:', err);
      }
    } else if (field === 'estimatedHours') {
      // 1. Update local state immediately for instant UI feedback
      updateProject(projectId, {
        estimatedHours: value,
        totalEstimatedHours: value,
        manualEstimatedHoursOverride: value,
      });

      // 2. Persist update to central database
      const payload = {
        id: targetProj.id,
        name: targetProj.name,
        projectName: targetProj.name,
        status: targetProj.status || 'WIP',
        estimatedHours: value,
        totalEstimatedHours: value,
        manualEstimatedHoursOverride: value,
        changedHours: getProjectChangedHours(targetProj),
        additionalHours: getProjectChangedHours(targetProj),
        updatedAt: new Date().toISOString(),
      };
      try {
        fetch('/api/ssot/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {});
        await setDoc(doc(db, 'projects', projectId), payload, { merge: true });
      } catch (err) {
        console.warn('Firestore handleHoursChange estimatedHours sync notice:', err);
      }
    } else if (field === 'changedHours') {
      // 1. Update local state immediately for instant UI feedback
      updateProject(projectId, {
        changedHours: value,
        additionalHours: value,
        manualChangedHoursOverride: value,
      });

      // 2. Persist update to central database
      const payload = {
        id: targetProj.id,
        name: targetProj.name,
        projectName: targetProj.name,
        status: targetProj.status || 'WIP',
        estimatedHours: getProjectEstimatedHours(targetProj),
        totalEstimatedHours: getProjectEstimatedHours(targetProj),
        changedHours: value,
        additionalHours: value,
        manualChangedHoursOverride: value,
        updatedAt: new Date().toISOString(),
      };
      try {
        fetch('/api/ssot/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {});
        await setDoc(doc(db, 'projects', projectId), payload, { merge: true });
      } catch (err) {
        console.warn('Firestore handleHoursChange changedHours sync notice:', err);
      }
    }
  };

  const commitLoggedHours = (project: BimProject, rawValue: string) => {
    if (!isSuperAdmin) {
      setActiveInlineKey(null);
      setInlineDrafts({});
      return;
    }
    const loggedKey = `${project.id}:logged`;
    const effectiveRaw =
      inlineDrafts[loggedKey] !== undefined ? inlineDrafts[loggedKey] : rawValue;
    const parsed = parseFloat(effectiveRaw);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      handleHoursChange(project.id, 'totalLogged', parsed);
    }
    setActiveInlineKey((prev) => (prev === loggedKey ? null : prev));
    setInlineDrafts((prev) => {
      if (!(loggedKey in prev)) return prev;
      const next = { ...prev };
      delete next[loggedKey];
      return next;
    });
  };

  const commitEstimatedHours = (project: BimProject, rawValue: string) => {
    if (!isSuperAdmin) {
      setActiveInlineKey(null);
      setInlineDrafts({});
      return;
    }
    const estimatedKey = `${project.id}:estimated`;
    const effectiveRaw =
      inlineDrafts[estimatedKey] !== undefined ? inlineDrafts[estimatedKey] : rawValue;
    const parsed = parseFloat(effectiveRaw);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      handleHoursChange(project.id, 'estimatedHours', parsed);
    }
    setActiveInlineKey((prev) => (prev === estimatedKey ? null : prev));
    setInlineDrafts((prev) => {
      if (!(estimatedKey in prev)) return prev;
      const next = { ...prev };
      delete next[estimatedKey];
      return next;
    });
  };

  const commitChangedHours = (project: BimProject, rawValue: string) => {
    if (!isSuperAdmin) {
      setActiveInlineKey(null);
      setInlineDrafts({});
      return;
    }
    const changedKey = `${project.id}:changed`;
    const effectiveRaw =
      inlineDrafts[changedKey] !== undefined ? inlineDrafts[changedKey] : rawValue;
    const parsed = parseFloat(effectiveRaw);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      handleHoursChange(project.id, 'changedHours', parsed);
    }
    setActiveInlineKey((prev) => (prev === changedKey ? null : prev));
    setInlineDrafts((prev) => {
      if (!(changedKey in prev)) return prev;
      const next = { ...prev };
      delete next[changedKey];
      return next;
    });
  };

  const filterOptions = [
    { id: 'all', label: 'All Projects' },
    { id: 'WIP', label: 'WIP' },
    { id: 'On Track', label: 'On Track' },
    { id: 'At Risk', label: 'At Risk' },
    { id: 'HOLD', label: 'HOLD' },
    { id: 'CLOSED', label: 'CLOSED' },
  ];

  const activePortfolioProjects = projects.filter((p) => !deletedProjectIds.includes(p.id));

  const filteredProjects = activePortfolioProjects.filter((p) => {
    const matchesScope = selectedProjectId === 'all' || p.id === selectedProjectId;
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      (p.name || '').toLowerCase().includes(q) ||
      (p.code || '').toLowerCase().includes(q) ||
      (p.clientName || '').toLowerCase().includes(q) ||
      (p.location || '').toLowerCase().includes(q) ||
      (p.status || '').toLowerCase().includes(q);
    const matchesStatus =
      statusFilter === 'all' || p.status === statusFilter;
    const matchesDiscipline =
      disciplineFilter === 'all' ||
      (p.disciplines || []).some((d) => {
        if (d === disciplineFilter || d.toLowerCase() === disciplineFilter.toLowerCase()) {
          return true;
        }
        if (
          (disciplineFilter === 'BIM - ACS' || disciplineFilter === 'ACS') &&
          (d === 'BIM - ACS' ||
            d === 'ACS' ||
            d === ('Architecture' as any) ||
            d === 'Structure' ||
            d === 'Structural')
        ) {
          return true;
        }
        if (
          (disciplineFilter === 'BIM - MEP' || disciplineFilter === 'MEP') &&
          (d === 'BIM - MEP' ||
            d === 'MEP' ||
            d === 'MEP - HVAC' ||
            d === 'MEP - Electrical' ||
            d === 'MEP - Plumbing' ||
            d === 'Fire Protection' ||
            d === 'SES')
        ) {
          return true;
        }
        if (
          (disciplineFilter === 'Structure' || disciplineFilter === 'Structural') &&
          (d === 'Structure' || d === 'Structural')
        ) {
          return true;
        }
        return false;
      }) ||
      (disciplineFilter === 'SCAN TO BIM' &&
        `${p.name || ''} ${p.code || ''} ${p.description || ''}`
          .toUpperCase()
          .includes('SCAN')) ||
      (disciplineFilter === 'CAD' &&
        `${p.name || ''} ${p.code || ''} ${p.buildingType || ''}`
          .toUpperCase()
          .includes('CAD')) ||
      (p.typology || '').toLowerCase().includes(disciplineFilter.toLowerCase());
    return matchesScope && matchesSearch && matchesStatus && matchesDiscipline;
  });

  // Calculate total portfolio stats (Total Target Hours = Estimated Hours + Changed Hours / Additional Hours)
  const totalLoggedHours = activePortfolioProjects.reduce((sum, p) => sum + getProjectDynamicLoggedHours(p), 0);
  const totalEstimatedHours = activePortfolioProjects.reduce((sum, p) => sum + getProjectTargetHours(p), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Projects & Hours
            </h2>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Multi-Project Portfolio
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Tracking {projects.length} organizational BIM projects • {totalLoggedHours.toFixed(1)}h Total Logged / {totalEstimatedHours.toFixed(1)}h Estimated
          </p>
        </div>
        {hasSuperAdminOrDirectorRole && (
          <div className="flex items-center gap-2">
            {/* Super Admin Status Badge & Switcher */}
            <button
              onClick={() => {
                if (hasSuperAdminOrDirectorRole) {
                  setAdminEditUnlocked(!adminEditUnlocked);
                }
              }}
              disabled={!hasSuperAdminOrDirectorRole}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                isSuperAdmin
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 cursor-pointer'
                  : 'bg-slate-800 border-slate-700 text-slate-400 cursor-default'
              }`}
              title={
                hasSuperAdminOrDirectorRole
                  ? 'Super Admin / Director inline editing active (click to toggle lock)'
                  : 'Read-only mode: Super Admin or Director role required to edit hours inline'
              }
            >
              {isSuperAdmin ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {currentUser?.appRole === 'DIRECTOR' || currentUser?.accessLevel === 'Director' || currentUser?.securityRole === 'Director'
                      ? 'Director: Active'
                      : 'Super Admin: Active'}
                  </span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Super Admin: Locked</span>
                </>
              )}
            </button>

            <button
              onClick={onOpenNewProjectModal}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create New BIM Project</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter toolbar */}
      <div
        className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '12px',
          justifyContent: 'space-between'
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="flex items-center gap-2 w-full sm:w-72 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search projects, client, typology..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg pl-9 pr-3 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
            />
          </div>

          {/* BIM Disciplines Filter Dropdown */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-xs shrink-0">
            <Layers className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-slate-400 font-semibold whitespace-nowrap">BIM Discipline:</span>
            <select
              aria-label="Filter projects by BIM Discipline"
              value={disciplineFilter}
              onChange={(e) => setDisciplineFilter(e.target.value)}
              className="bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer pr-2"
            >
              <option value="all" className="bg-slate-900">All Disciplines</option>
              <option value="ACS" className="bg-slate-900">ACS</option>
              <option value="MEP" className="bg-slate-900">MEP</option>
              <option value="SCAN TO BIM" className="bg-slate-900">SCAN TO BIM</option>
              <option value="CAD" className="bg-slate-900">CAD</option>
              <option value="BIM - ACS" className="bg-slate-900">BIM - ACS</option>
              <option value="BIM - MEP" className="bg-slate-900">BIM - MEP</option>
              <option value="Structure" className="bg-slate-900">Structure</option>
              <option value="MEP - HVAC" className="bg-slate-900">MEP - HVAC</option>
              <option value="MEP - Electrical" className="bg-slate-900">MEP - Electrical</option>
              <option value="MEP - Plumbing" className="bg-slate-900">MEP - Plumbing</option>
              <option value="Fire Protection" className="bg-slate-900">Fire Protection</option>
              <option value="Infrastructure" className="bg-slate-900">Infrastructure</option>
              <option value="Façade / Envelope" className="bg-slate-900">Façade / Envelope</option>
              <option value="Coordination & QA" className="bg-slate-900">Coordination & QA</option>
              <option value="AI & Automation" className="bg-slate-900">AI & Automation</option>
              <option value="Estimation" className="bg-slate-900">Estimation</option>
            </select>
          </div>
        </div>

        {/* Status Filter buttons */}
        <div
          className="flex items-center gap-2 overflow-x-auto max-w-full"
          style={{ minWidth: 'fit-content', flexShrink: 0 }}
        >
          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs shrink-0">
            {filterOptions.map((opt) => {
              const count = opt.id === 'all'
                ? projects.length
                : projects.filter((p) => p.status === opt.id).length;
              return (
                <button
                  key={opt.id}
                  onClick={() => setStatusFilter(opt.id)}
                  className={`px-2.5 py-1 rounded font-medium transition whitespace-nowrap text-xs shrink-0 ${
                    statusFilter === opt.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table View */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto p-1 pb-3">
          <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/90 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700 text-[11px]">
                <tr>
                  <th className="py-3 px-4 min-w-[220px]">Project Name</th>
                  <th className="py-3 px-3 min-w-[140px]">
                    {isSuperAdmin ? 'Status (Manual Change)' : 'Status'}
                  </th>
                  <th className="py-3 px-3 min-w-[130px]">Total Hours Logged</th>
                  <th className="py-3 px-3 min-w-[120px]">Estimated Hours</th>
                  <th className="py-3 px-3 min-w-[160px]">Changed Hours / Additional Hours</th>
                  <th className="py-3 px-3 min-w-[130px]">Planned Delivery Date</th>
                  <th className="py-3 px-3 min-w-[150px]">
                    <div className="flex items-center gap-1.5">
                      <span>Actual Delivered Date</span>
                      <span className="p-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30" title="Locked - Super Admin Edit Only">
                        <Lock className="w-2.5 h-2.5" />
                      </span>
                    </div>
                  </th>
                  <th className="py-3 px-3 text-right min-w-[110px]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredProjects.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      <p className="text-sm font-semibold text-slate-400">No projects found.</p>
                      <p className="text-xs text-slate-500 mt-1">Click "Add Project" to get started.</p>
                    </td>
                  </tr>
                ) : (
                  filteredProjects.map((project) => {
                    const completed = getProjectDynamicLoggedHours(project);
                    const assignedHours = getProjectAssignedHours(project);
                    const estimated = getProjectEstimatedHours(project);
                    const changedHours = getProjectChangedHours(project);
                    const totalTargetHours = getProjectTargetHours(project);
                    const remainingHours = totalTargetHours - assignedHours;
                    const pct = totalTargetHours > 0
                      ? Math.round((assignedHours / totalTargetHours) * 100)
                      : assignedHours > 0 ? 100 : 0;
                    const isOver = assignedHours > totalTargetHours && totalTargetHours > 0;
                    const isZeroEstOver = totalTargetHours === 0 && assignedHours > 0;
                    const plannedDate = project.plannedDeliveryDate || project.targetCompletionDate;
                    const actualDate = project.actualDeliveredDate;
                    const varianceInfo = calculateDeliveryVariance(plannedDate, actualDate, project.status);

                    const loggedKey = `${project.id}:logged`;
                    const estimatedKey = `${project.id}:estimated`;
                    const changedKey = `${project.id}:changed`;

                    return (
                      <tr
                        key={project.id}
                        className="hover:bg-slate-800/50 transition cursor-pointer group"
                        onClick={() => onSelectProject(project)}
                      >
                        {/* Project Name (Only project name, no description below) */}
                        <td className="py-2.5 px-4">
                          {isSuperAdmin ? (
                            <div className="flex items-center justify-between gap-2 font-semibold text-white group-hover:text-blue-300 transition text-[13px] whitespace-nowrap">
                              <span>{project.name}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isSuperAdmin) return;
                                  onSelectProject(project);
                                }}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition shrink-0"
                                title={`Edit Project: ${project.name} (Super Admin Only)`}
                                aria-label={`Edit project ${project.name}`}
                              >
                                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                              </button>
                            </div>
                          ) : (
                            <div className="font-semibold text-white group-hover:text-blue-300 transition text-[13px] whitespace-nowrap">
                              {project.name}
                            </div>
                          )}
                        </td>

                        {/* Status with Manual Select Dropdown (Super Admin only) */}
                        <td
                          className="py-2.5 px-3"
                          onClick={(e) => {
                            if (isSuperAdmin) e.stopPropagation();
                          }}
                        >
                          {isSuperAdmin ? (
                            <div className="relative inline-block">
                              <select
                                value={project.status}
                                disabled={!isSuperAdmin}
                                onChange={(e) => {
                                  handleStatusChange(project.id, e.target.value as ProjectStatus);
                                }}
                                className={`appearance-none font-semibold text-[11px] px-2.5 py-1 pr-6 rounded-md border cursor-pointer focus:outline-none transition shadow-xs ${getProjectStatusStyle(
                                  project.status
                                )}`}
                              >
                                <option value="WIP" className="bg-slate-900 text-cyan-300">WIP</option>
                                <option value="On Track" className="bg-slate-900 text-emerald-300">On Track</option>
                                <option value="At Risk" className="bg-slate-900 text-amber-300">At Risk</option>
                                <option value="HOLD" className="bg-slate-900 text-orange-300">HOLD</option>
                                <option value="CLOSED" className="bg-slate-900 text-slate-300">CLOSED</option>
                                <option value="Completed" className="bg-slate-900 text-emerald-300">Completed</option>
                              </select>
                              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          ) : (
                            <span
                              className={`inline-block font-semibold text-[11px] px-2.5 py-1 rounded-md border shadow-xs ${getProjectStatusStyle(
                                project.status
                              )}`}
                            >
                              {project.status}
                            </span>
                          )}
                        </td>

                        {/* Total Hours Logged */}
                        <td
                          className="py-2.5 px-3"
                          onClick={(e) => {
                            if (canEditHours) e.stopPropagation();
                          }}
                          onDoubleClick={(e) => {
                            if (canEditHours) {
                              e.stopPropagation();
                              setActiveInlineKey(loggedKey);
                              setInlineDrafts((prev) => ({
                                ...prev,
                                [loggedKey]: String(Number(completed.toFixed(1))),
                              }));
                            }
                          }}
                        >
                          {canEditHours ? (
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                aria-label={`Total Hours Logged for ${project.name}`}
                                value={
                                  inlineDrafts[loggedKey] !== undefined
                                    ? inlineDrafts[loggedKey]
                                    : Number(completed.toFixed(1))
                                }
                                onFocus={(e) => {
                                  setActiveInlineKey(loggedKey);
                                  setInlineDrafts((prev) =>
                                    prev[loggedKey] !== undefined
                                      ? prev
                                      : {
                                          ...prev,
                                          [loggedKey]: String(Number(completed.toFixed(1))),
                                        }
                                  );
                                  e.currentTarget.select();
                                }}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setActiveInlineKey(loggedKey);
                                  setInlineDrafts((prev) => ({
                                    ...prev,
                                    [loggedKey]: val,
                                  }));
                                }}
                                onBlur={(e) => commitLoggedHours(project, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitLoggedHours(project, e.currentTarget.value);
                                    e.currentTarget.blur();
                                  } else if (e.key === 'Escape') {
                                    setActiveInlineKey(null);
                                    setInlineDrafts((prev) => {
                                      const next = { ...prev };
                                      delete next[loggedKey];
                                      return next;
                                    });
                                    e.currentTarget.blur();
                                  }
                                }}
                                className="w-20 bg-slate-800/90 hover:bg-slate-800 focus:bg-slate-950 text-slate-100 font-bold text-[12px] font-mono px-2 py-1 rounded border border-slate-700 hover:border-amber-500/50 focus:border-amber-400 focus:outline-none transition"
                                title="Super Admin / Manager: Click or double-click to edit Total Hours Logged (Enter or blur to save)"
                              />
                              <span className="text-slate-500 text-[10px]">hrs</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span className="font-bold text-slate-100 text-[12px] font-mono">
                                {completed.toFixed(1)}
                              </span>
                              <span className="text-slate-500 text-[10px]">hrs</span>
                            </div>
                          )}
                        </td>

                        {/* Estimated Hours */}
                        <td
                          className="py-2.5 px-3"
                          onClick={(e) => {
                            if (canEditHours) e.stopPropagation();
                          }}
                          onDoubleClick={(e) => {
                            if (canEditHours) {
                              e.stopPropagation();
                              setActiveInlineKey(estimatedKey);
                              setInlineDrafts((prev) => ({
                                ...prev,
                                [estimatedKey]: String(Number(estimated.toFixed(1))),
                              }));
                            }
                          }}
                        >
                          {canEditHours ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                aria-label={`Estimated Hours for ${project.name}`}
                                value={
                                  inlineDrafts[estimatedKey] !== undefined
                                    ? inlineDrafts[estimatedKey]
                                    : Number(estimated.toFixed(1))
                                }
                                onFocus={(e) => {
                                  setActiveInlineKey(estimatedKey);
                                  setInlineDrafts((prev) =>
                                    prev[estimatedKey] !== undefined
                                      ? prev
                                      : {
                                          ...prev,
                                          [estimatedKey]: String(Number(estimated.toFixed(1))),
                                        }
                                  );
                                  e.currentTarget.select();
                                }}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setActiveInlineKey(estimatedKey);
                                  setInlineDrafts((prev) => ({
                                    ...prev,
                                    [estimatedKey]: val,
                                  }));
                                }}
                                onBlur={(e) => commitEstimatedHours(project, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitEstimatedHours(project, e.currentTarget.value);
                                    e.currentTarget.blur();
                                  } else if (e.key === 'Escape') {
                                    setActiveInlineKey(null);
                                    setInlineDrafts((prev) => {
                                      const next = { ...prev };
                                      delete next[estimatedKey];
                                      return next;
                                    });
                                    e.currentTarget.blur();
                                  }
                                }}
                                className="w-20 bg-slate-800/90 hover:bg-slate-800 focus:bg-slate-950 text-slate-200 font-semibold text-[12px] font-mono px-2 py-1 rounded border border-slate-700 hover:border-amber-500/50 focus:border-amber-400 focus:outline-none transition"
                                title="Super Admin / Manager: Click or double-click to edit Estimated Hours (Enter or blur to save)"
                              />
                              <span className="text-slate-500 text-[10px]">hrs</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-300 text-[12px] font-mono">
                                {estimated.toFixed(1)}
                              </span>
                              <span className="text-slate-500 text-[10px]">hrs</span>
                            </div>
                          )}
                        </td>

                        {/* Changed Hours / Additional Hours */}
                        <td
                          className="py-2.5 px-3"
                          onClick={(e) => {
                            if (canEditHours) e.stopPropagation();
                          }}
                          onDoubleClick={(e) => {
                            if (canEditHours) {
                              e.stopPropagation();
                              setActiveInlineKey(changedKey);
                              setInlineDrafts((prev) => ({
                                ...prev,
                                [changedKey]: String(Number(changedHours.toFixed(1))),
                              }));
                            }
                          }}
                        >
                          {canEditHours ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                aria-label={`Changed Hours / Additional Hours for ${project.name}`}
                                value={
                                  inlineDrafts[changedKey] !== undefined
                                    ? inlineDrafts[changedKey]
                                    : Number(changedHours.toFixed(1))
                                }
                                onFocus={(e) => {
                                  setActiveInlineKey(changedKey);
                                  setInlineDrafts((prev) =>
                                    prev[changedKey] !== undefined
                                      ? prev
                                      : {
                                          ...prev,
                                          [changedKey]: String(Number(changedHours.toFixed(1))),
                                        }
                                  );
                                  e.currentTarget.select();
                                }}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setActiveInlineKey(changedKey);
                                  setInlineDrafts((prev) => ({
                                    ...prev,
                                    [changedKey]: val,
                                  }));
                                }}
                                onBlur={(e) => commitChangedHours(project, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitChangedHours(project, e.currentTarget.value);
                                    e.currentTarget.blur();
                                  } else if (e.key === 'Escape') {
                                    setActiveInlineKey(null);
                                    setInlineDrafts((prev) => {
                                      const next = { ...prev };
                                      delete next[changedKey];
                                      return next;
                                    });
                                    e.currentTarget.blur();
                                  }
                                }}
                                className="w-20 bg-slate-800/90 hover:bg-slate-800 focus:bg-slate-950 text-slate-200 font-semibold text-[12px] font-mono px-2 py-1 rounded border border-slate-700 hover:border-amber-500/50 focus:border-amber-400 focus:outline-none transition"
                                title="Super Admin / Manager: Click or double-click to edit Changed Hours / Additional Hours (Enter or blur to save)"
                              />
                              <span className="text-slate-500 text-[10px]">hrs</span>
                              {changedHours > 0 && (
                                <span
                                  className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded whitespace-nowrap"
                                  title="Total Target Hours = Estimated Hours + Changed / Additional Hours"
                                >
                                  Total: {Number(totalTargetHours.toFixed(1))}h
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-300 text-[12px] font-mono">
                                {changedHours.toFixed(1)}
                              </span>
                              <span className="text-slate-500 text-[10px]">hrs</span>
                              {changedHours > 0 && (
                                <span
                                  className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded whitespace-nowrap"
                                  title="Total Target Hours = Estimated Hours + Changed / Additional Hours"
                                >
                                  Total: {Number(totalTargetHours.toFixed(1))}h
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Planned Delivery Date */}
                        <td className="py-2.5 px-3 font-medium text-slate-200" onClick={(e) => { if (isSuperAdmin) e.stopPropagation(); }}>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{plannedDate || '—'}</span>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => handleOpenDateOverride(project)}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition"
                                title="Edit Planned & Actual Delivery Dates (Super Admin Privilege)"
                              >
                                <Edit3 className="w-3 h-3 text-amber-400" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Actual Delivered Date (Locked - Super Admin Only) */}
                        <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                          {isSuperAdmin ? (
                            <div className="flex items-center gap-1.5">
                              {actualDate ? (
                                <div className="flex items-center gap-1 font-medium text-emerald-300">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>{actualDate}</span>
                                </div>
                              ) : (
                                <span className="text-slate-500 font-mono text-xs">—</span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenDateOverride(project)}
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition"
                                title="Edit Actual Delivered Date (Super Admin Privilege)"
                              >
                                <Edit3 className="w-3 h-3 text-amber-400" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 font-medium text-slate-400" title="Locked - Super Admin Only">
                              <Lock className="w-3 h-3 text-slate-500 shrink-0" />
                              <span className={actualDate ? 'text-slate-300' : 'text-slate-500'}>
                                {actualDate || 'Locked'}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Action */}
                        <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onSelectProject(project)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white transition font-medium text-[11px]"
                            >
                              View
                            </button>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isSuperAdmin) return;
                                  onSelectProject(project);
                                }}
                                className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/20 hover:border-amber-500/40 transition"
                                title={`Edit project ${project.name} (Super Admin Only)`}
                                aria-label={`Edit project ${project.name}`}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!isSuperAdmin) return;
                                  setProjectToDelete(project);
                                }}
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/40 transition"
                                title="Are you sure you want to permanently delete this project record?"
                                aria-label={`Delete project ${project.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
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

      {/* Super Admin Confirmation Modal: Delete Project Record */}
      {isSuperAdmin && projectToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Confirm Project Deletion</h3>
                  <p className="text-[11px] text-slate-400">Permanent Firestore record removal</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-200 font-semibold text-sm">
                Are you sure you want to permanently delete this project record?
              </p>
              <div className="p-3 rounded-xl bg-slate-800/70 border border-slate-700/80 space-y-1">
                <div className="font-bold text-white">{projectToDelete.name}</div>
                <div className="text-[11px] text-slate-400">
                  Code: <span className="font-mono text-slate-300">{projectToDelete.code}</span> • Status:{' '}
                  <span className="text-slate-300">{projectToDelete.status}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteProject}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Project</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Super Admin Modal: Edit Actual Delivered Date */}
      {isSuperAdmin && editingActualDateProject && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Super Admin Date Override</h3>
                  <p className="text-[11px] text-slate-400">Lock protected field</p>
                </div>
              </div>
              <button
                onClick={() => setEditingActualDateProject(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Target Project:</span>
                <strong className="text-white font-semibold text-xs">{editingActualDateProject.name}</strong>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block text-[11px] mb-1">
                  Planned Delivery Date:
                </label>
                <input
                  type="text"
                  placeholder="e.g. 18-08-2026 or 2026-08-18"
                  value={newPlannedDateValue}
                  onChange={(e) => setNewPlannedDateValue(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block text-[11px] mb-1">
                  Actual Delivered Date (DD-MM-YYYY or YYYY-MM-DD) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 18-08-2026 or 2026-08-18"
                  value={newActualDateValue}
                  onChange={(e) => setNewActualDateValue(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Leave empty to mark as WIP/In-Progress without delivery timestamp.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 text-xs">
              <button
                onClick={() => setEditingActualDateProject(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDateOverride}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Date</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Super Admin Edit Project Modal */}
      {isSuperAdmin && (
        <NewProjectModal
          isOpen={Boolean(projectToEdit)}
          onClose={() => setProjectToEdit(null)}
          projectToEdit={projectToEdit}
        />
      )}
    </div>
  );
};
