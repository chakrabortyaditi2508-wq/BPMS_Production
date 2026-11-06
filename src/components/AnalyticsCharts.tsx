import React from 'react';
import { DailyWorkLog, Discipline, BimProject } from '../types';

// Custom lightweight SVG S-Curve / Hours Chart
export const HoursBurnChart: React.FC<{
  estimatedHours: number;
  completedHours: number;
  projectName?: string;
}> = ({ estimatedHours, completedHours, projectName }) => {
  const percentage = estimatedHours > 0 ? Math.min(100, Math.round((completedHours / estimatedHours) * 100)) : 0;
  const isOverBudget = completedHours > estimatedHours;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
            Hours Burn-up Analysis
          </span>
          <h4 className="text-base font-semibold text-white">
            {projectName || 'Portfolio Total'}
          </h4>
        </div>
        <div className="text-right">
          <span className={`text-xl font-bold ${isOverBudget ? 'text-amber-400' : 'text-emerald-400'}`}>
            {percentage}%
          </span>
          <p className="text-xs text-slate-400">of estimated allocated</p>
        </div>
      </div>

      {/* Progress Bar with markers */}
      <div className="relative w-full h-4 bg-slate-800 rounded-full overflow-hidden mb-3 border border-slate-700">
        <div
          className={`h-full transition-all duration-700 rounded-full ${
            isOverBudget
              ? 'bg-gradient-to-r from-amber-500 to-rose-500'
              : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400'
          }`}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-xs">
        <div>
          <span className="text-slate-400">Estimated</span>
          <p className="font-semibold text-slate-200 text-sm">{estimatedHours.toLocaleString()} hrs</p>
        </div>
        <div>
          <span className="text-slate-400">Completed Logged</span>
          <p className="font-semibold text-blue-400 text-sm">{completedHours.toLocaleString()} hrs</p>
        </div>
        <div>
          <span className="text-slate-400">Remaining</span>
          <p className={`font-semibold text-sm ${isOverBudget ? 'text-rose-400' : 'text-emerald-400'}`}>
            {isOverBudget ? `+${(completedHours - estimatedHours).toLocaleString()} hrs (Over)` : `${(estimatedHours - completedHours).toLocaleString()} hrs`}
          </p>
        </div>
      </div>
    </div>
  );
};

