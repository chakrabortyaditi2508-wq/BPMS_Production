import React, { useState } from 'react';
import {
  Star,
  CheckCircle2,
  AlertCircle,
  Check,
  Building2,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useBimData } from '../context/BimDataContext';
import { INITIAL_PROJECTS } from '../data/mockData';
import { ProjectFeedbackItem } from '../types';
import { db } from '../firebase/config';
import { doc, setDoc } from 'firebase/firestore';

export const PublicClientFeedback: React.FC = () => {
  let contextProjects: any[] = [];
  try {
    const bimData = useBimData();
    if (bimData?.projects && bimData.projects.length > 0) {
      contextProjects = bimData.projects;
    }
  } catch {
    // fallback if context not loaded
  }

  const projects = contextProjects.length > 0 ? contextProjects : INITIAL_PROJECTS;

  // Form State
  const [formProjectId, setFormProjectId] = useState<string>(projects[0]?.id || 'p1');
  const [formRating, setFormRating] = useState<number>(5.0);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [formCategory, setFormCategory] = useState<ProjectFeedbackItem['category']>(
    'Quality of BIM Deliverables'
  );
  const [formSentiment, setFormSentiment] = useState<'positive' | 'neutral' | 'constructive'>(
    'positive'
  );
  const [formAuthorName, setFormAuthorName] = useState<string>('');
  const [formAuthorRole, setFormAuthorRole] = useState<ProjectFeedbackItem['authorRole']>(
    'Client Stakeholder'
  );
  const [formFeedbackText, setFormFeedbackText] = useState<string>('');
  const [formActionItem, setFormActionItem] = useState<string>('');
  const [formTags, setFormTags] = useState<string>('');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [submittedData, setSubmittedData] = useState<ProjectFeedbackItem | null>(null);

  const selectedProject = projects.find((p) => p.id === formProjectId) || projects[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formFeedbackText.trim()) {
      setFormError('Please enter written feedback comments.');
      return;
    }

    if (!formAuthorName.trim()) {
      setFormError('Please provide your name or organization.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    const newFeedback: ProjectFeedbackItem = {
      id: `fb-${Date.now()}`,
      projectId: selectedProject?.id || 'p1',
      projectName: selectedProject?.name || 'BIM Project',
      clientName: selectedProject?.clientName || 'Client Stakeholder',
      rating: formRating,
      feedbackText: formFeedbackText.trim(),
      category: formCategory,
      authorName: formAuthorName.trim(),
      authorRole: formAuthorRole,
      date: new Date().toISOString().split('T')[0],
      sentiment: formSentiment,
      status: 'Published',
      tags: formTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      actionItem: formActionItem.trim() || undefined,
    };

    // 1. Persist to localStorage
    try {
      const savedRaw = localStorage.getItem('bim_project_feedbacks_v1');
      const currentList: ProjectFeedbackItem[] = savedRaw ? JSON.parse(savedRaw) : [];
      const updatedList = [newFeedback, ...currentList];
      localStorage.setItem('bim_project_feedbacks_v1', JSON.stringify(updatedList));
      window.dispatchEvent(new Event('bim_feedback_updated'));
      window.dispatchEvent(new Event('storage'));
    } catch (e) {
      console.warn('LocalStorage error saving feedback:', e);
    }

    // 2. Persist to Firestore if available
    try {
      const docRef = doc(db, 'project_feedbacks', newFeedback.id);
      setDoc(docRef, newFeedback).catch(() => {});
    } catch {
      // ignore
    }

    // Confetti celebration
    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
      });
    } catch {
      // ignore
    }

    setIsSubmitting(false);
    setSubmittedData(newFeedback);
    setIsSubmitted(true);
  };

  const handleResetForAnother = () => {
    setFormFeedbackText('');
    setFormActionItem('');
    setFormTags('');
    setFormRating(5.0);
    setFormError(null);
    setIsSubmitted(false);
    setSubmittedData(null);
  };

  return (
    <div className="min-h-screen bg-[#060a17] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[34rem] h-[34rem] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Branding Header */}
      <div className="mb-6 flex items-center gap-3 relative z-10 text-center sm:text-left">
        <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center text-slate-950 font-bold shadow-lg shadow-amber-400/30 shrink-0">
          <Star className="w-5 h-5 fill-slate-950 text-slate-950" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            ProductionPulse BPMS
          </h1>
          <p className="text-xs text-slate-400">
            Public Stakeholder Evaluation & Client Feedback Portal
          </p>
        </div>
      </div>

      {/* Main Standalone Card */}
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden relative z-10 backdrop-blur-xl">
        {/* Card Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Record Project Feedback</h2>
              <p className="text-xs text-slate-400">
                Log stakeholder satisfaction & continuous improvement notes.
              </p>
            </div>
          </div>
          {/* Stripped UI: No Cancel or close buttons here */}
        </div>

        {/* Card Body */}
        {isSubmitted ? (
          /* Post-Submission Confirmation Message */
          <div className="p-8 sm:p-10 text-center space-y-6 animate-in fade-in duration-300">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20">
              <CheckCircle2 className="w-9 h-9 text-emerald-400" />
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-white tracking-tight">
                Thank You! Your feedback has been logged
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                Your evaluation for{' '}
                <strong className="text-slate-200">
                  {submittedData?.projectName || 'the BIM Project'}
                </strong>{' '}
                has been successfully transmitted to the project coordination team. We appreciate
                your valuable feedback in maintaining exceptional model accuracy and ISO 19650
                compliance.
              </p>
            </div>

            {/* Submission Summary Card */}
            {submittedData && (
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-left space-y-2 text-xs max-w-md mx-auto">
                <div className="flex justify-between items-center text-slate-400 pb-2 border-b border-slate-800/80">
                  <span>Rating Awarded:</span>
                  <div className="flex items-center gap-1 font-bold text-amber-400">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{submittedData.rating.toFixed(1)} / 5.0</span>
                  </div>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Author / Reviewer:</span>
                  <span className="text-slate-200 font-medium">
                    {submittedData.authorName} ({submittedData.authorRole})
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Evaluation Scope:</span>
                  <span className="text-slate-200 font-medium">{submittedData.category}</span>
                </div>
                <div className="pt-2 text-slate-300 italic text-[11px] line-clamp-2">
                  "{submittedData.feedbackText}"
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={handleResetForAnother}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition cursor-pointer shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Submit Another Feedback</span>
              </button>
            </div>
          </div>
        ) : (
          /* Feedback Entry Form */
          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
            {formError && (
              <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Project & Rating Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  BIM Project *
                </label>
                <select
                  value={formProjectId}
                  onChange={(e) => setFormProjectId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Star Rating (1.0 to 5.0) *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={5}
                    step={0.1}
                    value={formRating}
                    onChange={(e) => setFormRating(parseFloat(e.target.value) || 5)}
                    className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isFilled = (hoverRating !== null ? hoverRating : formRating) >= star;
                      return (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(null)}
                          onClick={() => setFormRating(star)}
                          className="text-amber-400 hover:scale-110 transition p-0.5 cursor-pointer"
                          title={`${star} Star`}
                        >
                          <Star
                            className={`w-5 h-5 ${
                              isFilled
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-600'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Category & Sentiment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Feedback Category *
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="Quality of BIM Deliverables">Quality of BIM Deliverables</option>
                  <option value="Clash Resolution & Coordination">Clash Resolution & Coordination</option>
                  <option value="Delivery Speed & Milestones">Delivery Speed & Milestones</option>
                  <option value="Communication & Responsiveness">Communication & Responsiveness</option>
                  <option value="General Client Satisfaction">General Client Satisfaction</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Sentiment
                </label>
                <select
                  value={formSentiment}
                  onChange={(e) => setFormSentiment(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="positive">Positive / Commendation</option>
                  <option value="neutral">Neutral / Informational</option>
                  <option value="constructive">Constructive / Improvement Area</option>
                </select>
              </div>
            </div>

            {/* Author & Role */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Stakeholder / Author Name *
                </label>
                <input
                  type="text"
                  value={formAuthorName}
                  onChange={(e) => setFormAuthorName(e.target.value)}
                  placeholder="e.g. Julian Thorne"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Author Role *
                </label>
                <select
                  value={formAuthorRole}
                  onChange={(e) => setFormAuthorRole(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="Client Stakeholder">Client Stakeholder</option>
                  <option value="BIM Lead Reviewer">BIM Lead Reviewer</option>
                  <option value="Principal Architect">Principal Architect</option>
                  <option value="General Contractor">General Contractor</option>
                  <option value="QA/QC Auditor">QA/QC Auditor</option>
                </select>
              </div>
            </div>

            {/* Feedback Text Area */}
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Written Feedback & Comments *
              </label>
              <textarea
                rows={3}
                value={formFeedbackText}
                onChange={(e) => setFormFeedbackText(e.target.value)}
                placeholder="Enter detailed evaluation regarding model quality, clash turnaround, sheet clarity..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>

            {/* Action Item & Tags */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Follow-Up Action Item (Optional)
                </label>
                <input
                  type="text"
                  value={formActionItem}
                  onChange={(e) => setFormActionItem(e.target.value)}
                  placeholder="e.g. Reconcile Level 2 riser drawings"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Tags (Comma separated)
                </label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="e.g. LOD 350, Navisworks, HVAC"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Form Footer: Stripped of Cancel button, shows only Save Feedback */}
            <div className="flex items-center justify-end pt-3 border-t border-slate-800">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-bold transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-400/25 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>{isSubmitting ? 'Saving Feedback...' : '✓ Save Feedback'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Card Footer Assurance */}
        <div className="px-6 py-3 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            ISO 19650 Quality Protocols
          </span>
          <span>Verified Client Evaluation</span>
        </div>
      </div>
    </div>
  );
};
