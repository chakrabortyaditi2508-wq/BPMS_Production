import React, { useState, useMemo } from 'react';
import {
  Clock,
  Layers,
  Users,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Zap,
  Building,
  ShieldAlert,
  FileSpreadsheet,
  CheckCircle,
  Timer,
  PauseCircle,
  ChevronDown,
  DollarSign,
  PieChart,
  BarChart3,
  Sliders,
  Filter,
  Eye,
  Award,
  Gauge,
  Briefcase
} from 'lucide-react';
import { useBimData, getProjectTargetHours } from '../context/BimDataContext';
import { BimProject, ProjectStatus, BimServiceType, PrimaryDiscipline } from '../types';
import { calculateDeliveryVariance, getProjectStatusStyle } from '../utils/deliveryVariance';

interface DashboardOverviewProps {
  onOpenLogModal: () => void;
  onOpenReportModal: (projectId?: string) => void;
  onSelectProjectDetail?: (project: BimProject) => void;
  onSelectProject?: (project: BimProject) => void;
}

type DateRange = 'this-quarter' | 'ytd' | 'last-30' | 'full-year';
type MetricViewMode = 'hours' | 'financial';

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  onOpenLogModal,
  onOpenReportModal,
  onSelectProjectDetail,
  onSelectProject,
}) => {
  const {
    projects,
    employees,
    workLogs,
    allWorkLogs,
    resourceAllocations,
    disciplineAssignments,
    selectedProjectId,
    overallMetrics,
    setCurrentTab,
    getProjectCompletedHours,
    updateProjectStatus,
  } = useBimData();

  const handleSelectProject = (project: BimProject) => {
    if (onSelectProject) {
      onSelectProject(project);
    } else if (onSelectProjectDetail) {
      onSelectProjectDetail(project);
    }
  };

  // Interactive filters
  const [dateRange, setDateRange] = useState<DateRange>('this-quarter');
  const [viewMode, setViewMode] = useState<MetricViewMode>('hours');
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string>('all');
  const [hoveredDiscipline, setHoveredDiscipline] = useState<string | null>(null);

  // Billing rate constant for Financial mode ($85/hr blended agency rate)
  const HOURLY_BILLING_RATE = 85;

  // Normalize project name helper for matching logs/allocations
  const normalizeName = (name?: string) =>
    (name || '')
      .trim()
      .replace(/^BIM[\s-_]+/i, '')
      .trim()
      .toLowerCase();

  const deletedProjectIds = useMemo(() => {
    try {
      const saved = localStorage.getItem('bim_deleted_project_ids_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return new Set<string>(parsed);
      }
    } catch {}
    return new Set<string>();
  }, [projects]);

  // Helper to check if a discipline string matches a specific Core BIM Service Pillar
  const doesDisciplineMatchService = (disc: string | undefined, svc: BimServiceType): boolean => {
    const d = (disc || '').trim().toUpperCase();
    if (!d) return false;
    const s = svc.toUpperCase();
    if (d === s) return true;

    switch (svc) {
      case 'ACS':
      case 'BIM - ACS':
        return (
          d === 'ACS' ||
          d === 'BIM - ACS' ||
          d === 'ARCHITECTURAL' ||
          d === 'ARCHITECTURE' ||
          d === 'STRUCTURE' ||
          d === 'STRUCTURAL' ||
          d === 'INFRASTRUCTURE' ||
          d === 'FAÇADE / ENVELOPE' ||
          d.includes('FACADE') ||
          d.includes('FAÇADE') ||
          d.includes('ENVELOPE') ||
          d === 'COORDINATION & QA' ||
          d.includes('COORDINATION') ||
          d.includes('QA') ||
          d === 'AI & AUTOMATION' ||
          d.includes('AUTOMATION') ||
          d === 'AI' ||
          d === 'ESTIMATION'
        );
      case 'MEP':
      case 'BIM - MEP':
        return (
          d === 'MEP' ||
          d === 'BIM - MEP' ||
          d === 'MEP - HVAC' ||
          d.includes('HVAC') ||
          d === 'MEP - ELECTRICAL' ||
          d.includes('ELECTRICAL') ||
          d.includes('ELEC') ||
          d === 'MEP - PLUMBING' ||
          d.includes('PLUMBING') ||
          d.includes('PLUMB') ||
          d === 'FIRE PROTECTION' ||
          d.includes('FIRE') ||
          d === 'SES'
        );
      case 'SCAN TO BIM':
        return (
          d === 'SCAN TO BIM' ||
          d.includes('SCAN') ||
          d.includes('POINT CLOUD') ||
          d.includes('AS-BUILT') ||
          d.includes('REALITY CAPTURE')
        );
      case 'CAD':
        return d === 'CAD' || d.includes('CAD') || d.includes('DRAFT');
      default:
        return false;
    }
  };

  // Helper to check if a project belongs to one of the 4 Core BIM Service Pillars (ACS, MEP, SCAN TO BIM, CAD)
  const doesProjectMatchService = (project: BimProject, svc: BimServiceType): boolean => {
    const rawDiscs =
      Array.isArray(project.disciplines) && project.disciplines.length > 0
        ? project.disciplines
        : (project as any).discipline
        ? [String((project as any).discipline)]
        : ['ACS'];

    if (rawDiscs.some((d) => doesDisciplineMatchService(d, svc))) {
      return true;
    }

    if (
      Array.isArray(project.tasks) &&
      project.tasks.some((t) => doesDisciplineMatchService(t.discipline, svc))
    ) {
      return true;
    }

    const titleCodeType = `${project.name || ''} ${project.code || ''} ${project.buildingType || ''}`.toUpperCase();
    const descText = (project.description || '').toUpperCase();

    if (svc === 'SCAN TO BIM') {
      return (
        titleCodeType.includes('SCAN') ||
        titleCodeType.includes('POINT CLOUD') ||
        titleCodeType.includes('AS-BUILT') ||
        titleCodeType.includes('REALITY CAPTURE') ||
        descText.includes('SCAN-TO-BIM') ||
        descText.includes('SCAN TO BIM')
      );
    }

    if (svc === 'CAD') {
      return titleCodeType.includes('CAD') || titleCodeType.includes('DRAFTING');
    }

    // Ensure orphaned/unlisted project entries that do not match MEP, SCAN TO BIM, or CAD map to ACS
    if (svc === 'ACS') {
      const matchesOtherCorePillar = (['MEP', 'SCAN TO BIM', 'CAD'] as BimServiceType[]).some((other) => {
        if (rawDiscs.some((d) => doesDisciplineMatchService(d, other))) return true;
        if (Array.isArray(project.tasks) && project.tasks.some((t) => doesDisciplineMatchService(t.discipline, other))) return true;
        if (
          other === 'SCAN TO BIM' &&
          (titleCodeType.includes('SCAN') ||
            titleCodeType.includes('POINT CLOUD') ||
            titleCodeType.includes('AS-BUILT') ||
            titleCodeType.includes('REALITY CAPTURE') ||
            descText.includes('SCAN-TO-BIM') ||
            descText.includes('SCAN TO BIM'))
        ) {
          return true;
        }
        if (other === 'CAD' && (titleCodeType.includes('CAD') || titleCodeType.includes('DRAFTING'))) {
          return true;
        }
        return false;
      });
      if (!matchesOtherCorePillar) {
        return true;
      }
    }

    return false;
  };

  const CORE_SERVICE_PILLARS: BimServiceType[] = ['ACS', 'MEP', 'SCAN TO BIM', 'CAD'];

  // 1. Scoped Projects based on global ACTIVE PROJECT SCOPE dropdown & Core Service Pillars
  const scopedProjects = useMemo(() => {
    const baseProjects = (projects || []).filter(
      (p) =>
        p &&
        p.id &&
        !deletedProjectIds.has(p.id) &&
        CORE_SERVICE_PILLARS.some((pillar) => doesProjectMatchService(p, pillar))
    );
    if (!selectedProjectId || selectedProjectId === 'all') {
      return baseProjects;
    }
    const targetNorm = normalizeName(selectedProjectId);
    return baseProjects.filter(
      (p) =>
        p.id === selectedProjectId ||
        (targetNorm && normalizeName(p.name) === targetNorm)
    );
  }, [projects, selectedProjectId, deletedProjectIds]);

  // 2. Scoped Operational Work Logs & Resource Allocations for selectedProjectId
  const scopedWorkLogs = useMemo(() => {
    const validLogs = (allWorkLogs || workLogs || []).filter((w) => !w.isTestEntry);
    if (!selectedProjectId || selectedProjectId === 'all') {
      return validLogs;
    }
    const targetIds = new Set(scopedProjects.map((p) => p.id));
    const targetNames = new Set(scopedProjects.map((p) => normalizeName(p.name)));
    return validLogs.filter(
      (w) =>
        targetIds.has(w.projectId) ||
        (w.projectName && targetNames.has(normalizeName(w.projectName)))
    );
  }, [allWorkLogs, workLogs, selectedProjectId, scopedProjects]);

  const scopedAllocations = useMemo(() => {
    const allocs = resourceAllocations || [];
    if (!selectedProjectId || selectedProjectId === 'all') {
      return allocs;
    }
    const targetIds = new Set(scopedProjects.map((p) => p.id));
    const targetNames = new Set(scopedProjects.map((p) => normalizeName(p.name)));
    return allocs.filter(
      (a) =>
        targetIds.has(a.projectId) ||
        (a.projectName && targetNames.has(normalizeName(a.projectName)))
    );
  }, [resourceAllocations, selectedProjectId, scopedProjects]);

  // 3. Scoped Employees / BIM Specialists linked to the active project scope
  const scopedEmployees = useMemo(() => {
    const allEmps = employees || [];
    if (!selectedProjectId || selectedProjectId === 'all') {
      return allEmps;
    }
    if (scopedProjects.length === 0) {
      return [];
    }

    const targetIds = new Set(scopedProjects.map((p) => p.id));

    return allEmps.filter((emp) => {
      const empId = (emp.id || '').trim();
      const empIdStripped = empId.replace(/^emp-/, '');
      const empEmail = (emp.email || '').trim().toLowerCase();
      const empName = (emp.name || '').trim().toLowerCase();

      // Check activeProjectIds on employee
      if (
        Array.isArray(emp.activeProjectIds) &&
        emp.activeProjectIds.some((pid) => targetIds.has(pid))
      ) {
        return true;
      }

      // Check project assignedEmployeeIds, tasks, or project-level assignedTo
      const inProjectTeam = scopedProjects.some((p) => {
        if (
          Array.isArray(p.assignedEmployeeIds) &&
          p.assignedEmployeeIds.some(
            (id) =>
              id === empId ||
              (empIdStripped && id.replace(/^emp-/, '') === empIdStripped)
          )
        ) {
          return true;
        }
        if (
          (p as any).assignedTo &&
          ((p as any).assignedTo === empId ||
            (empIdStripped &&
              String((p as any).assignedTo).replace(/^emp-/, '') === empIdStripped))
        ) {
          return true;
        }
        if (
          Array.isArray(p.tasks) &&
          p.tasks.some(
            (t) =>
              t.assignedEmployeeId === empId ||
              (empIdStripped &&
                (t.assignedEmployeeId || '').replace(/^emp-/, '') === empIdStripped)
          )
        ) {
          return true;
        }
        return false;
      });
      if (inProjectTeam) return true;

      // Check disciplineAssignments map for this project
      if (disciplineAssignments) {
        for (const [key, assignedVal] of Object.entries(disciplineAssignments)) {
          const matchesProjPrefix = scopedProjects.some(
            (p) => key.startsWith(`${p.id}__`) || key.startsWith(`${p.id}_`)
          );
          if (matchesProjPrefix && assignedVal) {
            const valStripped = String(assignedVal).replace(/^emp-/, '');
            if (
              assignedVal === empId ||
              (empIdStripped && valStripped === empIdStripped)
            ) {
              return true;
            }
          }
        }
      }

      // Check resource allocations for this project
      const inAllocations = scopedAllocations.some((a) => {
        const aEmpId = (a.employeeId || a.assignedTo || '').trim();
        const aEmpStripped = aEmpId.replace(/^emp-/, '');
        const aEmail = (a.memberEmail || '').trim().toLowerCase();
        const aName = (a.employeeName || '').trim().toLowerCase();
        return (
          (empId && aEmpId === empId) ||
          (empIdStripped && aEmpStripped === empIdStripped) ||
          (empEmail && aEmail && empEmail === aEmail) ||
          (empName && aName && empName === aName)
        );
      });
      if (inAllocations) return true;

      // Check logged hours for this project
      const inWorkLogs = scopedWorkLogs.some((w) => {
        const wEmpId = (w.employeeId || w.userId || '').trim();
        const wEmpStripped = wEmpId.replace(/^emp-/, '');
        const wEmail = (w.memberEmail || w.userEmail || '').trim().toLowerCase();
        const wName = (w.employeeName || '').trim().toLowerCase();
        return (
          (empId && wEmpId === empId) ||
          (empIdStripped && wEmpStripped === empIdStripped) ||
          (empEmail && wEmail && empEmail === wEmail) ||
          (empName && wName && empName === wName)
        );
      });
      return inWorkLogs;
    });
  }, [
    employees,
    selectedProjectId,
    scopedProjects,
    disciplineAssignments,
    scopedAllocations,
    scopedWorkLogs,
  ]);

  // Overall KPIs calculation (dynamically scoped to core service pillar projects)
  const totalBudgetHours = useMemo(() => {
    return scopedProjects.reduce(
      (sum, p) => sum + getProjectTargetHours(p),
      0
    );
  }, [scopedProjects]);

  const totalLoggedHours = useMemo(() => {
    return scopedProjects.reduce(
      (sum, p) => sum + getProjectCompletedHours(p.id),
      0
    );
  }, [scopedProjects, getProjectCompletedHours, scopedWorkLogs]);

  const scopedCriticalClashesCount = useMemo(() => {
    if (!selectedProjectId || selectedProjectId === 'all') {
      return overallMetrics?.criticalClashesCount ?? 0;
    }
    let count = 0;
    scopedProjects.forEach((p) => {
      (p.clashes || []).forEach((c) => {
        if (c.severity === 'Critical' && c.status !== 'Resolved') {
          count++;
        }
      });
    });
    return count;
  }, [selectedProjectId, overallMetrics, scopedProjects]);

  const totalPortfolioValue = totalBudgetHours * HOURLY_BILLING_RATE;
  const totalRecognizedRevenue = totalLoggedHours * HOURLY_BILLING_RATE;
  const totalTeamCapacity = scopedEmployees.reduce(
    (sum, e) => sum + (e.weeklyCapacityHours || (e as any).capacityHoursPerWeek || 40),
    0
  );
  const fleetUtilizationRate = useMemo(() => {
    if (!selectedProjectId || selectedProjectId === 'all') {
      return Math.min(
        100,
        Math.round((totalLoggedHours / Math.max(1, totalBudgetHours)) * 100) || 88
      );
    }
    if (totalBudgetHours > 0) {
      return Math.min(100, Math.round((totalLoggedHours / totalBudgetHours) * 100));
    }
    if (totalTeamCapacity > 0 && totalLoggedHours > 0) {
      return Math.min(100, Math.round((totalLoggedHours / totalTeamCapacity) * 100));
    }
    return 0;
  }, [selectedProjectId, totalLoggedHours, totalBudgetHours, totalTeamCapacity]);

  // AI insights state
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<Array<{
    category: string;
    type: 'warning' | 'success' | 'info';
    title: string;
    description: string;
    action: string;
  }>>([]);

  const fetchLiveAiInsights = async () => {
    setAiInsightsLoading(true);
    try {
      const summaryPayload = {
        projectScope: selectedProjectId === 'all' ? 'All Projects' : (scopedProjects[0]?.name || selectedProjectId),
        totalProjects: scopedProjects.length,
        totalEstimatedHours: totalBudgetHours,
        totalCompletedHours: totalLoggedHours,
        variance: totalBudgetHours - totalLoggedHours,
        employeesCount: scopedEmployees.length,
        activeClashes: scopedCriticalClashesCount,
        sampleProjects: scopedProjects.map(p => ({
          name: p.name,
          estimated: p.totalEstimatedHours,
          completed: getProjectCompletedHours(p.id),
          currentLOD: p.currentLOD,
          status: p.status,
          plannedDelivery: p.plannedDeliveryDate || p.targetCompletionDate,
          actualDelivered: p.actualDeliveredDate
        }))
      };

      const res = await fetch('/api/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summaryData: summaryPayload })
      });
      const data = await res.json();
      if (data.success && data.data?.insights) {
        setAiInsights(data.data.insights);
      }
    } catch (err) {
      console.error('Failed to fetch AI insights', err);
    } finally {
      setAiInsightsLoading(false);
    }
  };

  // Re-evaluate AI insights automatically if already active when project scope changes
  React.useEffect(() => {
    if (aiInsights.length > 0) {
      fetchLiveAiInsights();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  // Service Type Projections Calculation across the 4 Core Delivery Pillars (ACS, MEP, SCAN TO BIM, CAD)
  const serviceTypeData = useMemo(() => {
    const services: BimServiceType[] = ['ACS', 'MEP', 'SCAN TO BIM', 'CAD'];
    const serviceLabels: Record<string, { label: string; desc: string; color: string; bg: string; border: string }> = {
      'ACS': {
        label: 'ACS (Architecture, Coordination & Structure)',
        desc: 'Core 3D architectural & structural models, spatial coordination & LOD 300-350',
        color: 'text-blue-400',
        bg: 'bg-blue-500',
        border: 'border-blue-500/30'
      },
      'MEP': {
        label: 'MEP (Mechanical, Electrical & Plumbing)',
        desc: 'Multi-trade MEP coordination, HVAC, electrical, plumbing & plant integration',
        color: 'text-cyan-400',
        bg: 'bg-cyan-500',
        border: 'border-cyan-500/30'
      },
      'SCAN TO BIM': {
        label: 'SCAN TO BIM',
        desc: 'LiDAR point clouds, reverse engineering & as-built verification',
        color: 'text-purple-400',
        bg: 'bg-purple-500',
        border: 'border-purple-500/30'
      },
      'CAD': {
        label: 'CAD & Detailing',
        desc: '2D permit sets, shop drawings & fabrication drafting',
        color: 'text-amber-400',
        bg: 'bg-amber-500',
        border: 'border-amber-500/30'
      }
    };

    const isSingleProjectScope = Boolean(selectedProjectId && selectedProjectId !== 'all');
    const activeScoped = scopedProjects.filter(
      (p) => p.status !== 'Completed' && p.status !== 'CLOSED'
    );
    const targetProjects =
      !isSingleProjectScope && activeScoped.length > 0 ? activeScoped : scopedProjects;

    return services.map(svc => {
      const projs = targetProjects.filter(p => doesProjectMatchService(p, svc));
      let budgetHours = projs.reduce((sum, p) => sum + getProjectTargetHours(p), 0);
      let completedHours = projs.reduce((sum, p) => sum + getProjectCompletedHours(p.id), 0);

      // Also check if discipline-specific logs or allocations exist when no project directly has the tag
      if (projs.length === 0) {
        const svcLogsHours = scopedWorkLogs
          .filter(w => doesDisciplineMatchService(w.discipline, svc))
          .reduce((sum, w) => sum + (Number(w.hoursLogged) || 0), 0);
        const svcAllocHours = scopedAllocations
          .filter(a => doesDisciplineMatchService(a.discipline, svc))
          .reduce((sum, a) => sum + (Number(a.assignedHours) || 0), 0);
        completedHours += svcLogsHours;
        budgetHours += svcAllocHours;
      }

      const burnPct = budgetHours > 0
        ? Math.round((completedHours / budgetHours) * 100)
        : completedHours > 0
        ? 100
        : 0;
      const budgetRevenue = budgetHours * HOURLY_BILLING_RATE;
      const completedRevenue = completedHours * HOURLY_BILLING_RATE;
      const margin = 32 + (burnPct <= 100 ? 5 : -8);

      return {
        service: svc,
        ...serviceLabels[svc],
        projectCount: projs.length,
        projects: projs,
        budgetHours,
        completedHours,
        burnPct,
        budgetRevenue,
        completedRevenue,
        projectedMargin: Math.max(12, margin)
      };
    });
  }, [scopedProjects, selectedProjectId, getProjectCompletedHours, scopedWorkLogs, scopedAllocations]);

  // Discipline Headcount & Distribution (dynamically scoped to scopedEmployees)
  const disciplineHeadcountData = useMemo(() => {
    const disciplines: { id: PrimaryDiscipline; label: string; color: string; hex: string }[] = [
      { id: 'Architectural', label: 'Architectural', color: 'text-emerald-400', hex: '#10B981' },
      { id: 'Structural', label: 'Structural', color: 'text-blue-400', hex: '#3B82F6' },
      { id: 'MEP', label: 'MEP (HVAC/Elec/Plumb)', color: 'text-cyan-400', hex: '#06B6D4' },
      { id: 'Point Cloud / Scan to BIM Specialist', label: 'Scan to BIM Specialist', color: 'text-purple-400', hex: '#A855F7' },
      { id: 'CAD Specialist', label: 'CAD Specialist', color: 'text-amber-400', hex: '#F59E0B' },
      { id: 'BIM Management / QA/QC', label: 'BIM Management / QA/QC', color: 'text-rose-400', hex: '#F43F5E' },
    ];

    const mapEmpToPrimaryDisc = (role: string, disc: string): PrimaryDiscipline => {
      const r = ((role || '') + ' ' + (disc || '')).toLowerCase();
      if (r.includes('scan') || r.includes('point cloud') || r.includes('as-built') || r.includes('laser')) {
        return 'Point Cloud / Scan to BIM Specialist';
      }
      if (r.includes('cad') || r.includes('draftsman') || r.includes('sheet')) {
        return 'CAD Specialist';
      }
      if (r.includes('manager') || r.includes('lead') || r.includes('qa') || r.includes('coord')) {
        return 'BIM Management / QA/QC';
      }
      if (r.includes('mep') || r.includes('hvac') || r.includes('plumb') || r.includes('elect')) {
        return 'MEP';
      }
      if (r.includes('struct') || r.includes('civil') || r.includes('steel') || r.includes('rebar')) {
        return 'Structural';
      }
      return 'Architectural';
    };

    const totalEmps = scopedEmployees.length;

    return disciplines.map(d => {
      const matchingEmps = scopedEmployees.filter(e => mapEmpToPrimaryDisc(e.role, e.discipline) === d.id);
      const count = matchingEmps.length;
      const pct = totalEmps > 0 ? Math.round((count / totalEmps) * 100) : 0;
      const totalWeeklyCap = matchingEmps.reduce((sum, e) => sum + (e.weeklyCapacityHours || (e as any).capacityHoursPerWeek || 40), 0);
      const avgEfficiency = count > 0
        ? Math.min(99, Math.round(92 + (matchingEmps.reduce((s, e) => s + ((e as any).rating || 4.5), 0) / count) * 1.5))
        : 0;

      return {
        ...d,
        count,
        percentage: pct,
        totalWeeklyCap,
        avgEfficiency,
        members: matchingEmps
      };
    });
  }, [scopedEmployees]);

  // SVG Donut calculation
  const donutSegments = useMemo(() => {
    let accumulatedAngle = 0;
    const totalCount = scopedEmployees.length || 1;

    return disciplineHeadcountData.map(d => {
      const sliceAngle = scopedEmployees.length > 0 ? (d.count / totalCount) * 360 : 0;
      const startAngle = accumulatedAngle;
      accumulatedAngle += sliceAngle;

      return {
        ...d,
        startAngle,
        sliceAngle,
        endAngle: accumulatedAngle
      };
    });
  }, [disciplineHeadcountData, scopedEmployees.length]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Interactive Filters Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Executive Dashboard
              </h1>
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Portfolio & Resource Intelligence
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Multi-discipline projections, hours burn velocity, specialist capacity, and service pillar analytics.
            </p>
          </div>

          {/* Interactive Filters (Date Range & Hours vs Financial Mode) */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Hours vs Financial View Switcher */}
            <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
              <button
                onClick={() => setViewMode('hours')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition ${
                  viewMode === 'hours'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Hours View</span>
              </button>
              <button
                onClick={() => setViewMode('financial')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition ${
                  viewMode === 'financial'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Financial ($)</span>
              </button>
            </div>

            {/* Date Range Selector */}
            <div className="flex items-center bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400 mr-2" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRange)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                <option value="this-quarter" className="bg-slate-900 text-white">This Quarter (Q3 2026)</option>
                <option value="ytd" className="bg-slate-900 text-white">Year to Date (YTD)</option>
                <option value="last-30" className="bg-slate-900 text-white">Last 30 Days</option>
                <option value="full-year" className="bg-slate-900 text-white">Full Year 2026</option>
              </select>
            </div>

            {/* AI Insights Button */}
            <button
              onClick={fetchLiveAiInsights}
              disabled={aiInsightsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-semibold transition disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>{aiInsightsLoading ? 'Analyzing...' : 'AI Audit'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 1. TOP METRICS BAR (Active Projects, Revenue/Hours, Team Members) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1: Active Projects */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Active BIM Projects
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">
                {scopedProjects.filter(p => p.status !== 'Completed' && p.status !== 'CLOSED').length}
              </span>
              <span className="text-xs text-slate-400">/ {scopedProjects.length} Total Projects</span>
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-3 h-3" />
                {scopedProjects.filter(p => p.status === 'On Track' || p.status === 'WIP').length} On Schedule
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-400 font-medium">
                {scopedProjects.filter(p => p.status === 'At Risk' || p.status === 'HOLD' || p.status === 'Delayed').length} Action Needed
              </span>
            </div>
          </div>
        </div>

        {/* Metric 2: Revenue / Hours */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {viewMode === 'hours' ? 'Portfolio Hours Logged' : 'Revenue Recognized'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              {viewMode === 'hours' ? <Clock className="w-4 h-4" /> : <DollarSign className="w-4 h-4" />}
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">
                {viewMode === 'hours'
                  ? `${totalLoggedHours.toLocaleString()}h`
                  : `$${totalRecognizedRevenue.toLocaleString()}`}
              </span>
              <span className="text-xs text-slate-400">
                / {viewMode === 'hours' ? `${totalBudgetHours.toLocaleString()}h` : `$${totalPortfolioValue.toLocaleString()}`}
              </span>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="text-slate-400">
                Burn Rate: <strong className="text-emerald-400">{totalBudgetHours > 0 ? Math.round((totalLoggedHours / totalBudgetHours) * 100) : (totalLoggedHours > 0 ? 100 : 0)}%</strong>
              </span>
              <span className="text-slate-400">
                Rate: <strong className="text-slate-200">${HOURLY_BILLING_RATE}/h</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Metric 3: Team Members */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              BIM Specialists
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">
                {scopedEmployees.length}
              </span>
              <span className="text-xs text-emerald-400 font-medium">
                {scopedEmployees.length > 0 ? '100% Assigned' : 'No Specialists Assigned'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. PROJECT PROJECTIONS BY SERVICE TYPE (ACS, MEP, SCAN TO BIM, CAD) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Building className="w-4 h-4 text-blue-400" />
              <span>Project Projections by BIM Service Type</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Breakdown across the 4 core delivery pillars: ACS, MEP, SCAN TO BIM, and CAD Drafting
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Display:</span>
            <span className="text-xs font-bold text-white bg-slate-800 px-2.5 py-1 rounded border border-slate-700">
              {viewMode === 'hours' ? 'Estimated vs Completed Hours' : 'Contract Value vs Recognized'}
            </span>
          </div>
        </div>

        {/* Breakdown Cards for the 4 Service Types */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {serviceTypeData.map((svc) => (
            <div
              key={svc.service}
              className={`bg-slate-800/50 border ${svc.border} rounded-xl p-4 space-y-3 transition hover:bg-slate-800/80`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Pillar {svc.service}
                  </span>
                  <h3 className={`text-sm font-bold ${svc.color}`}>{svc.service}</h3>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  {svc.projectCount} Projects
                </span>
              </div>

              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-400 font-medium">Burn-up Progress</span>
                  <span className={`font-bold ${svc.burnPct > 100 ? 'text-amber-400' : 'text-slate-200'}`}>
                    {svc.burnPct}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${svc.bg}`}
                    style={{ width: `${Math.min(100, svc.burnPct)}%` }}
                  />
                </div>
              </div>

              {/* Numerical Metrics */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
                <div>
                  <span className="text-slate-500 text-[10px] block">
                    {viewMode === 'hours' ? 'Remaining Hours' : 'Remaining Value'}
                  </span>
                  <span className="font-semibold text-slate-200">
                    {viewMode === 'hours'
                      ? `${Math.max(0, svc.budgetHours - svc.completedHours).toFixed(1)}h`
                      : `$${(Math.max(0, svc.budgetRevenue - svc.completedRevenue) / 1000).toFixed(1)}k`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block">
                    {viewMode === 'hours' ? 'Logged Hours' : 'Recognized'}
                  </span>
                  <span className={`font-semibold ${svc.burnPct > 100 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {viewMode === 'hours'
                      ? `${svc.completedHours.toFixed(1)}h`
                      : `$${(svc.completedRevenue / 1000).toFixed(1)}k`}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 line-clamp-1">{svc.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 3. MEMBER COUNT DASHBOARD BY PRIMARY DISCIPLINE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Donut Chart & Headcount Share */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-cyan-400" />
                  <span>Headcount by Primary Discipline</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {scopedEmployees.length} active BIM specialists mapped across trade specializations
                </p>
              </div>
            </div>

            {/* Interactive Donut Graphic */}
            <div className="flex items-center justify-center py-4 relative">
              <svg className="w-44 h-44 transform -rotate-90" viewBox="0 0 100 100">
                {scopedEmployees.length === 0 ? (
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="transparent"
                    stroke="#1e293b"
                    strokeWidth="12"
                  />
                ) : (
                  donutSegments.map((seg) => {
                    const circumference = 2 * Math.PI * 38;
                    const strokeDasharray = `${(seg.sliceAngle / 360) * circumference} ${circumference}`;
                    const rotation = seg.startAngle;

                    return (
                      <circle
                        key={seg.id}
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke={seg.hex}
                        strokeWidth="12"
                        strokeDasharray={strokeDasharray}
                        transform={`rotate(${rotation} 50 50)`}
                        className="cursor-pointer transition-all duration-300 hover:opacity-80"
                        onMouseEnter={() => setHoveredDiscipline(seg.id)}
                        onMouseLeave={() => setHoveredDiscipline(null)}
                      />
                    );
                  })
                )}
              </svg>

              {/* Center Hub Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-white">{scopedEmployees.length}</span>
                <span className="text-[10px] uppercase font-semibold text-slate-400">Specialists</span>
              </div>
            </div>
          </div>

          {/* Quick Legend List */}
          <div className="space-y-1.5 text-xs pt-2 border-t border-slate-800">
            {disciplineHeadcountData.map((d) => (
              <div
                key={d.id}
                onMouseEnter={() => setHoveredDiscipline(d.id)}
                onMouseLeave={() => setHoveredDiscipline(null)}
                className={`flex items-center justify-between p-1.5 rounded transition ${
                  hoveredDiscipline === d.id ? 'bg-slate-800' : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.hex }} />
                  <span className="text-slate-300 text-xs font-medium">{d.label}</span>
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <strong className="text-white text-xs">{d.count}</strong>
                  <span className="text-slate-500 text-[10px]">({d.percentage}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Discipline Headcount & Capacity Cards (2 cols on large screen) */}
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {disciplineHeadcountData.map((d) => (
            <div
              key={d.id}
              className={`bg-slate-900 border rounded-xl p-4 space-y-3 transition ${
                hoveredDiscipline === d.id
                  ? 'border-blue-500/60 bg-slate-800/70 shadow-md'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                    Discipline Group
                  </span>
                  <h4 className={`text-xs font-bold ${d.color} line-clamp-1`}>{d.label}</h4>
                </div>
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: d.hex }}
                />
              </div>

              {/* Headcount Number */}
              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <span className="text-2xl font-bold text-white">{d.count}</span>
                  <span className="text-xs text-slate-400 ml-1">staff ({d.percentage}%)</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-emerald-400">{d.avgEfficiency}%</span>
                  <span className="text-[10px] text-slate-500 block">Efficiency</span>
                </div>
              </div>

              {/* Capacity info */}
              <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Weekly Cap:</span>
                  <strong className="text-slate-200">{d.totalWeeklyCap}h</strong>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="text-emerald-400 font-medium">Optimal Workload</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. AI ACTIONABLE AUDIT INSIGHTS */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">AI Portfolio Quality & Efficiency Audit</h3>
              <p className="text-xs text-slate-400">Automated model audits, burn rate alarms, and LOD milestones</p>
            </div>
          </div>
          <button
            onClick={fetchLiveAiInsights}
            disabled={aiInsightsLoading}
            className="text-xs text-purple-400 hover:text-purple-300 font-semibold px-2.5 py-1 rounded bg-purple-950/40 border border-purple-800/40 transition"
          >
            {aiInsightsLoading ? 'Running...' : 'Re-run Analysis'}
          </button>
        </div>

        {aiInsights.length === 0 ? (
          <div className="py-8 text-center text-slate-500 bg-slate-900/40 border border-slate-800/80 rounded-xl">
            <Sparkles className="w-6 h-6 text-purple-400/60 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-slate-400">Ready for Strategic Analysis</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Click "AI Audit" above to analyze portfolio hours, trade capacity, and clash patterns.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {aiInsights.map((ins, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border space-y-2 ${
                  ins.type === 'warning'
                    ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                    : ins.type === 'success'
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                    : 'bg-blue-950/20 border-blue-500/30 text-blue-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-900/60 border border-slate-700/50">
                    {ins.category}
                  </span>
                  {ins.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                  {ins.type === 'success' && <CheckCircle className="w-4 h-4 text-emerald-400" />}
                  {ins.type === 'info' && <Clock className="w-4 h-4 text-blue-400" />}
                </div>
                <h4 className="text-xs font-bold text-white">{ins.title}</h4>
                <p className="text-xs text-slate-300 leading-relaxed">{ins.description}</p>
                <div className="pt-2 border-t border-slate-800/50 text-[11px] font-medium text-slate-400">
                  Action: <span className="text-slate-200">{ins.action}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