// Daily Velocity Bar Chart (Past 7 Days)
export const DailyVelocityChart: React.FC<{
  workLogs: DailyWorkLog[];
}> = ({ workLogs }) => {
  // Aggregate hours by date for last 7 dates
  const dates = ['2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18'];
  
  const dailyData = dates.map(d => {
    const logs = workLogs.filter(w => !w.isTestEntry && w.date === d);
    const totalHours = logs.reduce((sum, l) => sum + l.hoursLogged, 0);
    const dayLabel = new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    return {
      date: d,
      label: dayLabel,
      hours: totalHours,
      count: logs.length
    };
  });

  const maxHours = Math.max(...dailyData.map(d => d.hours), 30);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-semibold text-white">Daily Organization Hour Velocity</h4>
          <p className="text-xs text-slate-400">Team logging intensity across active projects</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-block w-3 h-3 bg-blue-500 rounded-sm"></span>
          <span className="text-slate-300">Logged Hours</span>
        </div>
      </div>

      <div className="h-44 flex items-end justify-between gap-3 pt-6 pb-2 px-1">
        {dailyData.map((item) => {
          const heightPercent = Math.min(100, Math.round((item.hours / maxHours) * 100));
          return (
            <div key={item.date} className="flex-1 flex flex-col items-center gap-2 group relative">
              {/* Tooltip */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-10 bg-slate-800 text-slate-100 text-xs px-2.5 py-1 rounded shadow-lg border border-slate-700 pointer-events-none whitespace-nowrap z-20">
                <span className="font-semibold">{item.hours.toFixed(1)} hrs</span> ({item.count} logs)
              </div>

              {/* Bar */}
              <div className="w-full max-w-[40px] bg-slate-800 h-28 rounded-t flex items-end p-0.5 relative overflow-hidden">
                <div
                  className="w-full bg-gradient-to-t from-blue-600 to-cyan-400 rounded-t transition-all duration-500 group-hover:brightness-125"
                  style={{ height: `${Math.max(8, heightPercent)}%` }}
                />
              </div>

              <div className="text-center">
                <span className="text-[11px] font-medium text-slate-300 block">{item.hours.toFixed(1)}h</span>
                <span className="text-[10px] text-slate-400 block">{(item.label || '').split(',')[0]}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Discipline Hours Breakdown
export const DisciplineDistributionChart: React.FC<{
  workLogs: DailyWorkLog[];
}> = ({ workLogs }) => {
  const disciplines: Discipline[] = [
    'BIM - ACS',
    'BIM - MEP',
    'Structure',
    'MEP - HVAC',
    'MEP - Electrical',
    'MEP - Plumbing',
    'SCAN TO BIM',
    'CAD',
    'SES',
    'Fire Protection',
    'Infrastructure',
    'Façade / Envelope',
    'Coordination & QA',
    'AI & Automation',
    'Estimation',
  ];

  const colors: Record<Discipline, string> = {
    'ACS': 'bg-emerald-500 text-emerald-400',
    'BIM - ACS': 'bg-emerald-500 text-emerald-400',
    'BIM - MEP': 'bg-cyan-500 text-cyan-400',
    'Structure': 'bg-blue-500 text-blue-400',
    'Structural': 'bg-blue-500 text-blue-400',
    'MEP': 'bg-cyan-500 text-cyan-400',
    'MEP - HVAC': 'bg-cyan-500 text-cyan-400',
    'MEP - Electrical': 'bg-amber-500 text-amber-400',
    'MEP - Plumbing': 'bg-indigo-500 text-indigo-400',
    'SCAN TO BIM': 'bg-purple-500 text-purple-400',
    'CAD': 'bg-amber-500 text-amber-400',
    'SES': 'bg-fuchsia-500 text-fuchsia-400',
    'Fire Protection': 'bg-rose-500 text-rose-400',
    'Façade / Envelope': 'bg-purple-500 text-purple-400',
    'Coordination & QA': 'bg-orange-500 text-orange-400',
    'Infrastructure': 'bg-teal-500 text-teal-400',
    'AI & Automation': 'bg-violet-500 text-violet-400',
    'Estimation': 'bg-sky-500 text-sky-400',
  };

  const normalizeDisc = (d?: string): Discipline => {
    if (!d) return 'BIM - ACS';
    if (d === 'ACS') return 'BIM - ACS';
    if (d === 'MEP') return 'BIM - MEP';
    if (d === 'Structural') return 'Structure';
    return d as Discipline;
  };

  const totals = disciplines
    .map((disc) => {
      const hours = workLogs
        .filter((w) => !w.isTestEntry && normalizeDisc(w.discipline) === disc)
        .reduce((sum, w) => sum + w.hoursLogged, 0);
      return { discipline: disc, hours };
    })
    .filter((d) => d.hours > 0);

  const grandTotal = totals.reduce((sum, t) => sum + t.hours, 0);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-white">Discipline Hours Distribution</h4>
          <p className="text-xs text-slate-400">Total: {grandTotal.toFixed(1)} logged hours</p>
        </div>
      </div>

      {/* Segmented bar */}
      <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex mb-4 border border-slate-700">
        {totals.map(t => {
          const pct = grandTotal > 0 ? (t.hours / grandTotal) * 100 : 0;
          const bgClass = (colors[t.discipline] || 'bg-slate-500').split(' ')[0] || 'bg-slate-500';
          return (
            <div
              key={t.discipline}
              className={`${bgClass} h-full transition-all`}
              style={{ width: `${pct}%` }}
              title={`${t.discipline}: ${t.hours} hrs (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend list */}
      <div className="space-y-2 text-xs">
        {totals.map(t => {
          const pct = grandTotal > 0 ? Math.round((t.hours / grandTotal) * 100) : 0;
          const dotColor = (colors[t.discipline] || 'bg-slate-500').split(' ')[0] || 'bg-slate-500';
          return (
            <div key={t.discipline} className="flex items-center justify-between text-slate-300">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`}></span>
                <span className="truncate max-w-[150px]">{t.discipline}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-200">{t.hours.toFixed(1)}h</span>
                <span className="text-slate-400 w-8 text-right">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
