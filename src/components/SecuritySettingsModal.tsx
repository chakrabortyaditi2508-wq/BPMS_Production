import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  QrCode,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  X,
  Lock,
  Smartphone,
  Eye,
  EyeOff,
  Download,
  Info,
  Laptop,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { TwoFactorSetupModal } from './TwoFactorSetupModal';

interface SecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SecuritySettingsModal: React.FC<SecuritySettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    user,
    session,
    securityRole,
    permissions,
    twoFactorState,
    disableTwoFactor,
    regenerateBackupCodes,
    switchSecurityRole,
  } = useAuth();

  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [disableConfirmation, setDisableConfirmation] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [statusNotification, setStatusNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Regeneration state
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateTotpInput, setRegenerateTotpInput] = useState('');
  const [showRegenerateInput, setShowRegenerateInput] = useState(false);

  if (!isOpen) return null;

  const handleDisable2FA = async () => {
    setIsDisabling(true);
    try {
      const res = await disableTwoFactor();
      if (res.success) {
        setStatusNotification({ type: 'success', message: 'Two-Factor Authentication has been disabled.' });
        setDisableConfirmation(false);
      } else {
        setStatusNotification({ type: 'error', message: res.error || 'Failed to disable 2FA.' });
      }
    } catch (e: any) {
      setStatusNotification({ type: 'error', message: e?.message || 'Error disabling 2FA' });
    } finally {
      setIsDisabling(false);
    }
  };

  const handleRegenerateCodes = async () => {
    if (!regenerateTotpInput.trim()) {
      setStatusNotification({ type: 'error', message: 'Please enter your 6-digit TOTP code to confirm regeneration.' });
      return;
    }

    setIsRegenerating(true);
    try {
      const res = await regenerateBackupCodes(regenerateTotpInput.trim());
      if (res.success) {
        setStatusNotification({ type: 'success', message: '8 new backup recovery codes generated successfully!' });
        setShowRegenerateInput(false);
        setRegenerateTotpInput('');
        setShowBackupCodes(true);
      } else {
        setStatusNotification({ type: 'error', message: res.error || 'Invalid TOTP code.' });
      }
    } catch (e: any) {
      setStatusNotification({ type: 'error', message: e?.message || 'Failed to regenerate codes.' });
    } finally {
      setIsRegenerating(false);
    }
  };

  const copyCodes = () => {
    if (!user?.twoFactor?.backupCodes) return;
    navigator.clipboard.writeText(user.twoFactor.backupCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  const downloadCodes = () => {
    if (!user?.twoFactor?.backupCodes) return;
    const content = `BIM MATRIX PRO / PRODUCTION PULSE - BACKUP CODES
Account: ${user?.email}
Date: ${new Date().toLocaleString()}

${user.twoFactor.backupCodes.map((c, i) => `Code ${i + 1}: ${c}`).join('\n')}
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recovery-codes-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-slate-100 flex flex-col max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 border border-blue-400/30 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Security & Two-Factor Authentication</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-mono border border-blue-500/20">
                    ISO 19650
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Manage active credentials, multi-factor authorization, and session tokens
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Status Toast Alert */}
          {statusNotification && (
            <div
              className={`mt-4 p-3 rounded-2xl border text-xs flex items-center justify-between gap-2 ${
                statusNotification.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {statusNotification.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{statusNotification.message}</span>
              </div>
              <button
                onClick={() => setStatusNotification(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Body Sections */}
          <div className="py-5 space-y-6">
            {/* 1. TWO-FACTOR AUTHENTICATION STATUS CARD */}
            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      twoFactorState.isEnabled
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    }`}
                  >
                    {twoFactorState.isEnabled ? (
                      <ShieldCheck className="w-5 h-5" />
                    ) : (
                      <ShieldAlert className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">
                        Two-Factor Authentication (2FA)
                      </h3>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                          twoFactorState.isEnabled
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        }`}
                      >
                        {twoFactorState.isEnabled ? 'Active & Enforcing' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {twoFactorState.isEnabled
                        ? `Enrolled with standard TOTP app. Requires a 6-digit verification code or backup code during sign-in.`
                        : 'Enhance your BIM account security with a time-based one-time password (TOTP) authenticator.'}
                    </p>
                  </div>
                </div>

                {/* Enable / Disable Button */}
                <div className="shrink-0">
                  {twoFactorState.isEnabled ? (
                    <button
                      onClick={() => setDisableConfirmation(true)}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition"
                    >
                      Disable 2FA
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsSetupModalOpen(true)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition transform active:scale-95"
                    >
                      Enable 2FA Now
                    </button>
                  )}
                </div>
              </div>

              {/* Disable Confirmation Prompt */}
              {disableConfirmation && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2 font-bold text-rose-200">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>Are you sure you want to disable 2FA?</span>
                  </div>
                  <p className="text-rose-300 text-[11px]">
                    Disabling Two-Factor Authentication reduces the security of your BIM projects and administrative functions.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleDisable2FA}
                      disabled={isDisabling}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition"
                    >
                      {isDisabling ? 'Disabling...' : 'Yes, Disable 2FA'}
                    </button>
                    <button
                      onClick={() => setDisableConfirmation(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Recovery Codes Overview when 2FA is active */}
              {twoFactorState.isEnabled && (
                <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <KeyRound className="w-4 h-4 text-blue-400" />
                    <span>
                      Emergency Recovery Codes Remaining:{' '}
                      <strong className="text-white font-mono">
                        {user?.twoFactor?.backupCodes?.length ?? 0}
                      </strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowBackupCodes(!showBackupCodes)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      {showBackupCodes ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showBackupCodes ? 'Hide Codes' : 'View Codes'}</span>
                    </button>
                    <button
                      onClick={() => setShowRegenerateInput(true)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Regenerate</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Backup Codes Revealed Drawer */}
              {showBackupCodes && twoFactorState.isEnabled && (
                <div className="mt-3 p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Single-Use Recovery Tokens
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={copyCodes}
                        className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
                      >
                        {copiedCodes ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedCodes ? 'Copied' : 'Copy'}</span>
                      </button>
                      <button
                        onClick={downloadCodes}
                        className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(user?.twoFactor?.backupCodes || []).map((code, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-center font-mono text-xs font-bold text-blue-300 select-all"
                      >
                        {code}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Regenerate Confirmation Input */}
              {showRegenerateInput && twoFactorState.isEnabled && (
                <div className="mt-3 p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5 animate-in fade-in duration-150">
                  <div className="text-xs font-semibold text-white">
                    Confirm Regeneration with 6-digit TOTP
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. 123456"
                      value={regenerateTotpInput}
                      onChange={(e) => setRegenerateTotpInput(e.target.value)}
                      className="text-xs bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono"
                    />
                    <button
                      onClick={handleRegenerateCodes}
                      disabled={isRegenerating}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs"
                    >
                      {isRegenerating ? 'Verifying...' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setShowRegenerateInput(false)}
                      className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. ACTIVE SESSION DETAILS */}
            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2">
                <Laptop className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-white">Active Session & Identity Token</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                  <span className="text-[10px] font-semibold text-slate-500 block uppercase">
                    Session Token Identifier
                  </span>
                  <span className="font-mono text-slate-300 font-bold truncate block mt-0.5">
                    {session?.token || 'None'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                  <span className="text-[10px] font-semibold text-slate-500 block uppercase">
                    Client & Gateway
                  </span>
                  <span className="text-slate-300 font-semibold block mt-0.5 truncate">
                    {session?.browser || 'Web Client'} • {session?.ipAddress || 'Internal'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                  <span className="text-[10px] font-semibold text-slate-500 block uppercase">
                    Issued Timestamp
                  </span>
                  <span className="text-slate-300 block mt-0.5">
                    {session?.issuedAt ? new Date(session.issuedAt).toLocaleString() : 'N/A'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                  <span className="text-[10px] font-semibold text-slate-500 block uppercase">
                    2FA Verification State
                  </span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{session?.is2FAVerified ? 'Verified & Authenticated' : 'Single-Factor Only'}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* 3. SECURITY ROLE & PERMISSIONS MATRIX */}
            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Role-Based Access Control (RBAC)</h3>
                </div>

                {/* Role Switcher for Testing/Governance */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">Switch Role:</span>
                  <select
                    value={securityRole}
                    onChange={(e) => switchSecurityRole(e.target.value as any)}
                    className="text-xs bg-slate-900 border border-slate-700 text-white rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="Super Admin">Super Admin</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="BIM Specialist">BIM Specialist</option>
                    <option value="Lead Coordinator">Lead Coordinator</option>
                    <option value="Editor">Editor</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                </div>
              </div>

              {/* Permissions list chips */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] pt-1">
                {Object.entries(permissions).map(([key, val]) => (
                  <div
                    key={key}
                    className={`p-2 rounded-lg border flex items-center gap-2 ${
                      val
                        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
                        : 'bg-slate-900/40 border-slate-800 text-slate-500'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        val ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                    <span className="truncate">
                      {key
                        .replace(/^can/, '')
                        .replace(/([A-Z])/g, ' $1')
                        .trim()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono text-[11px]">BPMS Security v2.6 • 2FA Enforced</span>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* 2FA Setup Modal Launcher */}
      <TwoFactorSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        onSuccess={() => {
          setIsSetupModalOpen(false);
          setStatusNotification({ type: 'success', message: 'Two-Factor Authentication successfully activated!' });
        }}
      />
    </>
  );
};
