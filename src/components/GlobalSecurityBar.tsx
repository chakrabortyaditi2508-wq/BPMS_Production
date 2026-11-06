import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  KeyRound,
  LogOut,
  Settings,
  User,
  ChevronDown,
  Sun,
  Moon,
  Sparkles,
  Lock,
  Layers,
  Search,
  ExternalLink,
  Laptop,
  LayoutDashboard,
  Clock,
  Briefcase,
  Users,
  SlidersHorizontal,
  Star,
  FileText
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useBimData } from '../context/BimDataContext';
import { SecuritySettingsModal } from './SecuritySettingsModal';
import { TwoFactorSetupModal } from './TwoFactorSetupModal';
import { SecurityRole } from '../types';

interface GlobalSecurityBarProps {
  onOpenNewProjectModal?: () => void;
  onOpenNewEmployeeModal?: () => void;
  onOpenLogModal?: () => void;
}

export const GlobalSecurityBar: React.FC<GlobalSecurityBarProps> = ({
  onOpenNewProjectModal,
  onOpenNewEmployeeModal,
  onOpenLogModal,
}) => {
  const {
    user,
    session,
    securityRole,
    twoFactorState,
    switchSecurityRole,
    logout,
  } = useAuth();

  const { theme, toggleTheme, currentUser, signOut, currentTab } = useBimData();
  const isLight = theme === 'light';

  const NAV_TAB_MAP: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
    'dashboard': { label: 'Executive Dashboard', icon: LayoutDashboard },
    'projects': { label: 'Projects & Hours', icon: Layers },
    'daily-tracker': { label: 'Daily Hour Tracking', icon: Clock },
    'project-members': { label: 'Project Member Tracking', icon: Briefcase },
    'employees': { label: 'Team Efficiency', icon: Users },
    'assign-hours': { label: 'Assign Hours System', icon: SlidersHorizontal },
    'clash-lod': { label: 'Assign Hours System', icon: SlidersHorizontal },
    'project-feedback': { label: 'Project Feedback', icon: Star },
    'stakeholder-reports': { label: 'Stakeholder Reports', icon: FileText },
    'admin-nexus': { label: 'Admin Nexus', icon: ShieldCheck },
  };

  const activeTabMeta = NAV_TAB_MAP[currentTab] || { label: 'Executive Dashboard', icon: LayoutDashboard };
  const ActiveTabIcon = activeTabMeta.icon;

  useEffect(() => {
    document.title = `${activeTabMeta.label} | Production Pulse`;
  }, [activeTabMeta.label]);

  const displayName = currentUser?.name || user?.name || 'Modela Tech';
  const displayEmail = currentUser?.email || user?.email || 'modelatech2026@gmail.com';

  const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isSetup2FAModalOpen, setIsSetup2FAModalOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleBadgeStyle = (role: SecurityRole) => {
    switch (role) {
      case 'Super Admin':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'Project Manager':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'BIM Specialist':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      case 'Lead Coordinator':
        return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
      case 'Editor':
        return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
      case 'Viewer':
      default:
        return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
    }
  };

  const is2FAActive = Boolean(
    (user?.twoFactorEnabled !== undefined ? user.twoFactorEnabled : user?.twoFactor?.isEnabled) ??
    twoFactorState.isEnabled
  );

  return (
    <>
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-md transition-colors ${
          isLight
            ? 'bg-white/95 border-slate-200 text-slate-800'
            : 'bg-slate-900/95 border-slate-800 text-slate-100'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-3">
          {/* Left: Active Security State & Role Badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Prominent Active Role Badge */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border shadow-xs transition-all ${getRoleBadgeStyle(
                securityRole
              )}`}
              title={`Logged in as ${securityRole} (Active Session)`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <ShieldCheck className="w-3.5 h-3.5" />
              <span className="tracking-tight">{securityRole}: Active</span>
            </div>

            {/* 2FA Security Pill Indicator: Dynamic 2FA Active (green) / 2FA Inactive • Setup (orange) */}
            {is2FAActive ? (
              <button
                type="button"
                onClick={() => setIsSecurityModalOpen(true)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition cursor-pointer shadow-xs ${
                  isLight
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60 hover:bg-emerald-900/40'
                }`}
                title="Two-Factor Authentication is active & verifying sessions (Click to manage security settings)"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span className="font-bold">2FA Active</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsSetup2FAModalOpen(true)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition cursor-pointer shadow-xs ${
                  isLight
                    ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                    : 'bg-amber-950/40 text-amber-300 border-amber-800/60 hover:bg-amber-900/40'
                }`}
                title="Two-Factor Authentication Inactive - Click to setup TOTP 2FA"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-bold">2FA Inactive • Setup</span>
              </button>
            )}

            {/* Dynamic Active Page Header synchronized to active navigation state */}
            <div className={`h-4 w-[1px] hidden sm:block ${isLight ? 'bg-slate-300' : 'bg-slate-700/60'}`} />
            <div
              className="flex items-center gap-1.5 min-w-0"
              title={`Active Navigation Page: ${activeTabMeta.label}`}
            >
              <div className="w-6 h-6 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400 shrink-0 border border-blue-500/20">
                <ActiveTabIcon className="w-3.5 h-3.5" />
              </div>
              <span className={`text-xs sm:text-sm font-bold tracking-tight truncate ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}>
                {activeTabMeta.label}
              </span>
            </div>

            {/* ISO Compliance indicator */}
            <span className="hidden 2xl:inline-flex items-center text-[10px] text-slate-500 font-mono">
              ISO 19650 BEP Access Control
            </span>
          </div>

          {/* Right: Theme Toggle, Quick Actions & Central User Profile Menu */}
          <div className="flex items-center gap-2">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-xl border text-xs transition ${
                isLight
                  ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
              title={`Switch to ${isLight ? 'Dark' : 'Light'} Mode`}
            >
              {isLight ? (
                <Sun className="w-4 h-4 text-amber-500" />
              ) : (
                <Moon className="w-4 h-4 text-blue-400" />
              )}
            </button>

            {/* Security Settings Quick Button */}
            <button
              onClick={() => setIsSecurityModalOpen(true)}
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
                isLight
                  ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
              title="Open 2FA & Security Settings"
            >
              <KeyRound className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden lg:inline">2FA Settings</span>
            </button>

            {/* User Profile Dropdown Button */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                className={`flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border transition cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-900'
                    : 'bg-slate-800 hover:bg-slate-750 border-slate-700 text-white'
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0 ring-2 ring-blue-500/40">
                  {getInitials(displayName)}
                </div>

                <div className="hidden sm:block text-left min-w-0 max-w-[130px]">
                  <span className="text-xs font-bold truncate block leading-tight">
                    {displayName}
                  </span>
                  <span className="text-[10px] text-blue-400 font-medium truncate block leading-none mt-0.5">
                    {securityRole}
                  </span>
                </div>

                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isProfileMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Profile Menu Popover */}
              {isProfileMenuOpen && (
                <div
                  className={`absolute right-0 top-full mt-2 w-76 rounded-2xl border shadow-2xl z-50 p-3 space-y-3 animate-in fade-in zoom-in-95 duration-150 ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-800'
                      : 'bg-slate-900 border-slate-800 text-slate-100'
                  }`}
                >
                  {/* User Profile Card */}
                  <div className={`p-3 rounded-xl border space-y-2.5 ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
                  }`}>
                    {/* Role & 2FA Status Bar */}
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <span className="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {securityRole}: Active
                      </span>

                      {is2FAActive ? (
                        <button
                          onClick={() => {
                            setIsSecurityModalOpen(true);
                            setIsProfileMenuOpen(false);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold hover:bg-emerald-500/25 transition cursor-pointer"
                          title="2FA Active - Click to manage"
                        >
                          <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                          <span>2FA Active</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setIsSetup2FAModalOpen(true);
                            setIsProfileMenuOpen(false);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold hover:bg-amber-500/25 transition cursor-pointer"
                          title="2FA Inactive - Click to setup"
                        >
                          <ShieldAlert className="w-2.5 h-2.5 text-amber-400" />
                          <span>2FA Inactive • Setup</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-sm shrink-0 ring-2 ring-blue-500/40">
                        {getInitials(displayName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs truncate">
                          {displayName}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono truncate">
                          {displayEmail}
                        </div>
                        <div className="text-[10px] text-blue-400 mt-0.5 truncate">
                          {user?.organization || 'Production Pulse Team'}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">Session ID:</span>
                      <span className="font-mono text-slate-300 truncate max-w-[140px]">
                        {session?.token.slice(0, 14)}...
                      </span>
                    </div>
                  </div>

                  {/* Active Role Switcher */}
                  {(() => {
                    const isViewerRole =
                      securityRole === 'Viewer' ||
                      String(securityRole).toLowerCase().startsWith('viewer') ||
                      currentUser?.role === 'Viewer' ||
                      currentUser?.role === 'VIEWER' ||
                      currentUser?.appRole === 'VIEWER';

                    return (
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 flex items-center justify-between">
                          <span>Current Security Role</span>
                          {isViewerRole && (
                            <span className="inline-flex items-center gap-1 text-[9px] text-slate-400 font-medium normal-case">
                              <Lock className="w-2.5 h-2.5" />
                              Locked
                            </span>
                          )}
                        </label>
                        <select
                          value={isViewerRole ? 'Viewer' : securityRole}
                          disabled={isViewerRole}
                          aria-readonly={isViewerRole}
                          onChange={(e) => {
                            if (isViewerRole) return;
                            switchSecurityRole(e.target.value as any);
                          }}
                          className={`w-full text-xs rounded-xl px-2.5 py-2 font-semibold border focus:outline-none transition ${
                            isViewerRole
                              ? isLight
                                ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed opacity-80'
                                : 'bg-slate-800/60 border-slate-700/70 text-slate-300 cursor-not-allowed opacity-80'
                              : isLight
                              ? 'bg-slate-100 border-slate-300 text-slate-900 focus:border-blue-500 cursor-pointer'
                              : 'bg-slate-800 border-slate-700 text-white focus:border-blue-500 cursor-pointer'
                          }`}
                        >
                          {isViewerRole ? (
                            <option value="Viewer">Viewer</option>
                          ) : (
                            <>
                              <option value="Super Admin">Super Admin (Full Governance)</option>
                              <option value="Director">Director (Executive Access)</option>
                              <option value="Project Manager">Project Manager</option>
                              <option value="BIM Specialist">BIM Specialist</option>
                              <option value="Lead Coordinator">Lead Coordinator</option>
                              <option value="Editor">Editor</option>
                              <option value="Viewer">Viewer (Timesheet Only)</option>
                            </>
                          )}
                        </select>
                      </div>
                    );
                  })()}

                  {/* Menu Action Items */}
                  <div className="space-y-1 pt-1 border-t border-slate-800">
                    <button
                      onClick={() => {
                        setIsSecurityModalOpen(true);
                        setIsProfileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                        isLight
                          ? 'hover:bg-slate-100 text-slate-700'
                          : 'hover:bg-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-blue-400" />
                        <span>Security & 2FA Settings</span>
                      </div>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                          is2FAActive
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {is2FAActive ? 'Active' : 'Inactive'}
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        logout();
                        signOut();
                        setIsProfileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 p-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-rose-400" />
                      <span>Sign Out of Session</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Firestore Quota Exceeded Notice Banner */}
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs text-amber-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="truncate">
            <strong className="font-semibold text-amber-300">Firestore Write Quota Reached:</strong> Application running on high-speed Local Cache & Server Route synchronization. Database write quota resets daily.
          </span>
        </div>
        <a
          href="https://console.firebase.google.com/project/gen-lang-client-0498136594/firestore/databases/ai-studio-2ndremixproducti-6c4d93ca-07ef-472f-9f29-aa7277b9bf64/data?openUpgradeDialog=true"
          target="_blank"
          rel="noopener noreferrer"
          className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold transition shrink-0 flex items-center gap-1"
        >
          <span>Firebase Console</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Security Settings Modal */}
      <SecuritySettingsModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
      />

      {/* 2FA Setup Modal */}
      <TwoFactorSetupModal
        isOpen={isSetup2FAModalOpen}
        onClose={() => setIsSetup2FAModalOpen(false)}
        onSuccess={() => setIsSetup2FAModalOpen(false)}
      />
    </>
  );
};
