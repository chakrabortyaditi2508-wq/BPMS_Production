import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Shield,
  KeyRound,
  QrCode,
  Copy,
  Check,
  AlertTriangle,
  Download,
  ArrowRight,
  RefreshCw,
  X,
  Lock,
  Sparkles,
  Smartphone,
  Info
} from 'lucide-react';
import { useAuth, TwoFactorSetupDraft } from '../auth/AuthContext';

interface TwoFactorSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const TwoFactorSetupModal: React.FC<TwoFactorSetupModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, initiateTwoFactorSetup, confirmTwoFactorSetup } = useAuth();

  const [step, setStep] = useState<'qr' | 'verify' | 'recovery-codes' | 'completed'>('qr');
  const [setupDraft, setSetupDraft] = useState<TwoFactorSetupDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 6-digit OTP code state
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Load 2FA setup draft when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('qr');
      setOtpDigits(['', '', '', '', '', '']);
      setErrorMessage(null);
      setIsLoading(true);

      initiateTwoFactorSetup()
        .then((draft) => {
          setSetupDraft(draft);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error(err);
          setIsLoading(false);
          setErrorMessage('Failed to generate 2FA credentials.');
        });
    }
  }, [isOpen]);

  // Focus the first input box when moving to verify step
  useEffect(() => {
    if (step === 'verify') {
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    }
  }, [step]);

  if (!isOpen) return null;

  // Handle individual OTP digit change with auto-advance and auto-submit
  const handleDigitChange = (index: number, value: string) => {
    // Only accept numeric digit
    const char = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = char;
    setOtpDigits(newDigits);
    setErrorMessage(null);

    // Auto-advance to next input
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are filled
    const fullCode = newDigits.join('');
    if (fullCode.length === 6 && !newDigits.some((d) => d === '')) {
      handleVerifyCode(fullCode);
    }
  };

  // Handle keydown for backspace navigation
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle paste full code into any box
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
      handleVerifyCode(pasted);
    } else {
      inputRefs.current[Math.min(5, pasted.length)]?.focus();
    }
  };

  // Submit and confirm 2FA
  const handleVerifyCode = async (codeToVerify?: string) => {
    const code = codeToVerify || otpDigits.join('');
    if (code.length !== 6 || !setupDraft) {
      setErrorMessage('Please enter the complete 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await confirmTwoFactorSetup(setupDraft.secret, code, setupDraft.backupCodes);
      if (result.success) {
        setIsLoading(false);
        setStep('recovery-codes');
      } else {
        setIsLoading(false);
        setErrorMessage(result.error || 'Invalid verification code. Please check your authenticator app.');
        // Clear digits for retry
        setOtpDigits(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Verification failed. Please try again.');
    }
  };

  const copySecretKey = () => {
    if (!setupDraft) return;
    navigator.clipboard.writeText(setupDraft.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const copyAllBackupCodes = () => {
    if (!setupDraft) return;
    const formatted = setupDraft.backupCodes.join('\n');
    navigator.clipboard.writeText(formatted);
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  const downloadBackupCodesFile = () => {
    if (!setupDraft) return;
    const content = `BIM MATRIX PRO / PRODUCTION PULSE - EMERGENCY 2FA BACKUP CODES
Account: ${user?.email || 'user'}
Generated: ${new Date().toLocaleString()}

Keep these single-use recovery codes in a secure location.
Each code can be used exactly once if you lose access to your authenticator app.

${setupDraft.backupCodes.map((c, i) => `Code ${i + 1}: ${c}`).join('\n')}
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bim-matrix-pro-backup-codes-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const finishSetup = () => {
    if (onSuccess) onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-slate-100 flex flex-col max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 border border-blue-400/30 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Two-Factor Authentication (2FA)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                  TOTP RFC 6238
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Protect your BIM project access with an Authenticator app
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

        {/* Step Indicator */}
        <div className="py-4 flex items-center justify-between text-xs border-b border-slate-800/80">
          <div className={`flex items-center gap-1.5 font-semibold ${step === 'qr' ? 'text-blue-400' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'qr' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
              1
            </span>
            <span>Link App</span>
          </div>
          <div className="w-8 h-px bg-slate-800" />
          <div className={`flex items-center gap-1.5 font-semibold ${step === 'verify' ? 'text-blue-400' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'verify' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
              2
            </span>
            <span>Verify Code</span>
          </div>
          <div className="w-8 h-px bg-slate-800" />
          <div className={`flex items-center gap-1.5 font-semibold ${step === 'recovery-codes' ? 'text-emerald-400' : 'text-slate-400'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 'recovery-codes' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
              3
            </span>
            <span>Backup Codes</span>
          </div>
        </div>

        {/* STEP 1: QR CODE & MANUAL SECRET */}
        {step === 'qr' && (
          <div className="py-5 space-y-5 animate-in fade-in duration-200">
            <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-start gap-2.5">
              <Smartphone className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-white">Supported Authenticator Apps</span>
                Scan this code with Google Authenticator, Microsoft Authenticator, 1Password, or Authy on your mobile device.
              </div>
            </div>

            {/* QR Code Container */}
            <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
              <div className="bg-white p-3 rounded-2xl shadow-xl shrink-0">
                {setupDraft?.qrCodeDataUrl ? (
                  <img
                    src={setupDraft.qrCodeDataUrl}
                    alt="2FA QR Code"
                    className="w-44 h-44 rounded-lg block"
                  />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center bg-slate-100 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-slate-600" />
                  </div>
                )}
              </div>

              <div className="space-y-3 flex-1 text-left">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Can&apos;t scan? Manual Key Setup
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Enter this Base32 secret key into your authenticator app manually:
                </p>

                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono font-bold tracking-wider px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-blue-300 select-all block truncate max-w-[240px]">
                    {setupDraft?.secret || 'LOADING...'}
                  </code>
                  <button
                    onClick={copySecretKey}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95"
                    title="Copy Secret Key"
                  >
                    {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                <div className="text-[11px] text-slate-500 pt-1">
                  Type: Time-based (TOTP) • 30 seconds interval • 6 digits
                </div>
              </div>
            </div>

            {/* Next Step Button */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('verify')}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/30 transition transform active:scale-95"
              >
                <span>Continue to Verification</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: 6-DIGIT VERIFICATION CODE WITH AUTO-FOCUS & AUTO-SUBMIT */}
        {step === 'verify' && (
          <div className="py-5 space-y-6 animate-in fade-in duration-200 text-center">
            <div>
              <h3 className="text-sm font-bold text-white">Enter the 6-digit Authenticator Code</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Type the verification token currently displayed on your mobile device for <span className="text-blue-400 font-mono font-semibold">{user?.email}</span>.
              </p>
            </div>

            {/* 6-box Segmented OTP Input */}
            <div className="flex justify-center items-center gap-2 sm:gap-3 py-2">
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
                  className={`w-11 h-13 sm:w-13 sm:h-15 text-center text-xl sm:text-2xl font-mono font-bold rounded-2xl border transition-all ${
                    digit
                      ? 'bg-blue-600/10 border-blue-500 text-blue-300 ring-2 ring-blue-500/20'
                      : 'bg-slate-800/80 border-slate-700 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                  } focus:outline-none`}
                />
              ))}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-center gap-2 animate-shake">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Quick Demo Helper Hint */}
            <div className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-400" />
              <span>Tip: You can paste a 6-digit code or enter demo code <strong className="text-blue-300 font-mono cursor-pointer hover:underline" onClick={() => handleVerifyCode('123456')}>123456</strong>.</span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <button
                onClick={() => setStep('qr')}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                Back to QR Code
              </button>
              <button
                onClick={() => handleVerifyCode()}
                disabled={isLoading || otpDigits.some((d) => !d)}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/30 transition transform active:scale-95"
              >
                {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Verify & Activate 2FA</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: EMERGENCY BACKUP RECOVERY CODES */}
        {step === 'recovery-codes' && (
          <div className="py-5 space-y-5 animate-in fade-in duration-200">
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white block text-sm">2FA Successfully Enabled!</span>
                Two-Factor Authentication is now actively safeguarding your workspace. Save these single-use emergency backup recovery codes now.
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p>
                Each recovery code can only be used once. If you ever lose access to your phone or authenticator app, these codes are the only way to recover your BIM account.
              </p>
            </div>

            {/* Grid of 8 Backup Codes */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(setupDraft?.backupCodes || []).map((code, index) => (
                  <div
                    key={index}
                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-center font-mono text-xs font-bold text-blue-300 select-all"
                  >
                    {code}
                  </div>
                ))}
              </div>

              {/* Copy & Download utility buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-800/80">
                <span className="text-[11px] text-slate-400">
                  8 Single-Use Recovery Tokens Generated
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyAllBackupCodes}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    {copiedCodes ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCodes ? 'Copied All' : 'Copy All'}</span>
                  </button>
                  <button
                    onClick={downloadBackupCodesFile}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-400" />
                    <span>Download (.txt)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Completion Button */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={finishSetup}
                className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-emerald-600/30 transition transform active:scale-95 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>I Have Saved My Recovery Codes</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
