import React, { useState, useMemo, useEffect } from 'react';
import {
  Star,
  MessageSquare,
  Sparkles,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Building,
  TrendingUp,
  Award,
  ThumbsUp,
  ThumbsDown,
  Calendar,
  User,
  Tag,
  Share2,
  Trash2,
  Edit3,
  SlidersHorizontal,
  ChevronDown,
  ShieldCheck,
  Check,
  ExternalLink,
} from 'lucide-react';
import { useBimData, cleanProjectName } from '../context/BimDataContext';
import { BimProject, ProjectFeedbackItem } from '../types';

interface ProjectFeedbackProps {
  onSelectProject?: (project: BimProject) => void;
}

const INITIAL_FEEDBACKS: ProjectFeedbackItem[] = [];

export const ProjectFeedback: React.FC<ProjectFeedbackProps> = ({ onSelectProject }) => {
  const { projects, theme } = useBimData();
  const isLight = theme === 'light';

  // Feedbacks State with localStorage persistence
  const [feedbacks, setFeedbacks] = useState<ProjectFeedbackItem[]>(() => {
    try {
      localStorage.removeItem('bim_project_feedbacks_v1');
    } catch {}

    const saved = localStorage.getItem('bim_project_feedbacks_v2');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  // Filter States (Two Dropdowns + Search + Rating Filter)
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // New Feedback Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedClientLink, setCopiedClientLink] = useState(false);
  const [formProjectId, setFormProjectId] = useState(projects[0]?.id || 'p1');
  useEffect(() => {
    if (projects.length > 0 && !projects.some((p) => p.id === formProjectId)) {
      setFormProjectId(projects[0].id);
    }
  }, [projects, formProjectId]);
  const [formRating, setFormRating] = useState<number>(5);
  const [formFeedbackText, setFormFeedbackText] = useState('');
  const [formCategory, setFormCategory] = useState<ProjectFeedbackItem['category']>('Quality of BIM Deliverables');
  const [formAuthorName, setFormAuthorName] = useState('');
  const [formAuthorRole, setFormAuthorRole] = useState<ProjectFeedbackItem['authorRole']>('Client Stakeholder');
  const [formSentiment, setFormSentiment] = useState<'positive' | 'neutral' | 'constructive'>('positive');
  const [formTags, setFormTags] = useState('');
  const [formActionItem, setFormActionItem] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Sync feedbacks in real-time across tabs/windows
  useEffect(() => {
    const handleFeedbackSync = () => {
      const saved = localStorage.getItem('bim_project_feedbacks_v1');
      if (saved) {
        try {
          setFeedbacks(JSON.parse(saved));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleFeedbackSync);
    window.addEventListener('bim_feedback_updated', handleFeedbackSync);
    return () => {
      window.removeEventListener('storage', handleFeedbackSync);
      window.removeEventListener('bim_feedback_updated', handleFeedbackSync);
    };
  }, []);

  // Copy Public Client Link to Clipboard
  const handleCopyClientLink = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const publicUrl = `${origin}/feedback`;
    if (navigator?.clipboard) {
      navigator.clipboard
        .writeText(publicUrl)
        .then(() => {
          setCopiedClientLink(true);
          setTimeout(() => setCopiedClientLink(false), 2500);
        })
        .catch(() => {
          fallbackCopy(publicUrl);
        });
    } else {
      fallbackCopy(publicUrl);
    }
  };

  const fallbackCopy = (text: string) => {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedClientLink(true);
      setTimeout(() => setCopiedClientLink(false), 2500);
    } catch (e) {
      console.warn('Copy fallback error:', e);
    }
  };

  // Save to localStorage
  const saveFeedbacks = (items: ProjectFeedbackItem[]) => {
    setFeedbacks(items);
    localStorage.setItem('bim_project_feedbacks_v2', JSON.stringify(items));
    window.dispatchEvent(new Event('bim_feedback_updated'));
    window.dispatchEvent(new Event('storage'));
  };

  // Filtered Feedbacks
  const filteredFeedbacks = useMemo(() => {
    return feedbacks.filter((fb) => {
      const matchesProj = selectedProjectFilter === 'all' || fb.projectId === selectedProjectFilter;
      const matchesCat = selectedCategoryFilter === 'all' || fb.category === selectedCategoryFilter;
      const matchesRating = ratingFilter === 'all' || Math.floor(fb.rating) === ratingFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        fb.projectName.toLowerCase().includes(q) ||
        fb.feedbackText.toLowerCase().includes(q) ||
        fb.authorName.toLowerCase().includes(q) ||
        (fb.tags && fb.tags.some(t => t.toLowerCase().includes(q)));

      return matchesProj && matchesCat && matchesRating && matchesSearch;
    });
  }, [feedbacks, selectedProjectFilter, selectedCategoryFilter, ratingFilter, searchQuery]);

  // Overall Feedback Metrics
  const feedbackMetrics = useMemo(() => {
    const totalCount = feedbacks.length || 1;
    const avgRating = (feedbacks.reduce((sum, f) => sum + f.rating, 0) / totalCount).toFixed(2);
    const fiveStarCount = feedbacks.filter((f) => f.rating >= 4.7).length;
    const actionItemsCount = feedbacks.filter((f) => f.actionItem && f.actionItem.length > 0).length;
    const clientSatisfactionRate = Math.round((feedbacks.filter(f => f.sentiment === 'positive').length / totalCount) * 100);

    // Rating Breakdown (5, 4, 3, 2, 1 stars)
    const distribution = [5, 4, 3, 2, 1].map((stars) => {
      const count = feedbacks.filter((f) => Math.floor(f.rating) === stars).length;
      const pct = Math.round((count / totalCount) * 100);
      return { stars, count, pct };
    });

    return {
      avgRating,
      fiveStarCount,
      actionItemsCount,
      clientSatisfactionRate,
      distribution
    };
  }, [feedbacks]);

  // Handle Form Submit
  const handleAddFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formFeedbackText.trim()) {
      setFormError('Please enter written feedback comments.');
      return;
    }
    if (!formAuthorName.trim()) {
      setFormError('Please provide the feedback author / stakeholder name.');
      return;
    }

    const proj = projects.find((p) => p.id === formProjectId) || projects[0];
    const parsedTags = formTags.split(',').map((t) => t.trim()).filter(Boolean);

    const newItem: ProjectFeedbackItem = {
      id: `fb-${Date.now()}`,
      projectId: proj.id,
      projectName: proj.name,
      clientName: proj.clientName,
      rating: formRating,
      feedbackText: formFeedbackText.trim(),
      category: formCategory,
      authorName: formAuthorName.trim(),
      authorRole: formAuthorRole,
      date: new Date().toISOString().slice(0, 10),
      sentiment: formSentiment,
      status: formActionItem.trim() ? 'Action Item Created' : 'Published',
      tags: parsedTags.length > 0 ? parsedTags : ['Client Feedback', 'BIM Review'],
      actionItem: formActionItem.trim() || undefined
    };

    saveFeedbacks([newItem, ...feedbacks]);
    setShowAddModal(false);
    setFormFeedbackText('');
    setFormAuthorName('');
    setFormTags('');
    setFormActionItem('');
  };

  const handleDeleteFeedback = (id: string) => {
    saveFeedbacks(feedbacks.filter(f => f.id !== id));
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. HEADER & EXECUTIVE SATISFACTION HERO */}
      <div className={`p-5 rounded-2xl border ${
        isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                Project Quality & Client Pulse
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {feedbackMetrics.clientSatisfactionRate}% Client Satisfaction
              </span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight mt-1.5 flex items-center gap-2">
              Project Feedback
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Track client evaluations, QA/QC ratings, delivery feedback, and resolution action items across active BIM projects.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Share Client Link (/feedback) Button */}
            <button
              type="button"
              onClick={handleCopyClientLink}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition cursor-pointer shadow-xs ${
                copiedClientLink
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
              title="Copy client evaluation portal link to clipboard"
            >
              {copiedClientLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied Link!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Share Client Link (/feedback)</span>
                </>
              )}
            </button>

            {/* Preview Portal Button (opens /feedback in new tab) */}
            <a
              href="/feedback"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer shadow-xs"
              title="Open public feedback portal in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
              <span>Preview Portal</span>
            </a>

            {/* Record New Feedback Admin Button */}
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-md transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Record New Feedback</span>
            </button>
          </div>
        </div>

        {/* 4 Top KPI Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-5 pt-5 border-t border-slate-800">
          <div className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Overall Portfolio Rating
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <div className="text-2xl font-bold text-amber-400 font-mono flex items-center gap-1.5">
                <span>{feedbackMetrics.avgRating}</span>
                <span className="text-xs font-normal text-slate-400">/ 5.0</span>
              </div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">From {feedbacks.length} verified stakeholder audits</p>
          </div>

          <div className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Top Tier Ratings (&ge; 4.7★)
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <div className="text-2xl font-bold text-white font-mono">
                {feedbackMetrics.fiveStarCount}
              </div>
              <Award className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div
                className="bg-emerald-500 h-full rounded-full"
                style={{ width: `${Math.round((feedbackMetrics.fiveStarCount / Math.max(1, feedbacks.length)) * 100)}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Positive Sentiment
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <div className="text-2xl font-bold text-emerald-400 font-mono">
                {feedbackMetrics.clientSatisfactionRate}%
              </div>
              <ThumbsUp className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Client approval index</p>
          </div>

          <div className="p-3.5 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Active Action Items
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <div className="text-2xl font-bold text-blue-400 font-mono">
                {feedbackMetrics.actionItemsCount}
              </div>
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Follow-up continuous improvements</p>
          </div>
        </div>
      </div>

      {/* 2. DEDICATED SEARCH & 2-DROPDOWN FILTER TOOLBAR */}
      <div className={`p-4 rounded-xl border flex flex-col lg:flex-row items-center justify-between gap-3 ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
      }`}>
        {/* Search */}
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search feedback comments, author, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 text-slate-200 text-xs rounded-lg pl-9 pr-3 py-2 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-slate-500"
          />
        </div>

        {/* Filter Controls (Project Dropdown + Category Dropdown + Star Rating Filter) */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto justify-end text-xs">
          {/* Dropdown 1: Project Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
            <Building className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedProjectFilter}
              onChange={(e) => setSelectedProjectFilter(e.target.value)}
              className="bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All Projects ({projects.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900">
                  {cleanProjectName(p.name)}
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown 2: Category Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All Feedback Categories</option>
              <option value="Quality of BIM Deliverables" className="bg-slate-900">Quality of BIM Deliverables</option>
              <option value="Clash Resolution & Coordination" className="bg-slate-900">Clash Resolution & Coordination</option>
              <option value="Delivery Speed & Milestones" className="bg-slate-900">Delivery Speed & Milestones</option>
              <option value="Communication & Responsiveness" className="bg-slate-900">Communication & Responsiveness</option>
              <option value="General Client Satisfaction" className="bg-slate-900">General Client Satisfaction</option>
            </select>
          </div>

          {/* Star Filter Pill Buttons */}
          <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 px-1.5 font-semibold uppercase">Rating:</span>
            <button
              onClick={() => setRatingFilter('all')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                ratingFilter === 'all' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            {[5, 4, 3].map((stars) => (
              <button
                key={stars}
                onClick={() => setRatingFilter(stars)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition flex items-center gap-0.5 ${
                  ratingFilter === stars ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{stars}</span>
                <Star className="w-2.5 h-2.5 fill-current" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. FEEDBACK CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredFeedbacks.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-slate-900/50 border border-slate-800 rounded-2xl">
            <MessageSquare className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-400">No project feedback entries found.</p>
            <p className="text-xs text-slate-500 mt-1">Adjust filters or click "Record New Feedback" to add one.</p>
          </div>
        ) : (
          filteredFeedbacks.map((fb) => (
            <div
              key={fb.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4.5 flex flex-col justify-between space-y-3.5 shadow-sm transition hover:shadow-md group"
            >
              {/* Card Header: Project Name & Star Rating */}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block truncate max-w-[200px]">
                      {fb.projectName}
                    </span>
                    <h3 className="text-xs font-bold text-white mt-0.5">
                      {fb.category}
                    </h3>
                  </div>

                  {/* Rating Stars Badge */}
                  <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-md shrink-0">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-mono text-xs font-bold text-amber-400">
                      {fb.rating.toFixed(1)}
                    </span>
                  </div>
                </div>

                {/* Feedback Text Quote */}
                <p className="text-xs text-slate-300 mt-3 leading-relaxed bg-slate-800/40 p-3 rounded-lg border border-slate-800/80 italic">
                  "{fb.feedbackText}"
                </p>
              </div>

              {/* Action Item if available */}
              {fb.actionItem && (
                <div className="p-2.5 bg-blue-950/30 border border-blue-800/40 rounded-lg text-xs">
                  <div className="flex items-center gap-1.5 text-blue-300 font-semibold text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Follow-Up Action Item:</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1">{fb.actionItem}</p>
                </div>
              )}

              {/* Tags */}
              {fb.tags && fb.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {fb.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700/60"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Footer: Author & Date & Delete action */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-800 text-amber-400 flex items-center justify-center font-bold text-[10px] border border-slate-700">
                    {fb.authorName[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200 text-[11px]">{fb.authorName}</div>
                    <div className="text-[10px] text-slate-500">{fb.authorRole} • {fb.date}</div>
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteFeedback(fb.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition"
                  title="Delete feedback"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* RECORD NEW FEEDBACK MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full text-slate-100 shadow-2xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Record Project Feedback</h3>
                  <p className="text-xs text-slate-400">Log stakeholder satisfaction & continuous improvement notes.</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddFeedback} className="p-6 space-y-4 text-xs">
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {cleanProjectName(p.name)}
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
                      className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    />
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setFormRating(star)}
                          className="text-amber-400 hover:scale-110 transition"
                        >
                          <Star
                            className={`w-5 h-5 ${star <= formRating ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`}
                          />
                        </button>
                      ))}
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Feedback</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
