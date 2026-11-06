import React, { useState, useEffect, useCallback } from 'react';
import {
  BimDataProvider,
  useBimData,
  resolveSecurityRole,
  isTabAllowedForRole,
  getDefaultTabForRole,
} from './context/BimDataContext';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { SidebarNav } from './components/SidebarNav';
import { GlobalSecurityBar } from './components/GlobalSecurityBar';
import { DashboardOverview } from './components/DashboardOverview';
import { ProjectList } from './components/ProjectList';
import { DailyHourTracker } from './components/DailyHourTracker';
import { ProjectMemberTracking } from './components/ProjectMemberTracking';
import { EmployeeDirectory } from './components/EmployeeDirectory';
import { AssignHoursSystem } from './components/AssignHoursSystem';
import { ProjectFeedback } from './components/ProjectFeedback';
import { ClashAndLODTracker } from './components/ClashAndLODTracker';
import { StakeholderReportsArchive } from './components/StakeholderReportsArchive';
import { AdminNexus } from './components/AdminNexus';
import { StakeholderReportModal } from './components/StakeholderReportModal';
import { LogTimeModal } from './components/LogTimeModal';
import { NewProjectModal } from './components/NewProjectModal';
import { NewEmployeeModal } from './components/NewEmployeeModal';
import { ProjectDetailModal } from './components/ProjectDetailModal';
import { SignInModal } from './components/SignInModal';
import { PendingApprovalScreen } from './components/PendingApprovalScreen';
import { AuthGateway } from './components/AuthGateway';
import { TwoFactorChallengeModal } from './components/TwoFactorChallengeModal';
import { PublicClientFeedback } from './components/PublicClientFeedback';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BimProject, ViewTab } from './types';

export const ROUTE_TAB_MAP: Record<string, ViewTab> = {
  '/dashboard': 'dashboard',
  '/projects': 'projects',
  '/daily-tracker': 'daily-tracker',
  '/project-members': 'project-members',
  '/employees': 'employees',
  '/assign-hours': 'assign-hours',
  '/clash-lod': 'assign-hours',
  '/project-feedback': 'project-feedback',
  '/stakeholder-reports': 'stakeholder-reports',
  '/admin-nexus': 'admin-nexus',
};

export const TAB_ROUTE_MAP: Record<ViewTab, string> = {
  'dashboard': '/dashboard',
  'projects': '/projects',
  'daily-tracker': '/daily-tracker',
  'project-members': '/project-members',
  'employees': '/employees',
  'assign-hours': '/assign-hours',
  'clash-lod': '/assign-hours',
  'project-feedback': '/project-feedback',
  'stakeholder-reports': '/stakeholder-reports',
  'admin-nexus': '/admin-nexus',
};

export function isFeedbackRoute(path?: string): boolean {
  if (typeof window !== 'undefined') {
    const pathname = window.location?.pathname || '';
    if (pathname === '/feedback' || pathname.startsWith('/feedback')) {
      return true;
    }
    const hash = window.location?.hash || '';
    if (
      hash === '#feedback' ||
      hash === '#/feedback' ||
      hash.startsWith('#feedback') ||
      hash.startsWith('#/feedback')
    ) {
      return true;
    }
  }
  if (!path || typeof path !== 'string') return false;
  const clean = (path.split('?')[0] || '').split('#')[0]?.replace(/\/+$/, '') || '';
  return clean === '/feedback' || clean.startsWith('/feedback');
}

