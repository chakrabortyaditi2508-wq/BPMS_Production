import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  Filter,
  Plus,
  Clock,
  Briefcase,
  Layers,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Building,
  UserPlus,
  Mail,
  Phone,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  ChevronRight,
  ExternalLink,
  Zap,
  BarChart2,
  Edit,
  Gauge,
  Award,
  Target,
  Check,
  ArrowUpRight
} from 'lucide-react';
import { useBimData, isUserSuperAdmin, cleanProjectName } from '../context/BimDataContext';
import { Employee, BimProject, Discipline, DailyWorkLog } from '../types';
import { EditEmployeeModal } from './EditEmployeeModal';

interface ProjectMemberTrackingProps {
  onOpenNewEmployeeModal: () => void;
  onOpenNewProjectModal: () => void;
  onOpenLogModalForMember?: (employeeId?: string) => void;
  onSelectProject?: (project: BimProject) => void;
}

type ViewMode = 'member-cards' | 'efficiency-management';

export const ProjectMemberTracking: React.FC<ProjectMemberTrackingProps> = ({
  onOpenNewEmployeeModal,
  onOpenNewProjectModal,
  onOpenLogModalForMember,
  onSelectProject,
}) => {
  const {
    employees,
    projects,
    workLogs,
    getEmployeeLoggedHours,
    getProjectCompletedHours,
    updateEmployee,
    theme,
    currentUser,
  } = useBimData();
  const isLight = theme === 'light';
  const isSuperAdmin = isUserSuperAdmin(currentUser);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('member-cards');
  const [assignModalEmployee, setAssignModalEmployee] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [evaluatingEmployee, setEvaluatingEmployee] = useState<Employee | null>(null);
  const [evaluationNotes, setEvaluationNotes] = useState('');
  const [evaluationRating, setEvaluationRating] = useState('High');
  const [evaluationFeedbackSaved, setEvaluationFeedbackSaved] = useState<Record<string, { rating: string; notes: string; date: string }>>({});

  const activeMembers = employees;

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return (activeMembers || []).filter((emp) => {
      if (!activeMembers.some((m) => m.id === emp.id || m.email.toLowerCase() === emp.email.toLowerCase())) {
        return false;
      }

      const matchesSearch =
        (emp.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.role || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (emp.skills || []).some((s) => (s || '').toLowerCase().includes(searchQuery.toLowerCase())) ||
        (emp.primaryDiscipline || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesProject =
        selectedProjectId === 'all' || (emp.activeProjectIds || []).includes(selectedProjectId);

      const matchesDiscipline =
        selectedDiscipline === 'all' || emp.primaryDiscipline === selectedDiscipline;

      const matchesStatus =
        selectedStatus === 'all' || emp.status === selectedStatus;

      return matchesSearch && matchesProject && matchesDiscipline && matchesStatus;
    });
  }, [activeMembers, searchQuery, selectedProjectId, selectedDiscipline, selectedStatus]);

  // Aggregate metrics strictly for active members
  const activeEmpIds = useMemo(() => new Set(activeMembers.map((e) => e.id)), [activeMembers]);
  const activeEmpNames = useMemo(() => new Set(activeMembers.map((e) => (e.name || '').toLowerCase().trim())), [activeMembers]);

  const totalLoggedHours = (workLogs || [])
    .filter((log) => !log.isTestEntry && (activeEmpIds.has(log.employeeId) || activeEmpNames.has((log.employeeName || '').toLowerCase().trim())))
    .reduce((sum, log) => sum + (log.hoursLogged || 0), 0);
  const totalWeeklyCapacity = (activeMembers || []).reduce((sum, emp) => sum + (emp.weeklyCapacityHours || 40), 0);
  
  // Hours assigned or logged in current week across active members
  const recent7DaysHours = (activeMembers || []).reduce(
    (sum, emp) => sum + getEmployeeLoggedHours(emp.id, 'this-week'),
    0
  );

  const avgUtilization = totalWeeklyCapacity > 0
    ? Math.round((recent7DaysHours / totalWeeklyCapacity) * 100)
    : 0;

  // Export CSV of member-project hours
  const exportMemberMatrixCSV = () => {
    const headers = ['Member Name', 'Role', 'Discipline', 'Status', 'Hourly Rate ($)', 'Assigned Projects', 'Weekly Logged Hours', 'Total Project Hours'];
    const rows = (activeMembers || []).map((emp) => {
      const weeklyHours = getEmployeeLoggedHours(emp.id, 'this-week') || 0;
      const totalHours = getEmployeeLoggedHours(emp.id, 'all') || 0;
      const assignedProjCodes = (emp.activeProjectIds || [])
        .map((pId) => projects.find((p) => p.id === pId)?.code || pId)
        .join('; ');

      return [
        `"${emp.name || ''}"`,
        `"${emp.role || ''}"`,
        `"${emp.primaryDiscipline || ''}"`,
        `"${emp.status || ''}"`,
        emp.hourlyRate || 0,
        `"${assignedProjCodes}"`,
        weeklyHours.toFixed(1),
        totalHours.toFixed(1),
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BIM_Project_Member_Tracking_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getDisciplineBadge = (disc: Discipline) => {
    switch (disc) {
      case 'BIM - ACS':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'Structure':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'MEP - HVAC':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'MEP - Electrical':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'MEP - Plumbing':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
      case 'Façade / Envelope':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'Coordination & QA':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  const handleToggleProjectAssignment = (employee: Employee, projectId: string) => {
    const current = employee.activeProjectIds;
    const next = current.includes(projectId)
      ? current.filter((id) => id !== projectId)
      : [...current, projectId];
    updateEmployee(employee.id, { activeProjectIds: next });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Quick Action Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
              <Users className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Project Member Tracking
            </h1>
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
              Workload & Capacity
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Tracking {employees.length} BIM specialists across {projects.length} active projects with live capacity burn and discipline assignments.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <>
              <button
                onClick={onOpenNewEmployeeModal}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm"
                title="Register New BIM Team Member"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add Member</span>
              </button>

              <button
                onClick={onOpenNewProjectModal}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                title="Create New BIM Project"
              >
                <Plus className="w-4 h-4 text-slate-400" />
                <span>Add Project</span>
              </button>
            </>
          )}

          <button
            onClick={exportMemberMatrixCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Download CSV matrix of member allocations"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export Matrix</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Members */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Engaged Members
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{employees.length}</span>
              <span className="text-xs text-blue-400 font-medium">BIM Specialists</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Across {projects.length} multi-trade projects
            </p>
          </div>
        </div>

        {/* Weekly Workload Utilization */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Team Workload Load
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{avgUtilization}%</span>
              <span className="text-xs text-emerald-400 font-medium">Weekly Capacity</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {recent7DaysHours.toFixed(1)}h logged / {totalWeeklyCapacity}h available
            </p>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full ${
                avgUtilization > 95 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, avgUtilization)}%` }}
            />
          </div>
        </div>

        {/* Total Member Hours Logged */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Cumulative Hours Logged
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">
                {totalLoggedHours.toLocaleString()}
              </span>
              <span className="text-xs text-slate-400">Total Hours</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {workLogs.length} verified timesheet entries
            </p>
          </div>
        </div>

        {/* High Workload Alerts */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Workload Status
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">
                {employees.filter((e) => e.status === 'High Workload').length}
              </span>
              <span className="text-xs text-amber-400 font-medium">Over-Capacity</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {employees.filter((e) => e.status === 'Active').length} Active • {employees.filter((e) => e.status === 'On Leave').length} On Leave
            </p>
          </div>
        </div>
      </div>

      {/* View Mode & Filter Controls Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* View Title Badge */}
          <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs w-full md:w-auto">
            <span className="px-3 py-1.5 rounded font-medium bg-blue-600 text-white shadow-xs">
              Member Workload Cards
            </span>
          </div>

          {/* Search box */}
          <div className="w-full md:w-72 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search member, skill, role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg pl-8 pr-3 py-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
            />
          </div>
        </div>

        {/* Secondary Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80 text-xs">
          {/* Project Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Project:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Projects ({projects.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {cleanProjectName(p.name)}
                </option>
              ))}
            </select>
          </div>

          {/* Discipline Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Discipline:</span>
            <select
              value={selectedDiscipline}
              onChange={(e) => setSelectedDiscipline(e.target.value)}
              className="bg-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Disciplines</option>
              <option value="BIM - ACS">BIM - ACS</option>
              <option value="Structure">Structure</option>
              <option value="MEP - HVAC">MEP - HVAC</option>
              <option value="MEP - Electrical">MEP - Electrical</option>
              <option value="MEP - Plumbing">MEP - Plumbing</option>
              <option value="Façade / Envelope">Façade / Envelope</option>
              <option value="Coordination & QA">Coordination & QA</option>
              <option value="AI & Automation">AI & Automation</option>
              <option value="Estimation">Estimation</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="Active">Active</option>
              <option value="High Workload">High Workload</option>
              <option value="On Leave">On Leave</option>
            </select>
          </div>

          {/* Reset Filters */}
          {(selectedProjectId !== 'all' || selectedDiscipline !== 'all' || selectedStatus !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedProjectId('all');
                setSelectedDiscipline('all');
                setSelectedStatus('all');
                setSearchQuery('');
              }}
              className="text-xs text-blue-400 hover:text-blue-300 underline ml-auto font-medium"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* VIEW 1: Member Cards Grid */}
      {viewMode === 'member-cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEmployees.length === 0 ? (
            <div className="col-span-full bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400 text-xs">
              No team members match the active filters.
            </div>
          ) : (
            filteredEmployees.map((emp) => {
              if (!activeMembers.some((m) => m.id === emp.id || m.email.toLowerCase() === emp.email.toLowerCase())) return null;

              const weeklyHours = getEmployeeLoggedHours(emp.id, 'this-week');
              const totalHours = Math.max(getEmployeeLoggedHours(emp.id, 'all'), weeklyHours);
              const capacityPct = Math.round((weeklyHours / (emp.weeklyCapacityHours || 40)) * 100);
              const isOverCapacity = capacityPct > 100;

              const assignedProjects = projects.filter((p) => emp.activeProjectIds.includes(p.id));

              // Find member's active tasks across projects
              const activeTasks = projects.flatMap((p) =>
                p.tasks.filter((t) => t.assignedEmployeeId === emp.id && t.status !== 'Completed')
              );

              return (
                <div
                  key={emp.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-sm flex flex-col justify-between hover:border-slate-700 transition space-y-4"
                >
                  {/* Top Profile Header */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-white hover:text-blue-300 transition">
                          {emp.name}
                        </h3>
                        <p className="text-xs text-slate-400 font-medium">{emp.role}</p>
                        <span
                          className={`inline-block text-[9px] font-semibold px-2 py-0.5 rounded-full mt-1 border ${getDisciplineBadge(
                            emp.primaryDiscipline
                          )}`}
                        >
                          {emp.primaryDiscipline}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isSuperAdmin && (
                          <button
                            onClick={() => setEditingEmployee(emp)}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 hover:border-blue-500/50 text-[10px] font-semibold flex items-center gap-1 transition"
                            title="Edit member details"
                          >
                            <Edit className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        )}
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            emp.status === 'Active'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : emp.status === 'High Workload'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {emp.status}
                        </span>
                      </div>
                    </div>

                    {/* Contact & Rate */}
                    <div className="mt-3.5 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5 truncate">
                        <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{emp.email}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500">Rate: </span>
                        <strong className="text-slate-200">${emp.hourlyRate}/hr</strong>
                      </div>
                    </div>

                    {/* Weekly Capacity Meter */}
                    <div className="mt-3 bg-slate-800/60 border border-slate-700/60 rounded-lg p-2.5">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-400">Weekly Capacity Load:</span>
                        <span
                          className={`font-semibold ${
                            isOverCapacity ? 'text-rose-400' : 'text-slate-200'
                          }`}
                        >
                          {weeklyHours.toFixed(1)} / {emp.weeklyCapacityHours || 40}h ({capacityPct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isOverCapacity
                              ? 'bg-rose-500'
                              : capacityPct > 80
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, capacityPct)}%` }}
                        />
                      </div>
                    </div>

                    {/* Assigned Projects */}
                    <div className="mt-3.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-semibold">Assigned Projects ({assignedProjects.length})</span>
                        {isSuperAdmin && (
                          <button
                            onClick={() => setAssignModalEmployee(emp)}
                            className="text-[11px] text-blue-400 hover:text-blue-300 font-medium"
                          >
                            Edit Assignments
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {assignedProjects.length > 0 ? (
                          assignedProjects.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => onSelectProject?.(p)}
                              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 text-[10px] font-medium transition flex items-center gap-1"
                              title={`${p.name} - Click to inspect`}
                            >
                              <span>{p.code}</span>
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </button>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">No active project assignments</span>
                        )}
                      </div>
                    </div>

                    {/* Active Tasks list preview */}
                    {activeTasks.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-800/80">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider block mb-1.5">
                          Active Assigned Tasks ({activeTasks.length})
                        </span>
                        <div className="space-y-1">
                          {activeTasks.slice(0, 2).map((t) => (
                            <div
                              key={t.id}
                              className="text-[11px] bg-slate-800/40 p-1.5 rounded border border-slate-800 flex items-center justify-between gap-1 text-slate-300"
                            >
                              <span className="truncate">{t.name}</span>
                              <span className="text-[10px] text-indigo-300 shrink-0">{t.dueDate}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Total: <strong className="text-slate-200">{totalHours.toFixed(1)}h</strong> logged
                    </span>

                    <button
                      onClick={() => onOpenLogModalForMember?.(emp.id)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 font-medium transition flex items-center gap-1"
                    >
                      <Clock className="w-3 h-3" />
                      <span>Log Hours</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Edit Project Assignments Modal */}
      {assignModalEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 text-slate-100 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-sm border border-slate-700 shrink-0">
                  {assignModalEmployee.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || 'U'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{assignModalEmployee.name}</h3>
                  <p className="text-xs text-slate-400">{assignModalEmployee.role}</p>
                </div>
              </div>
              <button
                onClick={() => setAssignModalEmployee(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Select Assigned BIM Projects:
              </label>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {projects.map((p) => {
                  const isAssigned = assignModalEmployee.activeProjectIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleToggleProjectAssignment(assignModalEmployee, p.id)}
                      className={`p-3 rounded-lg border cursor-pointer transition flex items-center justify-between ${
                        isAssigned
                          ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                          : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">{p.code}</span>
                          <span className="text-xs font-semibold text-white">{p.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">{p.buildingType}</span>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                          isAssigned
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'border-slate-600 bg-slate-800'
                        }`}
                      >
                        {isAssigned && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setAssignModalEmployee(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Details Modal */}
      <EditEmployeeModal
        isOpen={Boolean(editingEmployee)}
        onClose={() => setEditingEmployee(null)}
        employee={editingEmployee}
      />
    </div>
  );
};
