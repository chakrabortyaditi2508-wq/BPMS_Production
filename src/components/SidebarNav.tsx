import React, { useState } from 'react';
import {
  Layers,
  LayoutDashboard,
  Clock,
  Users,
  FileText,
  Plus,
  UserPlus,
  Sparkles,
  ChevronDown,
  Building2,
  Menu,
  X,
  ShieldCheck,
  Briefcase,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import {
  useBimData,
  resolveSecurityRole,
  getQuickActionPermissions,
  isTabAllowedForRole,
  cleanProjectName,
} from '../context/BimDataContext';
import { useOptionalAuth } from '../auth/AuthContext';
import { ViewTab } from '../types';

interface SidebarNavProps {
  currentTab: ViewTab;
  setCurrentTab: (tab: ViewTab) => void;
  onOpenLogModal: () => void;
  onOpenNewProjectModal: () => void;
  onOpenNewEmployeeModal: () => void;
  onOpenReportModal: () => void;
  onOpenSignInModal?: () => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  currentTab,
  setCurrentTab,
  onOpenLogModal,
  onOpenNewProjectModal,
  onOpenNewEmployeeModal,
  onOpenReportModal,
  onOpenSignInModal,
}) => {
  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    overallMetrics,
    theme,
    currentUser,
    onboardingRequests,
  } = useBimData();

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isLight = theme === 'light';
  const pendingCount = onboardingRequests.filter((r) =>
    (r.status || '').toLowerCase().includes('pending')
  ).length;

  const auth = useOptionalAuth();
  const isAuthenticated = auth ? auth.isAuthenticated : Boolean(currentUser);
  const effectiveSecurityRole = resolveSecurityRole(
    currentUser,
    isAuthenticated,
    auth?.securityRole
  );
  const isViewer = effectiveSecurityRole === 'Viewer';
  const {
    canAddProject,
    canAddMember,
    canLogHours,
    canViewAIReport,
  } = getQuickActionPermissions(effectiveSecurityRole);

  const allNavItems: {
    id: ViewTab;
    label: string;
    subLabel?: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
    { id: 'projects', label: 'Projects & Hours', icon: Layers },
    {
      id: 'daily-tracker',
      label: 'Daily Hour Tracking',
      subLabel: 'Daily Hours Tracking & Organizational Timesheets',
      icon: Clock,
    },
    { id: 'assign-hours', label: 'Assigned Hours System', icon: SlidersHorizontal },
    { id: 'employees', label: 'Team Efficiency', icon: Users },
    { id: 'project-feedback', label: 'Project Feedback', icon: Star },
    { id: 'stakeholder-reports', label: 'Stakeholder Reports', icon: FileText },
    { id: 'admin-nexus', label: 'Admin Nexus', icon: ShieldCheck },
  ];

  const navItems = allNavItems.filter((item) =>
    isTabAllowedForRole(item.id, effectiveSecurityRole)
  );

  const handleTabClick = (tabId: ViewTab) => {
    setCurrentTab(tabId);
    setIsMobileOpen(false);
  };

  const navContent = (
    <div className={`flex flex-col h-full border-r transition-colors ${
      isLight
        ? 'bg-white border-slate-200 text-slate-800'
        : 'bg-slate-900 border-slate-800 text-slate-100'
    }`}>
      {/* Brand & Logo Header */}
      <div className={`p-4 border-b flex items-center justify-between ${
        isLight ? 'border-slate-200' : 'border-slate-800'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`font-bold text-base tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Production Pulse
              </span>
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-500 border border-blue-500/30">
                Enterprise
              </span>
            </div>
            <p className={`text-[11px] truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              BIM Project & Member Intelligence
            </p>
          </div>
        </div>

        {/* Mobile close button */}
        <button
          onClick={() => setIsMobileOpen(false)}
          className={`lg:hidden p-1.5 rounded-lg transition ${
            isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Project Scope Selector */}
      <div className={`p-3.5 border-b ${
        isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800/80 bg-slate-950/40'
      }`}>
        <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${
          isLight ? 'text-slate-500' : 'text-slate-400'
        }`}>
          Active Project Scope
        </label>
        <div className="relative">
          <select
            aria-label="Filter by BIM Project"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className={`w-full appearance-none text-xs font-medium rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer truncate transition ${
              isLight
                ? 'bg-white text-slate-800 border border-slate-300'
                : 'bg-slate-800 text-slate-200 border border-slate-700'
            }`}
          >
            <option value="all">All Projects ({projects.length} Active)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {cleanProjectName(p.name)}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Quick Action Buttons Group */}
      <div className={`p-3.5 border-b space-y-2 ${
        isLight ? 'border-slate-200' : 'border-slate-800/80'
      }`}>
        <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${
          isLight ? 'text-slate-500' : 'text-slate-400'
        }`}>
          Quick Actions
        </div>

        {(canAddProject || canAddMember) && (
          <div className="grid grid-cols-2 gap-2">
            {/* Add Project Button */}
            {canAddProject && (
              <button
                onClick={() => {
                  onOpenNewProjectModal();
                  setIsMobileOpen(false);
                }}
                className={`flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-lg transition ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
                title="Create New BIM Project"
              >
                <Plus className="w-3.5 h-3.5 text-blue-500" />
                <span>Add Project</span>
              </button>
            )}

            {/* Add Member Button */}
            {canAddMember && (
              <button
                onClick={() => {
                  onOpenNewEmployeeModal();
                  setIsMobileOpen(false);
                }}
                className={`flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-lg transition ${
                  isLight
                    ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
                    : 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30'
                }`}
                title="Register New BIM Team Member"
              >
                <UserPlus className="w-3.5 h-3.5 text-blue-500" />
                <span>Add Member</span>
              </button>
            )}
          </div>
        )}

        <div className={`grid grid-cols-2 gap-2 ${(canAddProject || canAddMember) ? 'pt-1' : ''}`}>
          {/* Log Daily Hours */}
          {canLogHours && (
            <button
              onClick={() => {
                onOpenLogModal();
                setIsMobileOpen(false);
              }}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition shadow-sm"
              title="Log Daily Hours"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Log Hours</span>
            </button>
          )}

          {/* AI Stakeholder Report */}
          {canViewAIReport && (
            <button
              onClick={() => {
                onOpenReportModal();
                setIsMobileOpen(false);
              }}
              className="flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white transition shadow-sm"
              title="Generate AI Stakeholder Report"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>AI Report</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Navigation Ribbon (Vertical Left-Hand Side) */}
      <div className="flex-1 py-3 px-2 overflow-y-auto space-y-1">
        <div className={`px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider ${
          isLight ? 'text-slate-500' : 'text-slate-400'
        }`}>
          {isViewer ? 'Authorized Navigation' : 'Navigation'}
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : isLight ? 'text-slate-500' : 'text-slate-400'}`} />
                <div className="text-left min-w-0">
                  <div className="truncate">{item.label}</div>
                  {isViewer && item.subLabel && (
                    <div className="text-[10px] text-blue-200/90 font-normal truncate mt-0.5">
                      {item.subLabel}
                    </div>
                  )}
                </div>
              </div>

              {item.id === 'admin-nexus' && pendingCount > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? 'bg-amber-400 text-slate-950 font-extrabold'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                  }`}
                >
                  {pendingCount}
                </span>
              )}

              {item.id === 'clash-lod' && overallMetrics.criticalClashesCount > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                    isActive
                      ? 'bg-rose-500 text-white'
                      : 'bg-rose-500/20 text-rose-500 border border-rose-500/30'
                  }`}
                >
                  {overallMetrics.criticalClashesCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Left-Hand Side Ribbon */}
      <aside className="hidden lg:block w-72 h-screen sticky top-0 shrink-0 z-30">
        {navContent}
      </aside>

      {/* Mobile Top Header with Hamburger */}
      <header className={`lg:hidden border-b sticky top-0 z-40 px-4 py-3 flex items-center justify-between ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-white'
      }`}>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsMobileOpen(true)}
            className={`p-2 rounded-lg transition ${
              isLight ? 'bg-slate-100 text-slate-800 hover:bg-slate-200' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm">Production Pulse</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canAddMember && (
            <button
              onClick={onOpenNewEmployeeModal}
              className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 text-blue-500 border border-blue-500/30 text-xs font-semibold"
            >
              + Member
            </button>
          )}
          {canLogHours && (
            <button
              onClick={onOpenLogModal}
              className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
            >
              Log
            </button>
          )}
        </div>
      </header>

      {/* Mobile Slide-Over Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};

