import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Building,
  User,
  Calendar,
  CheckCircle2,
  Tag,
  FileText
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  useBimData,
  isUserSuperAdmin,
  isUserViewer,
  toLocalIsoDate,
  cleanProjectName,
  getMemberLabel,
  sanitizeEmployeeRecord,
} from '../context/BimDataContext';
import { normalizeUserRole } from '../auth/googleAuth';
import { generateRequestDocId } from '../auth/roleSync';
import { Discipline, ActivityType, LODLevel } from '../types';

interface LogTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedProjectId?: string;
}

export const LogTimeModal: React.FC<LogTimeModalProps> = ({
  isOpen,
  onClose,
  preselectedProjectId,
}) => {
  const {
    projects,
    employees,
    resourceAllocations,
    addWorkLog,
    currentUser,
  } = useBimData();
  const isSuper = isUserSuperAdmin(currentUser);

  const isViewer = React.useMemo(() => {
    if (!currentUser) return false;
    if (isSuper) return false;
    const roleNormalized = normalizeUserRole(currentUser.appRole || currentUser.role || '');
    if (roleNormalized === 'SUPER_ADMIN' || roleNormalized === 'DIRECTOR') return false;
    return (
      roleNormalized === 'VIEWER' ||
      currentUser.securityRole === 'Viewer' ||
      currentUser.accessLevel === 'Viewer' ||
      currentUser.role === 'Viewer' ||
      currentUser.role === 'VIEWER' ||
      currentUser.appRole === 'VIEWER' ||
      isUserViewer(currentUser, true, currentUser.securityRole)
    );
  }, [currentUser, isSuper]);

  // Resolve allocations belonging strictly to the current logged-in user
  const viewerAllocations = React.useMemo(() => {
    if (!currentUser) return [];
    const cleanEmail = (currentUser.email || '').trim().toLowerCase();
    const userId = (currentUser.id || '').trim();
    const userIdStripped = userId.replace(/^emp-/, '');
    const detId = cleanEmail ? generateRequestDocId(cleanEmail) : '';
    const userName = (currentUser.name || '').trim().toLowerCase();

    return (resourceAllocations || []).filter((alloc) => {
      const aId = (alloc.employeeId || alloc.memberId || '').trim();
      const aIdStripped = aId.replace(/^emp-/, '');
      const aEmail = (alloc.memberEmail || alloc.assignedToEmail || '').trim().toLowerCase();
      const aName = (alloc.employeeName || '').trim().toLowerCase();
      if (userName && aName && userName !== aName) return false;
      return (
        (userId && (aId === userId || aIdStripped === userIdStripped)) ||
        (detId && aIdStripped === detId) ||
        (cleanEmail && aEmail && aEmail === cleanEmail) ||
        (userName && aName && aName === userName)
      );
    });
  }, [resourceAllocations, currentUser]);

  const activeTeamMembers = React.useMemo(() => {
    const raw = (employees || [])
      .filter((member) => !member.isDeleted && member.status !== 'deleted')
      .map((member) => sanitizeEmployeeRecord({ ...member }));
    const seen = new Set<string>();
    const deduplicated = raw.filter((member) => {
      const emailKey = (member.email || '').trim().toLowerCase();
      const idKey = (member.id || '').trim().toLowerCase();
      const strippedId = idKey.replace(/^emp-/, '');
      const detId = emailKey ? generateRequestDocId(emailKey).toLowerCase() : '';
      const nameKey = (member.name || '').trim().toLowerCase().replace(/sushoovan/g, 'sushovan');
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

    if (isViewer && currentUser) {
      const userEmail = (currentUser.email || '').trim().toLowerCase();
      const userId = (currentUser.id || '').trim();
      const userIdStripped = userId.replace(/^emp-/, '');
      const userName = (currentUser.name || '').trim().toLowerCase();

      const matched = deduplicated.find((m) => {
        const mEmail = (m.email || '').trim().toLowerCase();
        const mId = (m.id || '').trim();
        const mIdStripped = mId.replace(/^emp-/, '');
        const mName = (m.name || '').trim().toLowerCase();
        if (userEmail && mEmail && mEmail === userEmail) return true;
        if (userId && (mId === userId || mIdStripped === userIdStripped)) return true;
        if (userName && mName && (mName === userName || mName.includes(userName) || userName.includes(mName))) return true;
        return false;
      });

      if (matched) {
        return [matched];
      }

      return [
        {
          id: userId || 'emp-user',
          name: currentUser.name || (userEmail ? userEmail.split('@')[0] : 'Team Member'),
          email: currentUser.email || '',
          avatar:
            currentUser.avatar ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
              currentUser.name || 'User'
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
        },
      ];
    }

    return deduplicated;
  }, [employees, isViewer, currentUser]);

  const [projectId, setProjectId] = useState<string>(
    preselectedProjectId || viewerAllocations[0]?.projectId || projects[0]?.id || ''
  );
  const [employeeId, setEmployeeId] = useState<string>(
    activeTeamMembers[0]?.id || currentUser?.id || ''
  );
  const [date, setDate] = useState<string>(() => toLocalIsoDate(new Date()));
  const [hours, setHours] = useState<number>(4);
  const [discipline, setDiscipline] = useState<Discipline>('MEP - HVAC');
  const [activityType, setActivityType] = useState<ActivityType>(
    '3D Detailed Modeling'
  );
  const [taskName, setTaskName] = useState<string>('');
  const [lodStage, setLodStage] = useState<LODLevel>('LOD 350');
  const [notes, setNotes] = useState<string>('');
  const [billable, setBillable] = useState<boolean>(true);
  const [isTestEntry, setIsTestEntry] = useState<boolean>(false);

  // Isolated per-employee draft map so switching team members never clones notes or fields across users
  const memberFormDraftsRef = React.useRef<
    Record<
      string,
      {
        projectId: string;
        date: string;
        hours: number;
        discipline: Discipline;
        activityType: ActivityType;
        lodStage: LODLevel;
        notes: string;
        billable: boolean;
        isTestEntry: boolean;
      }
    >
  >({});

  const getCleanDefaultsForMember = React.useCallback(
    (targetEmpId: string) => {
      const targetEmp =
        activeTeamMembers.find(
          (e) =>
            e.id === targetEmpId ||
            e.id.replace(/^emp-/, '') === targetEmpId.replace(/^emp-/, '')
        ) ||
        employees
          .map((e) => sanitizeEmployeeRecord(e))
          .find(
            (e) =>
              e.id === targetEmpId ||
              e.id.replace(/^emp-/, '') === targetEmpId.replace(/^emp-/, '')
          );
      const targetEmail = (targetEmp?.email || '').trim().toLowerCase();
      const targetName = (targetEmp?.name || '').trim().toLowerCase();

      const memberAlloc = (resourceAllocations || []).find((a) => {
        const aId = (a.employeeId || a.memberId || '').trim();
        const aIdStripped = aId.replace(/^emp-/, '');
        const tIdStripped = targetEmpId.replace(/^emp-/, '');
        const aEmail = (a.memberEmail || a.assignedToEmail || '').trim().toLowerCase();
        const aName = (a.employeeName || '').trim().toLowerCase();
        if (aName && targetName && aName !== targetName) return false;
        return (
          (targetEmpId && (aId === targetEmpId || (aIdStripped && aIdStripped === tIdStripped))) ||
          (targetEmail && aEmail && aEmail === targetEmail) ||
          (targetName && aName && aName === targetName)
        );
      });

      const resolvedProjId =
        preselectedProjectId ||
        memberAlloc?.projectId ||
        targetEmp?.activeProjectIds?.[0] ||
        projects[0]?.id ||
        '';
      const resolvedProj = projects.find((p) => p.id === resolvedProjId) || projects[0];
      const resolvedDisc = (
        memberAlloc?.discipline ||
        targetEmp?.discipline ||
        targetEmp?.primaryDiscipline ||
        resolvedProj?.tasks?.[0]?.discipline ||
        'BIM - ACS'
      ) as Discipline;
      const resolvedLod = (
        memberAlloc?.lod ||
        resolvedProj?.tasks?.[0]?.lod ||
        resolvedProj?.currentLOD ||
        'LOD 350'
      ) as LODLevel;

      return {
        projectId: resolvedProjId,
        date: toLocalIsoDate(new Date()),
        hours: 4,
        discipline: resolvedDisc,
        activityType: '3D Detailed Modeling' as ActivityType,
        lodStage: resolvedLod,
        notes: '',
        billable: true,
        isTestEntry: false,
      };
    },
    [activeTeamMembers, employees, resourceAllocations, preselectedProjectId, projects]
  );

  // Reset form to clean, isolated state each time the modal opens
  const wasOpenRef = React.useRef(false);
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      memberFormDraftsRef.current = {};
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    memberFormDraftsRef.current = {};

    let initialEmpId = activeTeamMembers[0]?.id || '';
    if (currentUser?.email) {
      const cleanEmail = currentUser.email.trim().toLowerCase();
      const cleanUserName = (currentUser.name || '').trim().toLowerCase();
      const detId = generateRequestDocId(cleanEmail);
      const match = activeTeamMembers.find((e) => {
        const eName = (e.name || '').trim().toLowerCase();
        const eEmail = (e.email || '').trim().toLowerCase();
        if (cleanUserName && eName && cleanUserName !== eName) return false;
        return (
          (eEmail && eEmail === cleanEmail) ||
          (cleanUserName && eName === cleanUserName) ||
          e.id === currentUser.id ||
          e.id.replace(/^emp-/, '') === (currentUser.id || '').replace(/^emp-/, '') ||
          e.id.replace(/^emp-/, '') === detId
        );
      });
      const allocMatch = viewerAllocations[0];

      if (!isSuper) {
        initialEmpId =
          match?.id ||
          allocMatch?.employeeId ||
          currentUser.id ||
          `emp-${detId}`;
      } else {
        initialEmpId =
          match?.id ||
          activeTeamMembers[0]?.id ||
          currentUser.id ||
          `emp-${detId}`;
      }
    }

    setEmployeeId(initialEmpId);
    const cleanInit = getCleanDefaultsForMember(initialEmpId);
    setProjectId(cleanInit.projectId);
    setDate(cleanInit.date);
    setHours(cleanInit.hours);
    setDiscipline(cleanInit.discipline);
    setActivityType(cleanInit.activityType);
    setLodStage(cleanInit.lodStage);
    setTaskName('');
    setNotes('');
    setBillable(true);
    setIsTestEntry(false);
  }, [isOpen, currentUser, activeTeamMembers, isSuper, viewerAllocations, getCleanDefaultsForMember]);

  const selectedProject = projects.find((p) => p.id === projectId) || projects[0];
  const assignedMemberId =
    employeeId ||
    (!isSuper ? viewerAllocations[0]?.employeeId || currentUser?.id || '' : activeTeamMembers[0]?.id || '');
  const selectedEmployee =
    activeTeamMembers.find(
      (e) =>
        e.id === assignedMemberId ||
        e.id.replace(/^emp-/, '') === assignedMemberId.replace(/^emp-/, '')
    ) ||
    employees
      .map((e) => sanitizeEmployeeRecord(e))
      .find(
        (e) =>
          e.id === assignedMemberId ||
          e.id.replace(/^emp-/, '') === assignedMemberId.replace(/^emp-/, '')
      );

  const handleMemberSelect = (_disciplineKey: string, memberId: string) => {
    if (assignedMemberId) {
      // Save current member's draft in isolated slot before switching
      memberFormDraftsRef.current[assignedMemberId] = {
        projectId,
        date,
        hours,
        discipline,
        activityType,
        lodStage,
        notes,
        billable,
        isTestEntry,
      };
    }

    setEmployeeId(memberId);

    // Load target member's own isolated draft or initialize fresh defaults for that member
    const existingDraft = memberFormDraftsRef.current[memberId];
    const nextState = existingDraft
      ? { ...existingDraft }
      : getCleanDefaultsForMember(memberId);

    setProjectId(nextState.projectId);
    setDate(nextState.date);
    setHours(nextState.hours);
    setDiscipline(nextState.discipline);
    setActivityType(nextState.activityType);
    setLodStage(nextState.lodStage);
    setTaskName('');
    setNotes(nextState.notes);
    setBillable(nextState.billable);
    setIsTestEntry(nextState.isTestEntry);
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedProjectId = projectId || viewerAllocations[0]?.projectId || projects[0]?.id || '';
    if (!resolvedProjectId || hours <= 0) return;

    const cleanCurrentEmail = (currentUser?.email || '').trim().toLowerCase();
    const fallbackUserId =
      currentUser?.id || (cleanCurrentEmail ? `emp-${generateRequestDocId(cleanCurrentEmail)}` : 'emp-user');
    const effectiveEmployeeId = assignedMemberId || fallbackUserId;

    // Resolve the selected team member directly from sanitized activeTeamMembers
    const rawSelectedEmp =
      activeTeamMembers.find(
        (emp) =>
          emp.id === effectiveEmployeeId ||
          emp.id.replace(/^emp-/, '') === effectiveEmployeeId.replace(/^emp-/, '')
      ) ||
      employees
        .map((emp) => sanitizeEmployeeRecord(emp))
        .find(
          (emp) =>
            emp.id === effectiveEmployeeId ||
            emp.id.replace(/^emp-/, '') === effectiveEmployeeId.replace(/^emp-/, '')
        );
    const selectedEmp = rawSelectedEmp ? sanitizeEmployeeRecord(rawSelectedEmp) : undefined;

    const isLoggingForSelf = Boolean(
      !isSuper && !selectedEmp
        ? true
        : selectedEmp &&
            ((currentUser?.name &&
              selectedEmp.name.trim().toLowerCase() === currentUser.name.trim().toLowerCase()) ||
              (selectedEmp.email &&
                cleanCurrentEmail &&
                selectedEmp.email.trim().toLowerCase() === cleanCurrentEmail))
    );

    const targetEmpNameNorm = (
      selectedEmp?.name ||
      (isLoggingForSelf ? currentUser?.name : '') ||
      ''
    )
      .trim()
      .toLowerCase();
    const targetEmpEmailNorm = (
      selectedEmp?.email ||
      (isLoggingForSelf ? cleanCurrentEmail : '') ||
      ''
    )
      .trim()
      .toLowerCase();

    // Match against active assignments strictly belonging to the selected employee (for projectId/projectName only)
    const matchedAssignment = (resourceAllocations || []).find((alloc) => {
      const sameProj =
        alloc.projectId === resolvedProjectId ||
        alloc.projectId.replace(/^p(\d+)$/, 'proj-$1') === resolvedProjectId.replace(/^p(\d+)$/, 'proj-$1');
      if (!sameProj) return false;
      const aId = (alloc.employeeId || alloc.memberId || '').trim();
      const aIdStripped = aId.replace(/^emp-/, '');
      const effIdStripped = (selectedEmp?.id || effectiveEmployeeId).replace(/^emp-/, '');
      const aEmail = (alloc.memberEmail || alloc.assignedToEmail || '').trim().toLowerCase();
      const aName = (alloc.employeeName || '').trim().toLowerCase();
      if (aName && targetEmpNameNorm && aName !== targetEmpNameNorm) return false;
      return (
        aId === (selectedEmp?.id || effectiveEmployeeId) ||
        (aIdStripped && aIdStripped === effIdStripped) ||
        (targetEmpEmailNorm && aEmail && aEmail === targetEmpEmailNorm) ||
        (targetEmpNameNorm && aName && aName === targetEmpNameNorm)
      );
    });

    // Strictly bind user identifiers to the selected dropdown member without allowing matchedAssignment to override
    const finalEmpId = selectedEmp?.id || effectiveEmployeeId;
    const finalProjectId = matchedAssignment?.projectId || resolvedProjectId;
    const finalEmpName =
      selectedEmp?.name ||
      (isLoggingForSelf ? currentUser?.name : undefined) ||
      'BIM Modeler';
    const memberEmail = (
      selectedEmp?.email ||
      (isLoggingForSelf ? cleanCurrentEmail : '') ||
      ''
    )
      .trim()
      .toLowerCase();
    const resolvedUserId = finalEmpId;

    const loggedByIdentifier =
      cleanCurrentEmail ||
      currentUser?.name ||
      memberEmail ||
      finalEmpName ||
      'BIM Modeler';
    const createdAtIso = new Date().toISOString();

    addWorkLog({
      employeeId: finalEmpId,
      memberId: finalEmpId,
      employeeName: finalEmpName,
      projectId: finalProjectId,
      projectName: selectedProject?.name || matchedAssignment?.projectName || 'BIM Project',
      date,
      hoursLogged: Number(hours),
      discipline,
      activityType,
      taskName: taskName || '',
      lodStage,
      notes: notes.trim() || `Logged ${hours}h on ${activityType} for ${selectedProject?.name || 'BIM Project'}`,
      billable,
      memberEmail,
      userEmail: memberEmail,
      userId: resolvedUserId,
      isTestEntry: Boolean(isTestEntry),
      loggedBy: loggedByIdentifier,
      createdAt: createdAtIso,
    });

    // Clear isolated drafts after submission
    memberFormDraftsRef.current = {};
    setNotes('');

    try {
      confetti({
        particleCount: 35,
        spread: 50,
        origin: { y: 0.8 },
      });
    } catch {}

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full my-8 text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Log Daily Project Hours
              </h3>
              <p className="text-xs text-slate-400">
                Record BIM modeler time against project WBS and LOD stages
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 font-medium mb-1">
                BIM Specialist / Modeler
              </label>
              {isViewer ? (
                <div className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">
                    {getMemberLabel({
                      name: currentUser?.name || currentUser?.email || 'Modeler',
                      role: 'VIEWER',
                    })}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                    Logged-In User
                  </span>
                </div>
              ) : (
                <select
                  aria-label="Select Modeler"
                  value={assignedMemberId || ''}
                  onChange={(e) => handleMemberSelect(discipline, e.target.value)}
                  className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  required
                >
                  {activeTeamMembers.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {getMemberLabel(emp)}
                    </option>
                  ))}
                  {currentUser &&
                    !activeTeamMembers.some((e) => {
                      const eEmail = (e.email || '').trim().toLowerCase();
                      const uEmail = (currentUser.email || '').trim().toLowerCase();
                      const eId = (e.id || '').trim().replace(/^emp-/, '');
                      const uId = (currentUser.id || '').trim().replace(/^emp-/, '');
                      const uDetId = uEmail ? generateRequestDocId(uEmail) : '';
                      const eName = (e.name || '').trim().toLowerCase();
                      const uName = (currentUser.name || '').trim().toLowerCase();
                      return (
                        (uId && eId === uId) ||
                        (uDetId && eId === uDetId) ||
                        (uEmail && eEmail && eEmail === uEmail) ||
                        (uName && eName && eName === uName)
                      );
                    }) && (
                      <option
                        value={
                          selectedEmployee?.id ||
                          currentUser.id ||
                          (currentUser.email ? `emp-${generateRequestDocId(currentUser.email)}` : 'emp-user')
                        }
                      >
                        {getMemberLabel({
                          name: currentUser.name || currentUser.email,
                          role: isSuper ? 'SUPER_ADMIN' : (currentUser.appRole || currentUser.role || 'VIEWER'),
                        })}
                      </option>
                    )}
                </select>
              )}
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Target Project
              </label>
              <select
                aria-label="Select Target Project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                required
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
              <label className="block text-slate-400 font-medium mb-1">
                Log Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Hours Spent
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                LOD Level
              </label>
              <select
                aria-label="Select LOD Level"
                value={lodStage}
                onChange={(e) => setLodStage(e.target.value as LODLevel)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
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
              <label className="block text-slate-400 font-medium mb-1">
                Discipline
              </label>
              <select
                aria-label="Select Discipline"
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value as Discipline)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
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
              <label className="block text-slate-400 font-medium mb-1">
                Activity Category
              </label>
              <select
                aria-label="Select Activity Category"
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as ActivityType)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
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
            <label className="block text-slate-400 font-medium mb-1">
              Work Notes & Technical Details
            </label>
            <textarea
              rows={3}
              placeholder="Detailed description of coordination adjustments, clashes resolved, or sheets compiled..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="billable"
                checked={billable}
                onChange={(e) => setBillable(e.target.checked)}
                className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="billable" className="text-slate-300 select-none cursor-pointer">
                Billable Client Project Hours
              </label>
            </div>

            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <input
                type="checkbox"
                id="isTestEntry"
                checked={isTestEntry}
                onChange={(e) => setIsTestEntry(e.target.checked)}
                className="rounded bg-slate-800 border-amber-500/50 text-amber-500 focus:ring-amber-500"
              />
              <label htmlFor="isTestEntry" className="text-amber-300 font-semibold select-none cursor-pointer flex items-center gap-1.5">
                <span>Mark as Test Entry</span>
                {isTestEntry && (
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
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Submit Timesheet Entry</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
