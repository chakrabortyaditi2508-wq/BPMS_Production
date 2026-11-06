import React, { useState, useMemo, useRef } from 'react';
import {
  Calendar,
  Layers,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sparkles,
  Search,
  Filter,
  ArrowRight,
  User,
  Building,
  Target,
  Maximize2,
  Minimize2,
  Flame,
  Info,
  CalendarRange,
  Zap
} from 'lucide-react';
import { BimProject, Milestone, TaskItem, Discipline, LODLevel } from '../types';
import { useBimData } from '../context/BimDataContext';

interface ProjectGanttTimelineProps {
  onSelectProject?: (project: BimProject) => void;
  onOpenReportModal?: (projectId?: string) => void;
}

type TimeHorizon = '2026-year' | '2026-focus' | 'extended';
type ViewDensity = 'standard' | 'detailed' | 'milestones-only';

export const ProjectGanttTimeline: React.FC<ProjectGanttTimelineProps> = ({
  onSelectProject,
  onOpenReportModal,
}) => {
  const { projects, getProjectCompletedHours, employees, updateProjectStatus } = useBimData();

  // Controls state
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>('2026-year');
  const [viewDensity, setViewDensity] = useState<ViewDensity>('standard');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');
  const [lodFilter, setLodFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProjectIds, setExpandedProjectIds] = useState<Record<string, boolean>>({
    'proj-1': true,
    'proj-2': true,
  });
  const [selectedMilestone, setSelectedMilestone] = useState<{
    milestone: Milestone;
    project: BimProject;
  } | null>(null);

  const timelineContainerRef = useRef<HTMLDivElement>(null);

  // Reference "Today" date in 2026
  const todayStr = '2026-08-18';
  const todayTime = new Date(todayStr + 'T00:00:00').getTime();

  // Define timeline start & end dates based on selected horizon
  const { startDate, endDate, monthsList, quartersList } = useMemo(() => {
    let start: Date;
    let end: Date;

    if (timeHorizon === '2026-focus') {
      // Q2 - Q4 2026 (Apr 2026 - Dec 2026)
      start = new Date('2026-04-01T00:00:00');
      end = new Date('2026-12-31T23:59:59');
    } else if (timeHorizon === 'extended') {
      // Jan 2026 - Aug 2027 (20 Months)
      start = new Date('2026-01-01T00:00:00');
      end = new Date('2027-08-31T23:59:59');
    } else {
      // 2026 Full Year (Jan - Dec 2026)
      start = new Date('2026-01-01T00:00:00');
      end = new Date('2026-12-31T23:59:59');
    }

    const totalDuration = end.getTime() - start.getTime();

    // Generate array of month slots
    const months: Array<{ label: string; year: number; monthIndex: number; leftPct: number; widthPct: number }> = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);

    while (current <= end) {
      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1).getTime();
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0, 23, 59, 59).getTime();

      const clampedStart = Math.max(start.getTime(), monthStart);
      const clampedEnd = Math.min(end.getTime(), monthEnd);

      const leftPct = ((clampedStart - start.getTime()) / totalDuration) * 100;
      const widthPct = ((clampedEnd - clampedStart) / totalDuration) * 100;

      const monthName = current.toLocaleString('en-US', { month: 'short' });
      const yearShort = current.getFullYear() !== 2026 ? ` '${String(current.getFullYear()).slice(2)}` : '';

      months.push({
        label: `${monthName}${yearShort}`,
        year: current.getFullYear(),
        monthIndex: current.getMonth(),
        leftPct,
        widthPct,
      });

      current.setMonth(current.getMonth() + 1);
    }

    // Group into quarters
    const quarters: Array<{ label: string; leftPct: number; widthPct: number }> = [];
    let qStart = 0;
    for (let i = 0; i < months.length; i += 3) {
      const qMonths = months.slice(i, i + 3);
      if (qMonths.length > 0) {
        const qLeft = qMonths[0].leftPct;
        const qWidth = qMonths.reduce((sum, m) => sum + m.widthPct, 0);
        const qIndex = Math.floor(qMonths[0].monthIndex / 3) + 1;
        quarters.push({
          label: `Q${qIndex} ${qMonths[0].year}`,
          leftPct: qLeft,
          widthPct: qWidth,
        });
      }
    }

    return {
      startDate: start,
      endDate: end,
      totalDuration,
      monthsList: months,
      quartersList: quarters,
    };
  }, [timeHorizon]);

  const totalTimeDuration = endDate.getTime() - startDate.getTime();

  // Helper date positioning functions
  const getDatePercent = (dateStr: string) => {
    const t = new Date(dateStr + 'T00:00:00').getTime();
    if (isNaN(t)) return 0;
    const pct = ((t - startDate.getTime()) / totalTimeDuration) * 100;
    return Math.max(0, Math.min(100, pct));
  };

  const getBarCoordinates = (startStr: string, endStr: string) => {
    const s = new Date(startStr + 'T00:00:00').getTime();
    const e = new Date(endStr + 'T23:59:59').getTime();

    const clampedStart = Math.max(startDate.getTime(), s);
    const clampedEnd = Math.min(endDate.getTime(), e);

    if (clampedEnd < startDate.getTime() || clampedStart > endDate.getTime()) {
      return { left: 0, width: 0, visible: false };
    }

    const left = ((clampedStart - startDate.getTime()) / totalTimeDuration) * 100;
    const width = Math.max(1.5, ((clampedEnd - clampedStart) / totalTimeDuration) * 100);

    return { left, width, visible: true };
  };

  const todayPercent = getDatePercent(todayStr);

  const toggleExpand = (projectId: string) => {
    setExpandedProjectIds((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    projects.forEach((p) => {
      next[p.id] = true;
    });
    setExpandedProjectIds(next);
  };

  const collapseAll = () => {
    setExpandedProjectIds({});
  };

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.milestones.some((m) => m.title.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchesLod = lodFilter === 'all' || p.currentLOD === lodFilter || p.targetLOD === lodFilter;
      const matchesDiscipline =
        disciplineFilter === 'all' || p.disciplines.includes(disciplineFilter as Discipline);

      return matchesSearch && matchesStatus && matchesLod && matchesDiscipline;
    });
  }, [projects, searchQuery, statusFilter, lodFilter, disciplineFilter]);

  // Aggregate milestone statistics
  const milestoneStats = useMemo(() => {
    let total = 0;
    let completed = 0;
    let inProgress = 0;
    let upcoming = 0;
    let delayed = 0;

    projects.forEach((p) => {
      p.milestones.forEach((m) => {
        total++;
        if (m.status === 'completed') completed++;
        else if (m.status === 'in-progress') inProgress++;
        else if (m.status === 'upcoming') upcoming++;
        else if (m.status === 'delayed') delayed++;
      });
    });

    return { total, completed, inProgress, upcoming, delayed };
  }, [projects]);

  // Upcoming upcoming milestones radar (next 60 days)
  const upcomingMilestonesList = useMemo(() => {
    const list: Array<{
      milestone: Milestone;
      project: BimProject;
      daysRemaining: number;
    }> = [];

    projects.forEach((p) => {
      p.milestones.forEach((m) => {
        if (m.status !== 'completed') {
          const mTime = new Date(m.targetDate + 'T00:00:00').getTime();
          const diffDays = Math.round((mTime - todayTime) / (1000 * 60 * 60 * 24));
          list.push({
            milestone: m,
            project: p,
            daysRemaining: diffDays,
          });
        }
      });
    });

    return list.sort((a, b) => a.daysRemaining - b.daysRemaining).slice(0, 4);
  }, [projects, todayTime]);

  const scrollToToday = () => {
    if (timelineContainerRef.current) {
      const scrollWidth = timelineContainerRef.current.scrollWidth;
      const targetScroll = (todayPercent / 100) * scrollWidth - 300;
      timelineContainerRef.current.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
    }
  };

  const getDisciplineBadgeColor = (discipline: Discipline) => {
    switch (discipline) {
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

  const getMilestoneStatusBadge = (status: Milestone['status']) => {
    switch (status) {
      case 'completed':
        return {
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
          bg: 'bg-emerald-500',
          ring: 'ring-emerald-400/50',
          text: 'text-emerald-400',
          label: 'Completed',
        };
      case 'in-progress':
        return {
          icon: <Clock className="w-3.5 h-3.5 text-blue-400 animate-pulse" />,
          bg: 'bg-blue-500',
          ring: 'ring-blue-400/50 ring-2',
          text: 'text-blue-400',
          label: 'In Progress',
        };
      case 'delayed':
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />,
          bg: 'bg-rose-500',
          ring: 'ring-rose-400/60 ring-2 animate-bounce',
          text: 'text-rose-400',
          label: 'Delayed',
        };
      case 'upcoming':
      default:
        return {
          icon: <Target className="w-3.5 h-3.5 text-indigo-400" />,
          bg: 'bg-indigo-500',
          ring: 'ring-indigo-400/40',
          text: 'text-indigo-400',
          label: 'Upcoming',
        };
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      {/* Header & Controls Toolbar */}
      <div className="p-5 border-b border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <CalendarRange className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-white tracking-tight">
                Stakeholder Master Schedule & Milestone Gantt
              </h2>
              <span className="px-2 py-0.5 text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                Live Timeline
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Multi-project phase execution, LOD contractual sign-offs, and critical path milestones
            </p>
          </div>

          {/* Quick Horizon & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Horizon switcher */}
            <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
              <button
                onClick={() => setTimeHorizon('2026-year')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  timeHorizon === '2026-year'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                2026 Full Year
              </button>
              <button
                onClick={() => setTimeHorizon('2026-focus')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  timeHorizon === '2026-focus'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Q2–Q4 2026 Focus
              </button>
              <button
                onClick={() => setTimeHorizon('extended')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  timeHorizon === 'extended'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                2026–2027 Horizon
              </button>
            </div>

            {/* Jump to Today */}
            <button
              onClick={scrollToToday}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="Center timeline on today (Aug 18, 2026)"
            >
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></div>
              <span>Today (Aug 18)</span>
            </button>

            {/* Expand / Collapse All */}
            <div className="flex items-center bg-slate-800 rounded-lg border border-slate-700 overflow-hidden text-xs">
              <button
                onClick={expandAll}
                className="px-2.5 py-1.5 text-slate-300 hover:bg-slate-700 flex items-center gap-1 transition"
                title="Expand all WBS task breakdowns"
              >
                <Maximize2 className="w-3 h-3 text-slate-400" />
                <span className="hidden sm:inline">Expand WBS</span>
              </button>
              <div className="w-px h-4 bg-slate-700"></div>
              <button
                onClick={collapseAll}
                className="px-2.5 py-1.5 text-slate-300 hover:bg-slate-700 flex items-center gap-1 transition"
                title="Collapse all task breakdowns"
              >
                <Minimize2 className="w-3 h-3 text-slate-400" />
                <span className="hidden sm:inline">Collapse</span>
              </button>
            </div>
          </div>
        </div>

        {/* Milestone Health Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-2.5 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Total Deliverables</span>
            <span className="text-sm font-bold text-white">{milestoneStats.total}</span>
          </div>
          <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-2.5 flex items-center justify-between">
            <span className="text-xs text-emerald-300 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Completed
            </span>
            <span className="text-sm font-bold text-emerald-400">{milestoneStats.completed}</span>
          </div>
          <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-2.5 flex items-center justify-between">
            <span className="text-xs text-blue-300 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              In Progress
            </span>
            <span className="text-sm font-bold text-blue-400">{milestoneStats.inProgress}</span>
          </div>
          <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-lg p-2.5 flex items-center justify-between">
            <span className="text-xs text-indigo-300 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
              Upcoming
            </span>
            <span className="text-sm font-bold text-indigo-400">{milestoneStats.upcoming}</span>
          </div>
          <div className="bg-rose-950/30 border border-rose-500/20 rounded-lg p-2.5 flex items-center justify-between col-span-2 sm:col-span-1">
            <span className="text-xs text-rose-300 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
              Delayed / Alert
            </span>
            <span className="text-sm font-bold text-rose-400">{milestoneStats.delayed}</span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-2">
          {/* Search box */}
          <div className="w-full md:w-64 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search project, milestone, task..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg pl-8 pr-3 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Project Statuses</option>
              <option value="WIP">WIP</option>
              <option value="On Track">On Track</option>
              <option value="At Risk">At Risk</option>
              <option value="HOLD">HOLD</option>
              <option value="CLOSED">CLOSED</option>
            </select>

            {/* LOD Filter */}
            <select
              value={lodFilter}
              onChange={(e) => setLodFilter(e.target.value)}
              className="bg-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All LOD Stages</option>
              <option value="LOD 200">LOD 200</option>
              <option value="LOD 300">LOD 300</option>
              <option value="LOD 350">LOD 350</option>
              <option value="LOD 400">LOD 400</option>
            </select>

            {/* Discipline Filter */}
            <select
              value={disciplineFilter}
              onChange={(e) => setDisciplineFilter(e.target.value)}
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
            </select>
          </div>
        </div>
      </div>

      {/* Main Gantt Timeline Matrix */}
      <div
        ref={timelineContainerRef}
        className="overflow-x-auto relative select-none"
        style={{ minHeight: '380px' }}
      >
        <div className="min-w-[980px]">
          {/* Timeline Header (Quarters & Months) */}
          <div className="sticky top-0 z-20 bg-slate-950 border-b border-slate-800 flex">
            {/* Left Sidebar Fixed Header */}
            <div className="w-80 shrink-0 p-3 border-r border-slate-800 bg-slate-950 font-semibold text-xs text-slate-300 flex items-center justify-between">
              <span>Project & WBS Phase</span>
              <span className="text-[11px] text-slate-500">LOD / Hours</span>
            </div>

            {/* Right Date Track Header (Monthly Basis Only) */}
            <div className="flex-1 relative h-10 bg-slate-950 flex text-xs text-slate-300 font-medium">
              {monthsList.map((m, idx) => (
                <div
                  key={idx}
                  className="border-r border-slate-800/60 px-2 flex items-center justify-center truncate text-[11px] font-semibold text-slate-300"
                  style={{ width: `${m.widthPct}%` }}
                >
                  {m.label}
                </div>
              ))}

              {/* "TODAY" Marker Pin in Header */}
              {todayPercent >= 0 && todayPercent <= 100 && (
                <div
                  className="absolute top-0 bottom-0 z-30 pointer-events-none flex flex-col items-center"
                  style={{ left: `${todayPercent}%` }}
                >
                  <div className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-md -translate-x-1/2 whitespace-nowrap mt-1 border border-rose-400">
                    TODAY (AUG 18)
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline Grid Rows */}
          <div className="divide-y divide-slate-800/60 relative">
            {/* Background Grid Columns & Today Line */}
            <div className="absolute inset-0 left-80 pointer-events-none flex z-0">
              {monthsList.map((m, idx) => (
                <div
                  key={idx}
                  className={`border-r border-slate-800/30 h-full ${
                    idx % 2 === 1 ? 'bg-slate-800/10' : ''
                  }`}
                  style={{ width: `${m.widthPct}%` }}
                />
              ))}

              {/* Red Vertical Today Line */}
              {todayPercent >= 0 && todayPercent <= 100 && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-rose-500/80 border-r border-rose-500 border-dashed z-10"
                  style={{ left: `${todayPercent}%` }}
                />
              )}
            </div>

            {filteredProjects.length === 0 ? (
              <div className="p-16 text-center text-slate-400">
                <p className="text-sm font-semibold text-slate-300">No projects or milestones found.</p>
                <p className="text-xs text-slate-500 mt-1">Click "Add Project" to get started.</p>
              </div>
            ) : (
              filteredProjects.map((project) => {
                const isExpanded = !!expandedProjectIds[project.id];
                const completedHours = getProjectCompletedHours(project.id);
                const burnPct = project.totalEstimatedHours > 0
                  ? Math.round((completedHours / project.totalEstimatedHours) * 100)
                  : completedHours > 0 ? 100 : 0;

                const projectCoords = getBarCoordinates(project.startDate, project.targetCompletionDate);

                return (
                  <div key={project.id} className="relative z-10 group bg-slate-900/40 hover:bg-slate-900/80 transition">
                    {/* Main Project Schedule Row */}
                    <div className="flex items-center min-h-[64px]">
                      {/* Left Info Column */}
                      <div className="w-80 shrink-0 p-3 border-r border-slate-800 bg-slate-900/90 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <button
                            onClick={() => toggleExpand(project.id)}
                            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                            title={isExpanded ? 'Collapse WBS Tasks' : 'Expand WBS Tasks'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-blue-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                          <div className="overflow-hidden">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <select
                                value={project.status}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  updateProjectStatus(project.id, e.target.value as any);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border cursor-pointer focus:outline-none transition ${
                                  project.status === 'WIP'
                                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                                    : project.status === 'On Track'
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                    : project.status === 'At Risk'
                                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                    : project.status === 'HOLD'
                                    ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                                    : project.status === 'CLOSED'
                                    ? 'bg-slate-700 text-slate-300 border-slate-600'
                                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                }`}
                              >
                                <option value="WIP" className="bg-slate-900 text-cyan-300">WIP</option>
                                <option value="On Track" className="bg-slate-900 text-emerald-300">On Track</option>
                                <option value="At Risk" className="bg-slate-900 text-amber-300">At Risk</option>
                                <option value="HOLD" className="bg-slate-900 text-orange-300">HOLD</option>
                                <option value="CLOSED" className="bg-slate-900 text-slate-300">CLOSED</option>
                                <option value="Completed" className="bg-slate-900 text-emerald-300">Completed</option>
                              </select>
                            </div>
                            <h4
                              onClick={() => onSelectProject?.(project)}
                              className="text-xs font-semibold text-white hover:text-blue-300 cursor-pointer truncate transition"
                              title={project.name}
                            >
                              {project.name}
                            </h4>
                            <div className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                              <span>{(project.buildingType || '').split('&')[0]}</span>
                              <span>•</span>
                              <span className="text-indigo-300 font-medium">{project.currentLOD} → {project.targetLOD}</span>
                            </div>
                          </div>
                        </div>

                        {/* Hours pill */}
                        <div className="text-right shrink-0">
                          <span className="text-xs font-bold text-slate-200">{burnPct}%</span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {completedHours.toFixed(0)}/{project.totalEstimatedHours.toFixed(0)}h
                          </span>
                        </div>
                      </div>

                      {/* Right Gantt Bar & Milestones Track */}
                      <div className="flex-1 relative h-16 flex items-center px-2">
                        {projectCoords.visible && (
                          <div
                            className="absolute h-8 rounded-lg border shadow-sm transition-all duration-300 flex items-center justify-between px-2.5 overflow-hidden group/bar cursor-pointer"
                            style={{
                              left: `${projectCoords.left}%`,
                              width: `${projectCoords.width}%`,
                              backgroundColor:
                                project.status === 'On Track'
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : project.status === 'At Risk'
                                  ? 'rgba(245, 158, 11, 0.15)'
                                  : 'rgba(244, 63, 94, 0.15)',
                              borderColor:
                                project.status === 'On Track'
                                  ? 'rgba(16, 185, 129, 0.4)'
                                  : project.status === 'At Risk'
                                  ? 'rgba(245, 158, 11, 0.4)'
                                  : 'rgba(244, 63, 94, 0.4)',
                            }}
                            onClick={() => onSelectProject?.(project)}
                          >
                            {/* Inner Progress Fill */}
                            <div
                              className="absolute left-0 top-0 bottom-0 opacity-40 transition-all rounded-l-lg"
                              style={{
                                width: `${burnPct}%`,
                                backgroundColor:
                                  project.status === 'On Track'
                                    ? '#10b981'
                                    : project.status === 'At Risk'
                                    ? '#f59e0b'
                                    : '#f43f5e',
                              }}
                            />

                            {/* Label inside bar */}
                            <div className="relative z-10 text-[11px] font-semibold text-slate-100 truncate flex items-center gap-1.5">
                              <Building className="w-3 h-3 text-slate-300 shrink-0" />
                              <span className="truncate">{project.name}</span>
                            </div>

                            <div className="relative z-10 text-[10px] font-mono text-slate-300 shrink-0 hidden md:block">
                              {project.startDate.slice(5)} to {project.targetCompletionDate.slice(5)}
                            </div>
                          </div>
                        )}

                        {/* Plotted Milestone Markers on the Project Row */}
                        {project.milestones.map((milestone) => {
                          const mPercent = getDatePercent(milestone.targetDate);
                          if (mPercent < 0 || mPercent > 100) return null;

                          const statusBadge = getMilestoneStatusBadge(milestone.status);

                          return (
                            <div
                              key={milestone.id}
                              className="absolute z-20 group/node cursor-pointer -translate-x-1/2"
                              style={{ left: `${mPercent}%` }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMilestone({ milestone, project });
                              }}
                            >
                              {/* Diamond Node */}
                              <div
                                className={`w-5 h-5 rounded-md transform rotate-45 flex items-center justify-center shadow-md transition-transform duration-200 group-hover/node:scale-125 ${statusBadge.bg} ${statusBadge.ring}`}
                              >
                                <div className="transform -rotate-45">
                                  {milestone.status === 'completed' ? (
                                    <CheckCircle2 className="w-3 h-3 text-white" />
                                  ) : milestone.status === 'delayed' ? (
                                    <AlertTriangle className="w-3 h-3 text-white" />
                                  ) : (
                                    <span className="text-[9px] font-bold text-white">M</span>
                                  )}
                                </div>
                              </div>

                              {/* Tooltip on Hover */}
                              <div className="opacity-0 group-hover/node:opacity-100 transition-opacity duration-200 absolute bottom-full mb-2 -left-28 w-56 p-2.5 rounded-lg bg-slate-800 text-slate-100 text-xs shadow-xl border border-slate-700 pointer-events-none z-50">
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-[10px] font-bold uppercase tracking-wider ${statusBadge.text}`}>
                                    {statusBadge.label}
                                  </span>
                                  <span className="text-[10px] text-indigo-300 font-mono font-semibold">
                                    {milestone.lodRequirement}
                                  </span>
                                </div>
                                <h5 className="font-semibold text-white text-xs mb-1 line-clamp-2">
                                  {milestone.title}
                                </h5>
                                <p className="text-[10px] text-slate-400 line-clamp-2 mb-1.5">
                                  {milestone.deliverableDescription}
                                </p>
                                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-700">
                                  <span>Target: <strong>{milestone.targetDate}</strong></span>
                                  {milestone.completionDate && (
                                    <span className="text-emerald-400 font-medium">Done: {milestone.completionDate}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sub-tasks / WBS Breakdown Rows (when expanded) */}
                    {isExpanded && project.tasks && project.tasks.length > 0 && (
                      <div className="bg-slate-950/60 border-t border-slate-800/40 divide-y divide-slate-800/30">
                        {project.tasks.map((task) => {
                          const assignedEmp = employees.find((e) => e.id === task.assignedEmployeeId);
                          const taskCoords = getBarCoordinates(
                            project.startDate,
                            task.dueDate || project.targetCompletionDate
                          );
                          const taskBurn = task.estimatedHours > 0
                            ? Math.min(100, Math.round((task.completedHours / task.estimatedHours) * 100))
                            : 0;

                          return (
                            <div key={task.id} className="flex items-center min-h-[44px] hover:bg-slate-800/30 transition text-xs">
                              {/* Left Sub-task column */}
                              <div className="w-80 shrink-0 py-2 pl-9 pr-3 border-r border-slate-800/60 flex items-center justify-between gap-2">
                                <div className="overflow-hidden">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span
                                      className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${getDisciplineBadgeColor(
                                        task.discipline
                                      )}`}
                                    >
                                      {task.discipline.replace('MEP - ', '')}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                      {task.lod}
                                    </span>
                                  </div>
                                  <div className="text-xs font-medium text-slate-200 truncate" title={task.name}>
                                    {task.name}
                                  </div>
                                  <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                    {assignedEmp ? (
                                      <span className="flex items-center gap-1 text-slate-300">
                                        <User className="w-2.5 h-2.5 text-slate-400" />
                                        {assignedEmp.name}
                                      </span>
                                    ) : (
                                      <span>Unassigned</span>
                                    )}
                                    <span>• Due {task.dueDate}</span>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="text-[11px] font-semibold text-slate-300">{taskBurn}%</span>
                                  <span className="text-[9px] text-slate-500 block">
                                    {task.completedHours}/{task.estimatedHours}h
                                  </span>
                                </div>
                              </div>

                              {/* Right Task Bar */}
                              <div className="flex-1 relative h-10 flex items-center px-2">
                                {taskCoords.visible && (
                                  <div
                                    className="absolute h-5 rounded bg-slate-800 border border-slate-700/80 shadow-xs flex items-center px-2 overflow-hidden group/taskbar"
                                    style={{
                                      left: `${taskCoords.left}%`,
                                      width: `${taskCoords.width}%`,
                                    }}
                                  >
                                    {/* Task Progress fill */}
                                    <div
                                      className="absolute left-0 top-0 bottom-0 bg-blue-500/40 rounded-l"
                                      style={{ width: `${taskBurn}%` }}
                                    />
                                    <span className="relative z-10 text-[10px] text-slate-300 truncate font-medium">
                                      {task.name}
                                    </span>
                                  </div>
                                )}

                                {/* Task due date marker */}
                                {task.dueDate && (
                                  <div
                                    className="absolute z-10 -translate-x-1/2"
                                    style={{ left: `${getDatePercent(task.dueDate)}%` }}
                                    title={`Task Due Date: ${task.dueDate}`}
                                  >
                                    <div className="w-2 h-2 rounded-full bg-indigo-400 ring-2 ring-indigo-400/40"></div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Milestone Legend & Upcoming Milestone Radar Footer */}
      <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        {/* Milestone Legend */}
        <div className="flex flex-wrap items-center gap-4 text-slate-300">
          <span className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider">
            Milestone Legend:
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm rotate-45 bg-emerald-500 flex items-center justify-center"></div>
            <span>Completed Deliverable</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm rotate-45 bg-blue-500 ring-2 ring-blue-400/40 flex items-center justify-center"></div>
            <span>In-Progress Coordination</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm rotate-45 bg-indigo-500 flex items-center justify-center"></div>
            <span>Upcoming LOD Stage</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm rotate-45 bg-rose-500 ring-2 ring-rose-400/60 flex items-center justify-center"></div>
            <span>Delayed / Needs Action</span>
          </div>
        </div>

        {/* Quick report generation trigger */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenReportModal?.()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Generate Schedule Audit Briefing</span>
          </button>
        </div>
      </div>

      {/* Upcoming Milestones Radar Strip */}
      <div className="bg-slate-900/90 border-t border-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Upcoming Deliverable Milestones Radar (Next 60 Days)
            </h4>
          </div>
          <span className="text-[11px] text-slate-400">
            Calculated from today (Aug 18, 2026)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {upcomingMilestonesList.map((item, idx) => {
            const isLate = item.daysRemaining < 0;
            const isImminent = item.daysRemaining >= 0 && item.daysRemaining <= 14;

            return (
              <div
                key={idx}
                onClick={() => setSelectedMilestone({ milestone: item.milestone, project: item.project })}
                className="p-3 bg-slate-800/70 border border-slate-700/70 rounded-lg hover:border-blue-500/50 cursor-pointer transition flex flex-col justify-between space-y-2"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-bold text-blue-400">{item.project.code}</span>
                    <span
                      className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                        isLate
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : isImminent
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      }`}
                    >
                      {isLate ? `${Math.abs(item.daysRemaining)}d Overdue` : `${item.daysRemaining} days left`}
                    </span>
                  </div>
                  <h5 className="text-xs font-semibold text-white line-clamp-1">{item.milestone.title}</h5>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                    {item.milestone.deliverableDescription}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="text-indigo-300 font-medium">{item.milestone.lodRequirement}</span>
                  <span>Target: <strong>{item.milestone.targetDate}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Milestone Quick Modal / Drawer */}
      {selectedMilestone && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 text-slate-100 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-400">
                    {selectedMilestone.project.code}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      selectedMilestone.milestone.status === 'completed'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : selectedMilestone.milestone.status === 'delayed'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : selectedMilestone.milestone.status === 'in-progress'
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                    }`}
                  >
                    {selectedMilestone.milestone.status.toUpperCase()}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white">
                  {selectedMilestone.milestone.title}
                </h3>
                <p className="text-xs text-slate-400">
                  Project: {selectedMilestone.project.name}
                </p>
              </div>
              <button
                onClick={() => setSelectedMilestone(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 space-y-2 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block mb-0.5">Contractual Deliverable:</span>
                <p className="text-slate-200 leading-relaxed">
                  {selectedMilestone.milestone.deliverableDescription}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700 text-xs">
                <div>
                  <span className="text-slate-400">LOD Requirement:</span>
                  <p className="font-bold text-indigo-300 text-sm">
                    {selectedMilestone.milestone.lodRequirement}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Target Date:</span>
                  <p className="font-bold text-slate-100 text-sm">
                    {selectedMilestone.milestone.targetDate}
                  </p>
                </div>
              </div>

              {selectedMilestone.milestone.completionDate && (
                <div className="pt-2 border-t border-slate-700 text-xs text-emerald-400">
                  Completed & Approved on: <strong>{selectedMilestone.milestone.completionDate}</strong>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  const proj = selectedMilestone.project;
                  setSelectedMilestone(null);
                  onSelectProject?.(proj);
                }}
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
              >
                <span>Inspect Full Project WBS</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setSelectedMilestone(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
