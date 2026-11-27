import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Monitor,
  Pencil,
  Plus,
  Projector,
  RefreshCw,
  RotateCcw,
  Settings2,
  Smartphone,
  Tablet,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Participant, PullResult, RaffleSettings, ThemeId } from '../types/raffle';
import {
  DuplicateStrategy,
  downloadTextFile,
  exportWinnersCsv,
  generateSampleCsv,
  mergeImportedParticipants,
  parseParticipantsCsv,
  parseSessionBackupJson,
} from '../utils/csv';
import { createId } from '../utils/rng';
import { DEFAULT_SETTINGS, THEME_CONFIG } from '../data/defaults';
import { ClimbDurationInput } from './ClimbDurationInput';
import { isSupabaseConfigured } from '../utils/supabaseClient';
import {
  fetchRegistrations,
  mergeRegistrationsIntoParticipants,
} from '../utils/registrationService';

interface ManageModalProps {
  isOpen: boolean;
  embedded?: boolean;
  initialTab?: 'participants' | 'history' | 'settings';
  onClose: () => void;
  participants: Participant[];
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
  history: PullResult[];
  setHistory: React.Dispatch<React.SetStateAction<PullResult[]>>;
  settings: RaffleSettings;
  setSettings: React.Dispatch<React.SetStateAction<RaffleSettings>>;
  onResetDemo: () => void;
  onPlayClick: () => void;
}

