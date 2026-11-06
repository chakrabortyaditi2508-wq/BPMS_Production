import React, { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useBimData } from '../context/BimDataContext';
import { db } from '../firebase/config';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  isSuperAdminEmail,
  normalizeUserRole,
  mapAppRoleToAccessLevel,
  mapAppRoleToDisplayRole,
  mapUserRoleToSecurityRole,
} from '../auth/googleAuth';
import { AccessLevel } from '../types';

export const PendingApprovalScreen: React.FC = () => {
  const { user, updateCurrentUser, logout } = useAuth();
  const { currentUser, signOut } = useBimData();
  const [syncError, setSyncError] = React.useState<string | null>(null);

  const activeUser = user || currentUser;
  const cleanEmail = (activeUser?.email || '').trim().toLowerCase();

  // Real-time Firestore listener for live Super Admin approval
  useEffect(() => {
    if (!cleanEmail) return;

    let unsubscribe: (() => void) | undefined;
    try {
      const reqQuery = query(collection(db, 'access_requests'), where('email', '==', cleanEmail));
      unsubscribe = onSnapshot(
        reqQuery,
        (snapshot) => {
          setSyncError(null);
          if (!snapshot.empty) {
            const docs = snapshot.docs.map((d) => ({
              id: d.id,
              ...d.data({ serverTimestamps: 'estimate' }),
            } as any));
            docs.sort((a, b) => {
              const aStatus = String(a.status || '').toLowerCase();
              const bStatus = String(b.status || '').toLowerCase();
              const aWeight = aStatus === 'approved' ? 3 : aStatus === 'rejected' ? 2 : 1;
              const bWeight = bStatus === 'approved' ? 3 : bStatus === 'rejected' ? 2 : 1;
              if (aWeight !== bWeight) return bWeight - aWeight;
              const aTime = new Date(a.updatedAt || a.reviewedAt || a.timestamp || 0).getTime() || 0;
              const bTime = new Date(b.updatedAt || b.reviewedAt || b.timestamp || 0).getTime() || 0;
              return bTime - aTime;
            });
            const data = docs[0];
            const firestoreStatus = String(data?.status || '').trim().toLowerCase();

            if (firestoreStatus === 'approved' || firestoreStatus === 'active') {
              const assignedAppRole = normalizeUserRole(
                data?.assignedRole || data?.role || data?.appRole,
                isSuperAdminEmail(cleanEmail)
              );
              const calculatedAccessLevel = (data?.assignedAccessLevel as AccessLevel) || mapAppRoleToAccessLevel(assignedAppRole);
              const displayRole = mapAppRoleToDisplayRole(assignedAppRole);
              const securityRole = mapUserRoleToSecurityRole(assignedAppRole);

              updateCurrentUser({
                status: 'APPROVED',
                appRole: assignedAppRole,
                accessLevel: calculatedAccessLevel,
                role: displayRole,
                securityRole,
                isAdmin: assignedAppRole === 'SUPER_ADMIN' || assignedAppRole === 'DIRECTOR' || assignedAppRole === 'PROJECT_MANAGER',
                name: data?.fullName || data?.name || activeUser?.name,
              });
            } else if (firestoreStatus === 'rejected') {
              updateCurrentUser({ status: 'REJECTED' });
            }
          }
        },
        (error: any) => {
          console.warn('Real-time access_requests listener notice:', error);
          setSyncError(error?.message || 'Unable to sync approval status in real time.');
        }
      );
    } catch (e: any) {
      console.warn('Error setting up onSnapshot listener:', e);
      setSyncError(e?.message || 'Unable to connect to real-time status listener.');
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [cleanEmail, updateCurrentUser, activeUser?.name]);

  const handleBackToLogin = () => {
    logout();
    signOut();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Minimal Post-Submission Confirmation Card */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 text-slate-100 text-center space-y-6">
        {/* Top Status Badge */}
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Status: Pending
          </span>
        </div>

        {/* Main Heading */}
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Request Submitted Successfully!
        </h1>

        {/* Subtext */}
        <p className="text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
          Your request has been sent to the Super Admin. Please wait for approval.
        </p>

        {syncError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {syncError}
          </div>
        )}

        {/* Primary Action Button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleBackToLogin}
            className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-xl shadow-blue-600/30 transition transform active:scale-[0.99] cursor-pointer"
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};
