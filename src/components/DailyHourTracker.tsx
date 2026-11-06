import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Calendar,
  Filter,
  Plus,
  Search,
  CheckCircle2,
  Trash2,
  Edit2,
  Download,
  Building,
  User,
  Tag,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  FileSpreadsheet,
  X,
  Check,
  AlertTriangle,
} from 'lucide-react';
import {
  useBimData,
  getCurrentWeekRange,
  getEffectiveLogDate,
  normalizeDateToIso,
  toLocalIsoDate,
  isUserSuperAdmin,
  isUserViewer,
  cleanProjectName,
  getMemberLabel,
  sanitizeEmployeeRecord,
  sanitizeWorkLogRecord,
  isRecordOwnedByMember,
  isRemovedMockMember,
} from '../context/BimDataContext';
import { normalizeUserRole } from '../auth/googleAuth';
import { generateRequestDocId } from '../auth/roleSync';
import { db } from '../firebase/config';
import { collection, deleteDoc, doc, getDocs, onSnapshot } from 'firebase/firestore';
import { DailyWorkLog, Discipline, ActivityType, LODLevel, Employee } from '../types';

interface DailyHourTrackerProps {
  onOpenLogModal: () => void;
}

export const DailyHourTracker: React.FC<DailyHourTrackerProps> = ({
  onOpenLogModal,
}) => {
  const {
    workLogs,
    allWorkLogs,
    employees,
    projects,
    resourceAllocations,
    addWorkLog,
    updateWorkLog,
    deleteWorkLog,
    deleteEmployee,
    getEmployeeLoggedHours,
    currentUser,
  } = useBimData();

  const isDirector = useMemo(() => {
    if (!currentUser) return false;
    return (
      currentUser.securityRole === 'Director' ||
      currentUser.appRole === 'DIRECTOR' ||
      currentUser.accessLevel === 'Director' ||
      currentUser.role === 'Director'
    );
  }, [currentUser]);

  const isSuperAdmin = useMemo(() => isUserSuperAdmin(currentUser), [currentUser]);

  const isViewer = useMemo(() => {
    if (!currentUser) return true;
    if (isSuperAdmin || isDirector) return false;
    const norm = normalizeUserRole(currentUser.appRole || currentUser.role || '');
    if (norm === 'SUPER_ADMIN' || norm === 'DIRECTOR') return false;
    return (
      norm === 'VIEWER' ||
      currentUser.securityRole === 'Viewer' ||
      currentUser.accessLevel === 'Viewer' ||
      currentUser.role === 'Viewer' ||
      currentUser.role === 'VIEWER' ||
      currentUser.appRole === 'VIEWER' ||
      isUserViewer(currentUser, true, currentUser.securityRole)
    );
  }, [currentUser, isSuperAdmin, isDirector]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('all');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState('all');
  const [selectedDisciplineFilter, setSelectedDisciplineFilter] = useState('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'operational' | 'test'>('all');
  const [activeView, setActiveView] = useState<'matrix' | 'logs'>('matrix');

  // Edit & Delete confirmation states
  const [logToDelete, setLogToDelete] = useState<DailyWorkLog | null>(null);
  const [deleteCandidateLogs, setDeleteCandidateLogs] = useState<DailyWorkLog[]>([]);
  const [matrixTargetMember, setMatrixTargetMember] = useState<{
    id: string;
    name: string;
    email?: string;
  } | null>(null);
  const [deletedMatrixEmpIds, setDeletedMatrixEmpIds] = useState<string[]>([]);
  const [editingLog, setEditingLog] = useState<DailyWorkLog | null>(null);
  const [editCandidateLogs, setEditCandidateLogs] = useState<DailyWorkLog[]>([]);
  const [modifiedMatrixEmpIds, setModifiedMatrixEmpIds] = useState<string[]>([]);
  const [matrixDeleteNotice, setMatrixDeleteNotice] = useState<string | null>(null);

  const showMatrixDeleteNotice = (message: string) => {
    setMatrixDeleteNotice(message);
    window.setTimeout(() => {
      setMatrixDeleteNotice((current) => (current === message ? null : current));
    }, 4000);
  };

  // Edit form fields
  const [editEmployeeId, setEditEmployeeId] = useState('');
  const [editProjectId, setEditProjectId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editHours, setEditHours] = useState<number>(4);
  const [editLodStage, setEditLodStage] = useState<LODLevel>('LOD 350');
  const [editDiscipline, setEditDiscipline] = useState<Discipline>('BIM - ACS');
  const [editActivityType, setEditActivityType] = useState<ActivityType>('3D Detailed Modeling');
  const [editTaskName, setEditTaskName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editBillable, setEditBillable] = useState<boolean>(true);
  const [editIsTestEntry, setEditIsTestEntry] = useState<boolean>(false);

  const openEditLogModal = (log: DailyWorkLog, candidates: DailyWorkLog[] = []) => {
    const clonedLog: DailyWorkLog = sanitizeWorkLogRecord({ ...log });
    const clonedCandidates = candidates.map((c) => sanitizeWorkLogRecord({ ...c }));
    const matchedOwner = allTrackedEmployees.find((emp) => doesLogMatchEmployee(clonedLog, emp));
    const resolvedEmpId = matchedOwner?.id || clonedLog.employeeId || '';
    if (matchedOwner) {
      clonedLog.employeeId = matchedOwner.id;
      clonedLog.memberId = matchedOwner.id;
      clonedLog.userId = matchedOwner.id;
      clonedLog.employeeName = matchedOwner.name;
      if (matchedOwner.email) {
        clonedLog.memberEmail = matchedOwner.email;
        clonedLog.userEmail = matchedOwner.email;
      }
    }
    setEditingLog(clonedLog);
    setEditCandidateLogs(clonedCandidates);
    setEditEmployeeId(resolvedEmpId);
    setEditProjectId(clonedLog.projectId || projects[0]?.id || '');
    setEditDate(clonedLog.date || toLocalIsoDate(new Date()));
    setEditHours(Number(clonedLog.hoursLogged) || 0);
    setEditLodStage(clonedLog.lodStage || 'LOD 350');
    setEditDiscipline(clonedLog.discipline || 'BIM - ACS');
    setEditActivityType(clonedLog.activityType || '3D Detailed Modeling');
    setEditTaskName('');
    setEditNotes(clonedLog.notes || '');
    setEditBillable(clonedLog.billable !== undefined ? Boolean(clonedLog.billable) : true);
    setEditIsTestEntry(Boolean(clonedLog.isTestEntry));
  };

  const buildCleanDraftLogForMember = (
    emp: { id: string; name: string; email?: string; discipline?: Discipline; primaryDiscipline?: Discipline },
    draftDate: string
  ): DailyWorkLog => {
    const cleanEmp = sanitizeEmployeeRecord(emp as Employee);
    const matchingAllocs = findMatchingAllocationsForMember(cleanEmp);
    const primaryAlloc = matchingAllocs[0];
    const defaultProj =
      (primaryAlloc && projects.find((p) => p.id === primaryAlloc.projectId)) ||
      projects[0];
    return sanitizeWorkLogRecord({
      id: '__new_matrix_log__',
      employeeId: cleanEmp.id,
      memberId: cleanEmp.id,
      userId: cleanEmp.id,
      employeeName: cleanEmp.name,
      memberEmail: cleanEmp.email || primaryAlloc?.memberEmail || '',
      userEmail: cleanEmp.email || primaryAlloc?.memberEmail || '',
      projectId: primaryAlloc?.projectId || defaultProj?.id || '',
      projectName: primaryAlloc?.projectName || defaultProj?.name || 'BIM Project',
      date: draftDate,
      hoursLogged: 8,
      discipline:
        (primaryAlloc?.discipline as Discipline) ||
        cleanEmp.discipline ||
        cleanEmp.primaryDiscipline ||
        'BIM - ACS',
      activityType: '3D Detailed Modeling',
      taskName: '',
      lodStage: (primaryAlloc?.lod as LODLevel) || defaultProj?.currentLOD || 'LOD 350',
      notes: '',
      billable: true,
      timestamp: new Date().toISOString(),
      isTestEntry: logTypeFilter === 'test',
    });
  };

  const openMatrixRowEditModal = (
    emp: { id: string; name: string; email?: string; discipline?: Discipline; primaryDiscipline?: Discipline },
    empLogs: DailyWorkLog[],
    preferredDate?: string
  ) => {
    const cleanEmp = sanitizeEmployeeRecord(emp as Employee);
    // Filter and bind logs strictly belonging to this specific member
    const memberSpecificLogs = empLogs
      .filter((w) => doesLogMatchEmployee(w, cleanEmp))
      .map((w) => ({
        ...sanitizeWorkLogRecord(w),
        employeeId: cleanEmp.id,
        memberId: cleanEmp.id,
        userId: cleanEmp.id,
        employeeName: cleanEmp.name,
        memberEmail: cleanEmp.email || w.memberEmail || '',
        userEmail: cleanEmp.email || w.userEmail || '',
      }));

    const matchingDayLogs = preferredDate
      ? memberSpecificLogs.filter(
          (w) =>
            getEffectiveLogDate(w, currentWeekRange) === preferredDate ||
            normalizeDateToIso(w.date) === preferredDate ||
            w.date === preferredDate
        )
      : [];
    const targetLog = preferredDate ? matchingDayLogs[0] : memberSpecificLogs[0];

    if (targetLog) {
      const totalDayHours =
        matchingDayLogs.length > 1
          ? matchingDayLogs.reduce((sum, l) => sum + (Number(l.hoursLogged) || 0), 0)
          : Number(targetLog.hoursLogged) || 0;
      openEditLogModal(
        {
          ...targetLog,
          employeeId: cleanEmp.id,
          memberId: cleanEmp.id,
          userId: cleanEmp.id,
          employeeName: cleanEmp.name,
          memberEmail: cleanEmp.email || targetLog.memberEmail || '',
          userEmail: cleanEmp.email || targetLog.userEmail || '',
          hoursLogged: totalDayHours,
        },
        memberSpecificLogs
      );
      return;
    }

    const draftDate = preferredDate || toLocalIsoDate(new Date());
    const draftLog = buildCleanDraftLogForMember(cleanEmp, draftDate);
    openEditLogModal(draftLog, memberSpecificLogs);
  };

  const findMatchingAllocationsForMember = (emp: { id: string; name?: string; email?: string }) => {
    const empId = (emp.id || '').trim();
    const empIdStripped = empId.replace(/^emp-/, '');
    const empEmail = (emp.email || '').toLowerCase().trim();
    const empName = (emp.name || '').toLowerCase().trim();

    return (resourceAllocations || []).filter((alloc) => {
      const raw = alloc as any;
      const aId = (alloc.employeeId || raw.memberId || raw.assignedTo || '').trim();
      const aIdStripped = aId.replace(/^emp-/, '');
      const aEmail = (alloc.memberEmail || raw.assignedToEmail || '').toLowerCase().trim();
      const aName = (alloc.employeeName || raw.assignedToName || raw.memberName || '').toLowerCase().trim();

      if (empName && aName && empName !== aName) {
        return false;
      }

      return (
        (empId && (aId === empId || (empIdStripped && aIdStripped === empIdStripped) || alloc.id === empId)) ||
        (empEmail && aEmail && aEmail === empEmail) ||
        (empName && aName && aName === empName)
      );
    });
  };

  const openMatrixRowDeleteModal = (
    emp: { id: string; name: string; email?: string; discipline?: Discipline },
    empWeekLogs: DailyWorkLog[],
    empAllLogs: DailyWorkLog[] = []
  ) => {
    setMatrixTargetMember(emp);
    const candidateLogs = empWeekLogs.length > 0 ? empWeekLogs : empAllLogs;
    if (candidateLogs.length > 0) {
      setDeleteCandidateLogs(candidateLogs);
      setLogToDelete(candidateLogs[0]);
      return;
    }

    const matchingAllocs = findMatchingAllocationsForMember(emp);
    const primaryAlloc = matchingAllocs[0];
    const fallbackRecord: DailyWorkLog = {
      id: primaryAlloc?.id || emp.id || '__fallback_allocation_delete__',
      employeeId: emp.id,
      employeeName: emp.name,
      memberEmail: emp.email || primaryAlloc?.memberEmail || '',
      userEmail: emp.email || primaryAlloc?.memberEmail || '',
      projectId: primaryAlloc?.projectId || projects[0]?.id || '',
      projectName: primaryAlloc?.projectName || 'Assigned Hours / Allocation',
      date: currentWeekRange.startIso,
      hoursLogged: primaryAlloc ? Number(primaryAlloc.assignedHours) || 0 : 0,
      discipline: (primaryAlloc?.discipline as Discipline) || emp.discipline || 'BIM - ACS',
      activityType: '3D Detailed Modeling',
      taskName: primaryAlloc?.taskType || 'Resource Allocation',
      lodStage: (primaryAlloc?.lod as LODLevel) || 'LOD 350',
      notes: 'Fallback allocation / matrix row deletion',
      billable: true,
      timestamp: new Date().toISOString(),
    };
    setDeleteCandidateLogs([]);
    setLogToDelete(fallbackRecord);
  };

  const handleSaveEditedLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog) return;

    const matchedProj = projects.find((p) => p.id === editProjectId);
    const rawMatchedEmp = allTrackedEmployees.find(
      (emp) =>
        emp.id === editEmployeeId ||
        emp.id.replace(/^emp-/, '') === editEmployeeId.replace(/^emp-/, '')
    );
    const matchedEmp = rawMatchedEmp ? sanitizeEmployeeRecord(rawMatchedEmp) : undefined;

    const isSameMemberAsOriginal = matchedEmp
      ? doesLogMatchEmployee(editingLog, matchedEmp)
      : editEmployeeId === editingLog.employeeId;

    const targetEmpId = matchedEmp?.id || editEmployeeId || editingLog.employeeId;
    const targetEmpName =
      matchedEmp?.name || (isSameMemberAsOriginal ? editingLog.employeeName : 'BIM Modeler');
    const targetEmpEmail = (
      matchedEmp?.email ||
      (isSameMemberAsOriginal ? editingLog.memberEmail || editingLog.userEmail : '') ||
      ''
    )
      .trim()
      .toLowerCase();
    const targetProjectId = matchedProj?.id || editProjectId || editingLog.projectId;
    const targetProjectName = matchedProj?.name || editingLog.projectName || 'BIM Project';

    if (targetEmpId) {
      setModifiedMatrixEmpIds((prev) =>
        prev.includes(targetEmpId) ? prev : [...prev, targetEmpId]
      );
      setDeletedMatrixEmpIds((prev) => prev.filter((id) => id !== targetEmpId));
    }

    const allSourceLogs = allWorkLogs && allWorkLogs.length > 0 ? allWorkLogs : workLogs || [];
    const sameMemberSameDayLogs = matchedEmp
      ? allSourceLogs.filter(
          (w) =>
            doesLogMatchEmployee(w, matchedEmp) &&
            (getEffectiveLogDate(w, currentWeekRange) === editDate || w.date === editDate) &&
            Boolean(w.isTestEntry) === Boolean(editIsTestEntry)
        )
      : [];

    if (editingLog.id === '__new_matrix_log__' || !isSameMemberAsOriginal) {
      const existingTargetDayLog = sameMemberSameDayLogs[0];
      if (existingTargetDayLog) {
        updateWorkLog(existingTargetDayLog.id, {
          employeeId: targetEmpId,
          memberId: targetEmpId,
          userId: targetEmpId,
          employeeName: targetEmpName,
          memberEmail: targetEmpEmail,
          userEmail: targetEmpEmail,
          projectId: targetProjectId,
          projectName: targetProjectName,
          date: editDate,
          hoursLogged: Number(editHours) || 0,
          lodStage: editLodStage,
          discipline: editDiscipline,
          activityType: editActivityType,
          taskName: editTaskName || '',
          notes: editNotes,
          billable: Boolean(editBillable),
          isTestEntry: Boolean(editIsTestEntry),
        });
        sameMemberSameDayLogs.slice(1).forEach((dup) => {
          deleteWorkLog(dup.id);
        });
      } else {
        addWorkLog({
          employeeId: targetEmpId,
          memberId: targetEmpId,
          userId: targetEmpId,
          employeeName: targetEmpName,
          memberEmail: targetEmpEmail,
          userEmail: targetEmpEmail,
          projectId: targetProjectId,
          projectName: targetProjectName,
          date: editDate,
          hoursLogged: Number(editHours) || 0,
          lodStage: editLodStage,
          discipline: editDiscipline,
          activityType: editActivityType,
          taskName: editTaskName || '',
          notes: editNotes,
          billable: Boolean(editBillable),
          isTestEntry: Boolean(editIsTestEntry),
        });
      }
    } else {
      updateWorkLog(editingLog.id, {
        employeeId: targetEmpId,
        memberId: targetEmpId,
        userId: targetEmpId,
        employeeName: targetEmpName,
        memberEmail: targetEmpEmail,
        userEmail: targetEmpEmail,
        projectId: targetProjectId,
        projectName: targetProjectName,
        date: editDate,
        hoursLogged: Number(editHours) || 0,
        lodStage: editLodStage,
        discipline: editDiscipline,
        activityType: editActivityType,
        taskName: editTaskName || '',
        notes: editNotes,
        billable: Boolean(editBillable),
        isTestEntry: Boolean(editIsTestEntry),
      });
      // Remove any duplicate same-day logs for this same user that were collapsed into the matrix cell
      sameMemberSameDayLogs
        .filter((dup) => dup.id !== editingLog.id)
        .forEach((dup) => {
          deleteWorkLog(dup.id);
        });
    }

    setEditingLog(null);
    setEditCandidateLogs([]);
  };

  const deleteFallbackAllocationsForMember = async (
    targetEmp: { id: string; name?: string; email?: string },
    fallbackDocId?: string
  ) => {
    const empId = (targetEmp.id || '').trim();
    const empIdStripped = empId.replace(/^emp-/, '');
    const empEmail = (targetEmp.email || '').toLowerCase().trim();
    const empName = (targetEmp.name || '').toLowerCase().trim();

    const matchingAllocs = findMatchingAllocationsForMember(targetEmp);
    const docIdsToDelete = new Set<string>();
    if (fallbackDocId && fallbackDocId !== '__fallback_allocation_delete__') {
      docIdsToDelete.add(fallbackDocId);
    }
    if (empId) docIdsToDelete.add(empId);
    if (empIdStripped) docIdsToDelete.add(empIdStripped);
    matchingAllocs.forEach((a) => {
      if (a.id) docIdsToDelete.add(a.id);
    });

    // Update local allocations cache & notify listeners immediately
    try {
      const saved = localStorage.getItem('bim_resource_allocations_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const remaining = parsed.filter((alloc: any) => {
            const aId = (alloc.employeeId || alloc.memberId || alloc.assignedTo || '').trim();
            const aIdStripped = aId.replace(/^emp-/, '');
            const aEmail = (alloc.memberEmail || alloc.assignedToEmail || '').toLowerCase().trim();
            const aName = (alloc.employeeName || '').toLowerCase().trim();
            const isMatch =
              docIdsToDelete.has(alloc.id) ||
              (empId && (aId === empId || (empIdStripped && aIdStripped === empIdStripped))) ||
              (empEmail && aEmail && aEmail === empEmail) ||
              (empName && aName && aName === empName);
            return !isMatch;
          });
          localStorage.setItem('bim_resource_allocations_v2', JSON.stringify(remaining));
          window.dispatchEvent(new CustomEvent('bim_resource_allocations_updated', { detail: remaining }));
        }
      }
    } catch {}

    // Delete matching documents directly from Firestore assigned_hours, allocations, and project_assignments
    for (const docId of Array.from(docIdsToDelete)) {
      try {
        await deleteDoc(doc(db, 'assigned_hours', docId));
      } catch {}
      try {
        await deleteDoc(doc(db, 'allocations', docId));
      } catch {}
      try {
        await deleteDoc(doc(db, 'project_assignments', docId));
      } catch {}
    }

    // Also scan assigned_hours and allocations collections for any documents referencing this member
    for (const colName of ['assigned_hours', 'allocations', 'project_assignments']) {
      try {
        const snap = await getDocs(collection(db, colName));
        for (const d of snap.docs) {
          const data = d.data() || {};
          const dEmpId = String(data.employeeId || data.memberId || data.assignedTo || '').trim();
          const dEmpIdStripped = dEmpId.replace(/^emp-/, '');
          const dEmail = String(data.memberEmail || data.assignedToEmail || data.email || '').toLowerCase().trim();
          const dName = String(data.employeeName || data.name || '').toLowerCase().trim();
          if (
            (empId && (dEmpId === empId || (empIdStripped && dEmpIdStripped === empIdStripped))) ||
            (empEmail && dEmail && dEmail === empEmail) ||
            (empName && dName && dName === empName)
          ) {
            await deleteDoc(doc(db, colName, d.id)).catch(() => {});
          }
        }
      } catch {}
    }
  };

  const handleConfirmDeleteLog = async () => {
    if (!logToDelete) {
      setLogToDelete(null);
      setDeleteCandidateLogs([]);
      setMatrixTargetMember(null);
      return;
    }

    const matchedEmp =
      matrixTargetMember ||
      allTrackedEmployees.find((emp) => doesLogMatchEmployee(logToDelete, emp)) || {
        id: logToDelete.employeeId || '',
        name: logToDelete.employeeName || '',
        email: logToDelete.memberEmail || logToDelete.userEmail || '',
      };

    if (logToDelete.employeeId) {
      const empId = logToDelete.employeeId;
      setModifiedMatrixEmpIds((prev) => (prev.includes(empId) ? prev : [...prev, empId]));
    }
    if (matchedEmp?.id) {
      setModifiedMatrixEmpIds((prev) =>
        prev.includes(matchedEmp.id) ? prev : [...prev, matchedEmp.id]
      );
    }

    const hasActualDailyLogs =
      deleteCandidateLogs.length > 0 &&
      logToDelete.id !== '__fallback_allocation_delete__' &&
      (workLogs.some((w) => w.id === logToDelete.id) ||
        allWorkLogs.some((w) => w.id === logToDelete.id));

    if (hasActualDailyLogs) {
      deleteWorkLog(logToDelete.id);
    } else if (isSuperAdmin) {
      // Fallback: no matching daily_logs found -> delete from assigned_hours / allocations (super admin only)
      await deleteFallbackAllocationsForMember(matchedEmp, logToDelete.id);
      if (matchedEmp?.id) {
        setDeletedMatrixEmpIds((prev) =>
          prev.includes(matchedEmp.id) ? prev : [...prev, matchedEmp.id]
        );
        deleteEmployee(matchedEmp.id);
      }
    } else {
      deleteWorkLog(logToDelete.id);
    }

    setLogToDelete(null);
    setDeleteCandidateLogs([]);
    setMatrixTargetMember(null);
    showMatrixDeleteNotice('Record successfully deleted');
  };

  // Helper to match a work log to an employee record across all identifiers without cross-user collision
  const doesLogMatchEmployee = (
    log: DailyWorkLog,
    emp: { id: string; name?: string; email?: string }
  ): boolean => {
    if (isRecordOwnedByMember(log, emp as any, employees)) {
      return true;
    }

    const cleanLog = sanitizeWorkLogRecord(log);
    const cleanEmp = sanitizeEmployeeRecord(emp as Employee);

    const empEmail = (cleanEmp.email || emp.email || '')
      .toLowerCase()
      .trim()
      .replace(/^abhinandnb@/, 'abhinandanb@')
      .replace(/sushoovandas@gmail\.com/g, 'sushovandas@gmail.com');
    const logEmail = (
      (cleanLog as any).memberEmail ||
      (cleanLog as any).userEmail ||
      cleanLog.memberEmail ||
      ''
    )
      .toLowerCase()
      .trim()
      .replace(/^abhinandnb@/, 'abhinandanb@')
      .replace(/sushoovandas@gmail\.com/g, 'sushovandas@gmail.com');

    const empName = (cleanEmp.name || emp.name || '')
      .toLowerCase()
      .trim()
      .replace(/abhinandn/g, 'abhinandan')
      .replace(/sushoovan|sushovon/g, 'sushovan');
    const logName = (cleanLog.employeeName || '')
      .toLowerCase()
      .trim()
      .replace(/abhinandn/g, 'abhinandan')
      .replace(/sushoovan|sushovon/g, 'sushovan');

    const isGenericLogName =
      !logName ||
      logName === 'bim modeler' ||
      logName === 'team member' ||
      logName === 'bim engineer';

    // Strict guard: If both employee and log have non-generic names and they clearly belong to different people, never match
    if (
      empName &&
      !isGenericLogName &&
      empName !== logName &&
      !empName.includes(logName) &&
      !logName.includes(empName)
    ) {
      return false;
    }

    // Strict guard: If both employee and log have emails and they differ (and names don't match), never match
    if (empEmail && logEmail && empEmail !== logEmail && (!empName || isGenericLogName || empName !== logName)) {
      return false;
    }

    const empId = (cleanEmp.id || emp.id || '').trim();
    const empIdStripped = empId.replace(/^emp-/, '');
    const logEmpId = (cleanLog.employeeId || (cleanLog as any).memberId || '').trim();
    const logEmpIdStripped = logEmpId.replace(/^emp-/, '');
    const logUserId = ((cleanLog as any).userId || '').trim();
    const logUserIdStripped = logUserId.replace(/^emp-/, '');

    // 1. Authoritative match by email
    if (empEmail && logEmail && empEmail === logEmail) {
      return true;
    }

    // 2. Authoritative match by user / employee ID
    if (
      empId &&
      (logEmpId === empId ||
        logUserId === empId ||
        (empIdStripped &&
          (logEmpIdStripped === empIdStripped ||
            logUserIdStripped === empIdStripped ||
            logEmpId === empIdStripped ||
            logUserId === empIdStripped)))
    ) {
      return true;
    }

    // 3. Name matching
    if (empName && !isGenericLogName) {
      if (
        empName === logName ||
        empName.includes(logName) ||
        logName.includes(empName)
      ) {
        return true;
      }
    }

    // 4. Logged-by fallback ONLY when the log has a generic/missing employeeName and no conflicting memberEmail
    const loggedBy = String((cleanLog as any).loggedBy || '').toLowerCase().trim();
    if (isGenericLogName && !logEmail) {
      if (empEmail && loggedBy === empEmail) {
        return true;
      }
      if (empName && loggedBy === empName) {
        return true;
      }
    }

    // 5. Viewer personal timesheet fallback
    if (isViewer && currentUser) {
      const curEmail = (currentUser.email || '')
        .toLowerCase()
        .trim()
        .replace(/sushoovandas@gmail\.com/g, 'sushovandas@gmail.com');
      const curId = (currentUser.id || '').trim();
      const curIdStripped = curId.replace(/^emp-/, '');
      const curName = (currentUser.name || '').toLowerCase().trim().replace(/sushoovan|sushovon/g, 'sushovan');
      if (curEmail && logEmail === curEmail) return true;
      if (
        curId &&
        (logUserId === curId ||
          logEmpId === curId ||
          logUserIdStripped === curIdStripped ||
          logEmpIdStripped === curIdStripped)
      ) {
        return true;
      }
      if (curName && !isGenericLogName && (curName === logName || curName.includes(logName) || logName.includes(curName))) {
        return true;
      }
    }

    return false;
  };

  const [matrixSelectedDate, setMatrixSelectedDate] = useState<string>(() => toLocalIsoDate(new Date()));
  const [matrixCustomStartDate, setMatrixCustomStartDate] = useState('');
  const [matrixCustomEndDate, setMatrixCustomEndDate] = useState('');

  // Ensure initial and per-session date range filter state defaults consistently to Current Week (full weekly scope)
  // for all logged-in users, including both Super Admins (Aditi Chakraborty and Sushoovan Das)
  useEffect(() => {
    setMatrixSelectedDate(toLocalIsoDate(new Date()));
    setMatrixCustomStartDate('');
    setMatrixCustomEndDate('');
    setStartDateFilter('');
    setEndDateFilter('');
  }, [currentUser?.email, currentUser?.id]);

  // Dynamic current week range based on matrixSelectedDate
  const currentWeekRange = useMemo(() => {
    if (!matrixSelectedDate) return getCurrentWeekRange(new Date());
    const [y, m, d] = matrixSelectedDate.split('-').map(Number);
    if (y && m && d) {
      return getCurrentWeekRange(new Date(y, m - 1, d));
    }
    return getCurrentWeekRange(new Date());
  }, [matrixSelectedDate]);

  const weekDays = useMemo(() => currentWeekRange.days, [currentWeekRange]);

  const handlePrevWeek = () => {
    const [y, m, d] = (matrixSelectedDate || toLocalIsoDate(new Date())).split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() - 7);
    setMatrixSelectedDate(toLocalIsoDate(date));
    setMatrixCustomStartDate('');
    setMatrixCustomEndDate('');
  };

  const handleNextWeek = () => {
    const [y, m, d] = (matrixSelectedDate || toLocalIsoDate(new Date())).split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + 7);
    setMatrixSelectedDate(toLocalIsoDate(date));
    setMatrixCustomStartDate('');
    setMatrixCustomEndDate('');
  };

  const handleResetToCurrentWeek = () => {
    setMatrixSelectedDate(toLocalIsoDate(new Date()));
    setMatrixCustomStartDate('');
    setMatrixCustomEndDate('');
  };

  // Real-time onSnapshot listener on Firestore 'users' & 'team_members' collections + SSOT for instant matrix synchronization
  const [firestoreUsers, setFirestoreUsers] = useState<Employee[]>([]);
  useEffect(() => {
    let unsubUsers: (() => void) | undefined;
    let unsubTeamMembers: (() => void) | undefined;

    const usersMap = new Map<string, Employee>();
    const teamMembersMap = new Map<string, Employee>();
    const ssotMembersMap = new Map<string, Employee>();

    const parseMemberData = (docId: string, data: any): Employee | null => {
      if (!data || data.isDeleted === true || String(data.status || '').toLowerCase() === 'deleted') {
        return null;
      }
      if (isRemovedMockMember(data)) {
        return null;
      }
      const rawEmail = String(data.email || data.userEmail || '').trim().toLowerCase();
      if (rawEmail === 'sushovan.das@bimworkspace.com' || rawEmail === 'aditi@bimworkspace.com') {
        return null;
      }
      const rawName = String(data.fullName || data.name || (rawEmail ? rawEmail.split('@')[0] : '')).trim();
      const lowerRawName = rawName.toLowerCase();
      const isSushovan =
        lowerRawName.includes('sushovan') ||
        lowerRawName.includes('sushoovan') ||
        lowerRawName.includes('sushovon') ||
        rawEmail === 'sushoovandas@gmail.com' ||
        rawEmail === 'sushovandas@gmail.com' ||
        rawEmail === 'sushovondas@gmail.com';
      const isAditiSuper =
        !isSushovan &&
        (rawEmail === 'modelatech2026@gmail.com' ||
          lowerRawName === 'aditi chakraborty');
      const name = isAditiSuper ? 'Aditi Chakraborty' : rawName;
      const email = isSushovan
        ? rawEmail && rawEmail !== 'modelatech2026@gmail.com'
          ? rawEmail
          : 'sushoovandas@gmail.com'
        : isAditiSuper
        ? 'modelatech2026@gmail.com'
        : rawEmail;
      if (!name && !email) return null;
      const disc = ((data.discipline || data.primaryDiscipline || 'BIM - ACS') as Discipline);
      const resolvedRole = isAditiSuper || isSushovan
        ? 'SUPER_ADMIN'
        : normalizeUserRole(data.assignedRole || data.appRole || data.role || 'VIEWER', false);
      return sanitizeEmployeeRecord({
        id: isAditiSuper
          ? 'emp-modelatech2026_gmail_com'
          : isSushovan
          ? 'emp-sushoovan_das'
          : String(data.id || (docId.startsWith('emp-') ? docId : `emp-${docId}`)).trim(),
        name,
        email,
        role: resolvedRole as any,
        primaryDiscipline: disc,
        discipline: disc,
        avatar:
          data.avatar ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
        weeklyCapacityHours: Number(data.weeklyCapacityHours) || 40,
        experienceYears: Number(data.experienceYears) || 4,
        status: 'Active',
        activeProjectIds: Array.isArray(data.activeProjectIds) ? data.activeProjectIds : [],
        skills: [disc],
        phone: data.phone || '',
      });
    };

    const syncUsers = () => {
      const merged = new Map<string, Employee>();
      usersMap.forEach((v, k) => merged.set(k, v));
      teamMembersMap.forEach((v, k) => merged.set(k, v));
      ssotMembersMap.forEach((v, k) => merged.set(k, v));
      setFirestoreUsers(Array.from(merged.values()));
    };

    try {
      unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snapshot) => {
          usersMap.clear();
          snapshot.docs.forEach((docSnap) => {
            const parsed = parseMemberData(docSnap.id, docSnap.data());
            if (parsed) usersMap.set(docSnap.id, parsed);
          });
          syncUsers();
        },
        (err) => console.warn('DailyHourTracker users listener notice:', err)
      );

      unsubTeamMembers = onSnapshot(
        collection(db, 'team_members'),
        (snapshot) => {
          teamMembersMap.clear();
          snapshot.docs.forEach((docSnap) => {
            const parsed = parseMemberData(docSnap.id, docSnap.data());
            if (parsed) teamMembersMap.set(docSnap.id, parsed);
          });
          syncUsers();
        },
        (err) => console.warn('DailyHourTracker team_members listener notice:', err)
      );
    } catch (e) {
      console.warn('DailyHourTracker users setup notice:', e);
    }
    return () => {
      if (unsubUsers) unsubUsers();
      if (unsubTeamMembers) unsubTeamMembers();
    };
  }, []);

  // Direct real-time onSnapshot listeners on 'work_logs', 'daily_logs', and 'timesheets' + 5-second SSOT polling fallback
  const [realtimeFirestoreLogs, setRealtimeFirestoreLogs] = useState<DailyWorkLog[]>([]);

  useEffect(() => {
    let unsubWorkLogs: (() => void) | undefined;
    let unsubDailyLogs: (() => void) | undefined;
    let unsubTimesheets: (() => void) | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const workLogsMap = new Map<string, DailyWorkLog>();
    const dailyLogsMap = new Map<string, DailyWorkLog>();
    const timesheetsMap = new Map<string, DailyWorkLog>();
    const ssotLogsMap = new Map<string, DailyWorkLog>();
    const deletedIds = new Set<string>();

    const parseRawData = (docId: string, data: any): DailyWorkLog | null => {
      if (!data || data.isDeleted === true || deletedIds.has(docId) || isRemovedMockMember(data)) return null;
      const rawEmployeeName = String(data.employeeName || 'BIM Modeler').trim();
      const rawEmail = String(data.memberEmail || data.userEmail || '').trim().toLowerCase();
      const resolvedCreatedAt =
        typeof data.createdAt === 'string'
          ? data.createdAt
          : typeof data.createdAt?.toDate === 'function'
          ? data.createdAt.toDate().toISOString()
          : typeof data.createdAt?.seconds === 'number'
          ? new Date(data.createdAt.seconds * 1000).toISOString()
          : data.timestamp || new Date().toISOString();
      const resolvedMemberId = data.employeeId || data.memberId || data.userId || '';

      return sanitizeWorkLogRecord({
        id: docId,
        employeeId: resolvedMemberId,
        memberId: data.memberId || resolvedMemberId,
        employeeName: rawEmployeeName,
        projectId: data.projectId || '',
        projectName: data.projectName || 'BIM Project',
        date: data.date || (resolvedCreatedAt ? resolvedCreatedAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
        hoursLogged: Number(data.hoursLogged !== undefined ? data.hoursLogged : data.hours) || 0,
        discipline: (data.discipline as Discipline) || 'BIM - ACS',
        activityType: (data.activityType as ActivityType) || '3D Detailed Modeling',
        taskName: data.taskName || '',
        lodStage: (data.lodStage as LODLevel) || 'LOD 350',
        notes: data.notes || '',
        billable: data.billable !== undefined ? Boolean(data.billable) : true,
        timestamp: data.timestamp || resolvedCreatedAt,
        memberEmail: rawEmail,
        userEmail: rawEmail,
        userId: data.userId || resolvedMemberId,
        isTestEntry: Boolean(data.isTestEntry ?? false),
        loggedBy: data.loggedBy || rawEmail || rawEmployeeName || '',
        createdAt: resolvedCreatedAt,
      });
    };

    const parseLogSnapshot = (docSnap: any): DailyWorkLog | null => {
      return parseRawData(docSnap.id, docSnap.data() || {});
    };

    const pickLatest = (existing: DailyWorkLog | undefined, incoming: DailyWorkLog): DailyWorkLog => {
      if (!existing) return incoming;
      const existingTs = new Date((existing as any).updatedAt || existing.timestamp || existing.createdAt || 0).getTime() || 0;
      const incomingTs = new Date((incoming as any).updatedAt || incoming.timestamp || incoming.createdAt || 0).getTime() || 0;
      return incomingTs >= existingTs ? incoming : existing;
    };

    const syncCombinedLogs = () => {
      const mergedMap = new Map<string, DailyWorkLog>();
      workLogsMap.forEach((v, k) => {
        if (!deletedIds.has(k)) mergedMap.set(k, pickLatest(mergedMap.get(k), v));
      });
      dailyLogsMap.forEach((v, k) => {
        if (!deletedIds.has(k)) mergedMap.set(k, pickLatest(mergedMap.get(k), v));
      });
      timesheetsMap.forEach((v, k) => {
        if (!deletedIds.has(k)) mergedMap.set(k, pickLatest(mergedMap.get(k), v));
      });
      ssotLogsMap.forEach((v, k) => {
        if (!deletedIds.has(k)) mergedMap.set(k, pickLatest(mergedMap.get(k), v));
      });
      setRealtimeFirestoreLogs(Array.from(mergedMap.values()));
    };

    const pollSsotState = async () => {
      try {
        const res = await fetch('/api/ssot/state', { cache: 'no-store' });
        if (res.ok) {
          const payload = await res.json();
          if (Array.isArray(payload?.deletedLogIds)) {
            payload.deletedLogIds.forEach((id: string) => {
              deletedIds.add(String(id));
              ssotLogsMap.delete(String(id));
              workLogsMap.delete(String(id));
              dailyLogsMap.delete(String(id));
              timesheetsMap.delete(String(id));
            });
          }
          if (Array.isArray(payload?.timesheets)) {
            ssotLogsMap.clear();
            payload.timesheets.forEach((item: any) => {
              if (item?.id) {
                const parsed = parseRawData(String(item.id), item);
                if (parsed) ssotLogsMap.set(parsed.id, parsed);
              }
            });
            syncCombinedLogs();
          }
        }
      } catch {}
    };

    try {
      unsubWorkLogs = onSnapshot(
        collection(db, 'work_logs'),
        (snapshot) => {
          workLogsMap.clear();
          snapshot.docs.forEach((docSnap) => {
            const p = parseLogSnapshot(docSnap);
            if (p) workLogsMap.set(docSnap.id, p);
          });
          syncCombinedLogs();
        },
        (err) => console.warn('DailyHourTracker work_logs snapshot notice:', err)
      );

      unsubDailyLogs = onSnapshot(
        collection(db, 'daily_logs'),
        (snapshot) => {
          dailyLogsMap.clear();
          snapshot.docs.forEach((docSnap) => {
            const p = parseLogSnapshot(docSnap);
            if (p) dailyLogsMap.set(docSnap.id, p);
          });
          syncCombinedLogs();
        },
        (err) => console.warn('DailyHourTracker daily_logs snapshot notice:', err)
      );

      unsubTimesheets = onSnapshot(
        collection(db, 'timesheets'),
        (snapshot) => {
          timesheetsMap.clear();
          snapshot.docs.forEach((docSnap) => {
            const p = parseLogSnapshot(docSnap);
            if (p) timesheetsMap.set(docSnap.id, p);
          });
          syncCombinedLogs();
        },
        (err) => console.warn('DailyHourTracker timesheets snapshot notice:', err)
      );

      let sseSource: EventSource | undefined;
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
                  const parsed = parseRawData(String(item.id), item);
                  if (parsed) ssotLogsMap.set(parsed.id, parsed);
                }
              });
              syncCombinedLogs();
            } else if (payload?.type === 'UPSERT_TIMESHEETS' && Array.isArray(payload.timesheets)) {
              payload.timesheets.forEach((item: any) => {
                if (item?.id) {
                  deletedIds.delete(String(item.id));
                  const parsed = parseRawData(String(item.id), item);
                  if (parsed) ssotLogsMap.set(parsed.id, parsed);
                }
              });
              syncCombinedLogs();
            } else if (payload?.type === 'DELETE_TIMESHEET' && payload?.id) {
              const delId = String(payload.id);
              deletedIds.add(delId);
              ssotLogsMap.delete(delId);
              workLogsMap.delete(delId);
              dailyLogsMap.delete(delId);
              timesheetsMap.delete(delId);
              syncCombinedLogs();
            }
          } catch {}
        };
      }

      let bcChannel: BroadcastChannel | undefined;
      if (typeof BroadcastChannel !== 'undefined') {
        bcChannel = new BroadcastChannel('bim_ssot_realtime_channel');
        bcChannel.onmessage = (event) => {
          const msg = event?.data;
          if (!msg) return;
          if (msg.type === 'UPSERT_LOG' && msg.log && msg.log.id) {
            deletedIds.delete(String(msg.log.id));
            const parsed = parseRawData(String(msg.log.id), msg.log);
            if (parsed) {
              ssotLogsMap.set(parsed.id, parsed);
              syncCombinedLogs();
            }
          } else if (msg.type === 'DELETE_LOG' && msg.id) {
            const delId = String(msg.id);
            deletedIds.add(delId);
            ssotLogsMap.delete(delId);
            workLogsMap.delete(delId);
            dailyLogsMap.delete(delId);
            timesheetsMap.delete(delId);
            syncCombinedLogs();
          } else if (msg.type === 'REFRESH_SSOT') {
            pollSsotState();
          }
        };
      }

      pollSsotState();
      pollTimer = setInterval(pollSsotState, 3000);
    } catch (e) {
      console.warn('DailyHourTracker Firestore logs setup notice:', e);
    }

    return () => {
      if (unsubWorkLogs) unsubWorkLogs();
      if (unsubDailyLogs) unsubDailyLogs();
      if (unsubTimesheets) unsubTimesheets();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  // Merged and deduplicated comprehensive logs from all available sources (preferring latest timestamp)
  const allAvailableLogs = useMemo(() => {
    const logsMap = new Map<string, DailyWorkLog>();
    const upsertLog = (raw: DailyWorkLog) => {
      if (!raw || !raw.id) return;
      const sanitized = sanitizeWorkLogRecord(raw);
      const existing = logsMap.get(sanitized.id);
      if (!existing) {
        logsMap.set(sanitized.id, sanitized);
        return;
      }
      const existingTs = new Date((existing as any).updatedAt || existing.timestamp || existing.createdAt || 0).getTime() || 0;
      const incomingTs = new Date((sanitized as any).updatedAt || sanitized.timestamp || sanitized.createdAt || 0).getTime() || 0;
      if (incomingTs >= existingTs) {
        logsMap.set(sanitized.id, sanitized);
      }
    };
    (workLogs || []).forEach(upsertLog);
    (allWorkLogs || []).forEach(upsertLog);
    realtimeFirestoreLogs.forEach(upsertLog);
    const list = Array.from(logsMap.values());
    list.sort((a, b) => {
      const dateA = a.date || a.timestamp || '';
      const dateB = b.date || b.timestamp || '';
      const dateDiff = new Date(dateB).getTime() - new Date(dateA).getTime();
      if (!isNaN(dateDiff) && dateDiff !== 0) return dateDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
    return list;
  }, [workLogs, allWorkLogs, realtimeFirestoreLogs]);

  // Active team members across the organization (including Super Admins Aditi Chakraborty & Sushoovan Das)
  const allTrackedEmployees = useMemo(() => {
    const superAdminMember: Employee = {
      id: 'emp-modelatech2026_gmail_com',
      name: 'Aditi Chakraborty',
      email: 'modelatech2026@gmail.com',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aditi%20Chakraborty',
      role: 'SUPER_ADMIN' as any,
      primaryDiscipline: 'BIM - ACS',
      discipline: 'BIM - ACS',
      weeklyCapacityHours: 40,
      experienceYears: 8,
      status: 'Active',
      activeProjectIds: [],
      skills: ['BIM - ACS'],
      phone: '',
    };

    const sushovanAdminMember: Employee = {
      id: 'emp-sushoovan_das',
      name: 'Sushoovan Das',
      email: 'sushoovandas@gmail.com',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sushoovan%20Das',
      role: 'SUPER_ADMIN' as any,
      primaryDiscipline: 'BIM - ACS',
      discipline: 'BIM - ACS',
      weeklyCapacityHours: 40,
      experienceYears: 8,
      status: 'Active',
      activeProjectIds: [],
      skills: ['BIM - ACS'],
      phone: '',
    };

    const baseMembers = (employees || []).filter(
      (member) => !member.isDeleted && member.status !== 'deleted'
    );

    const list: Employee[] = [];
    const knownKeys = new Set<string>();

    const registerMember = (rawEmp: Employee) => {
      if (!rawEmp || rawEmp.isDeleted || rawEmp.status === 'deleted' || isRemovedMockMember(rawEmp)) return;
      const emp = sanitizeEmployeeRecord(rawEmp);
      const emailKey = (emp.email || '').toLowerCase().trim();
      const nameKey = (emp.name || '')
        .toLowerCase()
        .trim()
        .replace(/abhinandn/g, 'abhinandan')
        .replace(/sushoovan|sushovon/g, 'sushovan');
      const idKey = (emp.id || '').trim();
      const idKeyLower = idKey.toLowerCase();
      const strippedIdKey = idKey.replace(/^emp-/, '');
      const strippedIdLower = strippedIdKey.toLowerCase();
      const detIdLower = emailKey ? generateRequestDocId(emailKey).toLowerCase() : '';

      if (
        emailKey !== 'modelatech2026@gmail.com' &&
        emailKey !== 'sushoovandas@gmail.com' &&
        emailKey !== 'sushovandas@gmail.com'
      ) {
        if (deletedMatrixEmpIds.includes(emp.id)) return;
      }

      const alreadyExists =
        (idKeyLower && knownKeys.has(idKeyLower)) ||
        (strippedIdLower && knownKeys.has(strippedIdLower)) ||
        (detIdLower && knownKeys.has(detIdLower)) ||
        (nameKey && knownKeys.has(nameKey)) ||
        (emailKey && knownKeys.has(emailKey));

      if (!alreadyExists && (nameKey || idKeyLower || emailKey)) {
        if (idKeyLower) knownKeys.add(idKeyLower);
        if (strippedIdLower) knownKeys.add(strippedIdLower);
        if (detIdLower) knownKeys.add(detIdLower);
        if (nameKey) knownKeys.add(nameKey);
        if (emailKey) knownKeys.add(emailKey);
        list.push({ ...emp });
      }
    };

    // 1. Always include active team members from context & Firestore users/team_members collections & Super Admins
    baseMembers.forEach(registerMember);
    firestoreUsers.forEach(registerMember);
    registerMember(superAdminMember);
    registerMember(sushovanAdminMember);

    // 2. Include current authenticated user if not already in the list
    if (currentUser) {
      const userEmail = (currentUser.email || '').toLowerCase().trim();
      const userId = (currentUser.id || '').trim();
      registerMember({
        id: userId || 'emp-user',
        name: currentUser.name || (userEmail ? userEmail.split('@')[0] : 'Team Member'),
        email: currentUser.email || '',
        avatar:
          currentUser.avatar ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
            currentUser.name || 'User'
          )}`,
        role: (isSuperAdmin ? 'SUPER_ADMIN' : (currentUser.appRole || currentUser.role || 'VIEWER')) as any,
        primaryDiscipline: 'BIM - ACS',
        discipline: 'BIM - ACS',
        weeklyCapacityHours: 40,
        experienceYears: 3,
        status: 'Active',
        activeProjectIds: [],
        skills: ['BIM - ACS'],
        phone: '',
      });
    }

    // 3. Also include any active members referenced in resourceAllocations or allAvailableLogs
    (resourceAllocations || []).forEach((alloc) => {
      const name = (alloc.assignedToName || alloc.employeeName || alloc.memberName || '').trim();
      const email = (alloc.assignedToEmail || alloc.memberEmail || '').toLowerCase().trim();
      const id = (alloc.assignedTo || alloc.employeeId || alloc.memberId || '').trim();
      if (!name && !email && !id) return;
      registerMember({
        id: id || `emp-${Date.now()}`,
        name: name || (email ? email.split('@')[0] : 'Team Member'),
        email,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
          name || email || 'User'
        )}`,
        role: (alloc.employeeRole || 'BIM Modeler') as any,
        primaryDiscipline: (alloc.discipline || 'BIM - ACS') as Discipline,
        discipline: (alloc.discipline || 'BIM - ACS') as Discipline,
        weeklyCapacityHours: 40,
        experienceYears: 3,
        status: 'Active',
        activeProjectIds: [alloc.projectId].filter(Boolean),
        skills: [(alloc.discipline || 'BIM - ACS') as Discipline],
        phone: '',
      });
    });

    allAvailableLogs.forEach((log) => {
      const name = (log.employeeName || '').trim();
      const email = ((log as any).memberEmail || (log as any).userEmail || '').toLowerCase().trim();
      const id = (log.employeeId || (log as any).userId || '').trim();
      if (!name && !email && !id) return;
      registerMember({
        id: id || `emp-${Date.now()}`,
        name: name || (email ? email.split('@')[0] : 'Team Member'),
        email,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
          name || email || 'User'
        )}`,
        role: 'BIM Modeler' as any,
        primaryDiscipline: log.discipline || 'BIM - ACS',
        discipline: log.discipline || 'BIM - ACS',
        weeklyCapacityHours: 40,
        experienceYears: 3,
        status: 'Active',
        activeProjectIds: [log.projectId].filter(Boolean),
        skills: [log.discipline || 'BIM - ACS'],
        phone: '',
      });
    });

    // Role-based isolation: If user is a Viewer, strictly isolate to their own single employee record
    if (isViewer) {
      const userEmail = (currentUser?.email || '').toLowerCase().trim();
      const userId = (currentUser?.id || '').trim();
      const userIdStripped = userId.replace(/^emp-/, '');
      const userName = (currentUser?.name || '').toLowerCase().trim();

      const matchedUserEmp = list.find((emp) => {
        const empEmail = (emp.email || '').toLowerCase().trim();
        const empId = (emp.id || '').trim();
        const empIdStripped = empId.replace(/^emp-/, '');
        const empName = (emp.name || '').toLowerCase().trim();

        if (userEmail && empEmail && empEmail === userEmail) return true;
        if (userId && (empId === userId || empIdStripped === userIdStripped)) return true;
        if (userName && empName && (empName === userName || empName.includes(userName) || userName.includes(empName))) return true;
        return false;
      });

      if (matchedUserEmp) {
        return [matchedUserEmp];
      }

      const singleViewerEmp: Employee = {
        id: userId || 'emp-user',
        name: currentUser?.name || (userEmail ? userEmail.split('@')[0] : 'Team Member'),
        email: currentUser?.email || '',
        avatar:
          currentUser?.avatar ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
            currentUser?.name || 'User'
          )}`,
        role: 'VIEWER' as any,
        primaryDiscipline: 'BIM - ACS',
        discipline: 'BIM - ACS',
        weeklyCapacityHours: 40,
        experienceYears: 3,
        status: 'Active',
        activeProjectIds: [],
        skills: ['BIM - ACS'],
        phone: '',
      };
      return [singleViewerEmp];
    }

    return list;
  }, [
    employees,
    firestoreUsers,
    allAvailableLogs,
    resourceAllocations,
    currentUser,
    deletedMatrixEmpIds,
    isViewer,
  ]);

  // Helper to resolve a normalized YYYY-MM-DD date key from any log record format
  const getLogNormalizedDateKey = (log: DailyWorkLog): string => {
    const rawDate = (log.date || (log as any).workDate || (log as any).entryDate || '').trim();
    const normDate = normalizeDateToIso(rawDate);
    if (normDate) return normDate;
    const effDate = getEffectiveLogDate(log, currentWeekRange);
    if (effDate) return effDate;
    const normTs = normalizeDateToIso(log.timestamp || (log as any).createdAt);
    if (normTs) return normTs;
    return rawDate.slice(0, 10);
  };

  // Unified authoritative log collection (strictly role-scoped for Viewer)
  // Shared directly between Weekly Timesheet Matrix and Detailed Log Records
  const unifiedSourceLogs = useMemo(() => {
    const rawScoped = isViewer
      ? allAvailableLogs.filter((log) => {
          if (isRecordOwnedByMember(log, currentUser, employees)) return true;
          const userEmail = (currentUser?.email || '').trim().toLowerCase();
          const userId = (currentUser?.id || '').trim();
          const userIdStripped = userId.replace(/^emp-/, '');
          const logEmpId = (log.employeeId || '').trim();
          const logUserId = ((log as any).userId || (log as any).memberId || '').trim();
          const logEmail = (log.memberEmail || (log as any).userEmail || '').trim().toLowerCase();
          const logName = (log.employeeName || '').toLowerCase().trim();
          const currentName = (currentUser?.name || '').toLowerCase().trim();
          const loggedBy = String((log as any).loggedBy || '').toLowerCase().trim();

          return (
            (userEmail && (logEmail === userEmail || loggedBy.includes(userEmail))) ||
            (userId && (
              logUserId === userId ||
              logEmpId === userId ||
              logUserId.replace(/^emp-/, '') === userIdStripped ||
              logEmpId.replace(/^emp-/, '') === userIdStripped
            )) ||
            (currentName && logName && (
              logName === currentName ||
              logName.includes(currentName) ||
              currentName.includes(logName)
            ))
          );
        })
      : allAvailableLogs;

    return rawScoped.map((w) => sanitizeWorkLogRecord(w));
  }, [allAvailableLogs, isViewer, currentUser, employees]);

  // Full Member Matrix Outer Join: maps directly from active team members,
  // aggregating daily hours and weekly totals strictly from unifiedSourceLogs
  const fullWeeklyMatrix = useMemo(() => {
    const matrixLogs = unifiedSourceLogs.filter((w) => {
      if (logTypeFilter === 'operational') return !w.isTestEntry;
      if (logTypeFilter === 'test') return Boolean(w.isTestEntry);
      return true;
    });

    return allTrackedEmployees.map((rawUser) => {
      const user = { ...sanitizeEmployeeRecord(rawUser) };

      // Determine matching logs for this matrix row:
      // When user is a Viewer, unifiedSourceLogs is already isolated strictly to this single user's records.
      // Otherwise, match using doesLogMatchEmployee and authoritative ownership validation.
      // Prevent any single-day default window (e.g., 2026-10-29 - 2026-10-29) from hiding Mon-Wed entries in the Weekly Matrix
      const isSingleDayClamp =
        Boolean(matrixCustomStartDate && matrixCustomEndDate && matrixCustomStartDate === matrixCustomEndDate);
      const effectiveStartFilter = isSingleDayClamp ? '' : matrixCustomStartDate;
      const effectiveEndFilter = isSingleDayClamp ? '' : matrixCustomEndDate;

      const empAllLogs = matrixLogs.filter((w) => {
        const matchesMember = isViewer
          ? true
          : doesLogMatchEmployee(w, user) || isRecordOwnedByMember(w, user as any, employees);
        if (!matchesMember) return false;

        const logDateIso = getLogNormalizedDateKey(w);
        if (effectiveStartFilter && logDateIso < effectiveStartFilter) return false;
        if (effectiveEndFilter && logDateIso > effectiveEndFilter) return false;

        return true;
      });

      // Aggregate daily hours across the Monday-Sunday week columns
      let weekSum = 0;
      const dailyHours = weekDays.map((d) => {
        const dayLogs = empAllLogs.filter((w) => {
          const dateKey = getLogNormalizedDateKey(w);
          return (
            dateKey === d.date ||
            w.date === d.date ||
            normalizeDateToIso(w.date) === d.date ||
            getEffectiveLogDate(w, currentWeekRange) === d.date
          );
        });
        const hours = dayLogs.reduce((sum, l) => sum + (Number(l.hoursLogged) || 0), 0);
        weekSum += hours;
        return { date: d.date, hours, dayLogs };
      });

      const empWeekLogs = empAllLogs.filter((w) => {
        const dateKey = getLogNormalizedDateKey(w);
        return dateKey >= currentWeekRange.startIso && dateKey <= currentWeekRange.endIso;
      });

      const empActionLogs = empWeekLogs.length > 0 ? empWeekLogs : empAllLogs;

      return {
        user,
        empAllLogs,
        empWeekLogs,
        empActionLogs,
        weeklyTotals: {
          weekSum,
          dailyHours,
          userLogs: empWeekLogs,
        },
      };
    });
  }, [
    unifiedSourceLogs,
    allTrackedEmployees,
    logTypeFilter,
    currentWeekRange,
    weekDays,
    isViewer,
    employees,
    matrixCustomStartDate,
    matrixCustomEndDate,
  ]);

  useEffect(() => {
    if (
      selectedEmployeeFilter !== 'all' &&
      !allTrackedEmployees.some((e) => e.id === selectedEmployeeFilter)
    ) {
      setSelectedEmployeeFilter('all');
    }
  }, [allTrackedEmployees, selectedEmployeeFilter]);

  // Base filtered logs (by role/ownership, search, project, employee, discipline) before logTypeFilter
  const baseFilteredLogs = useMemo(() => {
    return unifiedSourceLogs.filter((log) => {
      const selectedEmpObj = allTrackedEmployees.find((e) => e.id === selectedEmployeeFilter);

      if (!isViewer && !isSuperAdmin) {
        const userEmail = (currentUser?.email || '').trim().toLowerCase();
        const userId = (currentUser?.id || '').trim();
        const userIdStripped = userId.replace(/^emp-/, '');
        const logEmpId = (log.employeeId || '').trim();
        const logUserId = ((log as any).userId || '').trim();
        const isOwned =
          (userEmail && ((log.memberEmail || (log as any).userEmail || '').trim().toLowerCase() === userEmail)) ||
          (userId && (logUserId === userId || logEmpId === userId || logUserId.replace(/^emp-/, '') === userIdStripped || logEmpId.replace(/^emp-/, '') === userIdStripped)) ||
          (currentUser?.name && (log.employeeName || '').toLowerCase().trim() === currentUser.name.toLowerCase().trim()) ||
          (selectedEmpObj && doesLogMatchEmployee(log, selectedEmpObj));
        if (!isOwned) return false;
      }

      const matchesSearch =
        !searchQuery ||
        (log.notes || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.taskName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.employeeName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.projectName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.discipline || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (log.activityType || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesEmp =
        isViewer ||
        !isSuperAdmin ||
        selectedEmployeeFilter === 'all' ||
        (selectedEmpObj ? doesLogMatchEmployee(log, selectedEmpObj) : log.employeeId === selectedEmployeeFilter);

      const matchesProj =
        selectedProjectFilter === 'all' || log.projectId === selectedProjectFilter;
      const matchesDisc =
        selectedDisciplineFilter === 'all' || log.discipline === selectedDisciplineFilter;

      const logDateIso = getLogNormalizedDateKey(log);
      const matchesStartDate =
        !startDateFilter || (Boolean(logDateIso) && logDateIso >= startDateFilter);
      const matchesEndDate =
        !endDateFilter || (Boolean(logDateIso) && logDateIso <= endDateFilter);

      return (
        matchesSearch &&
        matchesEmp &&
        matchesProj &&
        matchesDisc &&
        matchesStartDate &&
        matchesEndDate
      );
    });
  }, [
    unifiedSourceLogs,
    allTrackedEmployees,
    selectedEmployeeFilter,
    isSuperAdmin,
    isViewer,
    currentUser,
    searchQuery,
    selectedProjectFilter,
    selectedDisciplineFilter,
    startDateFilter,
    endDateFilter,
  ]);

  const operationalCount = useMemo(
    () => baseFilteredLogs.filter((l) => !l.isTestEntry).length,
    [baseFilteredLogs]
  );
  const testCount = useMemo(
    () => baseFilteredLogs.filter((l) => Boolean(l.isTestEntry)).length,
    [baseFilteredLogs]
  );

  // Filtered log list applying All Logs / Operational Only / Test Logs Only filter
  const filteredLogs = useMemo(() => {
    if (logTypeFilter === 'operational') {
      return baseFilteredLogs.filter((l) => !l.isTestEntry);
    }
    if (logTypeFilter === 'test') {
      return baseFilteredLogs.filter((l) => Boolean(l.isTestEntry));
    }
    return baseFilteredLogs;
  }, [baseFilteredLogs, logTypeFilter]);

  // Keep normal logged-hour calculations unchanged:
  // Test entries must not affect operational totals unless explicitly intended by the selected filter ('test').
  const operationalFilteredHours = useMemo(
    () =>
      baseFilteredLogs
        .filter((l) => !l.isTestEntry)
        .reduce((sum, l) => sum + (Number(l.hoursLogged) || 0), 0),
    [baseFilteredLogs]
  );

  const testFilteredHours = useMemo(
    () =>
      baseFilteredLogs
        .filter((l) => Boolean(l.isTestEntry))
        .reduce((sum, l) => sum + (Number(l.hoursLogged) || 0), 0),
    [baseFilteredLogs]
  );

  const totalFilteredHours =
    logTypeFilter === 'test' ? testFilteredHours : operationalFilteredHours;

  // Export to CSV function
  const exportLogsToCsv = () => {
    const headers = ['Date', 'Employee', 'Project', 'Discipline', 'Activity', 'Task', 'LOD', 'Hours', 'Billable', 'Entry Type', 'Notes'];
    const rows = filteredLogs.map((l) => [
      l.date,
      `"${l.employeeName || ''}"`,
      `"${l.projectName || ''}"`,
      `"${l.discipline || ''}"`,
      `"${l.activityType || ''}"`,
      `"${l.taskName || ''}"`,
      l.lodStage,
      l.hoursLogged,
      l.billable ? 'Yes' : 'No',
      l.isTestEntry ? 'TEST' : 'Operational',
      `"${(l.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BIM_Timesheet_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const canModifyLog = (_log: DailyWorkLog): boolean => {
    return isSuperAdmin;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification for Matrix / Log Deletion */}
      {matrixDeleteNotice && (
        <div
          role="status"
          className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 border border-emerald-500/40 text-emerald-300 shadow-2xl text-xs font-semibold animate-in fade-in slide-in-from-top-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{matrixDeleteNotice}</span>
          <button
            type="button"
            onClick={() => setMatrixDeleteNotice(null)}
            className="ml-2 p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Daily Hour Tracking
            </h2>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {isViewer ? 'Personal Timesheet' : 'Organizational Timesheets'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {isViewer
              ? 'Tracking personal daily work hours, task submissions, and weekly capacity utilization'
              : 'Tracking daily modeler work hours, multi-project tasks, and weekly employee capacity utilization'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportLogsToCsv}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={onOpenLogModal}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Log Daily Hours</span>
          </button>
        </div>
      </div>

      {/* View Switcher & Quick Stats */}
      <div className={`grid grid-cols-1 ${activeView === 'logs' ? 'md:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold uppercase">
                {isViewer
                  ? 'Total Logged'
                  : logTypeFilter === 'test'
                  ? 'Total Logged (Test Only)'
                  : 'Total Logged (Operational)'}
              </span>
              {totalFilteredHours > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Daily Hours Logged
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-2xl font-bold text-white">{totalFilteredHours.toFixed(1)} hrs</p>
              <span className="text-[11px] font-mono font-semibold text-emerald-400">
                (Hours Logged: {totalFilteredHours.toFixed(1)}h)
              </span>
              {logTypeFilter === 'all' && testFilteredHours > 0 && (
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  +{testFilteredHours.toFixed(1)}h [TEST] excluded
                </span>
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* IT Failure KPI Summary Card (Only shown in Detailed Log Records view) */}
        {activeView === 'logs' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-semibold uppercase">
                  IT FAILURE
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  IT Downtime Logged
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-2xl font-bold text-white">0.0 hrs</p>
                <span className="text-[11px] text-slate-400 font-medium">
                  (0 Incidents Reported)
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-semibold uppercase">
              {isViewer ? 'Active Modeler' : isSuperAdmin ? 'Active Engaged Staff' : 'Active Modeler'}
            </span>
            <p className="text-2xl font-bold text-white mt-1">
              {isViewer
                ? '1 Active Modeler'
                : isSuperAdmin
                ? `${allTrackedEmployees.length} Specialists`
                : (currentUser?.name || '1 Active Modeler')}
            </p>
            {isViewer && currentUser?.name && (
              <p className="text-[11px] text-slate-400 truncate mt-0.5 font-medium">
                {currentUser.name}
              </p>
            )}
          </div>
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <User className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tabs for Matrix vs Log Stream + Log Entry Type Filter (All Logs / Operational Only / Test Logs Only) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView('matrix')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeView === 'matrix'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isViewer ? 'My Timesheet Matrix' : 'Weekly Timesheet Matrix'}
          </button>
          <button
            onClick={() => setActiveView('logs')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeView === 'logs'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Detailed Log Records ({filteredLogs.length})
          </button>
        </div>

        {/* Entry Type Filter Buttons (Detailed Log Records only) */}
        {activeView === 'logs' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setLogTypeFilter('all')}
                className={`px-3 py-1 rounded-md font-semibold transition ${
                  logTypeFilter === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Logs ({baseFilteredLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setLogTypeFilter('operational')}
                className={`px-3 py-1 rounded-md font-semibold transition ${
                  logTypeFilter === 'operational'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Operational Only ({operationalCount})
              </button>
              <button
                type="button"
                onClick={() => setLogTypeFilter('test')}
                className={`px-3 py-1 rounded-md font-semibold transition flex items-center gap-1 ${
                  logTypeFilter === 'test'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-amber-300/80 hover:text-amber-300'
                }`}
              >
                <span>Test Logs Only ({testCount})</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Matrix View: Employee rows across days of the week */}
      {activeView === 'matrix' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between text-xs text-slate-300 bg-slate-800/40 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white">
                {isViewer
                  ? `My Weekly Timesheet Matrix (${currentWeekRange.label})`
                  : `Weekly Team Timesheet Matrix (${currentWeekRange.label})`}
              </span>
              {logTypeFilter === 'test' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  [TEST] FILTER ACTIVE
                </span>
              )}
            </div>

            {/* Calendar & Date Range Filter Control Bar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Previous / Next Week Navigation */}
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
                <button
                  type="button"
                  onClick={handlePrevWeek}
                  className="p-1 hover:bg-slate-700 text-slate-300 rounded transition"
                  title="Previous Week"
                  aria-label="Previous Week"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleResetToCurrentWeek}
                  className="px-2 py-0.5 text-[11px] font-medium hover:bg-slate-700 text-slate-200 rounded transition"
                  title="Reset to Current Week"
                >
                  This Week
                </button>
                <button
                  type="button"
                  onClick={handleNextWeek}
                  className="p-1 hover:bg-slate-700 text-slate-300 rounded transition"
                  title="Next Week"
                  aria-label="Next Week"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Target Week Calendar Picker */}
              <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-lg text-xs">
                <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-slate-400 font-medium hidden sm:inline">Week Of:</span>
                <input
                  type="date"
                  aria-label="Select target week date"
                  value={matrixSelectedDate}
                  onChange={(e) => {
                    setMatrixSelectedDate(e.target.value);
                    setMatrixCustomStartDate('');
                    setMatrixCustomEndDate('');
                  }}
                  className="bg-transparent text-slate-200 font-medium text-xs focus:outline-none cursor-pointer"
                  title="Select date to filter weekly timesheet matrix"
                />
              </div>

              {/* Range Filter Controls (Start / End Date) */}
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 px-2 py-1 rounded-lg text-xs">
                <span className="text-slate-400 font-medium">Range:</span>
                <input
                  type="date"
                  aria-label="Filter matrix start date"
                  value={matrixCustomStartDate || currentWeekRange.startIso}
                  onChange={(e) => setMatrixCustomStartDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-[11px] rounded px-1.5 py-0.5 focus:outline-none w-28 cursor-pointer"
                  title="Filter matrix entries starting from this date"
                />
                <span className="text-slate-500">-</span>
                <input
                  type="date"
                  aria-label="Filter matrix end date"
                  value={matrixCustomEndDate || currentWeekRange.endIso}
                  onChange={(e) => setMatrixCustomEndDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-[11px] rounded px-1.5 py-0.5 focus:outline-none w-28 cursor-pointer"
                  title="Filter matrix entries up to this date"
                />
                {(matrixCustomStartDate || matrixCustomEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setMatrixCustomStartDate('');
                      setMatrixCustomEndDate('');
                    }}
                    className="p-0.5 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition"
                    title="Clear Date Range Filter"
                    aria-label="Clear date range filter"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700">
                <tr>
                  <th className="p-3.5 min-w-[200px]">Employee & Role</th>
                  {weekDays.map((d) => (
                    <th key={d.date} className="p-3.5 text-center min-w-[80px]">
                      <div>{d.label}</div>
                      <div className="text-[10px] text-slate-500">{d.dayNum}</div>
                    </th>
                  ))}
                  <th className="p-3.5 text-right font-bold min-w-[100px]">Weekly Total</th>
                  {!isViewer && <th className="p-3.5 text-right min-w-[90px]">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {fullWeeklyMatrix.map(({ user: emp, empAllLogs, empWeekLogs, empActionLogs, weeklyTotals }) => {
                  const { weekSum, dailyHours } = weeklyTotals;

                  return (
                    <tr key={emp.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-3.5">
                        <div>
                          <div className="font-bold text-white">{emp.name}</div>
                          <div className="text-[11px] text-slate-400">{emp.role}</div>
                        </div>
                      </td>

                      {dailyHours.map((d) => {
                        const isUnderTarget = d.hours > 0 && d.hours < 9.0;
                        return (
                          <td key={d.date} className="p-3.5 text-center">
                            {d.hours > 0 ? (
                              <span
                                onClick={!isViewer ? () => openMatrixRowEditModal(emp, empActionLogs, d.date) : undefined}
                                title={
                                  !isViewer
                                    ? `Click to edit ${emp.name}'s hours for ${d.date}${
                                        isUnderTarget ? ' (Shortfall: < 9.0h daily target)' : ''
                                      }`
                                    : `${emp.name}: ${d.hours.toFixed(1)}h logged on ${d.date}`
                                }
                                className={`inline-block px-2 py-0.5 rounded font-semibold text-xs ${
                                  !isViewer
                                    ? 'cursor-pointer hover:ring-1 hover:ring-blue-400/60 transition'
                                    : 'cursor-default'
                                } ${
                                  logTypeFilter === 'test'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : isUnderTarget
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 ring-1 ring-amber-500/30 shadow-xs'
                                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                }`}
                              >
                                {d.hours.toFixed(1)}h
                              </span>
                            ) : (
                              <span
                                onClick={!isViewer ? () => openMatrixRowEditModal(emp, empActionLogs, d.date) : undefined}
                                title={!isViewer ? `Click to log/edit hours for ${emp.name} on ${d.date}` : undefined}
                                className={`text-slate-600 font-mono ${
                                  !isViewer ? 'cursor-pointer hover:text-slate-400 transition' : 'cursor-default'
                                }`}
                              >
                                -
                              </span>
                            )}
                          </td>
                        );
                      })}

                      <td className="p-3.5 text-right font-bold text-sm text-white">
                        <div className="flex flex-col items-end gap-0.5">
                          <span>Hours Logged: {weekSum.toFixed(1)}h</span>
                          {weekSum > 0 && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                              Daily Hours Logged
                            </span>
                          )}
                        </div>
                      </td>

                      {!isViewer && (
                        <td className="p-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openMatrixRowEditModal(emp, empActionLogs)}
                              className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 border border-blue-500/20 hover:border-blue-500/40 transition cursor-pointer"
                              title="Edit logged hours for a specific day or project"
                              aria-label={`Edit matrix hours for ${emp.name}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openMatrixRowDeleteModal(emp, empWeekLogs, empAllLogs)}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/40 transition cursor-pointer"
                              title="Delete this daily log entry?"
                              aria-label={`Delete daily log entry for ${emp.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detailed Log Stream */}
      {activeView === 'logs' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Search Keywords</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Task, notes, names..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-800 text-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Filter by Project</label>
              <select
                value={selectedProjectFilter}
                onChange={(e) => setSelectedProjectFilter(e.target.value)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {cleanProjectName(p.name)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                {isViewer ? 'Personal Timesheet' : isSuperAdmin ? 'Filter by Employee' : 'Member Timesheet'}
              </label>
              {isViewer ? (
                <div className="w-full bg-slate-800/80 text-blue-300 font-semibold rounded-lg px-2.5 py-1.5 border border-slate-700/80 text-xs truncate">
                  {currentUser?.name || currentUser?.email || 'My Personal Timesheet'}
                </div>
              ) : isSuperAdmin ? (
                <select
                  value={selectedEmployeeFilter}
                  onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
                  className="w-full bg-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="all">All Employees ({allTrackedEmployees.length})</option>
                  {allTrackedEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {getMemberLabel(e)}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full bg-slate-800/80 text-blue-300 font-semibold rounded-lg px-2.5 py-1.5 border border-slate-700/80 text-xs truncate">
                  {currentUser?.name || currentUser?.email || 'My Log Records'}
                </div>
              )}
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Filter by Discipline</label>
              <select
                value={selectedDisciplineFilter}
                onChange={(e) => setSelectedDisciplineFilter(e.target.value)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">All Disciplines</option>
                <option value="BIM - ACS">BIM - ACS</option>
                <option value="Structure">Structure</option>
                <option value="MEP - HVAC">MEP - HVAC</option>
                <option value="MEP - Electrical">MEP - Electrical</option>
                <option value="MEP - Plumbing">MEP - Plumbing</option>
                <option value="Fire Protection">Fire Protection</option>
                <option value="Façade / Envelope">Façade / Envelope</option>
                <option value="Coordination & QA">Coordination & QA</option>
                <option value="AI & Automation">AI & Automation</option>
                <option value="Estimation">Estimation</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Log Entry Type</label>
              <select
                aria-label="Filter by Log Entry Type"
                value={logTypeFilter}
                onChange={(e) => setLogTypeFilter(e.target.value as 'all' | 'operational' | 'test')}
                className="w-full bg-slate-800 text-slate-200 rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">All Logs ({baseFilteredLogs.length})</option>
                <option value="operational">Operational Only ({operationalCount})</option>
                <option value="test">Test Logs Only ({testCount})</option>
              </select>
            </div>

            <div className="sm:col-span-5 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400 font-medium flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  <span>Date Range Filter:</span>
                </span>
                <input
                  type="date"
                  aria-label="Start Date"
                  value={startDateFilter}
                  onChange={(e) => setStartDateFilter(e.target.value)}
                  className="bg-slate-800 text-slate-200 rounded-lg px-2.5 py-1 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-slate-500">to</span>
                <input
                  type="date"
                  aria-label="End Date"
                  value={endDateFilter}
                  onChange={(e) => setEndDateFilter(e.target.value)}
                  className="bg-slate-800 text-slate-200 rounded-lg px-2.5 py-1 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {(startDateFilter || endDateFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStartDateFilter('');
                      setEndDateFilter('');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 font-semibold flex items-center gap-1 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reset Dates</span>
                  </button>
                )}
              </div>
              {(searchQuery ||
                selectedProjectFilter !== 'all' ||
                selectedEmployeeFilter !== 'all' ||
                selectedDisciplineFilter !== 'all' ||
                startDateFilter ||
                endDateFilter ||
                logTypeFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedProjectFilter('all');
                    setSelectedEmployeeFilter('all');
                    setSelectedDisciplineFilter('all');
                    setStartDateFilter('');
                    setEndDateFilter('');
                    setLogTypeFilter('all');
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 underline font-medium"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          </div>

          {/* Logs Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700">
                  <tr>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">Employee</th>
                    <th className="p-3.5">Project & Task</th>
                    <th className="p-3.5">Hours</th>
                    <th className="p-3.5">Notes</th>
                    {!isViewer && <th className="p-3.5 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={isViewer ? 5 : 6} className="py-12 text-center text-slate-500">
                        <p className="text-sm font-semibold text-slate-400">No daily hour logs recorded.</p>
                        <p className="text-xs text-slate-500 mt-1">Click "Log Daily Hours" above to record hours for projects.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => {
                      const allowModify = canModifyLog(log);
                      return (
                        <tr key={log.id} className="hover:bg-slate-800/40 transition">
                          <td className="p-3.5 font-mono text-slate-400 whitespace-nowrap">
                            {log.date}
                          </td>
                          <td className="p-3.5 font-medium text-white whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span>{log.employeeName}</span>
                              {log.isTestEntry && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  [TEST]
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-200">{log.projectName}</span>
                              {log.isTestEntry && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  [TEST]
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">{log.taskName}</div>
                          </td>
                          <td className="p-3.5 font-bold text-sm whitespace-nowrap">
                            <div className="flex flex-col items-start gap-1">
                              <span className={log.isTestEntry ? 'text-amber-300' : 'text-blue-400'}>
                                Hours Logged: {Number(log.hoursLogged || 0).toFixed(1)}h
                              </span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                Daily Hours Logged
                              </span>
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-400 text-[11px] max-w-xs truncate" title={log.notes}>
                            {log.notes}
                          </td>
                          {!isViewer && (
                            <td className="p-3.5 text-right whitespace-nowrap">
                              {allowModify ? (
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openEditLogModal(log)}
                                    className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 border border-blue-500/20 hover:border-blue-500/40 transition"
                                    title="Edit daily log entry"
                                    aria-label={`Edit log entry for ${log.employeeName}`}
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeleteCandidateLogs([log]);
                                      setLogToDelete(log);
                                    }}
                                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/40 transition"
                                    title="Delete daily log entry"
                                    aria-label={`Delete log entry for ${log.employeeName}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  Daily Hours Logged
                                </span>
                              )}
                            </td>
                          )}
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

      {/* EDIT DAILY LOG MODAL (Super Admin / Authorized Owner) */}
      {editingLog && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full my-8 text-slate-100 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Edit Daily Work Log</h3>
                  <p className="text-xs text-slate-400">
                    Modify logged hours for a specific day or project in Firestore
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingLog(null);
                  setEditCandidateLogs([]);
                }}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedLog} className="p-6 space-y-4 text-xs">
              {editCandidateLogs.length > 1 && (
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/80">
                  <label className="block text-slate-300 font-semibold mb-1.5">
                    Select Daily Log Entry to Modify ({editCandidateLogs.length} entries)
                  </label>
                  <select
                    value={editingLog.id}
                    onChange={(e) => {
                      const chosen = editCandidateLogs.find((c) => c.id === e.target.value);
                      if (chosen) {
                        openEditLogModal(chosen, editCandidateLogs);
                      }
                    }}
                    className="w-full bg-slate-900 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    {editCandidateLogs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.date} — {c.hoursLogged} hrs — {c.projectName} ({c.taskName || c.discipline})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Quick Week Day Selector for Matrix Modification */}
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Current Week Day Selector ({currentWeekRange.label})
                  </span>
                  <span className="text-[11px] text-blue-400 font-mono">{editDate}</span>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                    {weekDays.map((wd) => {
                    const matchingLogForDay = editCandidateLogs.find(
                      (l) =>
                        getEffectiveLogDate(l, currentWeekRange) === wd.date ||
                        normalizeDateToIso(l.date) === wd.date ||
                        l.date === wd.date
                    );
                    const isSelectedDay = editDate === wd.date;
                    return (
                      <button
                        key={wd.date}
                        type="button"
                        onClick={() => {
                          if (matchingLogForDay) {
                            openEditLogModal(matchingLogForDay, editCandidateLogs);
                          } else {
                            const currentMember = allTrackedEmployees.find((emp) => emp.id === editEmployeeId);
                            if (currentMember) {
                              const cleanDayDraft = buildCleanDraftLogForMember(currentMember, wd.date);
                              openEditLogModal(cleanDayDraft, editCandidateLogs);
                            } else {
                              setEditDate(wd.date);
                              setEditHours(8);
                              setEditNotes('');
                              setEditingLog({
                                ...editingLog,
                                id: '__new_matrix_log__',
                                date: wd.date,
                                hoursLogged: 8,
                                notes: '',
                              });
                            }
                          }
                        }}
                        className={`py-1.5 px-1 rounded-lg border text-center transition ${
                          isSelectedDay
                            ? 'bg-blue-600/30 border-blue-500 text-white font-bold'
                            : matchingLogForDay
                            ? 'bg-slate-800 border-slate-700 text-blue-300 hover:border-slate-600'
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-[10px] truncate">{wd.label.replace(' (Today)', '')}</div>
                        <div className="text-[10px] font-mono mt-0.5">
                          {matchingLogForDay ? `${matchingLogForDay.hoursLogged}h` : wd.dayNum}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Team Member</label>
                  <select
                    value={editEmployeeId}
                    onChange={(e) => {
                      const nextEmpId = e.target.value;
                      const nextEmp = allTrackedEmployees.find((emp) => emp.id === nextEmpId);
                      if (!nextEmp) {
                        setEditEmployeeId(nextEmpId);
                        return;
                      }
                      const sourceLogs = allWorkLogs && allWorkLogs.length > 0 ? allWorkLogs : workLogs || [];
                      const nextEmpLogs = sourceLogs.filter(
                        (w) =>
                          (logTypeFilter === 'test' ? Boolean(w.isTestEntry) : !w.isTestEntry) &&
                          doesLogMatchEmployee(w, nextEmp)
                      );
                      const existingOnDate = nextEmpLogs.find(
                        (w) =>
                          getEffectiveLogDate(w, currentWeekRange) === editDate ||
                          normalizeDateToIso(w.date) === editDate ||
                          w.date === editDate
                      );
                      if (existingOnDate) {
                        openEditLogModal(existingOnDate, nextEmpLogs);
                      } else {
                        const cleanDraft = buildCleanDraftLogForMember(
                          nextEmp,
                          editDate || toLocalIsoDate(new Date())
                        );
                        openEditLogModal(cleanDraft, nextEmpLogs);
                      }
                    }}
                    disabled={!isSuperAdmin}
                    className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-75"
                  >
                    {!allTrackedEmployees.some((emp) => emp.id === editEmployeeId) && editEmployeeId && (
                      <option value={editEmployeeId}>{editingLog.employeeName}</option>
                    )}
                    {allTrackedEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {getMemberLabel(emp)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Target Project</label>
                  <select
                    value={editProjectId}
                    onChange={(e) => setEditProjectId(e.target.value)}
                    className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {cleanProjectName(p.name)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Log Date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => {
                      const nextDate = e.target.value;
                      setEditDate(nextDate);
                      const currentEmp = allTrackedEmployees.find(
                        (emp) => emp.id === editEmployeeId
                      );
                      if (currentEmp && editCandidateLogs.length > 0) {
                        const existingDayLogs = editCandidateLogs.filter(
                          (c) =>
                            doesLogMatchEmployee(c, currentEmp) &&
                            (getEffectiveLogDate(c, currentWeekRange) === nextDate ||
                              c.date === nextDate)
                        );
                        if (existingDayLogs.length > 0) {
                          const totalHrs = existingDayLogs.reduce(
                            (sum, l) => sum + (Number(l.hoursLogged) || 0),
                            0
                          );
                          openEditLogModal(
                            {
                              ...existingDayLogs[0],
                              employeeId: currentEmp.id,
                              memberId: currentEmp.id,
                              userId: currentEmp.id,
                              employeeName: currentEmp.name,
                              memberEmail: currentEmp.email || existingDayLogs[0].memberEmail || '',
                              userEmail: currentEmp.email || existingDayLogs[0].userEmail || '',
                              hoursLogged: totalHrs,
                            },
                            editCandidateLogs
                          );
                        }
                      }
                    }}
                    className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Hours Spent</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    value={editHours}
                    onChange={(e) => setEditHours(Number(e.target.value))}
                    className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">LOD Level</label>
                  <select
                    value={editLodStage}
                    onChange={(e) => setEditLodStage(e.target.value as LODLevel)}
                    className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="LOD 100">LOD 100</option>
                    <option value="LOD 200">LOD 200</option>
                    <option value="LOD 300">LOD 300</option>
                    <option value="LOD 350">LOD 350</option>
                    <option value="LOD 400">LOD 400</option>
                    <option value="LOD 500">LOD 500</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Discipline</label>
                  <select
                    value={editDiscipline}
                    onChange={(e) => setEditDiscipline(e.target.value as Discipline)}
                    className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="BIM - ACS">BIM - ACS</option>
                    <option value="Structure">Structure</option>
                    <option value="MEP - HVAC">MEP - HVAC</option>
                    <option value="MEP - Electrical">MEP - Electrical</option>
                    <option value="MEP - Plumbing">MEP - Plumbing</option>
                    <option value="Façade / Envelope">Façade / Envelope</option>
                    <option value="Coordination & QA">Coordination & QA</option>
                    <option value="Fire Protection">Fire Protection</option>
                    <option value="AI & Automation">AI & Automation</option>
                    <option value="Estimation">Estimation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Activity Category</label>
                  <select
                    value={editActivityType}
                    onChange={(e) => setEditActivityType(e.target.value as ActivityType)}
                    className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Drawing">Drawing</option>
                    <option value="Input Document study">Input Document study</option>
                    <option value="Estimation">Estimation</option>
                    <option value="QA & QC">QA & QC</option>
                    <option value="RFI , Mark up & issue Creation">RFI , Mark up & issue Creation</option>
                    <option value="Dynamo Script Making">Dynamo Script Making</option>
                    <option value="Addins & Pluggins Creation">Addins & Pluggins Creation</option>
                    <option value="3D Detailed Modeling">3D Detailed Modeling</option>
                    <option value="Clash Detection & Resolution">Clash Detection & Resolution</option>
                    <option value="Construction Documentation & Sheets">Construction Documentation & Sheets</option>
                    <option value="Parametric Family Creation">Parametric Family Creation</option>
                    <option value="Coordination & Navisworks Review">Coordination & Navisworks Review</option>
                    <option value="COBie & Asset Data Entry">COBie & Asset Data Entry</option>
                    <option value="Scan-to-BIM Point Cloud Modeling">Scan-to-BIM Point Cloud Modeling</option>
                    <option value="2D to 3D Conversion">2D to 3D Conversion</option>
                    <option value="AI & Automation">AI & Automation</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Work Notes & Technical Details</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="editBillable"
                    checked={editBillable}
                    onChange={(e) => setEditBillable(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="editBillable" className="text-slate-300 select-none cursor-pointer">
                    Billable Client Project Hours
                  </label>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <input
                    type="checkbox"
                    id="editIsTestEntry"
                    checked={editIsTestEntry}
                    onChange={(e) => setEditIsTestEntry(e.target.checked)}
                    className="rounded bg-slate-800 border-amber-500/50 text-amber-500 focus:ring-amber-500"
                  />
                  <label htmlFor="editIsTestEntry" className="text-amber-300 font-semibold select-none cursor-pointer flex items-center gap-1.5">
                    <span>Mark as Test Entry</span>
                    {editIsTestEntry && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/25 text-amber-300 border border-amber-400/50">
                        [TEST]
                      </span>
                    )}
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setEditingLog(null);
                    setEditCandidateLogs([]);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE DAILY LOG CONFIRMATION PROMPT MODAL */}
      {logToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full text-slate-100 shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Delete this daily log entry?</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    This permanently deletes the timesheet record from Firestore.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLogToDelete(null);
                  setDeleteCandidateLogs([]);
                }}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {deleteCandidateLogs.length > 1 && (
              <div className="text-xs">
                <label className="block text-slate-400 font-medium mb-1">
                  Select Daily Log Entry ({deleteCandidateLogs.length} entries)
                </label>
                <select
                  value={logToDelete.id}
                  onChange={(e) => {
                    const found = deleteCandidateLogs.find((c) => c.id === e.target.value);
                    if (found) setLogToDelete(found);
                  }}
                  className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500 cursor-pointer"
                >
                  {deleteCandidateLogs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.date} • {c.hoursLogged} hrs • {c.projectName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-slate-800/70 border border-slate-700/70 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Employee:</span>
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <span>{logToDelete.employeeName}</span>
                  {logToDelete.isTestEntry && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      [TEST]
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Project:</span>
                <span className="font-semibold text-blue-300">{logToDelete.projectName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Date & Hours:</span>
                <span className="font-mono font-bold text-white">
                  {logToDelete.date} • {logToDelete.hoursLogged} hrs
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Delete this daily log entry? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setLogToDelete(null);
                  setDeleteCandidateLogs([]);
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteLog}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Log</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
