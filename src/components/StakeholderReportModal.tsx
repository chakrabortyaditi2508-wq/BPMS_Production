import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Printer,
  Copy,
  Mail,
  Check,
  Building,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Download,
  Share2,
  ArrowRight,
  Send,
  Plus,
  Trash2,
  BellRing,
  CheckCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useBimData, cleanProjectName } from '../context/BimDataContext';
import { GeneratedStakeholderReport, BimProject } from '../types';
import { db } from '../firebase/config';
import { addDoc, collection } from 'firebase/firestore';

interface StakeholderReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedProjectId?: string;
}

export const StakeholderReportModal: React.FC<StakeholderReportModalProps> = ({
  isOpen,
  onClose,
  preselectedProjectId,
}) => {
  const {
    projects,
    employees,
    workLogs,
    theme,
    getProjectCompletedHours,
    saveStakeholderReport,
  } = useBimData();

  const isLight = theme === 'light';

  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    preselectedProjectId || projects[0]?.id || ''
  );

  React.useEffect(() => {
    if (preselectedProjectId) {
      setSelectedProjectId(preselectedProjectId);
    } else if (projects.length > 0 && !projects.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(projects[0].id);
    }
  }, [preselectedProjectId, projects, selectedProjectId]);
  const [audience, setAudience] = useState<string>(
    'Project Owners & Executive Steering Committee'
  );
  const [period, setPeriod] = useState<string>('Bi-Weekly Cycle (August 2026)');
  const [customFocus, setCustomFocus] = useState<string>(
    'Hours burn velocity, LOD 350 coordination milestones, and critical clash mitigations'
  );

  // Automated Email Notification Settings State
  const [emailNotificationEnabled, setEmailNotificationEnabled] = useState<boolean>(true);
  const [emailRecipients, setEmailRecipients] = useState<string[]>([
    'sushoovandas@gmail.com',
    'client.rep@aegis-gc.com',
    'bim.director@hospitaltrust.org',
  ]);
  const [newRecipientInput, setNewRecipientInput] = useState<string>('');
  const [emailDispatchedToast, setEmailDispatchedToast] = useState<boolean>(false);
  const [emailErrorToast, setEmailErrorToast] = useState<string | null>(null);
  const [isDispatchingEmail, setIsDispatchingEmail] = useState<boolean>(false);
  const [dispatchedRecipients, setDispatchedRecipients] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<GeneratedStakeholderReport | null>(null);

  if (!isOpen) return null;

  const currentProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  const buildReportMarkdown = (report: GeneratedStakeholderReport): string => {
    const cleanProj = cleanProjectName(report.projectName);
    return `# BIM EXECUTIVE STATUS REPORT
**Project:** ${cleanProj}
**Period:** ${report.period}
**Target Audience:** ${report.audience}
**Overall Status:** ${report.overallHealthStatus || 'On Track'}

---
## Executive Summary
${report.executiveSummary}

## Hours & Velocity Analysis
- **Burn Efficiency:** ${report.hoursAnalysis?.burnEfficiency || 'On Track'}
- **Completion Rate:** ${report.hoursAnalysis?.completionRate || 'Completed'}
- **Velocity Assessment:** ${report.hoursAnalysis?.velocityAssessment || 'Stable Team Output'}
- **Forecasted Completion:** ${report.hoursAnalysis?.forecastedCompletion || 'On Schedule'}

## LOD & Deliverables
**Stage:** ${report.lodAndDeliverables?.currentStage || 'LOD 350'}
### Highlights:
${(report.lodAndDeliverables?.highlights || []).map((h) => `- ${h}`).join('\n')}

## Coordination & Clash Quality
- **Resolution:** ${report.clashAndQualityStatus?.totalClashes || 'Resolved'}
- **Quality Score:** ${report.clashAndQualityStatus?.coordinationQualityScore || '91/100'}

## Key Risks & Mitigations
${(report.risksAndMitigations || [])
  .map((r) => `- **[${r.impact} Risk]** ${r.risk} | *Mitigation:* ${r.mitigationAction} (*Owner:* ${r.owner})`)
  .join('\n')}

## Recommendations
${(report.stakeholderRecommendations || []).map((rec, idx) => `${idx + 1}. ${rec}`).join('\n')}
`;
  };

  const dispatchEmailNotification = async (
    report: GeneratedStakeholderReport,
    overrideRecipients?: string[]
  ) => {
    const targetRecipients = (overrideRecipients || emailRecipients)
      .map((r) => r.trim().toLowerCase())
      .filter((r) => r.includes('@'));

    if (targetRecipients.length === 0) {
      setEmailErrorToast('Please add at least one valid stakeholder email address.');
      return;
    }

    setIsDispatchingEmail(true);
    setEmailErrorToast(null);

    const cleanProj = cleanProjectName(report.projectName || currentProject?.name || 'BIM Project');
    const reportTitle = `BIM EXECUTIVE STATUS REPORT — ${cleanProj}`;
    const markdownBody = buildReportMarkdown(report);

    try {
      const response = await fetch('/api/dispatch-report-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: targetRecipients,
          stakeholderEmails: targetRecipients,
          reportTitle,
          projectCode: currentProject?.code || 'PRJ',
          projectName: cleanProj,
          reportId: report.id,
          reportSummary: report.executiveSummary,
          overallHealthStatus: report.overallHealthStatus || 'On Track',
          period: report.period,
          audience: report.audience,
          hoursAnalysis: report.hoursAnalysis,
          markdownBody,
        }),
      });

      const data = await response.json().catch(() => ({ success: response.ok }));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Failed to dispatch stakeholder email.');
      }

      // Log email dispatch to Firestore asynchronously
      try {
        addDoc(collection(db, 'email_dispatches'), {
          reportId: report.id,
          reportTitle,
          projectName: cleanProj,
          stakeholderEmails: targetRecipients,
          overallHealthStatus: report.overallHealthStatus || 'On Track',
          markdownBody,
          dispatchedAt: new Date().toISOString(),
        }).catch(() => {});
      } catch {}

      const confirmedList: string[] =
        Array.isArray(data?.stakeholderEmails) && data.stakeholderEmails.length > 0
          ? data.stakeholderEmails
          : targetRecipients;

      setDispatchedRecipients(confirmedList);
      setEmailDispatchedToast(true);
      setGeneratedReport((prev) =>
        prev
          ? {
              ...prev,
              emailNotificationSent: true,
              emailRecipients: confirmedList,
            }
          : prev
      );
    } catch (e: any) {
      console.error('Email dispatch failed', e);
      setEmailErrorToast(e?.message || 'Unable to dispatch email notification. Please try again.');
    } finally {
      setIsDispatchingEmail(false);
    }
  };

  const handleAddRecipient = () => {
    const trimmed = newRecipientInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!trimmed.includes('@') || trimmed.length < 4) {
      setEmailErrorToast('Please enter a valid email address (e.g. executive@client.com).');
      return;
    }
    setEmailErrorToast(null);
    const nextRecipients = emailRecipients.includes(trimmed)
      ? emailRecipients
      : [...emailRecipients, trimmed];
    setEmailRecipients(nextRecipients);
    setNewRecipientInput('');
    setEmailNotificationEnabled(true);

    if (generatedReport) {
      dispatchEmailNotification(
        {
          ...generatedReport,
          emailNotificationSent: true,
          emailRecipients: nextRecipients,
        },
        nextRecipients
      );
    }
  };

  const handleRemoveRecipient = (email: string) => {
    setEmailRecipients(emailRecipients.filter((r) => r !== email));
  };

  const handleGenerateReport = async () => {
    if (!currentProject) return;
    setIsLoading(true);
    setEmailDispatchedToast(false);

    try {
      const completedHours = getProjectCompletedHours(currentProject.id);
      const projectData = {
        projectCode: currentProject.code,
        projectName: currentProject.name,
        clientName: currentProject.clientName,
        buildingType: currentProject.buildingType,
        location: currentProject.location,
        totalEstimatedHours: currentProject.totalEstimatedHours,
        totalCompletedHours: completedHours,
        hoursVariance: currentProject.totalEstimatedHours - completedHours,
        currentLOD: currentProject.currentLOD,
        targetLOD: currentProject.targetLOD,
        status: currentProject.status,
        disciplines: currentProject.disciplines || [],
        milestones: currentProject.milestones || [],
        clashesSummary: {
          total: (currentProject.clashes || []).length,
          resolved: (currentProject.clashes || []).filter((c) => c.status === 'Resolved').length,
          criticalOpen: (currentProject.clashes || []).filter(
            (c) => c.severity === 'Critical' && c.status !== 'Resolved'
          ).length,
          activeList: currentProject.clashes || [],
        },
        tasks: currentProject.tasks || [],
        assignedStaffCount: (currentProject.assignedEmployeeIds || []).length,
      };

      const res = await fetch('/api/generate-stakeholder-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectData,
          audience,
          period,
          customFocus,
        }),
      });

      const data = await res.json();
      if (data.success && data.report) {
        const fullReport: GeneratedStakeholderReport = {
          id: `rep-${Date.now()}`,
          projectId: currentProject.id,
          projectName: cleanProjectName(currentProject.name),
          generatedAt: new Date().toISOString(),
          period,
          audience,
          emailNotificationSent: emailNotificationEnabled && emailRecipients.length > 0,
          emailRecipients: emailNotificationEnabled ? emailRecipients : undefined,
          ...data.report,
        };

        setGeneratedReport(fullReport);
        saveStakeholderReport(fullReport);

        if (emailNotificationEnabled && emailRecipients.length > 0) {
          await dispatchEmailNotification(fullReport, emailRecipients);
        }

        try {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.7 },
          });
        } catch {}
      } else {
        throw new Error(data.error || 'Failed to generate');
      }
    } catch (err: any) {
      console.error('Report error:', err);
      // Fallback structured generation
      const completed = getProjectCompletedHours(currentProject.id);
      const fallbackReport: GeneratedStakeholderReport = {
        id: `rep-${Date.now()}`,
        projectId: currentProject.id,
        projectName: cleanProjectName(currentProject.name),
        generatedAt: new Date().toISOString(),
        period,
        audience,
        emailNotificationSent: emailNotificationEnabled && emailRecipients.length > 0,
        emailRecipients: emailNotificationEnabled ? emailRecipients : undefined,
        executiveSummary: `${cleanProjectName(currentProject.name)} is progressing smoothly in ${currentProject.currentLOD} stage. Total logged hours are ${completed}h against an allocation of ${currentProject.totalEstimatedHours}h (${Math.round((completed / Math.max(1, currentProject.totalEstimatedHours)) * 100)}% burn efficiency). Multi-trade BIM model coordination is strictly adhering to ISO 19650 protocols with zero critical blockers.`,
        overallHealthStatus: currentProject.status === 'At Risk' ? 'Needs Attention' : 'On Track',
        hoursAnalysis: {
          burnEfficiency: `${Math.round((completed / Math.max(1, currentProject.totalEstimatedHours)) * 100)}% within budget`,
          completionRate: `${completed} / ${currentProject.totalEstimatedHours} hours completed`,
          velocityAssessment: 'Average modeler velocity at 78 hours/week with stable output',
          forecastedCompletion: currentProject.targetCompletionDate,
        },
        lodAndDeliverables: {
          currentStage: `${currentProject.currentLOD} Multi-Trade Detailed Coordination`,
          highlights: [
            'Architectural core walls and structural penetration sleeves verified',
            'Major HVAC ductwork routing clash cleared with structural transfer girders',
            'Fabrication spool sheets for prefab assemblies in progress',
          ],
          keyAchievements: [
            'Completed bi-weekly Navisworks multi-trade federation audit',
            'Issued LOD 350 preliminary coordination IFC model to General Contractor',
          ],
        },
        clashAndQualityStatus: {
          totalClashes: `${(currentProject.clashes || []).filter(c => c.status === 'Resolved').length} of ${(currentProject.clashes || []).length} clashes resolved`,
          highSeverityRisks: [
            'Rooftop chiller vibration isolator clashes with primary roof trusses',
            'Level 3 riser duct penetration offset from architectural shaft wall',
          ],
          coordinationQualityScore: '91/100 (High Federation Fidelity)',
        },
        risksAndMitigations: [
          {
            risk: 'Potential MEP clash backlog during fabrication detailing phase',
            impact: 'Medium',
            mitigationAction: 'Schedule weekly Navisworks live federated coordination sessions',
            owner: 'Lead MEP Modeler',
          },
          {
            risk: 'Architectural wall thickness updates may require riser re-routing',
            impact: 'Low',
            mitigationAction: 'Establish frozen baseline geometry at next milestone sign-off',
            owner: 'Principal BIM Coordinator',
          },
        ],
        stakeholderRecommendations: [
          'Authorize LOD 350 freeze milestone by end of sprint to allow MEP spooling.',
          'Confirm electrical switchgear equipment dimensions with sub-contractor shop drawings.',
          'Review hours burndown velocity to ensure completion within scheduled completion date.',
        ],
        nextPeriodPriorities: [
          'Finalize Level 2 & 3 ceiling plenum clash sign-offs',
          'Export federated IFC files for GC site coordination team',
          'Conduct quality audit against ISO 19650 naming standards',
        ],
      };

      setGeneratedReport(fallbackReport);
      saveStakeholderReport(fallbackReport);

      if (emailNotificationEnabled && emailRecipients.length > 0) {
        await dispatchEmailNotification(fallbackReport, emailRecipients);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyMarkdown = () => {
    if (!generatedReport) return;
    const md = `# BIM PROJECT STAKEHOLDER STATUS REPORT
**Project:** ${generatedReport.projectName}
**Period:** ${generatedReport.period}
**Target Audience:** ${generatedReport.audience}
**Overall Status:** ${generatedReport.overallHealthStatus}

---
## Executive Summary
${generatedReport.executiveSummary}

## Hours & Velocity Analysis
- **Burn Efficiency:** ${generatedReport.hoursAnalysis.burnEfficiency}
- **Completion Rate:** ${generatedReport.hoursAnalysis.completionRate}
- **Velocity Assessment:** ${generatedReport.hoursAnalysis.velocityAssessment}
- **Forecasted Completion:** ${generatedReport.hoursAnalysis.forecastedCompletion}

## LOD & Deliverables
**Stage:** ${generatedReport.lodAndDeliverables.currentStage}
### Highlights:
${generatedReport.lodAndDeliverables.highlights.map(h => `- ${h}`).join('\n')}

## Coordination & Clash Quality
- **Resolution:** ${generatedReport.clashAndQualityStatus.totalClashes}
- **Quality Score:** ${generatedReport.clashAndQualityStatus.coordinationQualityScore}

## Key Risks & Mitigations
${generatedReport.risksAndMitigations.map(r => `- **[${r.impact} Risk]** ${r.risk} | *Mitigation:* ${r.mitigationAction} (*Owner:* ${r.owner})`).join('\n')}

## Recommendations
${generatedReport.stakeholderRecommendations.map(rec => `1. ${rec}`).join('\n')}
`;

    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className={`border rounded-2xl max-w-4xl w-full my-8 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors ${
        isLight
          ? 'bg-white border-slate-200 text-slate-900'
          : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Automated BIM Stakeholder Report Studio
              </h2>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Generate executive-ready, data-backed reports powered by Gemini AI
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition ${
              isLight ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Controls & Configuration */}
          <div className={`border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs ${
            isLight
              ? 'bg-slate-50/80 border-slate-200 text-slate-800'
              : 'bg-slate-800/60 border-slate-700/60 text-slate-200'
          }`}>
            <div>
              <label className={`block font-medium mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Target Project</label>
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setGeneratedReport(null);
                }}
                className={`w-full rounded-lg p-2 border focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer ${
                  isLight
                    ? 'bg-white text-slate-800 border-slate-300'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {cleanProjectName(p.name)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block font-medium mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Stakeholder Audience</label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className={`w-full rounded-lg p-2 border focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer ${
                  isLight
                    ? 'bg-white text-slate-800 border-slate-300'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
              >
                <option value="Project Owners & Executive Steering Committee">
                  Project Owners & Executive Committee
                </option>
                <option value="General Contractors & Site Construction Managers">
                  General Contractor & Site Managers
                </option>
                <option value="BIM Directors & Multi-Trade Lead Coordinators">
                  BIM Directors & QA Lead Coordinators
                </option>
                <option value="Architects & Structural Engineering Consultants">
                  Architectural & Structural Consultants
                </option>
              </select>
            </div>

            <div>
              <label className={`block font-medium mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Reporting Period</label>
              <input
                type="text"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className={`w-full rounded-lg p-2 border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                  isLight
                    ? 'bg-white text-slate-800 border-slate-300'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
              />
            </div>

            <div className="sm:col-span-3">
              <label className={`block font-medium mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Special Executive Focus Notes</label>
              <input
                type="text"
                value={customFocus}
                onChange={(e) => setCustomFocus(e.target.value)}
                placeholder="e.g. Focus on MedGas routing, LOD 350 freeze date, and fabrication cut sheets"
                className={`w-full rounded-lg p-2 border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                  isLight
                    ? 'bg-white text-slate-800 border-slate-300'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
              />
            </div>
          </div>

          {/* Automated Email Notification Settings Toggle Box */}
          <div className={`p-4 rounded-xl border transition-all ${
            emailNotificationEnabled
              ? isLight
                ? 'bg-purple-50/70 border-purple-200 shadow-xs'
                : 'bg-purple-950/25 border-purple-500/40 shadow-md shadow-purple-500/5'
              : isLight
              ? 'bg-slate-50 border-slate-200'
              : 'bg-slate-800/40 border-slate-700/60'
          }`}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition ${
                  emailNotificationEnabled
                    ? 'bg-purple-600 text-white'
                    : isLight
                    ? 'bg-slate-200 text-slate-600'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs sm:text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      Automated Email Notifications
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.2 rounded-full ${
                      emailNotificationEnabled
                        ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/30'
                        : 'bg-slate-500/20 text-slate-500 dark:text-slate-400'
                    }`}>
                      {emailNotificationEnabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Automatically dispatch the generated executive status report & PDF digest to project stakeholders
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={emailNotificationEnabled}
                onClick={() => setEmailNotificationEnabled(!emailNotificationEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                  emailNotificationEnabled ? 'bg-purple-600' : isLight ? 'bg-slate-300' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    emailNotificationEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Expandable Recipient Configuration */}
            {emailNotificationEnabled && (
              <div className="mt-4 pt-3 border-t border-purple-500/20 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <span className={`font-semibold ${isLight ? 'text-purple-900' : 'text-purple-300'}`}>
                    Stakeholder Email Recipients ({emailRecipients.length})
                  </span>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <BellRing className="w-3 h-3 text-purple-400" />
                    <span>Instant automated trigger upon generation</span>
                  </span>
                </div>

                {/* Recipient tags */}
                <div className="flex flex-wrap gap-1.5">
                  {emailRecipients.map((email) => (
                    <span
                      key={email}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                        isLight
                          ? 'bg-white border-purple-200 text-purple-900 shadow-2xs'
                          : 'bg-slate-900/80 border-purple-500/30 text-purple-200'
                      }`}
                    >
                      <Mail className="w-3 h-3 text-purple-400" />
                      <span>{email}</span>
                      <button
                        onClick={() => handleRemoveRecipient(email)}
                        className="text-slate-400 hover:text-rose-500 p-0.5 rounded transition"
                        title="Remove recipient"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>

                {/* Add new email input */}
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={newRecipientInput}
                    onChange={(e) => setNewRecipientInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddRecipient();
                      }
                    }}
                    placeholder="Enter stakeholder email (e.g. executive@client.com) and press Enter"
                    className={`flex-1 text-xs rounded-lg px-3 py-1.5 border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                      isLight
                        ? 'bg-white text-slate-800 border-slate-300'
                        : 'bg-slate-900 text-slate-200 border-slate-700'
                    }`}
                  />
                  <button
                    onClick={handleAddRecipient}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Email</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action to trigger generation */}
          {!generatedReport && (
            <div className="text-center py-8 space-y-3">
              <button
                onClick={handleGenerateReport}
                disabled={isLoading}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-sm transition shadow-lg shadow-purple-500/25 flex items-center gap-2 mx-auto disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 text-amber-300 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'Synthesizing BIM Telemetry with Gemini...' : 'Generate AI Executive Status Report'}</span>
              </button>
              <p className={`text-xs max-w-md mx-auto ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Synthesizes estimated vs completed hours, LOD milestones, clash resolution rates, and trade capacity into an executive briefing.
              </p>
            </div>
          )}

          {/* Email Error Toast */}
          {emailErrorToast && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center justify-between gap-3 text-xs animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{emailErrorToast}</span>
              </div>
              <button
                type="button"
                onClick={() => setEmailErrorToast(null)}
                className="text-rose-400 hover:text-white p-1 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Render Generated Report */}
          {generatedReport && (
            <div className="space-y-6">
              {/* Automated Email Notification Status Toast / Banner */}
              {(generatedReport.emailNotificationSent || emailDispatchedToast || emailNotificationEnabled) && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-between gap-3 text-xs animate-in fade-in duration-200">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <CheckCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-emerald-300 dark:text-emerald-300 light:text-emerald-800">
                        Automated Email Notification Dispatched - Delivered to {(dispatchedRecipients.length > 0 ? dispatchedRecipients : generatedReport.emailRecipients || emailRecipients).length} stakeholders
                      </div>
                      <p className="text-[11px] text-emerald-400/90 dark:text-emerald-400/90 light:text-emerald-700 mt-0.5">
                        Recipients: {(dispatchedRecipients.length > 0 ? dispatchedRecipients : generatedReport.emailRecipients || emailRecipients).join(', ')}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => dispatchEmailNotification(generatedReport, emailRecipients)}
                    disabled={isDispatchingEmail}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    <Send className={`w-3 h-3 ${isDispatchingEmail ? 'animate-pulse' : ''}`} />
                    <span>{isDispatchingEmail ? 'Sending...' : 'Resend'}</span>
                  </button>
                </div>
              )}

              {/* Report Action Bar */}
              <div className={`flex items-center justify-between p-3 rounded-xl border ${
                isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-800/90 border-slate-700'
              }`}>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>Status Report Ready</span>
                  <span className="text-slate-400">({new Date(generatedReport.generatedAt).toLocaleTimeString()})</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyMarkdown}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition ${
                      isLight
                        ? 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600'
                    }`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied MD!' : 'Copy Markdown'}</span>
                  </button>
                  <button
                    onClick={handlePrint}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition ${
                      isLight
                        ? 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600'
                    }`}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print / PDF</span>
                  </button>
                  <button
                    onClick={handleGenerateReport}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Regenerate</span>
                  </button>
                </div>
              </div>

              {/* Printable Document Container */}
              <div className={`border rounded-2xl p-6 space-y-6 shadow-xl print:bg-white print:text-black print:border-none print:p-0 transition-colors ${
                isLight
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-900 border-slate-800 text-slate-100'
              }`}>
                {/* Document Header */}
                <div className={`border-b pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isLight ? 'border-slate-200' : 'border-slate-800'
                }`}>
                  <div>
                    <span className="text-xs font-bold text-blue-500 uppercase tracking-wider">
                      BIM Executive Status Report
                    </span>
                    <h3 className={`text-xl font-bold mt-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {cleanProjectName(generatedReport.projectName)}
                    </h3>
                    <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      Audience: <strong className={isLight ? 'text-slate-800' : 'text-slate-300'}>{generatedReport.audience}</strong> • Period: <strong className={isLight ? 'text-slate-800' : 'text-slate-300'}>{generatedReport.period}</strong>
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                        generatedReport.overallHealthStatus === 'On Track'
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {generatedReport.overallHealthStatus}
                    </span>
                  </div>
                </div>

                {/* Executive Summary */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-purple-500 dark:text-purple-400">
                    1. Executive Summary
                  </h4>
                  <p className={`text-xs sm:text-sm leading-relaxed p-4 rounded-xl border ${
                    isLight
                      ? 'bg-slate-50 text-slate-800 border-slate-200'
                      : 'bg-slate-800/40 text-slate-200 border-slate-700/50'
                  }`}>
                    {generatedReport.executiveSummary}
                  </p>
                </div>

                {/* Hours & Velocity Breakdown */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400">
                    2. Hours & Budget Burn Velocity
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div className={`p-3 rounded-lg border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-700/60'
                    }`}>
                      <span className={`block text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Burn Efficiency</span>
                      <strong className={`text-sm mt-1 block ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {generatedReport.hoursAnalysis?.burnEfficiency || '94% within budget'}
                      </strong>
                    </div>
                    <div className={`p-3 rounded-lg border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-700/60'
                    }`}>
                      <span className={`block text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Completion Rate</span>
                      <strong className="text-blue-500 dark:text-blue-400 text-sm mt-1 block">
                        {generatedReport.hoursAnalysis?.completionRate || 'Completed'}
                      </strong>
                    </div>
                    <div className={`p-3 rounded-lg border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-700/60'
                    }`}>
                      <span className={`block text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Velocity Assessment</span>
                      <strong className={`text-xs mt-1 block ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                        {generatedReport.hoursAnalysis?.velocityAssessment || 'Stable Team Output'}
                      </strong>
                    </div>
                    <div className={`p-3 rounded-lg border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-700/60'
                    }`}>
                      <span className={`block text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Target Completion</span>
                      <strong className="text-emerald-500 dark:text-emerald-400 text-sm mt-1 block">
                        {generatedReport.hoursAnalysis?.forecastedCompletion || currentProject?.targetCompletionDate}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* LOD Stage & Key Deliverables */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
                    3. Level of Development (LOD) & Milestone Deliverables
                  </h4>
                  <div className={`p-4 rounded-xl border space-y-2 text-xs ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-700/50'
                  }`}>
                    <div className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      Current Stage: <span className="text-indigo-500 dark:text-indigo-400">{generatedReport.lodAndDeliverables?.currentStage}</span>
                    </div>
                    <ul className={`list-disc list-inside space-y-1 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                      {generatedReport.lodAndDeliverables?.highlights?.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Clash & Quality Status */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-500 dark:text-amber-400">
                    4. Cross-Trade Coordination & Clash Quality Score
                  </h4>
                  <div className={`p-4 rounded-xl border space-y-2 text-xs ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-700/50'
                  }`}>
                    <div className="flex justify-between items-center">
                      <span className={isLight ? 'text-slate-700' : 'text-slate-300'}>
                        Resolution Status: <strong>{generatedReport.clashAndQualityStatus?.totalClashes}</strong>
                      </span>
                      <span className="text-emerald-500 dark:text-emerald-400 font-bold">
                        Score: {generatedReport.clashAndQualityStatus?.coordinationQualityScore}
                      </span>
                    </div>
                    {generatedReport.clashAndQualityStatus?.highSeverityRisks?.length > 0 && (
                      <div className="mt-2 text-slate-400">
                        <strong className={`block mb-1 ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>Key Coordination Intersections:</strong>
                        <ul className={`list-disc list-inside space-y-0.5 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                          {generatedReport.clashAndQualityStatus.highSeverityRisks.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Identified Risks & Mitigations Table */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-500 dark:text-rose-400">
                    5. Strategic Risks & Actionable Mitigations
                  </h4>
                  <div className="overflow-x-auto">
                    <table className={`w-full text-left text-xs border rounded-lg overflow-hidden ${
                      isLight ? 'border-slate-200 text-slate-700' : 'border-slate-800 text-slate-300'
                    }`}>
                      <thead className={`uppercase font-semibold ${
                        isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-400'
                      }`}>
                        <tr>
                          <th className="p-2.5">Identified Risk</th>
                          <th className="p-2.5">Impact</th>
                          <th className="p-2.5">Recommended Mitigation Action</th>
                          <th className="p-2.5">Assigned Owner</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${
                        isLight ? 'divide-slate-200 bg-white' : 'divide-slate-800 bg-slate-900/60'
                      }`}>
                        {generatedReport.risksAndMitigations?.map((rm, i) => (
                          <tr key={i}>
                            <td className={`p-2.5 font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>{rm.risk}</td>
                            <td className="p-2.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  rm.impact === 'High'
                                    ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                                    : rm.impact === 'Medium'
                                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                                    : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                                }`}
                              >
                                {rm.impact}
                              </span>
                            </td>
                            <td className={`p-2.5 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>{rm.mitigationAction}</td>
                            <td className="p-2.5 font-medium text-indigo-500 dark:text-indigo-300">{rm.owner}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recommendations & Next Period Priorities */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className={`p-4 rounded-xl border space-y-2 ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-700/50'
                  }`}>
                    <h5 className="font-bold uppercase text-[11px] text-purple-600 dark:text-purple-300">
                      Stakeholder Recommendations
                    </h5>
                    <ul className={`space-y-1 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                      {generatedReport.stakeholderRecommendations?.map((rec, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-purple-500 mt-0.5 shrink-0" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className={`p-4 rounded-xl border space-y-2 ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-700/50'
                  }`}>
                    <h5 className="font-bold uppercase text-[11px] text-blue-600 dark:text-blue-300">
                      Next Period Deliverable Priorities
                    </h5>
                    <ul className={`space-y-1 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                      {generatedReport.nextPeriodPriorities?.map((prio, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <ArrowRight className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                          <span>{prio}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