export const ManageModal: React.FC<ManageModalProps> = ({
  isOpen,
  embedded = false,
  initialTab = 'participants',
  onClose,
  participants,
  setParticipants,
  history,
  setHistory,
  settings,
  setSettings,
  onResetDemo,
  onPlayClick,
}) => {
  const [activeTab, setActiveTab] = useState<'participants' | 'history' | 'settings'>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Manual single rappeller entry state
  const [manualName, setManualName] = useState('');
  const [manualDept, setManualDept] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualWeight, setManualWeight] = useState(1);

  // Bulk paste (default open for rapid party guest lists) & CSV duplicate handling
  const [bulkText, setBulkText] = useState('');
  const [showBulkBox, setShowBulkBox] = useState(true);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [replaceOnCsv, setReplaceOnCsv] = useState(false);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>('skip');
  const participantsRef = useRef(participants);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  // Inline rappeller editing & paginated display for 100-500+ attendees
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editWeight, setEditWeight] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(100);

  // 2-step confirmation for destructive actions
  const [pendingConfirm, setPendingConfirm] = useState<
    'clear_roster' | 'clear_history' | 'reset_demo' | null
  >(null);

  const [backupFeedback, setBackupFeedback] = useState<string | null>(null);
  const [cloudSyncFeedback, setCloudSyncFeedback] = useState<string | null>(null);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!pendingConfirm) return;
    const timer = window.setTimeout(() => setPendingConfirm(null), 4000);
    return () => window.clearTimeout(timer);
  }, [pendingConfirm]);

  useEffect(() => {
    if (!isOpen || embedded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (editingParticipantId) {
        setEditingParticipantId(null);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, embedded, editingParticipantId, onClose]);

  const bulkLineCount = useMemo(
    () =>
      bulkText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean).length,
    [bulkText]
  );

  if (!isOpen && !embedded) return null;

  const handleAddSingleParticipant = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualName.trim();
    if (!trimmed) return;
    onPlayClick();

    const newEntry: Participant = {
      id: createId(),
      name: trimmed,
      department: manualDept.trim() || undefined,
      title: manualTitle.trim() || undefined,
      weight: Math.max(1, Math.min(100, Number(manualWeight) || 1)),
      active: true,
    };

    const outcome = mergeImportedParticipants(participants, [newEntry], duplicateStrategy, false);
    setParticipants(outcome.merged);
    setManualName('');
    setManualDept('');
    setManualTitle('');
    setManualWeight(1);

    if (outcome.mergedCount > 0) {
      setImportFeedback(`Merged tickets into existing rappeller "${newEntry.name}".`);
    } else if (outcome.skippedCount > 0) {
      setImportFeedback(`Skipped "${newEntry.name}" (duplicate name already in roster).`);
    } else {
      setImportFeedback(`Added "${newEntry.name}" to the rappellers list.`);
    }
  };

  const handleBulkAdd = () => {
    if (!bulkText.trim()) return;
    onPlayClick();
    const { participants: parsed } = parseParticipantsCsv(bulkText);
    if (parsed.length === 0) return;

    const outcome = mergeImportedParticipants(participants, parsed, duplicateStrategy, false);
    setParticipants(outcome.merged);
    setBulkText('');
    setImportFeedback(
      `Bulk paste: ${outcome.addedCount} added, ${outcome.mergedCount} merged, ${outcome.skippedCount} duplicate(s) skipped.`
    );
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const strategy = duplicateStrategy;
    const replace = replaceOnCsv;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result ?? '');
      const { participants: imported, skippedRows } = parseParticipantsCsv(text);
      if (imported.length === 0) {
        setImportFeedback('No valid names found in CSV file.');
        return;
      }
      onPlayClick();
      const outcome = mergeImportedParticipants(
        participantsRef.current,
        imported,
        strategy,
        replace
      );
      setParticipants(outcome.merged);
      setImportFeedback(
        `${replace ? 'Replaced roster' : 'Imported'} from "${file.name}": ${
          outcome.addedCount
        } added, ${outcome.mergedCount} merged, ${outcome.skippedCount} duplicates skipped${
          skippedRows > 0 ? `, ${skippedRows} blank rows ignored` : ''
        }.`
      );
    };
    reader.onerror = () => {
      console.warn('[csv] File read failed:', reader.error);
      setImportFeedback('Failed to read the CSV file. Please check file permissions and try again.');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleBackupImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result ?? '');
      const res = parseSessionBackupJson(text);
      if (!res.ok) {
        setBackupFeedback(res.error);
        return;
      }
      onPlayClick();
      setParticipants(res.data.participants);
      setHistory(res.data.history);
      if (res.data.settings) {
        setSettings((prev) => ({
          ...DEFAULT_SETTINGS,
          ...prev,
          ...res.data.settings,
        }));
      }
      setBackupFeedback(
        `Restored backup "${file.name}": ${res.data.participants.length} rappellers, ${res.data.history.length} winners.`
      );
    };
    reader.onerror = () => {
      console.warn('[backup] File read failed:', reader.error);
      setBackupFeedback('Failed to read the backup file. Please try again.');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const startEditParticipant = (p: Participant) => {
    onPlayClick();
    setEditingParticipantId(p.id);
    setEditName(p.name);
    setEditDept(p.department ?? '');
    setEditTitle(p.title ?? '');
    setEditWeight(p.weight);
  };

  const saveEditParticipant = (id: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    onPlayClick();
    setParticipants((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              name: trimmed,
              department: editDept.trim() || undefined,
              title: editTitle.trim() || undefined,
              weight: Math.max(1, Math.min(100, Number(editWeight) || 1)),
            }
          : item
      )
    );
    setEditingParticipantId(null);
  };

  const handleToggleHistoryStatus = (pull: PullResult) => {
    onPlayClick();
    const nextStatus = pull.status === 'won' ? 'absent' : 'won';
    setHistory((prev) =>
      prev.map((item) => (item.id === pull.id ? { ...item, status: nextStatus } : item))
    );
  };

  const handleThemeSwitch = (theme: ThemeId) => {
    onPlayClick();
    const preset = THEME_CONFIG[theme];
    setSettings((prev) => ({
      ...prev,
      theme,
      eventTitle:
        prev.eventTitle === THEME_CONFIG[prev.theme].defaultTitle
          ? preset.defaultTitle
          : prev.eventTitle,
      eventSubtitle:
        prev.eventSubtitle === THEME_CONFIG[prev.theme].defaultSubtitle
          ? preset.defaultSubtitle
          : prev.eventSubtitle,
    }));
  };

  const openDualWindow = (mode: 'controller' | 'projector') => {
    onPlayClick();
    const url = new URL(window.location.href);
    url.searchParams.set('view', mode);
    if (mode === 'controller') {
      window.open(url.toString(), 'CelestiaHostController', 'width=1140,height=840');
    } else {
      window.open(url.toString(), 'CelestiaProjector', 'noopener');
    }
  };

  const filteredParticipants = participants.filter((p) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.department ?? '').toLowerCase().includes(q) ||
      (p.title ?? '').toLowerCase().includes(q)
    );
  });

  const shownParticipants = filteredParticipants.slice(0, visibleLimit);
  const activeCount = participants.filter((p) => p.active).length;
  const hasNonUnitWeights = participants.some((p) => p.weight !== 1);

  const shellContent = (
    <div
      className={
        embedded
          ? 'w-full flex flex-col rounded-2xl border border-[#d3bc8e]/35 bg-[#0e1529]/95 text-slate-100 shadow-xl overflow-hidden'
          : 'relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border border-[#d3bc8e]/45 bg-[#0e1529]/95 text-slate-100 shadow-[0_0_80px_rgba(8,12,26,0.85)] overflow-hidden'
      }
    >
      {!embedded && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#d63f22]/35 bg-gradient-to-r from-[#18355e] via-[#0e1f38] to-[#18355e]">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="font-display text-lg md:text-xl font-bold tracking-wide text-[#f4ebd9]">
                Paskong Vonotec — Rappellers & Race Control
              </h2>
              <p className="text-xs text-amber-200/90 font-medium">
                Standing Tall Together: A Christmas of Gratitude • Upload CSV rosters, manage attendees, or tune drama
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onPlayClick();
              onClose();
            }}
            aria-label="Close modal"
            className="w-9 h-9 rounded-full border border-slate-600/60 bg-slate-800/70 hover:bg-slate-700 flex items-center justify-center text-slate-200 cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 px-6 py-3 bg-[#0a1020] border-b border-slate-800">
        {[
          {
            id: 'participants',
            label: `Rappellers (${activeCount}/${participants.length})`,
            icon: Users,
          },
          { id: 'history', label: `Winners Log (${history.length})`, icon: CheckCircle2 },
          { id: 'settings', label: 'Theme & Race Rules', icon: Settings2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                onPlayClick();
                setActiveTab(tab.id as typeof activeTab);
                setPendingConfirm(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                isActive
                  ? 'bg-[#ece5d8] text-[#2b3245] shadow-[0_0_20px_rgba(211,188,142,0.4)] font-semibold'
                  : 'bg-slate-800/60 text-slate-200 hover:bg-slate-800 border border-slate-700/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* TAB 1: RAPPELLERS (BULK PASTE + MANUAL + CSV + PAGINATED LIST) */}
        {activeTab === 'participants' && (
          <div className="space-y-6">
            {importFeedback && (
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-emerald-100 text-sm">
                <span>{importFeedback}</span>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={() => setImportFeedback(null)}
                  className="text-emerald-200 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Bulk Paste Hundreds of Rappellers / Single Add */}
              <form
                onSubmit={handleAddSingleParticipant}
                className="lg:col-span-7 p-4 rounded-xl bg-slate-900/80 border border-slate-700/70 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-200 flex items-center gap-2">
                    <UserPlus className="w-4 h-4" />{' '}
                    {showBulkBox ? 'Bulk Paste Party Rappellers' : 'Add Single Rappeller'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowBulkBox((v) => !v)}
                    className="text-xs text-amber-300 hover:text-amber-200 underline cursor-pointer"
                  >
                    {showBulkBox ? 'Switch to Single Form' : 'Switch to Bulk Paste (100+ Names)'}
                  </button>
                </div>

                {!showBulkBox ? (
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-5">
                      <label className="block text-xs text-slate-300 mb-1">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        placeholder="e.g. Aria Winterbourne"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs text-slate-300 mb-1">Dept / Group</label>
                      <input
                        type="text"
                        value={manualDept}
                        onChange={(e) => setManualDept(e.target.value)}
                        placeholder="Engineering"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        className="block text-xs text-slate-300 mb-1"
                        title="1 = equal chance; higher adds a small stamina boost"
                      >
                        Tickets
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={manualWeight}
                        onChange={(e) => setManualWeight(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-end">
                      <button
                        type="submit"
                        className="w-full py-2 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm flex items-center justify-center gap-1 cursor-pointer transition"
                      >
                        <Plus className="w-4 h-4" /> Add
                      </button>
                    </div>
                    <div className="sm:col-span-12">
                      <label className="block text-xs text-slate-300 mb-1">
                        Optional Title / Role
                      </label>
                      <input
                        type="text"
                        value={manualTitle}
                        onChange={(e) => setManualTitle(e.target.value)}
                        placeholder="e.g. VIP Guest / Team Lead"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-300">
                      Paste hundreds of party names at once (one per line, or{' '}
                      <code className="text-amber-200">Name, Department, Title</code>):
                    </p>
                    <textarea
                      rows={5}
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      placeholder={`Aria Winterbourne\nLucas Vance, Engineering\nSophia Reyes, Marketing, Team Lead\nMarcus Chen`}
                      className="w-full p-3 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white font-mono focus:outline-none focus:border-amber-400"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-400">
                        {bulkLineCount > 0
                          ? `Ready to import ${bulkLineCount} line${bulkLineCount === 1 ? '' : 's'}`
                          : 'Paste a guest list from Excel, Sheets, or Slack'}
                      </span>
                      <button
                        type="button"
                        disabled={bulkLineCount === 0}
                        onClick={handleBulkAdd}
                        className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-45 text-slate-950 font-semibold text-sm cursor-pointer transition"
                      >
                        Add {bulkLineCount > 0 ? `${bulkLineCount} Rappellers` : 'All Lines'}
                      </button>
                    </div>
                  </div>
                )}
              </form>

              {/* CSV Import, Duplicate Strategy & Template */}
              <div className="lg:col-span-5 p-4 rounded-xl bg-slate-900/80 border border-slate-700/70 flex flex-col justify-between space-y-3">
                <div className="space-y-2.5">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-sky-300 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> CSV Import (100s Ready)
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Auto-detects <code className="text-amber-200">Name</code>,{' '}
                    <code className="text-amber-200">Department</code>, and{' '}
                    <code className="text-amber-200">Title</code> columns, or plain 1-column lists.
                  </p>

                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">
                      On Duplicate Names
                    </label>
                    <select
                      aria-label="Duplicate Name Handling"
                      value={duplicateStrategy}
                      onChange={(e) => setDuplicateStrategy(e.target.value as DuplicateStrategy)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-amber-100 focus:outline-none focus:border-amber-400"
                    >
                      <option value="skip">Skip Duplicates (Recommended)</option>
                      <option value="merge_tickets">Merge Duplicates</option>
                      <option value="allow">Allow Duplicate Names</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-200 pt-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={replaceOnCsv}
                      onChange={(e) => setReplaceOnCsv(e.target.checked)}
                      className="rounded border-slate-600 accent-amber-400"
                    />
                    Replace existing rappellers on CSV upload
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    onChange={handleCsvFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <Upload className="w-4 h-4" /> Upload CSV
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadTextFile('rappellers_template.csv', generateSampleCsv())
                    }
                    className="py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Download className="w-3.5 h-3.5" /> Sample CSV
                  </button>
                </div>
              </div>
            </div>

            {/* Roster Toolbar & Paginated Table */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setVisibleLimit(100);
                    }}
                    placeholder="Filter rappellers by name or group..."
                    className="px-3.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white w-64 focus:outline-none focus:border-amber-400"
                  />
                  <span className="text-xs text-slate-300">
                    Active: <strong className="text-amber-300">{activeCount}</strong> /{' '}
                    {participants.length} rappellers
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {hasNonUnitWeights && (
                    <button
                      type="button"
                      onClick={() => {
                        onPlayClick();
                        setParticipants((prev) => prev.map((p) => ({ ...p, weight: 1 })));
                        setImportFeedback('Equalized all rappellers to 1× ticket weight.');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-xs font-semibold text-amber-200 border border-amber-400/45 cursor-pointer transition"
                    >
                      Equalize All to 1×
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onPlayClick();
                      setParticipants((prev) => prev.map((p) => ({ ...p, active: true })));
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 cursor-pointer transition"
                  >
                    Re-enable All Rappellers
                  </button>

                  {pendingConfirm === 'clear_roster' ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onPlayClick();
                          setParticipants([]);
                          setPendingConfirm(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white cursor-pointer transition"
                      >
                        Confirm Clear All
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingConfirm(null)}
                        className="px-2 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-200 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={participants.length === 0}
                      onClick={() => {
                        onPlayClick();
                        setPendingConfirm('clear_roster');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900/80 disabled:opacity-40 text-xs text-rose-200 border border-rose-500/30 cursor-pointer transition"
                    >
                      Clear Roster
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden max-h-80 overflow-y-auto">
                {filteredParticipants.length === 0 ? (
                  <div className="p-8 text-center text-slate-300 text-sm">
                    No rappellers found. Paste names or upload a CSV file above.
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900 text-xs uppercase text-slate-300 sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-4">Rappeller</th>
                        <th className="py-2.5 px-4">Dept / Title</th>
                        <th className="py-2.5 px-3 text-center">Tickets</th>
                        <th className="py-2.5 px-4 text-center">Status</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {shownParticipants.map((p) => {
                        const isEditing = editingParticipantId === p.id;
                        return (
                          <tr key={p.id} className="hover:bg-slate-900/50">
                            <td className="py-2 px-4 font-medium text-white">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-slate-900 border border-amber-400/60 text-sm text-white"
                                />
                              ) : (
                                p.name
                              )}
                            </td>
                            <td className="py-2 px-4 text-xs text-slate-300">
                              {isEditing ? (
                                <div className="flex gap-1.5">
                                  <input
                                    type="text"
                                    value={editDept}
                                    onChange={(e) => setEditDept(e.target.value)}
                                    placeholder="Department"
                                    className="w-1/2 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                                  />
                                  <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    placeholder="Title"
                                    className="w-1/2 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                                  />
                                </div>
                              ) : (
                                <>
                                  {p.department && <span>{p.department}</span>}
                                  {p.department && p.title && (
                                    <span className="text-slate-500"> • </span>
                                  )}
                                  {p.title && <span className="text-amber-200/80">{p.title}</span>}
                                  {!p.department && !p.title && (
                                    <span className="text-slate-500">—</span>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {isEditing ? (
                                <input
                                  type="number"
                                  aria-label={`Tickets for ${p.name}`}
                                  min={1}
                                  max={100}
                                  value={editWeight}
                                  onChange={(e) => setEditWeight(Number(e.target.value))}
                                  className="w-14 px-2 py-0.5 rounded bg-slate-900 border border-amber-400/60 text-xs text-center text-white"
                                />
                              ) : (
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-semibold tabular-nums ${
                                    p.weight > 1
                                      ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                                      : 'text-slate-300'
                                  }`}
                                >
                                  {p.weight}×
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-4 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setParticipants((prev) =>
                                    prev.map((item) =>
                                      item.id === p.id ? { ...item, active: !item.active } : item
                                    )
                                  )
                                }
                                className={`px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                                  p.active
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                                }`}
                              >
                                {p.active ? 'Ready' : 'Won / Out'}
                              </button>
                            </td>
                            <td className="py-2 px-4 text-right whitespace-nowrap space-x-1">
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => saveEditParticipant(p.id)}
                                    aria-label={`Save ${p.name}`}
                                    className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingParticipantId(null)}
                                    aria-label="Cancel edit"
                                    className="p-1 text-slate-400 hover:text-white cursor-pointer"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startEditParticipant(p)}
                                    aria-label={`Edit ${p.name}`}
                                    className="p-1 text-slate-400 hover:text-amber-300 cursor-pointer"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setParticipants((prev) =>
                                        prev.filter((item) => item.id !== p.id)
                                      )
                                    }
                                    aria-label={`Remove ${p.name}`}
                                    className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {filteredParticipants.length > shownParticipants.length && (
                <div className="flex items-center justify-center gap-3 pt-1">
                  <span className="text-xs text-slate-400">
                    Showing {shownParticipants.length} of {filteredParticipants.length} rappellers
                  </span>
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((v) => v + 100)}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-amber-200 cursor-pointer"
                  >
                    Show 100 More
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibleLimit(filteredParticipants.length)}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
                  >
                    Show All
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: WINNERS LOG */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-200">
                Total Rooftop Winners: <strong className="text-amber-300">{history.length}</strong>
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={history.length === 0}
                  onClick={() =>
                    downloadTextFile(
                      `rappeller-winners-${new Date().toISOString().slice(0, 10)}.csv`,
                      exportWinnersCsv(history)
                    )
                  }
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Download className="w-4 h-4" /> Export Winners CSV
                </button>

                {pendingConfirm === 'clear_history' ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onPlayClick();
                        setHistory([]);
                        setPendingConfirm(null);
                      }}
                      className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white cursor-pointer transition"
                    >
                      Confirm Clear Log
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingConfirm(null)}
                      className="px-2.5 py-2 rounded-lg bg-slate-800 text-xs text-slate-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={history.length === 0}
                    onClick={() => {
                      onPlayClick();
                      setPendingConfirm('clear_history');
                    }}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs text-slate-200 cursor-pointer transition"
                  >
                    Clear History
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden max-h-96 overflow-y-auto">
              {history.length === 0 ? (
                <div className="p-10 text-center text-slate-300 text-sm">
                  No races completed yet. Start a <strong>Rappelling Race</strong> to pick winners!
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-xs uppercase text-slate-300 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-4">Rank</th>
                      <th className="py-2.5 px-4">Winner</th>
                      <th className="py-2.5 px-4">Round</th>
                      <th className="py-2.5 px-4">Department</th>
                      <th className="py-2.5 px-4">Time</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Toggle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {history.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-900/40">
                        <td className="py-2.5 px-4 font-bold text-amber-300">#{h.finishRank}</td>
                        <td className="py-2.5 px-4 font-semibold text-white">
                          {h.participant.name}
                        </td>
                        <td className="py-2.5 px-4 text-xs text-amber-200/90">
                          {h.roundLabel || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300">
                          {h.participant.department || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-sky-200 tabular-nums">
                          {typeof h.finishTimeSeconds === 'number'
                            ? `${h.finishTimeSeconds.toFixed(1)}s`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`text-xs font-medium ${
                              h.status === 'won'
                                ? 'text-emerald-300'
                                : 'text-rose-300 line-through'
                            }`}
                          >
                            {h.status === 'won' ? 'Confirmed' : 'Absent'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleToggleHistoryStatus(h)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 cursor-pointer transition"
                          >
                            {h.status === 'won' ? 'Mark Absent' : 'Restore'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: SETTINGS & DUAL-SCREEN MODE */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/70 via-slate-900/85 to-sky-950/70 border border-sky-400/35 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-sky-200 flex items-center gap-2">
                  <Monitor className="w-4 h-4" /> Dual-Screen Live Event Mode
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Keep the projector window clean for the party while controlling races, winner counts,
                  and rappeller lists privately from a backstage controller window.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => openDualWindow('controller')}
                  className="px-3.5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Monitor className="w-4 h-4" /> Open Host Controller Window
                </button>
                <button
                  type="button"
                  onClick={() => openDualWindow('projector')}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Projector className="w-4 h-4" /> Open Clean Projector Window
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/70 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-200">
                  Skyscraper Visual Theme
                </h3>
                <div className="space-y-2">
                  {(['christmas', 'celestial'] as ThemeId[]).map((tKey) => {
                    const active = settings.theme === tKey;
                    return (
                      <button
                        key={tKey}
                        type="button"
                        onClick={() => handleThemeSwitch(tKey)}
                        className={`w-full text-left p-3 rounded-xl border transition cursor-pointer ${
                          active
                            ? 'bg-amber-400/15 border-amber-300 text-white'
                            : 'bg-slate-950/70 border-slate-800 text-slate-200 hover:border-slate-600'
                        }`}
                      >
                        <div className="font-semibold text-sm">{THEME_CONFIG[tKey].name}</div>
                        <div className="text-xs text-slate-300/80 mt-0.5">
                          {tKey === 'christmas'
                            ? '100F glass skyscraper with rooftop Christmas tree, city lights & chimes'
                            : '100F downtown midnight tower with beacon spire & lit skyline windows'}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 space-y-2">
                  <label className="block text-xs text-slate-300">Event Headline</label>
                  <input
                    type="text"
                    value={settings.eventTitle}
                    onChange={(e) => setSettings((s) => ({ ...s, eventTitle: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white"
                  />
                  <label className="block text-xs text-slate-300">Event Subtitle</label>
                  <input
                    type="text"
                    value={settings.eventSubtitle}
                    onChange={(e) => setSettings((s) => ({ ...s, eventSubtitle: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/70 space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-200">
                  Race Mechanics & Tension
                </h3>

                <label className="flex items-start gap-3 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={settings.removeWinnerOnDraw}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, removeWinnerOnDraw: e.target.checked }))
                    }
                    className="mt-1 accent-amber-400"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-100">
                      Auto-remove winners from subsequent races
                    </div>
                    <div className="text-xs text-slate-300/80">
                      Each rappeller can only win once unless re-enabled manually.
                    </div>
                  </div>
                </label>

                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-200 font-medium">
                      Climb Duration (Seconds to 100F)
                    </span>
                    <ClimbDurationInput
                      value={settings.raceDurationSeconds}
                      min={5}
                      max={300}
                      onChange={(secs) => setSettings((s) => ({ ...s, raceDurationSeconds: secs }))}
                      inputClassName="w-14 px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-xs text-amber-200 font-bold text-center focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={300}
                    step={5}
                    value={settings.raceDurationSeconds}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, raceDurationSeconds: Number(e.target.value) }))
                    }
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                  <p className="text-xs text-slate-300/80">
                    Sets how long the climb lasts before rappellers reach the rooftop finish line.
                  </p>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-200 font-medium">
                      Race Volatility (Surges & Rope Slips)
                    </span>
                    <span className="text-amber-300 font-bold">
                      {Math.round(settings.dramaIntensity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(settings.dramaIntensity * 100)}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, dramaIntensity: Number(e.target.value) / 100 }))
                    }
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                  <p className="text-xs text-slate-300/80">
                    Controls how often rappellers trigger dramatic speed surges or sudden rope slips
                    while climbing the skyscraper.
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-800 flex flex-wrap justify-between items-center gap-2">
                  <span className="text-xs text-slate-300">
                    Restore default sample rappellers & settings?
                  </span>
                  {pendingConfirm === 'reset_demo' ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onPlayClick();
                          onResetDemo();
                          setPendingConfirm(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white cursor-pointer transition"
                      >
                        Confirm Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingConfirm(null)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-200 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onPlayClick();
                        setPendingConfirm('reset_demo');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs text-amber-200 flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reset Sample Roster
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Live Venue Registration (Supabase) */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/70 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-sky-300">
                      Christmas Party Registration (Mobile + Kiosk)
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isSupabaseConfigured()
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                      }`}
                    >
                      {isSupabaseConfigured() ? 'Supabase Connected' : 'Setup Needed'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Share the Guest Check-In link (turn into a QR code at the door) or open the
                    PIN-protected Usher Kiosk for guests without phones.
                  </p>
                  {cloudSyncFeedback && (
                    <p className="text-xs text-amber-200 font-medium pt-0.5">{cloudSyncFeedback}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onPlayClick();
                      const url = `${window.location.origin}${window.location.pathname}?view=register`;
                      void navigator.clipboard?.writeText(url);
                      setCloudSyncFeedback('Copied Guest Check-In URL to clipboard.');
                    }}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy Guest Link
                  </button>
                  <a
                    href="?view=register"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-200 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Guest Form
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href="?view=kiosk"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Tablet className="w-3.5 h-3.5" /> Usher Kiosk
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {isSupabaseConfigured() && (
                    <>
                      <button
                        type="button"
                        disabled={cloudSyncing}
                        onClick={async () => {
                          onPlayClick();
                          setCloudSyncing(true);
                          const { records, error } = await fetchRegistrations();
                          setCloudSyncing(false);
                          if (error) {
                            setCloudSyncFeedback(`Sync error: ${error}`);
                            return;
                          }
                          const { addedCount, removedCount } = mergeRegistrationsIntoParticipants(
                            participants,
                            records
                          );
                          if (addedCount > 0 || removedCount > 0) {
                            setParticipants(
                              (prev) => mergeRegistrationsIntoParticipants(prev, records).merged
                            );
                          }
                          setCloudSyncFeedback(
                            addedCount > 0 || removedCount > 0
                              ? `Synced (+${addedCount} added, -${removedCount} removed · ${records.length} cloud total).`
                              : `All ${records.length} cloud registrations are already in the pool.`
                          );
                        }}
                        className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${cloudSyncing ? 'animate-spin' : ''}`} />
                        Sync Now
                      </button>
                      <button
                        type="button"
                        disabled={cloudSyncing}
                        onClick={async () => {
                          onPlayClick();
                          setCloudSyncing(true);
                          const { records, error } = await fetchRegistrations();
                          setCloudSyncing(false);
                          if (error) {
                            setCloudSyncFeedback(`Sync error: ${error}`);
                            return;
                          }
                          const onlyCloud = mergeRegistrationsIntoParticipants([], records).merged;
                          setParticipants(onlyCloud);
                          setCloudSyncFeedback(
                            `Loaded ${onlyCloud.length} registered guest(s) only (demo roster cleared).`
                          );
                        }}
                        className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                      >
                        <Users className="w-3.5 h-3.5" />
                        Use Registered Only
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Full Session Backup (JSON) */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/70 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 max-w-xl">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
                  Session Backup (JSON)
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Save or restore your full party state (rappellers, winners log, and settings) across
                  laptops or before clearing browser data.
                </p>
                {backupFeedback && (
                  <p className="text-xs text-amber-200 font-medium pt-0.5">{backupFeedback}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  ref={backupInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleBackupImportChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => {
                    onPlayClick();
                    const payload = JSON.stringify(
                      {
                        version: 1,
                        exportedAt: new Date().toISOString(),
                        participants,
                        history,
                        settings,
                      },
                      null,
                      2
                    );
                    downloadTextFile(
                      `paskong-vonotec-backup-${new Date().toISOString().slice(0, 10)}.json`,
                      payload,
                      'application/json;charset=utf-8;'
                    );
                    setBackupFeedback('Exported full session backup JSON.');
                  }}
                  className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Download className="w-4 h-4" /> Export Backup (.json)
                </button>
                <button
                  type="button"
                  onClick={() => backupInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Upload className="w-4 h-4" /> Import Backup (.json)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) return shellContent;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      {shellContent}
    </div>
  );
};
