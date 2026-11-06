import React, { useState } from 'react';
import { X, User, CheckCircle2, Shield, Briefcase } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useBimData } from '../context/BimDataContext';
import { Discipline, ROLE_TITLES, ROLE_OPTIONS, EmployeeRole } from '../types';

interface NewEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewEmployeeModal: React.FC<NewEmployeeModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { addEmployee, projects, theme } = useBimData();
  const isLight = theme === 'light';

  const [name, setName] = useState('');
  const [role, setRole] = useState<EmployeeRole>('Senior MEP Modeler');
  const [email, setEmail] = useState('');
  const [primaryDiscipline, setPrimaryDiscipline] = useState<Discipline>('MEP - HVAC');
  const [weeklyCapacityHours, setWeeklyCapacityHours] = useState(40);
  const [skillsInput, setSkillsInput] = useState('Revit 2026, Navisworks Manage, Dynamo');
  const [assignedProjectIds, setAssignedProjectIds] = useState<string[]>([
    projects[0]?.id || '',
  ]);

  if (!isOpen) return null;

  const handleToggleProject = (projId: string) => {
    if (assignedProjectIds.includes(projId)) {
      setAssignedProjectIds(assignedProjectIds.filter((id) => id !== projId));
    } else {
      setAssignedProjectIds([...assignedProjectIds, projId]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    const skills = skillsInput.split(',').map((s) => s.trim()).filter(Boolean);

    addEmployee({
      name,
      role,
      email,
      primaryDiscipline,
      weeklyCapacityHours: Number(weeklyCapacityHours),
      hourlyRate: 85, // standard default rate
      skills,
      activeProjectIds: assignedProjectIds,
      avatar: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80`,
      status: 'Active',
    });

    try {
      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.7 },
      });
    } catch {}

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className={`border rounded-2xl max-w-lg w-full my-8 shadow-2xl overflow-hidden transition-colors ${
        isLight
          ? 'bg-white border-slate-200 text-slate-900'
          : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-500 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Add Member
              </h3>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Register team member capacity, designated role, and project allocations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-lg transition ${
              isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className={`block font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              Full Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Rachel Chen, PE"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full rounded-lg p-2.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isLight
                  ? 'bg-white text-slate-900 border-slate-300 placeholder-slate-400'
                  : 'bg-slate-800 text-slate-200 border-slate-700 placeholder-slate-500'
              }`}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`block font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Role Title *
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={`w-full rounded-lg p-2.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                  isLight
                    ? 'bg-white text-slate-900 border-slate-300'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
                required
              >
                {ROLE_TITLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Email Address *
              </label>
              <input
                type="email"
                placeholder="rachel.chen@bimtracker.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full rounded-lg p-2.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isLight
                    ? 'bg-white text-slate-900 border-slate-300 placeholder-slate-400'
                    : 'bg-slate-800 text-slate-200 border-slate-700 placeholder-slate-500'
                }`}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`block font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Primary Discipline
              </label>
              <select
                value={primaryDiscipline}
                onChange={(e) => setPrimaryDiscipline(e.target.value as Discipline)}
                className={`w-full rounded-lg p-2.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                  isLight
                    ? 'bg-white text-slate-900 border-slate-300'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
              >
                <option value="BIM - ACS">BIM - ACS</option>
                <option value="Structure">Structure</option>
                <option value="MEP - HVAC">MEP - HVAC</option>
                <option value="MEP - Electrical">MEP - Electrical</option>
                <option value="MEP - Plumbing">MEP - Plumbing</option>
                <option value="Fire Protection">Fire Protection</option>
                <option value="Façade / Envelope">Façade / Envelope</option>
                <option value="Coordination & QA">Coordination & QA</option>
                <option value="AI & Automation">AI & Automation</option>
                <option value="Estimation">Estimation</option>
              </select>
            </div>

            <div>
              <label className={`block font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Weekly Capacity (Hours/Wk)
              </label>
              <input
                type="number"
                min={1}
                max={80}
                value={weeklyCapacityHours}
                onChange={(e) => setWeeklyCapacityHours(Number(e.target.value))}
                className={`w-full rounded-lg p-2.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isLight
                    ? 'bg-white text-slate-900 border-slate-300'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
              />
            </div>
          </div>

          <div>
            <label className={`block font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              BIM Skills & Specializations (comma separated)
            </label>
            <input
              type="text"
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder="e.g. Revit 2026, Navisworks Manage, Dynamo, Solibri"
              className={`w-full rounded-lg p-2.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isLight
                  ? 'bg-white text-slate-900 border-slate-300'
                  : 'bg-slate-800 text-slate-200 border-slate-700 placeholder-slate-500'
              }`}
            />
          </div>

          <div>
            <label className={`block font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              Assign to Active Projects ({assignedProjectIds.length} selected)
            </label>
            <div className={`flex flex-wrap gap-2 max-h-28 overflow-y-auto p-2.5 rounded-lg border ${
              isLight
                ? 'bg-slate-50 border-slate-200'
                : 'bg-slate-800/60 border-slate-700/60'
            }`}>
              {projects.map((p) => {
                const isSelected = assignedProjectIds.includes(p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => handleToggleProject(p.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : isLight
                        ? 'bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-300'
                        : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700'
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`flex justify-end gap-2.5 pt-4 border-t ${
            isLight ? 'border-slate-200' : 'border-slate-800'
          }`}>
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md shadow-blue-500/20 transition"
            >
              Save Member
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
