import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  X,
  Building,
  Users,
  Layers,
  Clock,
  AlertTriangle,
  FileText,
  ChevronRight,
  ExternalLink,
  Command,
  Sun,
  Moon,
  Sparkles,
  Plus,
  UserPlus
} from 'lucide-react';
import { useBimData } from '../context/BimDataContext';
import { BimProject, Employee, ViewTab } from '../types';

interface GlobalSearchHeaderProps {
  onSelectProjectDetail: (project: BimProject) => void;
  onOpenLogModal: (projectId?: string) => void;
  onOpenNewProjectModal: () => void;
  onOpenNewEmployeeModal: () => void;
  onOpenReportModal: (projectId?: string) => void;
}

export const GlobalSearchHeader: React.FC<GlobalSearchHeaderProps> = ({
  onSelectProjectDetail,
  onOpenLogModal,
  onOpenNewProjectModal,
  onOpenNewEmployeeModal,
  onOpenReportModal,
}) => {
  const {
    projects,
    employees,
    workLogs,
    currentTab,
    setCurrentTab,
    globalSearchQuery,
    setGlobalSearchQuery,
    theme,
    toggleTheme,
    getProjectCompletedHours,
    getEmployeeLoggedHours,
  } = useBimData();

  const [isOpen, setIsOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'projects' | 'members' | 'clashes'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut (Press "/" or Cmd/Ctrl+K to focus search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        searchInputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Real-time matched items
  const query = globalSearchQuery.trim().toLowerCase();

  const matchingProjects = useMemo(() => {
    if (!query) return (projects || []).slice(0, 4);
    return (projects || []).filter(
      (p) =>
        (p.name || '').toLowerCase().includes(query) ||
        (p.code || '').toLowerCase().includes(query) ||
        (p.clientName || '').toLowerCase().includes(query) ||
        (p.buildingType || '').toLowerCase().includes(query) ||
        (p.currentLOD || '').toLowerCase().includes(query) ||
        (p.disciplines || []).some((d) => (d || '').toLowerCase().includes(query))
    );
  }, [projects, query]);

  const matchingEmployees = useMemo(() => {
    if (!query) return (employees || []).slice(0, 4);
    return (employees || []).filter(
      (e) =>
        (e.name || '').toLowerCase().includes(query) ||
        (e.role || '').toLowerCase().includes(query) ||
        (e.email || '').toLowerCase().includes(query) ||
        (e.primaryDiscipline || '').toLowerCase().includes(query) ||
        (e.skills || []).some((s) => (s || '').toLowerCase().includes(query))
    );
  }, [employees, query]);

  const matchingClashes = useMemo(() => {
    if (!query) return [];
    return (projects || []).flatMap((p) =>
      (p.clashes || [])
        .filter(
          (c) =>
            (c.elementRef || '').toLowerCase().includes(query) ||
            (c.disciplineA || '').toLowerCase().includes(query) ||
            (c.disciplineB || '').toLowerCase().includes(query) ||
            (c.locationDescription || '').toLowerCase().includes(query) ||
            (c.severity || '').toLowerCase().includes(query) ||
            (c.status || '').toLowerCase().includes(query)
        )
        .map((c) => ({ ...c, projectName: p.name, projectCode: p.code }))
    );
  }, [projects, query]);

  const totalResultsCount = matchingProjects.length + matchingEmployees.length + matchingClashes.length;

  const handleSelectProject = (project: BimProject) => {
    onSelectProjectDetail(project);
    setIsOpen(false);
  };

  const handleSelectEmployee = (emp: Employee) => {
    setCurrentTab('project-members');
    setIsOpen(false);
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 dark:bg-slate-900/95 light:bg-white/95 backdrop-blur border-b border-slate-800 dark:border-slate-800 light:border-slate-200 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
        {/* Global Search Container */}
        <div className="relative flex-1 max-w-2xl">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={globalSearchQuery}
              onChange={(e) => {
                setGlobalSearchQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder="Search projects, members, LOD stages, disciplines, clashes... (Press / to focus)"
              className="w-full bg-slate-800/80 dark:bg-slate-800/80 light:bg-slate-100 text-slate-100 dark:text-slate-100 light:text-slate-900 text-xs sm:text-sm rounded-xl pl-10 pr-20 py-2.5 border border-slate-700 dark:border-slate-700 light:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition shadow-inner placeholder-slate-400 dark:placeholder-slate-400 light:placeholder-slate-500"
            />

            {/* Clear & Keyboard Hint */}
            <div className="absolute right-2.5 flex items-center gap-1.5">
              {globalSearchQuery ? (
                <button
                  onClick={() => {
                    setGlobalSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="p-1 rounded-md text-slate-400 hover:text-white dark:hover:text-white light:hover:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-700 light:hover:bg-slate-200 transition"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-700/60 dark:bg-slate-700/60 light:bg-slate-200 text-slate-400 dark:text-slate-400 light:text-slate-600 border border-slate-600/40">
                  /
                </span>
              )}
            </div>
          </div>

          {/* Interactive Search Results Popover */}
          {isOpen && (
            <div
              ref={dropdownRef}
              className="absolute left-0 right-0 top-full mt-2 bg-slate-900 dark:bg-slate-900 light:bg-white border border-slate-800 dark:border-slate-800 light:border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden text-xs max-h-[80vh] flex flex-col animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Filter Tabs Header inside dropdown */}
              <div className="p-2.5 border-b border-slate-800 dark:border-slate-800 light:border-slate-200 bg-slate-950/50 dark:bg-slate-950/50 light:bg-slate-50 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setFilterType('all')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition ${
                      filterType === 'all'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 dark:hover:text-slate-200 light:hover:text-slate-800'
                    }`}
                  >
                    All ({totalResultsCount})
                  </button>
                  <button
                    onClick={() => setFilterType('projects')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition ${
                      filterType === 'projects'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 dark:hover:text-slate-200 light:hover:text-slate-800'
                    }`}
                  >
                    Projects ({matchingProjects.length})
                  </button>
                  <button
                    onClick={() => setFilterType('members')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition ${
                      filterType === 'members'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 dark:hover:text-slate-200 light:hover:text-slate-800'
                    }`}
                  >
                    Members ({matchingEmployees.length})
                  </button>
                  {matchingClashes.length > 0 && (
                    <button
                      onClick={() => setFilterType('clashes')}
                      className={`px-2.5 py-1 rounded-lg font-medium transition ${
                        filterType === 'clashes'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200 dark:hover:text-slate-200 light:hover:text-slate-800'
                      }`}
                    >
                      Clashes ({matchingClashes.length})
                    </button>
                  )}
                </div>

                {query && (
                  <span className="text-[11px] text-blue-400 font-medium truncate max-w-[140px]">
                    Matching &quot;{query}&quot;
                  </span>
                )}
              </div>

              {/* Search Results List */}
              <div className="overflow-y-auto p-3 space-y-4 max-h-[60vh]">
                {/* 1. Projects Section */}
                {(filterType === 'all' || filterType === 'projects') && matchingProjects.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500 mb-2 px-1">
                      <div className="flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-blue-400" />
                        <span>BIM Projects ({matchingProjects.length})</span>
                      </div>
                      <button
                        onClick={() => {
                          setCurrentTab('projects');
                          setIsOpen(false);
                        }}
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5 text-[10px]"
                      >
                        <span>View Portfolio</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {matchingProjects.map((p) => {
                        const completed = getProjectCompletedHours(p.id);
                        const pct = p.totalEstimatedHours > 0
                          ? Math.min(100, Math.round((completed / p.totalEstimatedHours) * 100))
                          : 0;

                        return (
                          <div
                            key={p.id}
                            onClick={() => handleSelectProject(p)}
                            className="p-2.5 rounded-xl bg-slate-800/50 dark:bg-slate-800/50 light:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-800 light:hover:bg-slate-200/80 border border-slate-700/60 dark:border-slate-700/60 light:border-slate-200 cursor-pointer transition flex items-center justify-between gap-3 group"
                          >
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-500/20">
                                {p.code}
                              </div>
                              <div className="overflow-hidden">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-white dark:text-white light:text-slate-900 group-hover:text-blue-400 transition truncate">
                                    {p.name}
                                  </h4>
                                  <span
                                    className={`text-[9px] font-semibold px-1.5 py-0.2 rounded-full shrink-0 ${
                                      p.status === 'On Track'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : p.status === 'At Risk'
                                        ? 'bg-amber-500/20 text-amber-400'
                                        : 'bg-rose-500/20 text-rose-400'
                                    }`}
                                  >
                                    {p.status}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-400 light:text-slate-600 mt-0.5 truncate">
                                  <span>{p.buildingType}</span>
                                  <span>•</span>
                                  <span className="text-indigo-400 font-medium">{p.currentLOD}</span>
                                  <span>•</span>
                                  <span>{completed} / {p.totalEstimatedHours}h ({pct}%)</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenLogModal(p.id);
                                  setIsOpen(false);
                                }}
                                className="px-2 py-1 rounded bg-slate-700 dark:bg-slate-700 light:bg-slate-200 hover:bg-blue-600 hover:text-white text-[10px] text-slate-300 dark:text-slate-300 light:text-slate-700 transition"
                                title="Log hours for this project"
                              >
                                Log
                              </button>
                              <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Team Members Section */}
                {(filterType === 'all' || filterType === 'members') && matchingEmployees.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500 mb-2 px-1">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Team Members & Specialists ({matchingEmployees.length})</span>
                      </div>
                      <button
                        onClick={() => {
                          setCurrentTab('project-members');
                          setIsOpen(false);
                        }}
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5 text-[10px]"
                      >
                        <span>View Matrix</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {matchingEmployees.map((emp) => {
                        const weekly = getEmployeeLoggedHours(emp.id, 'this-week');
                        const total = getEmployeeLoggedHours(emp.id, 'all');

                        return (
                          <div
                            key={emp.id}
                            onClick={() => handleSelectEmployee(emp)}
                            className="p-2.5 rounded-xl bg-slate-800/50 dark:bg-slate-800/50 light:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-800 light:hover:bg-slate-200/80 border border-slate-700/60 dark:border-slate-700/60 light:border-slate-200 cursor-pointer transition flex items-center justify-between gap-2.5 group"
                          >
                            <div className="flex items-center gap-2.5 overflow-hidden">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-[11px] shrink-0 shadow-xs border border-slate-600/50">
                                {emp.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || 'U'}
                              </div>
                              <div className="overflow-hidden">
                                <div className="font-bold text-white dark:text-white light:text-slate-900 group-hover:text-blue-400 transition truncate">
                                  {emp.name}
                                </div>
                                <div className="text-[10px] text-slate-400 dark:text-slate-400 light:text-slate-600 truncate">
                                  {emp.role} • <span className="text-emerald-400">{emp.primaryDiscipline}</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-semibold text-white dark:text-white light:text-slate-800 text-[11px]">
                                {weekly.toFixed(1)}h/wk
                              </span>
                              <span className="text-[9px] text-slate-400 block">
                                {total.toFixed(0)}h total
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Clashes Section */}
                {(filterType === 'all' || filterType === 'clashes') && matchingClashes.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-400 light:text-slate-500 mb-2 px-1">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Matched Clashes ({matchingClashes.length})</span>
                      </div>
                      <button
                        onClick={() => {
                          setCurrentTab('clash-lod');
                          setIsOpen(false);
                        }}
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-0.5 text-[10px]"
                      >
                        <span>View Clash Matrix</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {matchingClashes.slice(0, 3).map((clash) => (
                        <div
                          key={clash.id}
                          onClick={() => {
                            setCurrentTab('clash-lod');
                            setIsOpen(false);
                          }}
                          className="p-2.5 rounded-xl bg-slate-800/40 dark:bg-slate-800/40 light:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-800 light:hover:bg-slate-200 border border-slate-700/50 cursor-pointer transition flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-amber-400 text-[10px]">{clash.projectCode}</span>
                              <span className="font-semibold text-white dark:text-white light:text-slate-900">{clash.description}</span>
                            </div>
                            <p className="text-[10px] text-slate-400">
                              {clash.disciplineA} vs {clash.disciplineB} • {clash.location}
                            </p>
                          </div>

                          <span className="text-[9px] font-semibold px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                            {clash.severity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {totalResultsCount === 0 && (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    <p>No projects, team members, or clashes match &quot;{query}&quot;.</p>
                    <button
                      onClick={() => setGlobalSearchQuery('')}
                      className="mt-2 text-blue-400 hover:underline font-semibold"
                    >
                      Clear search query
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Navigation Footer */}
              <div className="p-2.5 border-t border-slate-800 dark:border-slate-800 light:border-slate-200 bg-slate-950/60 dark:bg-slate-950/60 light:bg-slate-50 flex items-center justify-between text-[11px] text-slate-400">
                <span>Press <kbd className="px-1 py-0.5 rounded bg-slate-800 dark:bg-slate-800 light:bg-slate-200 border border-slate-700 text-slate-300 dark:text-slate-300 light:text-slate-700 font-mono text-[10px]">ESC</kbd> to close</span>
                <span>Active Across All Views</span>
              </div>
            </div>
          )}
        </div>

        {/* Right utility buttons: Theme toggle & quick shortcuts */}
        <div className="flex items-center gap-2">
          {/* Theme Switcher in Header */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-800/80 dark:bg-slate-800/80 light:bg-slate-100 text-slate-300 dark:text-slate-300 light:text-slate-700 hover:text-white dark:hover:text-white light:hover:text-slate-900 border border-slate-700 dark:border-slate-700 light:border-slate-300 transition"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Theme`}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span className="hidden md:inline text-xs font-semibold">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-blue-500" />
                <span className="hidden md:inline text-xs font-semibold">Dark</span>
              </>
            )}
          </button>

          {/* Quick Add Project */}
          <button
            onClick={onOpenNewProjectModal}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-800 dark:bg-slate-800 light:bg-slate-100 hover:bg-slate-700 text-slate-200 dark:text-slate-200 light:text-slate-800 border border-slate-700 dark:border-slate-700 light:border-slate-300 transition"
            title="Add Project"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
            <span>+ Project</span>
          </button>

          {/* Quick Add Member */}
          <button
            onClick={onOpenNewEmployeeModal}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition"
            title="Add Team Member"
          >
            <UserPlus className="w-3.5 h-3.5 text-blue-400" />
            <span>+ Member</span>
          </button>
        </div>
      </div>
    </header>
  );
};
