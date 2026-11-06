import React, { useState, useEffect } from 'react';
import {
  X,
  UserCheck,
  CheckCircle2,
  Briefcase,
  Mail,
  Phone,
  Layers,
  Sparkles,
  Shield,
  Activity,
  Trash2
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useBimData } from '../context/BimDataContext';
import { Employee, Discipline, ROLE_TITLES, ROLE_OPTIONS, EmployeeRole } from '../types';

interface EditEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
}

export const EditEmployeeModal: React.FC<EditEmployeeModalProps> = ({
  isOpen,
  onClose,
  employee,
}) => {
  const { updateEmployee, deleteEmployee, projects, theme } = useBimData();
  const isLight = theme === 'light';

  const [name, setName] = useState('');
  const [role, setRole] = useState<EmployeeRole>('Senior MEP Modeler');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [primaryDiscipline, setPrimaryDiscipline] = useState<Discipline>('MEP - HVAC');
  const [weeklyCapacityHours, setWeeklyCapacityHours] = useState(40);
  const [status, setStatus] = useState<'Active' | 'On Leave' | 'High Workload'>('Active');
  const [skillsInput, setSkillsInput] = useState('');
  const [assignedProjectIds, setAssignedProjectIds] = useState<string[]>([]);
  const [avatar, setAvatar] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (employee) {
      setName(employee.name);
      setRole(employee.role);
      setEmail(employee.email);
      setPhone(employee.phone || '');
      setPrimaryDiscipline(employee.primaryDiscipline);
      setWeeklyCapacityHours(employee.weeklyCapacityHours || 40);
      setStatus(employee.status || 'Active');
      setSkillsInput(employee.skills.join(', '));
      setAssignedProjectIds(employee.activeProjectIds || []);
      setAvatar(employee.avatar);
      setShowDeleteConfirm(false);
    }
  }, [employee]);

  if (!isOpen || !employee) return null;

  const handleToggleProject = (projId: string) => {
    if (assignedProjectIds.includes(projId)) {
      setAssignedProjectIds(assignedProjectIds.filter((id) => id !== projId));
    } else {
      setAssignedProjectIds([...assignedProjectIds, projId]);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    const skills = skillsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    updateEmployee(employee.id, {
      name,
      role,
      email,
      phone: phone || undefined,
      primaryDiscipline,
      weeklyCapacityHours: Number(weeklyCapacityHours),
      status,
      skills,
      activeProjectIds: assignedProjectIds,
      avatar: avatar || employee.avatar,
    });

    try {
      confetti({
        particleCount: 25,
        spread: 45,
        origin: { y: 0.7 },
      });
    } catch {}

    onClose();
  };

  const handleDelete = () => {
    deleteEmployee(employee.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className={`border rounded-2xl max-w-xl w-full my-8 shadow-2xl overflow-hidden transition-colors ${
        isLight
          ? 'bg-white border-slate-200 text-slate-900'
          : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-xs border border-slate-700 shadow-sm shrink-0">
              {employee.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || 'U'}
            </div>
            <div>
              <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Edit Member Details
              </h3>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Update role designation, email contact, disciplines, and project assignments
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
        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`block font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Full Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full rounded-lg p-2.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isLight
                    ? 'bg-white text-slate-900 border-slate-300'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
                required
              />
            </div>

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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`block font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Email Address (Mail ID) *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full rounded-lg p-2.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isLight
                    ? 'bg-white text-slate-900 border-slate-300'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
                required
              />
            </div>

            <div>
              <label className={`block font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Phone Number
              </label>
              <input
                type="tel"
                placeholder="+1 (555) 019-2834"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`w-full rounded-lg p-2.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isLight
                    ? 'bg-white text-slate-900 border-slate-300 placeholder-slate-400'
                    : 'bg-slate-800 text-slate-200 border-slate-700 placeholder-slate-500'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                Weekly Capacity (Hrs/Wk)
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

            <div>
              <label className={`block font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Availability Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className={`w-full rounded-lg p-2.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                  isLight
                    ? 'bg-white text-slate-900 border-slate-300'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
              >
                <option value="Active">Active</option>
                <option value="High Workload">High Workload</option>
                <option value="On Leave">On Leave</option>
              </select>
            </div>
          </div>

          <div>
            <label className={`block font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              BIM Skills & Competencies (comma separated)
            </label>
            <input
              type="text"
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder="e.g. Revit 2026, Navisworks Manage, Dynamo, Solibri"
              className={`w-full rounded-lg p-2.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isLight
                  ? 'bg-white text-slate-900 border-slate-300'
                  : 'bg-slate-800 text-slate-200 border-slate-700'
              }`}
            />
          </div>

          <div>
            <label className={`block font-medium mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              Assigned Projects ({assignedProjectIds.length} active)
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

          {/* Delete confirmation section */}
          {showDeleteConfirm && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
              <span>Are you sure you want to remove this team member from the organization?</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className={`flex items-center justify-between pt-4 border-t ${
            isLight ? 'border-slate-200' : 'border-slate-800'
          }`}>
            <div>
              {!showDeleteConfirm && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition"
                  title="Delete member"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Member</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
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
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md shadow-blue-500/20 transition flex items-center gap-1.5"
              >
                <UserCheck className="w-4 h-4" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
