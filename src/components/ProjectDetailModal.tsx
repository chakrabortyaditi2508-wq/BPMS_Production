import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Clock,
  Layers,
  Calendar,
  Building,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Users,
  Plus,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Edit3,
  Check
} from 'lucide-react';
import {
  useBimData,
  isUserSuperAdmin,
  getProjectEstimatedHours,
  getProjectChangedHours,
  getProjectTargetHours,
} from '../context/BimDataContext';
import { BimProject, Milestone, TaskItem, LODLevel, Discipline, PRIMARY_DISCIPLINES } from '../types';
import { calculateDeliveryVariance, getProjectStatusStyle } from '../utils/deliveryVariance';

interface ProjectDetailModalProps {
  project: BimProject | null;
  onClose: () => void;
  onOpenReportModalWithProject: (projectId: string) => void;
  onOpenLogModalWithProject: (projectId: string) => void;
}

const LOD_OPTIONS: LODLevel[] = [
  'LOD 100',
  'LOD 200',
  'LOD 300',
  'LOD 350',
  'LOD 400',
  'LOD 500',
];

const toIsoDateInput = (val?: string): string => {
  if (!val) return '';
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const ddmmyyyy = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }
  return trimmed;
};

export const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({
  project,
  onClose,
  onOpenReportModalWithProject,
  onOpenLogModalWithProject,
}) => {
  const {
    projects,
    getProjectCompletedHours,
    employees,
    updateMilestoneStatus,
    updateTask,
    addTask,
    addMilestone,
    updateProject,
    updateProjectStatus,
    currentUser,
    disciplineAssignments,
    handleMemberSelect: syncDisciplineMemberToFirestore,
  } = useBimData();

  const liveProject = projects.find((p) => p.id === project?.id) || project;

  const isSuperAdmin = isUserSuperAdmin(currentUser);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'milestones' | 'clashes'>('overview');
  const [showAddTask, setShowAddTask] = useState(false);
  const [isEditingDeliveryDates, setIsEditingDeliveryDates] = useState(false);
  const [newPlannedDateValue, setNewPlannedDateValue] = useState('');
  const [newActualDateValue, setNewActualDateValue] = useState('');

  // Inline editing states for Project Overview & Hours fields
  const [isEditingPlannedDate, setIsEditingPlannedDate] = useState(false);
  const [isEditingActualDate, setIsEditingActualDate] = useState(false);
  const plannedDateInputRef = useRef<HTMLInputElement | null>(null);
  const actualDateInputRef = useRef<HTMLInputElement | null>(null);

  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState('');

  const [isEditingEstHours, setIsEditingEstHours] = useState(false);
  const [estHoursDraft, setEstHoursDraft] = useState('');

  const [isEditingScope, setIsEditingScope] = useState(false);
  const [scopeDraft, setScopeDraft] = useState('');

  // New task form
  const [taskName, setTaskName] = useState('');
  const [taskDiscipline, setTaskDiscipline] = useState(liveProject?.disciplines?.[0] || 'BIM - ACS');
  const [taskLOD, setTaskLOD] = useState<LODLevel>('LOD 350');
  const [taskEstHours, setTaskEstHours] = useState(80);
  const [taskAssignee, setTaskAssignee] = useState(employees[0]?.id || '');
  const [taskDueDate, setTaskDueDate] = useState('2026-09-30');

  useEffect(() => {
    if (liveProject?.disciplines && liveProject.disciplines.length > 0) {
      setTaskDiscipline(liveProject.disciplines[0]);
    }
    setIsEditingPlannedDate(false);
    setIsEditingActualDate(false);
    setIsEditingBudget(false);
    setIsEditingEstHours(false);
    setIsEditingScope(false);
  }, [liveProject?.id]);

  if (!liveProject) return null;

  const handleMemberSelect = async (
    disciplineKey: string,
    memberId: string,
    taskId?: string
  ) => {
    if (taskId) {
      updateTask(liveProject.id, taskId, {
        assignedEmployeeId: memberId,
        discipline: disciplineKey as any,
      });
    } else {
      setTaskAssignee(memberId);
      if (memberId && !liveProject.assignedEmployeeIds.includes(memberId)) {
        updateProject(liveProject.id, {
          assignedEmployeeIds: [...liveProject.assignedEmployeeIds, memberId],
        });
      }
    }
    try {
      await syncDisciplineMemberToFirestore(disciplineKey, memberId, liveProject.id);
    } catch (err) {
      console.warn('Firestore discipline assignment sync notice:', err);
    }
  };

  const handleProjectDisciplineChange = (index: number, newDiscipline: Discipline) => {
    const nextDisciplines = [...(liveProject.disciplines || [])];
    nextDisciplines[index] = newDiscipline;
    const deduped = Array.from(new Set(nextDisciplines));
    updateProject(liveProject.id, { disciplines: deduped });
  };

  const handleAddProjectDiscipline = (newDiscipline: string) => {
    if (!newDiscipline) return;
    const current = liveProject.disciplines || [];
    if (!current.includes(newDiscipline as Discipline)) {
      updateProject(liveProject.id, {
        disciplines: [...current, newDiscipline as Discipline],
      });
    }
  };

  const handleRemoveProjectDiscipline = (index: number) => {
    const current = liveProject.disciplines || [];
    if (current.length <= 1) return;
    const nextDisciplines = current.filter((_, i) => i !== index);
    updateProject(liveProject.id, { disciplines: nextDisciplines });
  };

  const commitBudget = () => {
    const parsed = Number(budgetDraft);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      updateProject(liveProject.id, { budgetAmount: parsed });
    }
    setIsEditingBudget(false);
  };

  const commitEstHours = () => {
    const parsed = Number(estHoursDraft);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      updateProject(liveProject.id, {
        totalEstimatedHours: parsed,
        estimatedHours: parsed,
        manualEstimatedHoursOverride: parsed,
      });
    }
    setIsEditingEstHours(false);
  };

  const commitScope = () => {
    updateProject(liveProject.id, { description: scopeDraft });
    setIsEditingScope(false);
  };

  const completedHours = getProjectCompletedHours(liveProject.id);
  const baseEstimatedHours = getProjectEstimatedHours(liveProject);
  const changedAdditionalHours = getProjectChangedHours(liveProject);
  const totalTargetHours = getProjectTargetHours(liveProject);
  const variance = totalTargetHours - completedHours;
  const isOverBudget = completedHours > totalTargetHours;
  const burnPct = totalTargetHours > 0
    ? Math.min(100, Math.round((completedHours / totalTargetHours) * 100))
    : 0;

  const assignedStaff = employees.filter((e) =>
    liveProject.assignedEmployeeIds.includes(e.id)
  );

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName) return;

    addTask(liveProject.id, {
      name: taskName,
      discipline: taskDiscipline as any,
      lod: taskLOD,
      estimatedHours: Number(taskEstHours),
      completedHours: 0,
      status: 'In Progress',
      assignedEmployeeId: taskAssignee,
      dueDate: taskDueDate,
    });

    setTaskName('');
    setShowAddTask(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full my-8 text-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-start justify-between bg-slate-900">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-400 font-mono">{liveProject.code}</span>
              {isSuperAdmin ? (
                <div className="relative inline-block">
                  <select
                    value={liveProject.status}
                    onChange={(e) => updateProjectStatus(liveProject.id, e.target.value as any)}
                    className={`font-semibold text-[11px] px-2.5 py-0.5 rounded-full border cursor-pointer focus:outline-none transition ${getProjectStatusStyle(
                      liveProject.status
                    )}`}
                  >
                    <option value="WIP" className="bg-slate-900 text-cyan-300">WIP</option>
                    <option value="On Track" className="bg-slate-900 text-emerald-300">On Track</option>
                    <option value="At Risk" className="bg-slate-900 text-amber-300">At Risk</option>
                    <option value="HOLD" className="bg-slate-900 text-orange-300">HOLD</option>
                    <option value="CLOSED" className="bg-slate-900 text-slate-300">CLOSED</option>
                    <option value="Completed" className="bg-slate-900 text-emerald-300">Completed</option>
                  </select>
                </div>
              ) : (
                <span
                  className={`font-semibold text-[11px] px-2.5 py-0.5 rounded-full border ${getProjectStatusStyle(
                    liveProject.status
                  )}`}
                >
                  {liveProject.status}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-white mt-1">{liveProject.name}</h2>
            <p className="text-xs text-slate-400">
              {liveProject.clientName} • {liveProject.buildingType} • {liveProject.location}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenLogModalWithProject(liveProject.id)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition flex items-center gap-1"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Log Hours</span>
            </button>
            <button
              onClick={() => onOpenReportModalWithProject(liveProject.id)}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-medium transition flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>AI Report</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded-lg transition ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-800 bg-slate-900/50 flex space-x-4 text-xs font-medium">
          {[
            { id: 'overview', label: 'Project Overview & Hours' },
            { id: 'tasks', label: `WBS Tasks (${liveProject.tasks.length})` },
            { id: 'milestones', label: `LOD Milestones (${liveProject.milestones.length})` },
            { id: 'clashes', label: `Clash Register (${liveProject.clashes.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400 font-bold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Hours Summary Box */}
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 text-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-slate-400 font-semibold uppercase">Estimated vs Actual Hours Burn</span>
                    <h3 className="text-lg font-bold text-white mt-0.5 flex items-center gap-1.5">
                      <span>{completedHours} /</span>
                      {isSuperAdmin && isEditingEstHours ? (
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          autoFocus
                          value={estHoursDraft}
                          onChange={(e) => setEstHoursDraft(e.target.value)}
                          onBlur={commitEstHours}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitEstHours();
                            } else if (e.key === 'Escape') {
                              setIsEditingEstHours(false);
                            }
                          }}
                          className="w-24 bg-slate-900 text-white font-bold text-sm px-2 py-0.5 rounded border border-blue-500 focus:outline-none"
                        />
                      ) : (
                        <span
                          onClick={() => {
                            if (isSuperAdmin) {
                              setEstHoursDraft(String(baseEstimatedHours));
                              setIsEditingEstHours(true);
                            }
                          }}
                          className={
                            isSuperAdmin
                              ? 'cursor-pointer hover:text-blue-400 border-b border-dashed border-slate-600 hover:border-blue-400 transition'
                              : ''
                          }
                          title={isSuperAdmin ? 'Click to edit Base Estimated Hours' : undefined}
                        >
                          {totalTargetHours}
                        </span>
                      )}
                      <span>hrs</span>
                      {changedAdditionalHours > 0 && (
                        <span className="text-xs font-normal text-slate-400 ml-1">
                          ({baseEstimatedHours}h est + {changedAdditionalHours}h changed)
                        </span>
                      )}
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className={`text-xl font-bold ${isOverBudget ? 'text-amber-400' : 'text-blue-400'}`}>
                      {burnPct}%
                    </span>
                    <p className="text-[11px] text-slate-400">Total Hours Allocated</p>
                  </div>
                </div>

                <div className="w-full bg-slate-700 h-3 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isOverBudget ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${burnPct}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-700 text-xs">
                  <div>
                    <span className="text-slate-400 block">Estimated Budget:</span>
                    {isSuperAdmin ? (
                      isEditingBudget ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-slate-400 font-bold text-sm">$</span>
                          <input
                            type="number"
                            min="0"
                            step="500"
                            autoFocus
                            aria-label="Edit Estimated Budget"
                            value={budgetDraft}
                            onChange={(e) => setBudgetDraft(e.target.value)}
                            onBlur={commitBudget}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitBudget();
                              } else if (e.key === 'Escape') {
                                setIsEditingBudget(false);
                              }
                            }}
                            className="w-28 bg-slate-900 text-white font-bold text-sm px-2 py-0.5 rounded border border-blue-500 focus:outline-none"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setBudgetDraft(String(liveProject.budgetAmount ?? 0));
                            setIsEditingBudget(true);
                          }}
                          className="group inline-flex items-center gap-1.5 text-left focus:outline-none"
                          title="Click to edit Estimated Budget"
                        >
                          <strong className="text-white group-hover:text-blue-400 text-sm border-b border-dashed border-slate-600 group-hover:border-blue-400 transition">
                            ${(liveProject.budgetAmount ?? 0).toLocaleString()}
                          </strong>
                          <Edit3 className="w-3 h-3 text-amber-400 opacity-80 group-hover:opacity-100 transition shrink-0" />
                        </button>
                      )
                    ) : (
                      <strong className="text-white text-sm">${(liveProject.budgetAmount ?? 0).toLocaleString()}</strong>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 block">Hours Variance:</span>
                    <strong className={`text-sm ${isOverBudget ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {isOverBudget ? `+${completedHours - totalTargetHours}h Over` : `${variance}h Remaining`}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Current LOD:</span>
                    {isSuperAdmin ? (
                      <select
                        aria-label="Edit Current LOD"
                        value={liveProject.currentLOD}
                        onChange={(e) =>
                          updateProject(liveProject.id, {
                            currentLOD: e.target.value as LODLevel,
                          })
                        }
                        className="mt-0.5 bg-slate-900/90 hover:bg-slate-900 text-indigo-400 font-bold text-sm rounded px-2 py-0.5 border border-slate-700 hover:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer transition"
                      >
                        {LOD_OPTIONS.map((lod) => (
                          <option key={lod} value={lod} className="bg-slate-900 text-indigo-300">
                            {lod}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <strong className="text-indigo-400 text-sm">{liveProject.currentLOD}</strong>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 block">Target LOD:</span>
                    {isSuperAdmin ? (
                      <select
                        aria-label="Edit Target LOD"
                        value={liveProject.targetLOD}
                        onChange={(e) =>
                          updateProject(liveProject.id, {
                            targetLOD: e.target.value as LODLevel,
                          })
                        }
                        className="mt-0.5 bg-slate-900/90 hover:bg-slate-900 text-slate-200 font-bold text-sm rounded px-2 py-0.5 border border-slate-700 hover:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer transition"
                      >
                        {LOD_OPTIONS.map((lod) => (
                          <option key={lod} value={lod} className="bg-slate-900 text-slate-200">
                            {lod}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <strong className="text-slate-200 text-sm">{liveProject.targetLOD}</strong>
                    )}
                  </div>
                </div>
              </div>

              {/* Delivery Dates & Variance Tracker */}
              {(() => {
                const plannedDate = liveProject.plannedDeliveryDate || liveProject.targetCompletionDate;
                const actualDate = liveProject.actualDeliveredDate;
                const varianceInfo = calculateDeliveryVariance(plannedDate, actualDate, liveProject.status);
                return (
                  <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-400" />
                        Delivery Schedule & Variance
                      </h4>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${varianceInfo.badgeClass}`}>
                        {varianceInfo.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-slate-300">
                      <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-400 text-[11px] block">Planned Delivery Date:</span>
                          {isSuperAdmin && isEditingPlannedDate ? (
                            <input
                              ref={plannedDateInputRef}
                              type="date"
                              autoFocus
                              aria-label="Planned Delivery Date"
                              value={toIsoDateInput(newPlannedDateValue || plannedDate)}
                              onChange={(e) => {
                                const val = e.target.value;
                                setNewPlannedDateValue(val);
                                updateProject(liveProject.id, {
                                  plannedDeliveryDate: val,
                                  targetCompletionDate: val,
                                });
                              }}
                              onBlur={() => setIsEditingPlannedDate(false)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'Escape') {
                                  setIsEditingPlannedDate(false);
                                }
                              }}
                              className="mt-0.5 w-full bg-slate-800 border border-amber-500/70 rounded px-2 py-0.5 text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          ) : (
                            <strong
                              onClick={() => {
                                if (isSuperAdmin) {
                                  setNewPlannedDateValue(toIsoDateInput(plannedDate));
                                  setIsEditingPlannedDate(true);
                                  setTimeout(() => {
                                    try {
                                      plannedDateInputRef.current?.focus();
                                      plannedDateInputRef.current?.showPicker?.();
                                    } catch {}
                                  }, 0);
                                }
                              }}
                              className={`text-white text-xs ${
                                isSuperAdmin ? 'cursor-pointer hover:text-amber-300 transition' : ''
                              }`}
                            >
                              {plannedDate || 'Not specified'}
                            </strong>
                          )}
                        </div>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewPlannedDateValue(toIsoDateInput(plannedDate));
                              setIsEditingPlannedDate(true);
                              setTimeout(() => {
                                try {
                                  plannedDateInputRef.current?.focus();
                                  plannedDateInputRef.current?.showPicker?.();
                                } catch {}
                              }, 0);
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-amber-400 hover:text-amber-300 transition shrink-0"
                            title="Edit Planned Delivery Date"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-400 text-[11px] block">Actual Delivered Date:</span>
                          {isSuperAdmin && isEditingActualDate ? (
                            <input
                              ref={actualDateInputRef}
                              type="date"
                              autoFocus
                              aria-label="Actual Delivered Date"
                              value={toIsoDateInput(newActualDateValue || actualDate)}
                              onChange={(e) => {
                                const val = e.target.value;
                                setNewActualDateValue(val);
                                updateProject(liveProject.id, {
                                  actualDeliveredDate: val || undefined,
                                });
                              }}
                              onBlur={() => setIsEditingActualDate(false)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'Escape') {
                                  setIsEditingActualDate(false);
                                }
                              }}
                              className="mt-0.5 w-full bg-slate-800 border border-amber-500/70 rounded px-2 py-0.5 text-emerald-300 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          ) : (
                            <strong
                              onClick={() => {
                                if (isSuperAdmin) {
                                  setNewActualDateValue(toIsoDateInput(actualDate));
                                  setIsEditingActualDate(true);
                                  setTimeout(() => {
                                    try {
                                      actualDateInputRef.current?.focus();
                                      actualDateInputRef.current?.showPicker?.();
                                    } catch {}
                                  }, 0);
                                }
                              }}
                              className={`${actualDate ? 'text-emerald-400 text-xs' : 'text-slate-500 text-xs'} ${
                                isSuperAdmin ? 'cursor-pointer hover:text-amber-300 transition' : ''
                              }`}
                            >
                              {actualDate || 'In Progress'}
                            </strong>
                          )}
                        </div>
                        {isSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewActualDateValue(toIsoDateInput(actualDate));
                              setIsEditingActualDate(true);
                              setTimeout(() => {
                                try {
                                  actualDateInputRef.current?.focus();
                                  actualDateInputRef.current?.showPicker?.();
                                } catch {}
                              }, 0);
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-amber-400 hover:text-amber-300 transition shrink-0"
                            title="Edit Actual Delivered Date"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800">
                        <span className="text-slate-400 text-[11px] block">Schedule Status:</span>
                        <strong className="text-xs text-indigo-300">{varianceInfo.subText}</strong>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Project Description */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    BIM Scope & Engineering Strategy
                  </h4>
                  {isSuperAdmin && !isEditingScope && (
                    <button
                      type="button"
                      onClick={() => {
                        setScopeDraft(liveProject.description || '');
                        setIsEditingScope(true);
                      }}
                      className="p-1 rounded hover:bg-slate-800 text-amber-400 hover:text-amber-300 transition flex items-center gap-1 text-[11px]"
                      title="Edit BIM Scope & Engineering Strategy"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {isSuperAdmin && isEditingScope ? (
                  <div className="space-y-2">
                    <textarea
                      autoFocus
                      rows={4}
                      aria-label="Edit BIM Scope & Engineering Strategy"
                      value={scopeDraft}
                      onChange={(e) => setScopeDraft(e.target.value)}
                      onBlur={commitScope}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setIsEditingScope(false);
                        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          commitScope();
                        }
                      }}
                      className="w-full text-xs text-slate-200 leading-relaxed bg-slate-800/80 p-4 rounded-xl border border-blue-500/70 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                    />
                  </div>
                ) : (
                  <p
                    onClick={() => {
                      if (isSuperAdmin) {
                        setScopeDraft(liveProject.description || '');
                        setIsEditingScope(true);
                      }
                    }}
                    title={isSuperAdmin ? 'Click to edit BIM Scope & Engineering Strategy' : undefined}
                    className={`text-xs text-slate-300 leading-relaxed bg-slate-800/40 p-4 rounded-xl border border-slate-700/50 ${
                      isSuperAdmin ? 'cursor-pointer hover:border-blue-500/50 hover:bg-slate-800/60 transition' : ''
                    }`}
                  >
                    {liveProject.description || 'Click to add BIM scope and engineering strategy...'}
                  </p>
                )}
              </div>

              {/* Disciplines Engaged */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Active BIM Disciplines
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  {(liveProject.disciplines || []).map((disc, discIdx) => {
                    const assignedMemberId =
                      disciplineAssignments[`${liveProject.id}__${disc}`] ||
                      disciplineAssignments[disc] ||
                      liveProject.tasks.find((t) => t.discipline === disc)?.assignedEmployeeId ||
                      '';
                    const availableDisciplineOptions = Array.from(
                      new Set([...PRIMARY_DISCIPLINES, disc])
                    );
                    return (
                      <div
                        key={`${disc}-${discIdx}`}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-2"
                      >
                        {isSuperAdmin ? (
                          <select
                            aria-label={`Change discipline ${disc}`}
                            value={disc}
                            onChange={(e) =>
                              handleProjectDisciplineChange(discIdx, e.target.value as Discipline)
                            }
                            className="bg-slate-900 text-slate-100 text-xs font-semibold rounded px-1.5 py-0.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                          >
                            {availableDisciplineOptions.map((dOpt) => (
                              <option key={dOpt} value={dOpt}>
                                {dOpt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>{disc}</span>
                        )}
                        {isSuperAdmin && employees.length > 0 && (
                          <select
                            aria-label={`Assign specialist for ${disc}`}
                            value={assignedMemberId || ''}
                            onChange={(e) => handleMemberSelect(disc, e.target.value)}
                            className="bg-slate-900 text-slate-200 text-[11px] rounded px-1.5 py-0.5 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                          >
                            <option value="">Unassigned</option>
                            {employees.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {isSuperAdmin && (liveProject.disciplines || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveProjectDiscipline(discIdx)}
                            className="text-slate-400 hover:text-rose-400 transition p-0.5"
                            title={`Remove ${disc}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {isSuperAdmin && (
                    <select
                      aria-label="Add active BIM discipline"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddProjectDiscipline(e.target.value);
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800/70 hover:bg-slate-800 border border-dashed border-slate-600 text-blue-400 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">+ Add Discipline</option>
                      {PRIMARY_DISCIPLINES.filter(
                        (d) => !(liveProject.disciplines || []).includes(d as Discipline)
                      ).map((d) => (
                        <option key={d} value={d} className="bg-slate-900 text-slate-200">
                          {d}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Assigned Specialists */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Engaged BIM Team ({assignedStaff.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {assignedStaff.map((emp) => (
                    <div
                      key={emp.id}
                      className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 flex items-center gap-2.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">{emp.name}</div>
                        <div className="text-[11px] text-slate-400">{emp.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Tasks Tab */}
          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Work Breakdown Tasks & Estimated Hours
                </h4>
                {isSuperAdmin && (
                  <button
                    onClick={() => setShowAddTask(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Task</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {liveProject.tasks.map((task) => {
                  const assignedMemberId =
                    task.assignedEmployeeId ||
                    disciplineAssignments[`${liveProject.id}__${task.discipline}`] ||
                    disciplineAssignments[task.discipline] ||
                    '';
                  const assignee = employees.find((e) => e.id === assignedMemberId);
                  const isTaskOver = task.completedHours > task.estimatedHours;
                  const taskPct = task.estimatedHours > 0
                    ? Math.min(100, Math.round((task.completedHours / task.estimatedHours) * 100))
                    : 0;

                  return (
                    <div
                      key={task.id}
                      className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{task.name}</span>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-semibold border border-slate-700">
                              {task.discipline}
                            </span>
                            <span className="text-indigo-400 font-bold text-[10px]">
                              {task.lod}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>Assigned:</span>
                            {isSuperAdmin && employees.length > 0 ? (
                              <select
                                aria-label={`Assign team member for ${task.name}`}
                                value={assignedMemberId || ''}
                                onChange={(e) =>
                                  handleMemberSelect(task.discipline, e.target.value, task.id)
                                }
                                className="bg-slate-800 text-slate-200 text-[11px] font-semibold rounded px-1.5 py-0.5 border border-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">Unassigned</option>
                                {employees.map((emp) => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <strong className="text-slate-300">{assignee?.name || 'Unassigned'}</strong>
                            )}
                            <span>• Due: {task.dueDate}</span>
                          </div>
                        </div>

                        {isSuperAdmin ? (
                          <select
                            aria-label="Change task status"
                            value={task.status}
                            onChange={(e) =>
                              updateTask(liveProject.id, task.id, {
                                status: e.target.value as TaskItem['status'],
                              })
                            }
                            className="bg-slate-800 text-slate-200 text-xs rounded px-2 py-1 border border-slate-700 cursor-pointer"
                          >
                            <option value="Not Started">Not Started</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Under Review">Under Review</option>
                            <option value="Completed">Completed</option>
                          </select>
                        ) : (
                          <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-700">
                            {task.status}
                          </span>
                        )}
                      </div>

                      <div className="flex justify-between items-center text-[11px] text-slate-400">
                        <span>
                          Hours: <strong className="text-blue-400">{task.completedHours}h</strong> / {task.estimatedHours}h
                        </span>
                        <span className={isTaskOver ? 'text-amber-400 font-semibold' : 'text-slate-300'}>
                          {taskPct}% {isTaskOver && '(Over Budget)'}
                        </span>
                      </div>
                      <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isTaskOver ? 'bg-amber-500' : 'bg-blue-500'}`}
                          style={{ width: `${taskPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add Task Form modal/inline */}
              {showAddTask && (
                <form
                  onSubmit={handleCreateTask}
                  className="bg-slate-800/90 border border-slate-700 p-4 rounded-xl text-xs space-y-3"
                >
                  <h5 className="font-bold text-white">Create New WBS Task</h5>
                  <div>
                    <label className="block text-slate-400 mb-1">Task Title</label>
                    <input
                      type="text"
                      value={taskName}
                      onChange={(e) => setTaskName(e.target.value)}
                      placeholder="e.g., Level 2 Electrical Cable Tray Modeling LOD 350"
                      className="w-full bg-slate-800 text-slate-200 rounded p-2 border border-slate-700"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Discipline</label>
                      <select
                        aria-label="Select Task Discipline"
                        value={taskDiscipline}
                        onChange={(e) => setTaskDiscipline(e.target.value as any)}
                        className="w-full bg-slate-800 text-slate-200 rounded p-1.5 border border-slate-700"
                      >
                        {Array.from(new Set([...(liveProject.disciplines || []), 'AI & Automation'])).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">LOD Stage</label>
                      <select
                        aria-label="Select LOD Stage"
                        value={taskLOD}
                        onChange={(e) => setTaskLOD(e.target.value as any)}
                        className="w-full bg-slate-800 text-slate-200 rounded p-1.5 border border-slate-700"
                      >
                        <option value="LOD 200">LOD 200</option>
                        <option value="LOD 300">LOD 300</option>
                        <option value="LOD 350">LOD 350</option>
                        <option value="LOD 400">LOD 400</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Est. Hours</label>
                      <input
                        type="number"
                        value={taskEstHours}
                        onChange={(e) => setTaskEstHours(Number(e.target.value))}
                        className="w-full bg-slate-800 text-slate-200 rounded p-1.5 border border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Assignee</label>
                      <select
                        aria-label="Select Task Assignee"
                        value={taskAssignee || ''}
                        onChange={(e) => handleMemberSelect(taskDiscipline, e.target.value)}
                        className="w-full bg-slate-800 text-slate-200 rounded p-1.5 border border-slate-700"
                      >
                        {employees.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddTask(false)}
                      className="px-3 py-1.5 rounded bg-slate-800 text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded bg-blue-600 text-white font-semibold"
                    >
                      Save Task
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Milestones Tab */}
          {activeTab === 'milestones' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                BIM LOD Deliverable Milestones
              </h4>
              <div className="space-y-3">
                {liveProject.milestones.map((ms) => (
                  <div
                    key={ms.id}
                    className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h5 className="font-bold text-white text-sm">{ms.title}</h5>
                          <span className="text-indigo-400 font-bold text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30">
                            {ms.lodRequirement}
                          </span>
                        </div>
                        <p className="text-slate-400 mt-1 leading-relaxed">
                          {ms.deliverableDescription}
                        </p>
                      </div>
                      {isSuperAdmin ? (
                        <select
                          aria-label="Change milestone status"
                          value={ms.status}
                          onChange={(e) =>
                            updateMilestoneStatus(
                              liveProject.id,
                              ms.id,
                              e.target.value as Milestone['status']
                            )
                          }
                          className="bg-slate-800 text-slate-200 text-xs rounded px-2.5 py-1 border border-slate-700 cursor-pointer"
                        >
                          <option value="upcoming">Upcoming</option>
                          <option value="in-progress">In Progress</option>
                          <option value="completed">Completed</option>
                          <option value="delayed">Delayed</option>
                        </select>
                      ) : (
                        <span className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-700 capitalize">
                          {ms.status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1 border-t border-slate-700/60">
                      <span>Target Date: <strong className="text-slate-200">{ms.targetDate}</strong></span>
                      {ms.completionDate && (
                        <span className="text-emerald-400">
                          Completed on: {ms.completionDate}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clashes Tab */}
          {activeTab === 'clashes' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Cross-Trade Coordination Clashes ({liveProject.clashes.length})
              </h4>
              <div className="space-y-3">
                {liveProject.clashes.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.severity === 'Critical'
                              ? 'bg-rose-500/20 text-rose-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {c.severity}
                        </span>
                        <span className="font-bold text-slate-200">
                          {c.disciplineA} &times; {c.disciplineB}
                        </span>
                      </div>
                      <span className="text-slate-400 text-[11px]">{c.status}</span>
                    </div>
                    <div className="text-white font-medium">{c.elementRef}</div>
                    <div className="text-slate-400 text-[11px]">{c.locationDescription}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Super Admin Date Override Modal */}
      {isEditingDeliveryDates && isSuperAdmin && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-[60] flex items-center justify-center p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Super Admin Date Override</h3>
                  <p className="text-[11px] text-slate-400">Lock protected field</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingDeliveryDates(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Target Project:</span>
                <strong className="text-white font-semibold text-xs">{liveProject.name}</strong>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block text-[11px] mb-1">
                  Planned Delivery Date:
                </label>
                <input
                  type="text"
                  placeholder="e.g. 18-08-2026 or 2026-08-18"
                  value={newPlannedDateValue}
                  onChange={(e) => setNewPlannedDateValue(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs"
                />
              </div>

              <div>
                <label className="text-slate-300 font-semibold block text-[11px] mb-1">
                  Actual Delivered Date (DD-MM-YYYY or YYYY-MM-DD) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 18-08-2026 or 2026-08-18"
                  value={newActualDateValue}
                  onChange={(e) => setNewActualDateValue(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Leave empty to mark as WIP/In-Progress without delivery timestamp.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setIsEditingDeliveryDates(false)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const trimmedPlanned = newPlannedDateValue.trim();
                  const trimmedActual = newActualDateValue.trim();
                  updateProject(liveProject.id, {
                    plannedDeliveryDate: trimmedPlanned,
                    targetCompletionDate: trimmedPlanned,
                    actualDeliveredDate: trimmedActual || undefined,
                  });
                  setIsEditingDeliveryDates(false);
                }}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold transition flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Date</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
