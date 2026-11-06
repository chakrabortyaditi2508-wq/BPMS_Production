import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  Filter,
  Plus,
  Search,
  ShieldCheck,
  Zap,
  ArrowRight,
  User,
  Building
} from 'lucide-react';
import { useBimData, cleanProjectName, getMemberLabel } from '../context/BimDataContext';
import { ClashRecord, Discipline, LODLevel } from '../types';

export const ClashAndLODTracker: React.FC = () => {
  const {
    projects,
    employees,
    selectedProjectId,
    setSelectedProjectId,
    updateClashStatus,
    addClash,
  } = useBimData();

  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAddClashModal, setShowAddClashModal] = useState(false);

  // New clash form state
  const [newClashProjId, setNewClashProjId] = useState(projects[0]?.id || '');
  const [disciplineA, setDisciplineA] = useState<Discipline>('MEP - HVAC');
  const [disciplineB, setDisciplineB] = useState<Discipline>('Structure');
  const [severity, setSeverity] = useState<'Critical' | 'Major' | 'Minor'>('Critical');
  const [elementRef, setElementRef] = useState('');
  const [locationDesc, setLocationDesc] = useState('');
  const [assignedTo, setAssignedTo] = useState(employees[0]?.id || '');

  // Aggregate all clashes or selected project clashes
  const allClashes: Array<ClashRecord & { projectName: string; projectCode: string; projectId: string }> = [];
  (projects || []).forEach((p) => {
    if (selectedProjectId === 'all' || p.id === selectedProjectId) {
      (p.clashes || []).forEach((c) => {
        allClashes.push({
          ...c,
          projectName: p.name,
          projectCode: p.code,
          projectId: p.id,
        });
      });
    }
  });

  const filteredClashes = allClashes.filter((c) => {
    const matchesSev = severityFilter === 'all' || c.severity === severityFilter;
    const matchesStat = statusFilter === 'all' || c.status === statusFilter;
    return matchesSev && matchesStat;
  });

  const criticalCount = allClashes.filter((c) => c.severity === 'Critical' && c.status !== 'Resolved').length;
  const majorCount = allClashes.filter((c) => c.severity === 'Major' && c.status !== 'Resolved').length;
  const resolvedCount = allClashes.filter((c) => c.status === 'Resolved').length;

  const handleCreateClash = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClashProjId || !elementRef) return;

    addClash(newClashProjId, {
      disciplineA,
      disciplineB,
      severity,
      status: 'New',
      elementRef,
      locationDescription: locationDesc,
      assignedToEmployeeId: assignedTo,
      identifiedDate: '2026-08-18',
    });

    setElementRef('');
    setLocationDesc('');
    setShowAddClashModal(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            BIM Quality, LOD Progress & Clash Matrix
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Tracking Level of Development (LOD 100 - 500) completion & cross-trade Navisworks coordination issues
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddClashModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Register Clash Issue</span>
          </button>
        </div>
      </div>

      {/* LOD Stages Overview Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100">
        <h3 className="text-sm font-bold text-white mb-3">
          Level of Development (LOD) Portfolio Distribution
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          {[
            { lod: 'LOD 100', name: 'Concept & Massing', desc: 'Conceptual parameters' },
            { lod: 'LOD 200', name: 'Schematic Design', desc: 'Generic geometry' },
            { lod: 'LOD 300', name: 'Detailed Design', desc: 'Accurate dimensions' },
            { lod: 'LOD 350', name: 'Multi-Trade Coord', desc: 'Interfaces & penetrations' },
            { lod: 'LOD 400', name: 'Fabrication & Spool', desc: 'Ready for shop assembly' },
          ].map((item) => {
            const count = projects.filter((p) => p.currentLOD === item.lod).length;
            return (
              <div
                key={item.lod}
                className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-lg space-y-1"
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-indigo-400">{item.lod}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                    {count} Projects
                  </span>
                </div>
                <div className="font-medium text-slate-200 text-[11px]">{item.name}</div>
                <div className="text-slate-400 text-[10px]">{item.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Clash Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-semibold uppercase">Critical Clashes Open</span>
            <p className="text-2xl font-bold text-rose-400 mt-1">{criticalCount} Unresolved</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-semibold uppercase">Major Trade Clashes</span>
            <p className="text-2xl font-bold text-amber-400 mt-1">{majorCount} Active</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-semibold uppercase">Total Clashes Resolved</span>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{resolvedCount} Cleared</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Clash Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl text-xs">
        <div className="flex items-center gap-2">
          <label className="text-slate-400 font-medium">Severity:</label>
          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setSeverityFilter('all')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                severityFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400'
              }`}
            >
              All ({allClashes.length})
            </button>
            <button
              onClick={() => setSeverityFilter('Critical')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                severityFilter === 'Critical' ? 'bg-rose-600 text-white' : 'text-slate-400'
              }`}
            >
              Critical
            </button>
            <button
              onClick={() => setSeverityFilter('Major')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                severityFilter === 'Major' ? 'bg-amber-600 text-white' : 'text-slate-400'
              }`}
            >
              Major
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-slate-400 font-medium">Status:</label>
          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                statusFilter === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('Active')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                statusFilter === 'Active' ? 'bg-blue-600 text-white' : 'text-slate-400'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('Resolved')}
              className={`px-2.5 py-1 rounded font-medium transition ${
                statusFilter === 'Resolved' ? 'bg-emerald-600 text-white' : 'text-slate-400'
              }`}
            >
              Resolved
            </button>
          </div>
        </div>
      </div>

      {/* Clash Register Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-800/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-700">
              <tr>
                <th className="p-3.5">Project</th>
                <th className="p-3.5">Severity</th>
                <th className="p-3.5">Discipline Interface</th>
                <th className="p-3.5">Element Details & Location</th>
                <th className="p-3.5">Assigned Specialist</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Update Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredClashes.map((clash) => {
                const assignee = employees.find((e) => e.id === clash.assignedToEmployeeId);
                return (
                  <tr key={clash.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3.5 font-bold text-white whitespace-nowrap">
                      <div>{clash.projectCode}</div>
                      <div className="text-[10px] text-slate-400 font-normal truncate max-w-[140px]">
                        {clash.projectName}
                      </div>
                    </td>

                    <td className="p-3.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                          clash.severity === 'Critical'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : clash.severity === 'Major'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {clash.severity}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <div className="flex items-center gap-1 font-semibold text-slate-200">
                        <span>{clash.disciplineA}</span>
                        <span className="text-slate-500">&times;</span>
                        <span>{clash.disciplineB}</span>
                      </div>
                    </td>

                    <td className="p-3.5">
                      <div className="font-medium text-slate-200">{clash.elementRef}</div>
                      <div className="text-slate-400 text-[11px]">{clash.locationDescription}</div>
                    </td>

                    <td className="p-3.5 whitespace-nowrap">
                      {assignee ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                            {assignee.name.charAt(0) || 'U'}
                          </div>
                          <span>{assignee.name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500">Unassigned</span>
                      )}
                    </td>

                    <td className="p-3.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          clash.status === 'Resolved'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : clash.status === 'Reviewed'
                            ? 'bg-blue-500/20 text-blue-400'
                            : clash.status === 'New'
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {clash.status}
                      </span>
                    </td>

                    <td className="p-3.5 text-right">
                      <select
                        aria-label="Change clash status"
                        value={clash.status}
                        onChange={(e) =>
                          updateClashStatus(
                            clash.projectId,
                            clash.id,
                            e.target.value as ClashRecord['status']
                          )
                        }
                        className="bg-slate-800 text-slate-200 text-xs rounded px-2 py-1 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="New">New</option>
                        <option value="Active">Active</option>
                        <option value="Reviewed">Reviewed</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Register Clash Issue */}
      {showAddClashModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 text-slate-100 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">Register New BIM Clash / Issue</h3>
            <form onSubmit={handleCreateClash} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Target Project</label>
                <select
                  value={newClashProjId}
                  onChange={(e) => setNewClashProjId(e.target.value)}
                  className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {cleanProjectName(p.name)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Discipline A</label>
                  <select
                    value={disciplineA}
                    onChange={(e) => setDisciplineA(e.target.value as Discipline)}
                    className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700"
                  >
                    <option value="BIM - ACS">BIM - ACS</option>
                    <option value="Structure">Structure</option>
                    <option value="MEP - HVAC">MEP - HVAC</option>
                    <option value="MEP - Electrical">MEP - Electrical</option>
                    <option value="MEP - Plumbing">MEP - Plumbing</option>
                    <option value="Façade / Envelope">Façade / Envelope</option>
                    <option value="Fire Protection">Fire Protection</option>
                    <option value="AI & Automation">AI & Automation</option>
                    <option value="Estimation">Estimation</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Discipline B</label>
                  <select
                    value={disciplineB}
                    onChange={(e) => setDisciplineB(e.target.value as Discipline)}
                    className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700"
                  >
                    <option value="Structure">Structure</option>
                    <option value="BIM - ACS">BIM - ACS</option>
                    <option value="MEP - HVAC">MEP - HVAC</option>
                    <option value="MEP - Electrical">MEP - Electrical</option>
                    <option value="MEP - Plumbing">MEP - Plumbing</option>
                    <option value="Façade / Envelope">Façade / Envelope</option>
                    <option value="Fire Protection">Fire Protection</option>
                    <option value="AI & Automation">AI & Automation</option>
                    <option value="Estimation">Estimation</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Severity</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as any)}
                    className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700"
                  >
                    <option value="Critical">Critical</option>
                    <option value="Major">Major</option>
                    <option value="Minor">Minor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Assign Lead Specialist</label>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700"
                  >
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {getMemberLabel(e)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Element Conflict Reference</label>
                <input
                  type="text"
                  placeholder="e.g., Supply Duct 800x400 vs Structural Transfer Girder TG-02"
                  value={elementRef}
                  onChange={(e) => setElementRef(e.target.value)}
                  className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Location & Level Details</label>
                <input
                  type="text"
                  placeholder="e.g., Level 3 West Wing Corridor (Grid E-4)"
                  value={locationDesc}
                  onChange={(e) => setLocationDesc(e.target.value)}
                  className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddClashModal(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold transition"
                >
                  Save Clash Issue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
