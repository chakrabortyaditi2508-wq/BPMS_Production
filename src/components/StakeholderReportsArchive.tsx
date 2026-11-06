import React, { useState, useEffect } from 'react';
import {
  FileText,
  Sparkles,
  Search,
  Calendar,
  Building,
  Printer,
  Copy,
  Check,
  ArrowRight,
  Filter,
  CheckCircle2,
  Mail,
  Send,
  CheckCheck
} from 'lucide-react';
import { useBimData, cleanProjectName } from '../context/BimDataContext';
import { GeneratedStakeholderReport } from '../types';

interface StakeholderReportsArchiveProps {
  onOpenReportModal: (projectId?: string) => void;
}

export const StakeholderReportsArchive: React.FC<StakeholderReportsArchiveProps> = ({
  onOpenReportModal,
}) => {
  const { generatedReports = [], projects, theme } = useBimData();
  const isLight = theme === 'light';

  const [selectedReportProjectId, setSelectedReportProjectId] = useState<string>(projects[0]?.id || '');
  const reportsList = Array.isArray(generatedReports) ? generatedReports : [];

  const [search, setSearch] = useState('');
  const [selectedReport, setSelectedReport] = useState<GeneratedStakeholderReport | null>(
    reportsList[0] || null
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!selectedReport && reportsList.length > 0) {
      setSelectedReport(reportsList[0]);
    }
  }, [reportsList, selectedReport]);

  const filteredReports = reportsList.filter(
    (r) =>
      r?.projectName?.toLowerCase().includes(search.toLowerCase()) ||
      r?.audience?.toLowerCase().includes(search.toLowerCase()) ||
      r?.period?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCopyMarkdown = (rep: GeneratedStakeholderReport) => {
    const md = `# BIM STAKEHOLDER REPORT: ${rep.projectName}
**Audience:** ${rep.audience}
**Period:** ${rep.period}
**Health Status:** ${rep.overallHealthStatus}

## Executive Summary
${rep.executiveSummary}

## Hours Telemetry
- Burn: ${rep.hoursAnalysis?.burnEfficiency}
- Rate: ${rep.hoursAnalysis?.completionRate}

## Next Priorities
${rep.nextPeriodPriorities?.map((p) => `- ${p}`).join('\n')}
`;
    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 border rounded-xl p-5 shadow-xs transition-colors ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-xl font-bold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Stakeholder Reports
            </h2>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
              Automated Archives
            </span>
          </div>
          <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Archived executive briefs, hours burn telemetry, and BIM coordination status reports
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Project Dropdown for Report Creation */}
          <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-xs">
            <Building className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Project:</span>
            <select
              value={selectedReportProjectId}
              onChange={(e) => setSelectedReportProjectId(e.target.value)}
              className="bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer max-w-[200px] truncate"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900">
                  {cleanProjectName(p.name)}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => onOpenReportModal(selectedReportProjectId)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white transition shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Generate Report</span>
          </button>
        </div>
      </div>

      {reportsList.length === 0 ? (
        <div className={`border rounded-xl p-12 text-center space-y-4 ${
          isLight ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-900 border-slate-800 text-slate-400'
        }`}>
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6 text-amber-300" />
          </div>
          <div className="space-y-1">
            <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>No Generated Reports Yet</h3>
            <p className="text-xs max-w-sm mx-auto">
              Launch the AI Automated Report Studio to generate your first executive status report with automated email dispatch.
            </p>
          </div>
          <button
            onClick={() => onOpenReportModal(selectedReportProjectId)}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
          >
            Create First Report
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Report List */}
          <div className="space-y-3">
            <div className="relative">
              <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${isLight ? 'text-slate-400' : 'text-slate-400'}`} />
              <input
                type="text"
                placeholder="Search archived reports..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`w-full text-xs rounded-xl pl-9 pr-3 py-2 border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                  isLight
                    ? 'bg-white text-slate-800 border-slate-300'
                    : 'bg-slate-900 text-slate-200 border-slate-800'
                }`}
              />
            </div>

            <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
              {filteredReports.map((rep) => {
                const isSelected = selectedReport?.id === rep.id;
                return (
                  <div
                    key={rep.id}
                    onClick={() => setSelectedReport(rep)}
                    className={`p-4 rounded-xl border text-xs cursor-pointer transition ${
                      isSelected
                        ? isLight
                          ? 'bg-purple-50/70 border-purple-400 shadow-sm'
                          : 'bg-slate-800 border-purple-500/60 shadow-md'
                        : isLight
                        ? 'bg-white border-slate-200 hover:border-slate-300'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className={`font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>{rep.projectName}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          rep.overallHealthStatus === 'On Track'
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {rep.overallHealthStatus}
                      </span>
                    </div>

                    <p className={`text-[11px] font-medium truncate mb-2 ${isLight ? 'text-purple-700' : 'text-purple-300'}`}>
                      {rep.audience}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>{rep.period}</span>
                      <div className="flex items-center gap-1.5">
                        {rep.emailNotificationSent && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold">
                            <Mail className="w-2.5 h-2.5" />
                            <span>Emailed</span>
                          </span>
                        )}
                        <span>{new Date(rep.generatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Selected Report Viewer */}
          <div className="lg:col-span-2">
            {selectedReport ? (
              <div className={`border rounded-xl p-6 space-y-6 shadow-md transition-colors ${
                isLight
                  ? 'bg-white border-slate-200 text-slate-900'
                  : 'bg-slate-900 border-slate-800 text-slate-100'
              }`}>
                {/* Header with Actions */}
                <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4 ${
                  isLight ? 'border-slate-200' : 'border-slate-800'
                }`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-purple-500 dark:text-purple-400 uppercase tracking-wider">
                        Archived Stakeholder Report
                      </span>
                      {selectedReport.emailNotificationSent && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                          <CheckCheck className="w-3 h-3" />
                          <span>Automated Email Dispatched</span>
                        </span>
                      )}
                    </div>
                    <h3 className={`text-lg font-bold mt-0.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {selectedReport.projectName}
                    </h3>
                    <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {selectedReport.audience} • {selectedReport.period}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyMarkdown(selectedReport)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs transition ${
                        isLight
                          ? 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                      }`}
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => window.print()}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs transition ${
                        isLight
                          ? 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                      }`}
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                  </div>
                </div>

                {/* Body Content */}
                <div className="space-y-4 text-xs">
                  <div>
                    <h4 className="font-bold text-purple-500 dark:text-purple-400 uppercase text-[11px] mb-1">
                      Executive Summary
                    </h4>
                    <p className={`leading-relaxed p-3.5 rounded-xl border ${
                      isLight
                        ? 'bg-slate-50 text-slate-800 border-slate-200'
                        : 'bg-slate-800/40 text-slate-300 border-slate-700/50'
                    }`}>
                      {selectedReport.executiveSummary}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className={`p-3 rounded-lg border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-700/50'
                    }`}>
                      <span className={`block text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Hours Burn Efficiency</span>
                      <strong className="text-blue-500 dark:text-blue-400 text-xs mt-0.5 block">
                        {selectedReport.hoursAnalysis?.burnEfficiency}
                      </strong>
                    </div>
                    <div className={`p-3 rounded-lg border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-700/50'
                    }`}>
                      <span className={`block text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Completion Rate</span>
                      <strong className="text-emerald-500 dark:text-emerald-400 text-xs mt-0.5 block">
                        {selectedReport.hoursAnalysis?.completionRate}
                      </strong>
                    </div>
                  </div>

                  {selectedReport.lodAndDeliverables?.highlights && (
                    <div>
                      <h4 className="font-bold text-indigo-500 dark:text-indigo-400 uppercase text-[11px] mb-1">
                        Key Milestones & LOD Deliverables
                      </h4>
                      <ul className={`list-disc list-inside space-y-1 p-3 rounded-xl border ${
                        isLight
                          ? 'bg-slate-50 text-slate-700 border-slate-200'
                          : 'bg-slate-800/40 text-slate-300 border-slate-700/50'
                      }`}>
                        {selectedReport.lodAndDeliverables.highlights.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedReport.stakeholderRecommendations && (
                    <div>
                      <h4 className="font-bold text-emerald-500 dark:text-emerald-400 uppercase text-[11px] mb-1">
                        Recommendations
                      </h4>
                      <ul className={`space-y-1 p-3 rounded-xl border ${
                        isLight
                          ? 'bg-slate-50 text-slate-700 border-slate-200'
                          : 'bg-slate-800/40 text-slate-300 border-slate-700/50'
                      }`}>
                        {selectedReport.stakeholderRecommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-emerald-500 dark:text-emerald-400 font-bold">&bull;</span>
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className={`border rounded-xl p-12 text-center ${
                isLight ? 'bg-white border-slate-200 text-slate-500' : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}>
                Select a report from the list to view.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
