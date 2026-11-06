import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  Building,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle2,
  Users,
  Timer,
  AlertTriangle,
  PauseCircle,
  CheckCircle,
  Edit3
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useBimData, normalizeDateToIso } from '../context/BimDataContext';
import { BimProject, Discipline, LODLevel, ProjectStatus, PROJECT_STATUS_OPTIONS } from '../types';
import { calculateDeliveryVariance } from '../utils/deliveryVariance';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectToEdit?: BimProject | null;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  projectToEdit = null,
}) => {
  const { addProject, updateProject, employees, selectedProjectId, setSelectedProjectId } = useBimData();
  const isEditMode = Boolean(projectToEdit);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [clientName, setClientName] = useState('');
  const [buildingType, setBuildingType] = useState('Commercial High-Rise');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('WIP');
  const [totalEstimatedHours, setTotalEstimatedHours] = useState(1200);
  const [budgetAmount, setBudgetAmount] = useState(180000);
  const [currentLOD, setCurrentLOD] = useState<LODLevel>('LOD 300');
  const [targetLOD, setTargetLOD] = useState<LODLevel>('LOD 350');
  const [startDate, setStartDate] = useState('2026-08-01');
  const [plannedDeliveryDate, setPlannedDeliveryDate] = useState('2026-11-30');
  const [actualDeliveredDate, setActualDeliveredDate] = useState('');
  const [selectedDisciplines, setSelectedDisciplines] = useState<Discipline[]>([
    'BIM - ACS',
    'Structure',
    'MEP - HVAC',
    'MEP - Electrical',
  ]);
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState<string[]>(() =>
    [employees[0]?.id, employees[1]?.id].filter((id): id is string => Boolean(id))
  );

  useEffect(() => {
    if (!isOpen) return;
    if (projectToEdit) {
      setName(projectToEdit.name || '');
      setCode(projectToEdit.code || '');
      setClientName(projectToEdit.clientName || '');
      setBuildingType(projectToEdit.buildingType || 'Commercial High-Rise');
      setLocation(projectToEdit.location || '');
      setDescription(projectToEdit.description || '');
      setStatus(projectToEdit.status || 'WIP');
      setTotalEstimatedHours(
        Number(
          projectToEdit.manualEstimatedHoursOverride ??
            projectToEdit.estimatedHours ??
            projectToEdit.totalEstimatedHours ??
            0
        )
      );
      setBudgetAmount(Number(projectToEdit.budgetAmount ?? 0));
      setCurrentLOD(projectToEdit.currentLOD || 'LOD 300');
      setTargetLOD(projectToEdit.targetLOD || 'LOD 350');
      setStartDate(normalizeDateToIso(projectToEdit.startDate) || '2026-08-01');
      setPlannedDeliveryDate(
        normalizeDateToIso(
          projectToEdit.plannedDeliveryDate || projectToEdit.targetCompletionDate
        ) || '2026-11-30'
      );
      setActualDeliveredDate(
        projectToEdit.actualDeliveredDate
          ? normalizeDateToIso(projectToEdit.actualDeliveredDate) || projectToEdit.actualDeliveredDate
          : ''
      );
      setSelectedDisciplines(
        Array.isArray(projectToEdit.disciplines) && projectToEdit.disciplines.length > 0
          ? projectToEdit.disciplines
          : ['BIM - ACS']
      );
      setAssignedEmployeeIds(
        Array.isArray(projectToEdit.assignedEmployeeIds)
          ? projectToEdit.assignedEmployeeIds
          : []
      );
    } else {
      setName('');
      setCode('');
      setClientName('');
      setBuildingType('Commercial High-Rise');
      setLocation('');
      setDescription('');
      setStatus('WIP');
      setTotalEstimatedHours(1200);
      setBudgetAmount(180000);
      setCurrentLOD('LOD 300');
      setTargetLOD('LOD 350');
      setStartDate('2026-08-01');
      setPlannedDeliveryDate('2026-11-30');
      setActualDeliveredDate('');
      setSelectedDisciplines(['BIM - ACS', 'Structure', 'MEP - HVAC', 'MEP - Electrical']);
      setAssignedEmployeeIds(
        [employees[0]?.id, employees[1]?.id].filter((id): id is string => Boolean(id))
      );
    }
  }, [isOpen, projectToEdit]);

  if (!isOpen) return null;

  const liveVariance = calculateDeliveryVariance(plannedDeliveryDate, actualDeliveredDate || undefined, status);

  const handleToggleDiscipline = (disc: Discipline) => {
    if (selectedDisciplines.includes(disc)) {
      setSelectedDisciplines(selectedDisciplines.filter((d) => d !== disc));
    } else {
      setSelectedDisciplines([...selectedDisciplines, disc]);
    }
  };

  const handleToggleEmployee = (empId: string) => {
    if (assignedEmployeeIds.includes(empId)) {
      setAssignedEmployeeIds(assignedEmployeeIds.filter((id) => id !== empId));
    } else {
      setAssignedEmployeeIds([...assignedEmployeeIds, empId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    const cleanCode =
      code.trim() ||
      `BIM-${cleanName
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 4)
        .toUpperCase() || 'PRJ'}`;
    const cleanClient = clientName.trim() || 'Enterprise Portfolio Client';
    const effectiveDisciplines: Discipline[] =
      selectedDisciplines.length > 0 ? selectedDisciplines : ['BIM - ACS'];
    const cleanAssignees = assignedEmployeeIds.filter(Boolean);
    const effectivePlannedDate = plannedDeliveryDate || new Date().toISOString().slice(0, 10);

    if (isEditMode && projectToEdit) {
      const estHoursNum = Number(totalEstimatedHours) || 0;
      const updatedData: Partial<BimProject> = {
        name: cleanName,
        code: cleanCode,
        clientName: cleanClient,
        buildingType: buildingType.trim() || 'Commercial High-Rise',
        location: location.trim() || 'Global',
        description:
          description.trim() ||
          `${buildingType || 'Commercial'} BIM modeling and multi-trade coordination project.`,
        status: status || 'WIP',
        currentLOD,
        targetLOD,
        totalEstimatedHours: estHoursNum,
        estimatedHours: estHoursNum,
        manualEstimatedHoursOverride: estHoursNum,
        budgetAmount: Number(budgetAmount) || 0,
        startDate: startDate || new Date().toISOString().slice(0, 10),
        targetCompletionDate: effectivePlannedDate,
        plannedDeliveryDate: effectivePlannedDate,
        actualDeliveredDate: actualDeliveredDate.trim() ? actualDeliveredDate.trim() : undefined,
        disciplines: effectiveDisciplines,
        assignedEmployeeIds: cleanAssignees,
      };

      updateProject(projectToEdit.id, updatedData);

      const dbPayload = {
        ...projectToEdit,
        ...updatedData,
        id: projectToEdit.id,
        projectName: cleanName,
        actualDeliveredDate: actualDeliveredDate.trim() ? actualDeliveredDate.trim() : '',
        updatedAt: new Date().toISOString(),
      };

      try {
        fetch('/api/ssot/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dbPayload),
        }).catch(() => {});
        await setDoc(doc(db, 'projects', projectToEdit.id), dbPayload, { merge: true });
      } catch (err) {
        console.warn('Firestore update project notice:', err);
      }

      onClose();
      return;
    }

    addProject({
      name: cleanName,
      code: cleanCode,
      clientName: cleanClient,
      buildingType: buildingType.trim() || 'Commercial High-Rise',
      location: location.trim() || 'Global',
      description:
        description.trim() ||
        `${buildingType || 'Commercial'} BIM modeling and multi-trade coordination project.`,
      status: status || 'WIP',
      currentLOD,
      targetLOD,
      totalEstimatedHours: Number(totalEstimatedHours) || 0,
      totalCompletedHours: 0,
      budgetAmount: Number(budgetAmount) || 0,
      startDate: startDate || new Date().toISOString().slice(0, 10),
      targetCompletionDate: effectivePlannedDate,
      plannedDeliveryDate: effectivePlannedDate,
      actualDeliveredDate: actualDeliveredDate.trim() ? actualDeliveredDate.trim() : undefined,
      disciplines: effectiveDisciplines,
      assignedEmployeeIds: cleanAssignees,
      tasks: [
        {
          id: `task-${Date.now()}-1`,
          name: `${currentLOD} Core Modeling Setup`,
          discipline: effectiveDisciplines[0] || 'BIM - ACS',
          lod: currentLOD,
          estimatedHours: Math.round((Number(totalEstimatedHours) || 0) * 0.4),
          completedHours: 0,
          status: 'In Progress',
          assignedEmployeeId: cleanAssignees[0] || '',
          dueDate: effectivePlannedDate,
        },
      ],
      milestones: [
        {
          id: `ms-${Date.now()}-1`,
          title: `Initial ${currentLOD} Model Release`,
          targetDate: startDate || effectivePlannedDate,
          status: 'in-progress',
          lodRequirement: currentLOD,
          deliverableDescription: `Delivery of coordinated ${effectiveDisciplines.join(', ')} geometry to client.`,
        },
      ],
      clashes: [],
    });

    if (selectedProjectId !== 'all') {
      setSelectedProjectId('all');
    }

    // Reset form fields for next creation
    setName('');
    setCode('');
    setClientName('');
    setLocation('');
    setDescription('');
    setStatus('WIP');
    setTotalEstimatedHours(1200);
    setActualDeliveredDate('');

    try {
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.7 },
      });
    } catch {}

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full my-8 text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
              {isEditMode ? <Edit3 className="w-4 h-4 text-amber-400" /> : <Layers className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEditMode ? 'Edit BIM Project' : 'Create New BIM Project'}
              </h3>
              <p className="text-xs text-slate-400">
                {isEditMode
                  ? `Update project details, scope, status, and delivery schedule for ${projectToEdit?.name}`
                  : 'Configure delivery schedule, variance tracking, hour budgets, and BIM milestones'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Project Name, Code & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-slate-400 font-medium mb-1">Project Name</label>
              <input
                type="text"
                placeholder="e.g. London Wall Gym"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Project Code</label>
              <input
                type="text"
                placeholder="e.g. BIM-LWG"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
              >
                {PROJECT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Client, Typology, Location */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Client / Owner</label>
              <input
                type="text"
                placeholder="e.g. City Wellness Properties UK"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Building Typology</label>
              <input
                type="text"
                placeholder="e.g. Sports & Wellness Facility"
                value={buildingType}
                onChange={(e) => setBuildingType(e.target.value)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Location</label>
              <input
                type="text"
                placeholder="e.g. London, UK"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Project Scope / Description */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Project Scope & Description</label>
            <input
              type="text"
              placeholder="e.g. Commercial BIM modeling and multi-trade coordination project"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Delivery Dates & Live Difference Highlight */}
          <div className="p-3.5 bg-slate-850 bg-slate-800/60 border border-slate-700 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                Delivery Milestones & Variance Highlight
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${liveVariance.badgeClass}`}>
                Difference: {liveVariance.label}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Delivery Date (Planned) <span className="text-blue-400">*</span>
                </label>
                <input
                  type="date"
                  value={plannedDeliveryDate}
                  onChange={(e) => setPlannedDeliveryDate(e.target.value)}
                  className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Actual Delivered Date <span className="text-slate-500">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={actualDeliveredDate}
                  onChange={(e) => setActualDeliveredDate(e.target.value)}
                  className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="YYYY-MM-DD"
                />
              </div>
            </div>
          </div>

          {/* Hours, LOD */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Estimated Hours</label>
              <input
                type="number"
                value={totalEstimatedHours}
                onChange={(e) => setTotalEstimatedHours(Number(e.target.value))}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Current LOD</label>
              <select
                value={currentLOD}
                onChange={(e) => setCurrentLOD(e.target.value as LODLevel)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="LOD 100">LOD 100</option>
                <option value="LOD 200">LOD 200</option>
                <option value="LOD 300">LOD 300</option>
                <option value="LOD 350">LOD 350</option>
                <option value="LOD 400">LOD 400</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 font-medium mb-1">Target LOD</label>
              <select
                value={targetLOD}
                onChange={(e) => setTargetLOD(e.target.value as LODLevel)}
                className="w-full bg-slate-800 text-slate-200 rounded-lg p-2 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="LOD 300">LOD 300</option>
                <option value="LOD 350">LOD 350</option>
                <option value="LOD 400">LOD 400</option>
                <option value="LOD 500">LOD 500</option>
              </select>
            </div>
          </div>

          {/* Disciplines */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">BIM Disciplines</label>
            <div className="flex flex-wrap gap-2">
              {[
                'ACS',
                'MEP',
                'SCAN TO BIM',
                'CAD',
                'BIM - ACS',
                'Structure',
                'MEP - HVAC',
                'MEP - Electrical',
                'MEP - Plumbing',
                'SES',
                'BIM - MEP',
                'Façade / Envelope',
                'Coordination & QA',
                'Fire Protection',
                'AI & Automation',
                'Estimation',
              ].map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => handleToggleDiscipline(d as Discipline)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition ${
                    selectedDisciplines.includes(d as Discipline)
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Assignees */}
          <div>
            <label className="block text-slate-400 font-medium mb-1">Assign BIM Specialists</label>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto p-2 bg-slate-800/60 rounded-lg border border-slate-700/60">
              {employees.map((emp) => (
                <button
                  type="button"
                  key={emp.id}
                  onClick={() => handleToggleEmployee(emp.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition ${
                    assignedEmployeeIds.includes(emp.id)
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-blue-500 text-white font-bold text-[9px] flex items-center justify-center shrink-0">
                    {emp.name.charAt(0) || 'U'}
                  </div>
                  <span>{emp.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition"
            >
              {isEditMode ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