function getNormalizedPath(): string {
  if (typeof window === 'undefined' || !window.location) return '/';
  // Check if current route is public feedback portal
  if (isFeedbackRoute()) return '/feedback';

  // Check hash first (e.g. #/dashboard or #dashboard or #feedback)
  const rawHash = window.location?.hash || '';
  const hash = rawHash.replace(/^#\/?/, '/');
  if (isFeedbackRoute(hash)) return '/feedback';
  if (hash && hash !== '/' && ROUTE_TAB_MAP[hash]) {
    return hash;
  }
  const pathname = window.location?.pathname || '';
  if (!pathname || pathname === '' || pathname === '/') return '/';
  if (isFeedbackRoute(pathname)) return '/feedback';
  const clean = pathname.replace(/\/+$/, '');
  return clean || '/';
}

function BimAppContent() {
  const { currentTab, setCurrentTab, theme, currentUser } = useBimData();
  const { isAuthenticated, is2FAPending, securityRole } = useAuth();
  const isLight = theme === 'light';

  const effectiveSecurityRole = resolveSecurityRole(
    currentUser,
    Boolean(isAuthenticated),
    securityRole
  );
  const defaultAllowedTab = getDefaultTabForRole(effectiveSecurityRole);
  const defaultAllowedRoute = TAB_ROUTE_MAP[defaultAllowedTab] || '/daily-tracker';

  // Active Browser Route State
  const [currentPath, setCurrentPath] = useState<string>(() => getNormalizedPath());
  const [isRouteReady, setIsRouteReady] = useState<boolean>(true);

  // Check if session is truly active and approved
  const userStatusUpper = String(currentUser?.status || '').toUpperCase();
  const hasActiveSession = Boolean(
    isAuthenticated &&
    currentUser &&
    (userStatusUpper === 'APPROVED' || userStatusUpper === 'ACTIVE')
  );

  // 1. Automatic Unauthenticated Redirect:
  // If an unauthenticated user opens any direct dashboard link (e.g. /dashboard, /projects, /admin-nexus),
  // immediately store the attempted target and redirect to the Landing / Sign-In page (/)
  // Auth Guard Exemption: If window.location.pathname === '/feedback' (or starts with '/feedback'), DO NOT redirect!
  useEffect(() => {
    // Check if requested route is public feedback
    if (isFeedbackRoute() || isFeedbackRoute(currentPath)) {
      return;
    }

    if (!hasActiveSession) {
      const path = getNormalizedPath();
      if (path !== '/' && path !== '/login' && !isFeedbackRoute(path)) {
        try {
          sessionStorage.setItem('bpms_redirect_target', path);
        } catch {
          // ignore
        }
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', '/');
        }
        setCurrentPath('/');
      }
    }
  }, [hasActiveSession, currentPath]);

  // Synchronize browser popstate & hashchange events
  useEffect(() => {
    const handleLocationChange = () => {
      const path = getNormalizedPath();
      setCurrentPath(path);
      if (ROUTE_TAB_MAP[path]) {
        const targetTab = ROUTE_TAB_MAP[path];
        if (isTabAllowedForRole(targetTab, effectiveSecurityRole)) {
          setCurrentTab(targetTab);
        } else {
          setCurrentTab(defaultAllowedTab);
        }
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [setCurrentTab, effectiveSecurityRole, defaultAllowedTab]);

  // Sync initial path with ViewTab if authenticated and approved; redirect root / or /login directly to allowed default tab
  useEffect(() => {
    if (hasActiveSession) {
      const path = getNormalizedPath();
      if (path === '/' || path === '/login') {
        if (typeof window !== 'undefined' && window.history) {
          window.history.replaceState(null, '', defaultAllowedRoute);
        }
        setCurrentPath(defaultAllowedRoute);
        setCurrentTab(defaultAllowedTab);
      } else if (ROUTE_TAB_MAP[path]) {
        const requestedTab = ROUTE_TAB_MAP[path];
        if (isTabAllowedForRole(requestedTab, effectiveSecurityRole)) {
          setCurrentTab(requestedTab);
        } else {
          if (typeof window !== 'undefined' && window.history) {
            window.history.replaceState(null, '', defaultAllowedRoute);
          }
          setCurrentPath(defaultAllowedRoute);
          setCurrentTab(defaultAllowedTab);
        }
      } else {
        // Fallback for unrecognized sub-routes
        if (typeof window !== 'undefined' && window.history) {
          window.history.replaceState(null, '', defaultAllowedRoute);
        }
        setCurrentPath(defaultAllowedRoute);
        setCurrentTab(defaultAllowedTab);
      }
      setIsRouteReady(true);
    }
  }, [hasActiveSession, setCurrentTab, effectiveSecurityRole, defaultAllowedTab, defaultAllowedRoute]);

  // Automatically enforce role-based view tab constraint when securityRole changes or restricted tab is active
  useEffect(() => {
    if (!isTabAllowedForRole(currentTab, effectiveSecurityRole)) {
      setCurrentTab(defaultAllowedTab);
      if (typeof window !== 'undefined' && window.history && hasActiveSession) {
        window.history.replaceState(null, '', defaultAllowedRoute);
        setCurrentPath(defaultAllowedRoute);
      }
    }
  }, [effectiveSecurityRole, currentTab, setCurrentTab, defaultAllowedTab, defaultAllowedRoute, hasActiveSession]);

  // Modal states
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportModalProjectId, setReportModalProjectId] = useState<string | undefined>();

  const [isLogTimeModalOpen, setIsLogTimeModalOpen] = useState(false);
  const [logTimeModalProjectId, setLogTimeModalProjectId] = useState<string | undefined>();

  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isNewEmployeeModalOpen, setIsNewEmployeeModalOpen] = useState(false);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);

  const [selectedProjectForDetail, setSelectedProjectForDetail] = useState<BimProject | null>(null);

  /**
   * Router navigation helper
   */
  const navigateTo = useCallback(
    (targetPath: string) => {
      if (typeof window !== 'undefined') {
        window.history.pushState(null, '', targetPath);
      }
      setCurrentPath(targetPath);
      if (ROUTE_TAB_MAP[targetPath]) {
        setCurrentTab(ROUTE_TAB_MAP[targetPath]);
      }
    },
    [setCurrentTab]
  );

  /**
   * Handle Tab change from sidebar or headers
   */
  const handleTabChange = useCallback(
    (tabId: ViewTab) => {
      if (!isTabAllowedForRole(tabId, effectiveSecurityRole)) {
        navigateTo(defaultAllowedRoute);
        return;
      }
      const targetRoute = TAB_ROUTE_MAP[tabId] || defaultAllowedRoute;
      navigateTo(targetRoute);
    },
    [navigateTo, effectiveSecurityRole, defaultAllowedRoute]
  );

  /**
   * Post-Login Routing:
   * Only redirect users to the dashboard *after* they have successfully submitted their login credentials
   */
  const handlePostLoginRouting = useCallback(
    (explicitTarget?: string) => {
      let target = explicitTarget;
      if (!target) {
        try {
          target = sessionStorage.getItem('bpms_redirect_target') || defaultAllowedRoute;
          sessionStorage.removeItem('bpms_redirect_target');
        } catch {
          target = defaultAllowedRoute;
        }
      }

      const targetTab = ROUTE_TAB_MAP[target];
      if (!targetTab || !isTabAllowedForRole(targetTab, effectiveSecurityRole)) {
        target = defaultAllowedRoute;
      }

      navigateTo(target);
    },
    [effectiveSecurityRole, defaultAllowedRoute, navigateTo]
  );

  // Retrieve any pending attempted route for display on login screen
  const attemptedRoute = (() => {
    try {
      return sessionStorage.getItem('bpms_redirect_target');
    } catch {
      return null;
    }
  })();

  // 0. Auth Guard Exemption Logic: Public Client Route (/feedback)
  // Check if window.location.pathname === '/feedback' (or starts with '/feedback')
  // Bypass Auth Check: If the requested route is /feedback, DO NOT redirect to the login/landing screen even if isAuthenticated is false.
  // Render ONLY the standalone view matching exact layout (stripped of sidebar, navbar, and cancel buttons)
  const isPublicFeedback =
    (typeof window !== 'undefined' &&
      (window.location.pathname === '/feedback' ||
        window.location.pathname.startsWith('/feedback'))) ||
    isFeedbackRoute(currentPath) ||
    isFeedbackRoute();

  if (isPublicFeedback) {
    return <PublicClientFeedback />;
  }

  // 1. Two-Factor Authentication Login Challenge Step: If 2FA is pending, prompt challenge
  if (is2FAPending) {
    return (
      <TwoFactorChallengeModal
        onSuccess={() => handlePostLoginRouting()}
      />
    );
  }

  // 2. Pending Approval, Rejected, or Suspended: Render dedicated Access Request Status Screen if user session is in pending/rejected state
  if (
    isAuthenticated &&
    currentUser &&
    (userStatusUpper === 'PENDING_APPROVAL' ||
      userStatusUpper === 'PENDING' ||
      userStatusUpper === 'REJECTED' ||
      userStatusUpper === 'SUSPENDED')
  ) {
    return <PendingApprovalScreen />;
  }

  // 3. Session Gate / Auth Guard:
  // If user has NO active session, always load the Landing Page / Sign-In screen
  if (!hasActiveSession) {
    return (
      <AuthGateway
        onLoginSuccess={handlePostLoginRouting}
        attemptedRoute={attemptedRoute}
      />
    );
  }

  const handleOpenReportModal = (projectId?: string) => {
    setReportModalProjectId(projectId);
    setIsReportModalOpen(true);
  };

  const handleOpenLogModal = (projectId?: string) => {
    setLogTimeModalProjectId(projectId);
    setIsLogTimeModalOpen(true);
  };

  return (
    <div
      className={`min-h-screen flex flex-col lg:flex-row font-sans antialiased selection:bg-blue-600 selection:text-white transition-colors ${
        isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100'
      }`}
    >
      {/* Left-Hand Side Ribbon / Sidebar Navigation */}
      <SidebarNav
        currentTab={currentTab}
        setCurrentTab={handleTabChange}
        onOpenLogModal={() => handleOpenLogModal()}
        onOpenNewProjectModal={() => setIsNewProjectModalOpen(true)}
        onOpenNewEmployeeModal={() => setIsNewEmployeeModalOpen(true)}
        onOpenReportModal={() => handleOpenReportModal()}
        onOpenSignInModal={() => setIsSignInModalOpen(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Global Security Header / Active Role Bar */}
        <GlobalSecurityBar
          onOpenNewProjectModal={() => setIsNewProjectModalOpen(true)}
          onOpenNewEmployeeModal={() => setIsNewEmployeeModalOpen(true)}
          onOpenLogModal={() => handleOpenLogModal()}
        />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <ErrorBoundary>
            {!isRouteReady ? (
              <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-slate-400">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-medium">Loading workspace...</span>
              </div>
            ) : (
              <>
                {isTabAllowedForRole('dashboard', effectiveSecurityRole) && currentTab === 'dashboard' && (
                  <DashboardOverview
                    onOpenReportModal={handleOpenReportModal}
                    onOpenLogModal={() => handleOpenLogModal()}
                    onSelectProject={(proj) => setSelectedProjectForDetail(proj)}
                  />
                )}

                {isTabAllowedForRole('projects', effectiveSecurityRole) && currentTab === 'projects' && (
                  <ProjectList
                    onSelectProject={(proj) => setSelectedProjectForDetail(proj)}
                    onOpenNewProjectModal={() => setIsNewProjectModalOpen(true)}
                    onOpenReportModalWithProject={(id) => handleOpenReportModal(id)}
                  />
                )}

                {isTabAllowedForRole('daily-tracker', effectiveSecurityRole) && currentTab === 'daily-tracker' && (
                  <DailyHourTracker onOpenLogModal={() => handleOpenLogModal()} />
                )}

                {isTabAllowedForRole('employees', effectiveSecurityRole) && currentTab === 'employees' && (
                  <EmployeeDirectory
                    onOpenNewEmployeeModal={() => setIsNewEmployeeModalOpen(true)}
                    onOpenLogModalForEmployee={() => handleOpenLogModal()}
                    onSelectProject={(proj) => setSelectedProjectForDetail(proj)}
                  />
                )}

                {isTabAllowedForRole('assign-hours', effectiveSecurityRole) &&
                  (currentTab === 'assign-hours' || currentTab === 'clash-lod' || currentTab === 'project-members') && (
                    <AssignHoursSystem
                      onSelectProject={(proj) => setSelectedProjectForDetail(proj)}
                    />
                  )}

                {isTabAllowedForRole('project-feedback', effectiveSecurityRole) && currentTab === 'project-feedback' && (
                  <ProjectFeedback
                    onSelectProject={(proj) => setSelectedProjectForDetail(proj)}
                  />
                )}

                {isTabAllowedForRole('stakeholder-reports', effectiveSecurityRole) && currentTab === 'stakeholder-reports' && (
                  <StakeholderReportsArchive
                    onOpenReportModal={() => handleOpenReportModal()}
                  />
                )}

                {isTabAllowedForRole('admin-nexus', effectiveSecurityRole) && currentTab === 'admin-nexus' && (
                  <AdminNexus />
                )}
              </>
            )}
          </ErrorBoundary>
        </main>

        {/* Global Footer */}
        <footer
          className={`border-t py-5 text-center text-xs transition-colors mt-auto ${
            isLight
              ? 'bg-white border-slate-200 text-slate-500'
              : 'border-slate-900 bg-slate-950 text-slate-500'
          }`}
        >
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
                Production Pulse v2.6
              </span>
              <span>• ISO 19650 Compliance Enabled</span>
            </div>
            <div>
              Real-time BIM Project Hours, Team Member Tracking & Multi-Trade LOD Coordination
            </div>
          </div>
        </footer>
      </div>

      {/* Global Modals */}
      <StakeholderReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        preselectedProjectId={reportModalProjectId}
      />

      <LogTimeModal
        isOpen={isLogTimeModalOpen}
        onClose={() => setIsLogTimeModalOpen(false)}
        preselectedProjectId={logTimeModalProjectId}
      />

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
      />

      <NewEmployeeModal
        isOpen={isNewEmployeeModalOpen}
        onClose={() => setIsNewEmployeeModalOpen(false)}
      />

      <SignInModal
        isOpen={isSignInModalOpen}
        onClose={() => setIsSignInModalOpen(false)}
      />

      <ProjectDetailModal
        project={selectedProjectForDetail}
        onClose={() => setSelectedProjectForDetail(null)}
        onOpenReportModalWithProject={(id) => {
          setSelectedProjectForDetail(null);
          handleOpenReportModal(id);
        }}
        onOpenLogModalWithProject={(id) => {
          setSelectedProjectForDetail(null);
          handleOpenLogModal(id);
        }}
      />
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BimDataProvider>
          <BimAppContent />
        </BimDataProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
