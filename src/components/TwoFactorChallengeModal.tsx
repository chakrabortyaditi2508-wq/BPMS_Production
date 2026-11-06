import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  KeyRound,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  Info
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

interface TwoFactorChallengeModalProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  isStandaloneScreen?: boolean;
}

export const TwoFactorChallengeModal: React.FC<TwoFactorChallengeModalProps> = ({
  onSuccess,
  onCancel,
  isStandaloneScreen = true,
}) => {
  const { pending2FAUser, verify2FAChallenge, cancel2FAChallenge } = useAuth();

  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCodeInput, setBackupCodeInput] = useState('');
  const [rememberBrowser, setRememberBrowser] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  // 6-digit OTP code state
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus the first digit on mount
  useEffect(() => {
    if (!useBackupCode) {
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
    }
  }, [useBackupCode]);

  // Handle single digit input
  const handleDigitChange = (index: number, value: string) => {
    const char = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = char;
    setOtpDigits(newDigits);
    setErrorMessage(null);

    // Auto-advance
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    const fullCode = newDigits.join('');
    if (fullCode.length === 6 && !newDigits.some((d) => d === '')) {
      handleSubmit(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setOtpDigits(newDigits);
    setErrorMessage(null);

    if (pasted.length === 6) {
      inputRefs.current[5]?.focus();
      handleSubmit(pasted);
    } else {
      inputRefs.current[Math.min(5, pasted.length)]?.focus();
    }
  };

  const handleSubmit = async (codeToSubmit?: string) => {
    const token = useBackupCode ? backupCodeInput.trim() : (codeToSubmit || otpDigits.join(''));

    if (!token) {
      setErrorMessage(useBackupCode ? 'Please enter your emergency recovery code.' : 'Please enter the 6-digit code.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await verify2FAChallenge(token, rememberBrowser);
      if (result.success) {
        setIsLoading(false);
        if (result.method === 'backup') {
          setSuccessInfo(`Recovery code accepted! ${result.remainingCodes ?? 'Remaining'} backup codes left.`);
        } else {
          setSuccessInfo('Two-Factor Authentication verified. Access granted.');
        }

        setTimeout(() => {
          if (onSuccess) onSuccess();
        }, 400);
      } else {
        setIsLoading(false);
        setErrorMessage(result.error || 'Invalid verification token. Please try again.');
        if (!useBackupCode) {
          setOtpDigits(['', '', '', '', '', '']);
          inputRefs.current[0]?.focus();
        }
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Authentication failed. Please check your credentials.');
    }
  };

  const handleCancel = () => {
    cancel2FAChallenge();
    if (onCancel) onCancel();
  };

  const cardContent = (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-slate-100 backdrop-blur-xl">
      {/* Header with Security Badge */}
      <div className="flex items-center gap-3 pb-5 border-b border-slate-800">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 border border-blue-400/30 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white tracking-tight">
              2FA Security Challenge
            </h2>
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              Protected
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Production Pulse Enterprise Identity
          </p>
        </div>
      </div>

      {/* Target User Info Card */}
      {pending2FAUser && (
        <div className="my-5 p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0 ring-2 ring-blue-500/30">
              {pending2FAUser.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-xs text-white truncate">
                {pending2FAUser.name}
              </div>
              <div className="text-[11px] text-slate-400 truncate font-mono">
                {pending2FAUser.email}
              </div>
            </div>
          </div>

          <span className="text-[10px] px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20 shrink-0">
            {pending2FAUser.securityRole || pending2FAUser.accessLevel || 'Super Admin'}
          </span>
        </div>
      )}

      {/* Verification Input Mode */}
      {!useBackupCode ? (
        <div className="space-y-4 my-4">
          <div className="text-center">
            <label className="block text-xs font-semibold text-slate-200">
              Enter 6-digit Authenticator Token
            </label>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Check Google Authenticator or Microsoft Authenticator
            </p>
          </div>

          {/* 6-box input */}
          <div className="flex justify-center items-center gap-2 sm:gap-2.5 py-1">
            {otpDigits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => { inputRefs.current[idx] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                className={`w-11 h-13 text-center text-xl font-mono font-bold rounded-xl border transition-all ${
                  digit
                    ? 'bg-blue-600/15 border-blue-500 text-blue-300 ring-2 ring-blue-500/20'
                    : 'bg-slate-800/90 border-slate-700 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                } focus:outline-none`}
              />
            ))}
          </div>

          <div className="text-[11px] text-slate-500 text-center flex items-center justify-center gap-1">
            <Info className="w-3.5 h-3.5 text-blue-400" />
            <span>Developer bypass: Enter demo code <strong className="text-blue-300 font-mono cursor-pointer hover:underline" onClick={() => handleSubmit('123456')}>123456</strong> or an active TOTP.</span>
          </div>
        </div>
      ) : (
        <div className="space-y-4 my-4">
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">
              Emergency Backup Recovery Code
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Enter one of your single-use 8-character recovery codes (e.g. 8421-9932)
            </p>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="XXXX-XXXX"
                value={backupCodeInput}
                onChange={(e) => {
                  setBackupCodeInput(e.target.value.toUpperCase());
                  setErrorMessage(null);
                }}
                className="w-full text-sm bg-slate-800 border border-slate-700 text-white rounded-xl pl-10 pr-3.5 py-2.5 focus:outline-none focus:border-blue-500 font-mono font-bold tracking-wider"
              />
            </div>
          </div>
          {pending2FAUser?.twoFactor?.backupCodes && pending2FAUser.twoFactor.backupCodes.length > 0 && (
            <div className="text-[11px] text-slate-400">
              Demo sample backup code:{' '}
              <span
                onClick={() => setBackupCodeInput(pending2FAUser.twoFactor?.backupCodes[0] || '')}
                className="text-blue-400 font-mono font-bold cursor-pointer hover:underline"
              >
                {pending2FAUser.twoFactor.backupCodes[0]}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error / Success Feedback */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successInfo && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successInfo}</span>
        </div>
      )}

      {/* Remember browser checkbox */}
      <div className="flex items-center gap-2 my-4">
        <input
          type="checkbox"
          id="remember-browser"
          checked={rememberBrowser}
          onChange={(e) => setRememberBrowser(e.target.checked)}
          className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="remember-browser" className="text-xs text-slate-400 cursor-pointer">
          Trust this browser for 30 days
        </label>
      </div>

      {/* Primary Submit Button */}
      <button
        type="button"
        onClick={() => handleSubmit()}
        disabled={isLoading || (!useBackupCode && otpDigits.some((d) => !d)) || (useBackupCode && !backupCodeInput.trim())}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 transition transform active:scale-95"
      >
        {isLoading ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : (
          <ShieldCheck className="w-4 h-4" />
        )}
        <span>Verify & Unlock Dashboard</span>
      </button>

      {/* Alternative Method Toggle */}
      <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => {
            setUseBackupCode(!useBackupCode);
            setErrorMessage(null);
          }}
          className="text-blue-400 hover:text-blue-300 font-semibold"
        >
          {useBackupCode ? 'Use 6-digit Authenticator Token' : 'Use Emergency Backup Code'}
        </button>

        <button
          type="button"
          onClick={handleCancel}
          className="text-slate-400 hover:text-slate-200 flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Switch Account</span>
        </button>
      </div>
    </div>
  );

  if (!isStandaloneScreen) {
    return cardContent;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[34rem] h-[34rem] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {cardContent}
    </div>
  );
};
