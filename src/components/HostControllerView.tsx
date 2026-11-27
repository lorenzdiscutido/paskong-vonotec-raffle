import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  FastForward,
  Flag,
  Projector,
  Radio,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Participant, PullResult, RaffleSettings, WishStage } from '../types/raffle';
import { DEFAULT_PARTICIPANTS, DEFAULT_SETTINGS, THEME_CONFIG } from '../data/defaults';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../utils/storage';
import { SyncMessage, SyncStateSnapshot, createWishSyncChannel } from '../utils/syncChannel';
import { wishSound } from '../utils/soundEngine';
import { ManageModal } from './ManageModal';
import { ClimbDurationInput } from './ClimbDurationInput';
import { isSupabaseConfigured } from '../utils/supabaseClient';
import {
  fetchRegistrations,
  mergeRegistrationsIntoParticipants,
  subscribeToRegistrations,
} from '../utils/registrationService';

export const HostControllerView: React.FC = () => {
  const [participants, setParticipants] = useState<Participant[]>(() =>
    loadFromStorage(STORAGE_KEYS.participants, DEFAULT_PARTICIPANTS)
  );
  const [history, setHistory] = useState<PullResult[]>(() =>
    loadFromStorage(STORAGE_KEYS.history, [])
  );
  const [settings, setSettings] = useState<RaffleSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...loadFromStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  }));

  // Live Projector mirror state
  const [stage, setStage] = useState<WishStage>('idle');
  const [currentBatch, setCurrentBatch] = useState<PullResult[]>([]);
  const [revealIndex, setRevealIndex] = useState(0);
  const [wishCaption, setWishCaption] = useState('');
  const [winnerCount, setWinnerCount] = useState(1);
  const [projectorConnected, setProjectorConnected] = useState(false);
  const [storageAlert, setStorageAlert] = useState<string | null>(null);

  const syncRef = useRef<ReturnType<typeof createWishSyncChannel> | null>(null);
  const stateRef = useRef({ participants, history, settings });
  const lastSnapshotAtRef = useRef(0);
  const lastLocalEditAtRef = useRef(0);

  useEffect(() => {
    stateRef.current = { participants, history, settings };
  }, [participants, history, settings]);

  useEffect(() => {
    wishSound.enabled = settings.soundEnabled;
  }, [settings.soundEnabled]);

  useEffect(() => {
    const channel = createWishSyncChannel((msg: SyncMessage) => {
      if (msg.type === 'STATE_SNAPSHOT') {
        const snap: SyncStateSnapshot = msg.payload;
        lastSnapshotAtRef.current = Date.now();
        setProjectorConnected(true);
        setStage(snap.stage);
        setCurrentBatch(snap.currentBatch);
        setRevealIndex(snap.revealIndex);
        setWishCaption(snap.wishCaption);

        if (Date.now() - lastLocalEditAtRef.current > 1500) {
          stateRef.current = {
            participants: snap.participants,
            history: snap.history,
            settings: snap.settings,
          };
          setParticipants(snap.participants);
          setHistory(snap.history);
          setSettings(snap.settings);
        }
      }
    });

    syncRef.current = channel;
    channel.post({ type: 'REQUEST_STATE' });

    const heartbeat = window.setInterval(() => {
      if (lastSnapshotAtRef.current > 0 && Date.now() - lastSnapshotAtRef.current > 7000) {
        setProjectorConnected(false);
      }
      channel.post({ type: 'REQUEST_STATE' });
    }, 3000);

    return () => {
      window.clearInterval(heartbeat);
      channel.close();
      syncRef.current = null;
    };
  }, []);

  // Auto-sync live Supabase venue registrations while idle
  useEffect(() => {
    if (!isSupabaseConfigured() || stage !== 'idle') return;
    let cancelled = false;

    const syncCloud = async () => {
      const { records, error } = await fetchRegistrations();
      if (cancelled || error) return;
      const { merged, addedCount, removedCount } = mergeRegistrationsIntoParticipants(
        stateRef.current.participants,
        records
      );
      if (addedCount > 0 || removedCount > 0) {
        stateRef.current = { ...stateRef.current, participants: merged };
        setParticipants(merged);
        saveToStorage(STORAGE_KEYS.participants, merged);
        syncRef.current?.post({
          type: 'CMD_UPDATE_DATA',
          participants: merged,
        });
      }
    };

    void syncCloud();
    const unsubscribe = subscribeToRegistrations(() => {
      void syncCloud();
    });
    const pollTimer = window.setInterval(() => {
      void syncCloud();
    }, 10000);

    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(pollTimer);
    };
  }, [stage]);

  const broadcastUpdate = (patch: {
    participants?: Participant[];
    history?: PullResult[];
    settings?: RaffleSettings;
  }) => {
    lastLocalEditAtRef.current = Date.now();
    let quotaExceeded = false;
    if (patch.participants) {
      quotaExceeded =
        saveToStorage(STORAGE_KEYS.participants, patch.participants).quotaExceeded || quotaExceeded;
    }
    if (patch.history) {
      quotaExceeded =
        saveToStorage(STORAGE_KEYS.history, patch.history).quotaExceeded || quotaExceeded;
    }
    if (patch.settings) {
      quotaExceeded =
        saveToStorage(STORAGE_KEYS.settings, patch.settings).quotaExceeded || quotaExceeded;
    }
    if (quotaExceeded) {
      setStorageAlert('Browser storage is full — export Winners CSV or clear older history.');
    }
    syncRef.current?.post({ type: 'CMD_UPDATE_DATA', ...patch });
  };

  const handleSetParticipants: React.Dispatch<React.SetStateAction<Participant[]>> = (updater) => {
    const next = typeof updater === 'function' ? updater(stateRef.current.participants) : updater;
    stateRef.current = { ...stateRef.current, participants: next };
    setParticipants(next);
    broadcastUpdate({ participants: next });
  };

  const handleSetHistory: React.Dispatch<React.SetStateAction<PullResult[]>> = (updater) => {
    const next = typeof updater === 'function' ? updater(stateRef.current.history) : updater;
    stateRef.current = { ...stateRef.current, history: next };
    setHistory(next);
    broadcastUpdate({ history: next });
  };

  const handleSetSettings: React.Dispatch<React.SetStateAction<RaffleSettings>> = (updater) => {
    const next = typeof updater === 'function' ? updater(stateRef.current.settings) : updater;
    stateRef.current = { ...stateRef.current, settings: next };
    setSettings(next);
    broadcastUpdate({ settings: next });
  };

  const eligibleParticipants = useMemo(
    () => participants.filter((p) => p.active && p.weight > 0),
    [participants]
  );

  const clampedWinnerCount = Math.max(
    1,
    Math.min(winnerCount, Math.max(1, eligibleParticipants.length))
  );
  const currentPull = currentBatch[revealIndex] ?? null;

  const openProjectorWindow = () => {
    wishSound.playUiClick();
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'projector');
    window.open(url.toString(), 'CelestiaProjector', 'noopener');
  };

  const handleThemeToggle = () => {
    wishSound.playUiClick();
    const nextTheme = settings.theme === 'christmas' ? 'celestial' : 'christmas';
    const nextPreset = THEME_CONFIG[nextTheme];
    const curPreset = THEME_CONFIG[settings.theme];
    handleSetSettings((prev) => ({
      ...prev,
      theme: nextTheme,
      eventTitle:
        prev.eventTitle === curPreset.defaultTitle ? nextPreset.defaultTitle : prev.eventTitle,
      eventSubtitle:
        prev.eventSubtitle === curPreset.defaultSubtitle
          ? nextPreset.defaultSubtitle
          : prev.eventSubtitle,
    }));
  };

  const stageLabel =
    stage === 'idle'
      ? 'Idle at Skyscraper Lobby'
      : stage === 'racing'
      ? 'Rappellers Climbing to 100F'
      : stage === 'reveal_single'
      ? `Announcing Winner (${revealIndex + 1}/${currentBatch.length})`
      : `Rooftop Finish Line (${currentBatch.length})`;

  return (
    <div className="min-h-screen w-full overflow-y-auto bg-[#0a1020] text-slate-100 p-4 sm:p-6 space-y-5">
      <header className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-[#0e1f38] border border-[#18355e]/90 shadow-xl">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-lg sm:text-xl font-black text-[#f4ebd9]">
                Paskong Vonotec Controller
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                  projectorConnected
                    ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                    : 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                }`}
              >
                <Radio className="w-3 h-3" />
                {projectorConnected ? 'Synced with Projector' : 'Waiting for Main / Projector Tab'}
              </span>
            </div>
            <p className="text-xs text-amber-200/90 font-medium mt-0.5">
              Standing Tall Together: A Christmas of Gratitude
              <span className="text-slate-300 ml-2">
                • Status: <strong className="text-amber-200">{stageLabel}</strong>
                {wishCaption ? ` — ${wishCaption}` : ''}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openProjectorWindow}
            className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
          >
            <Projector className="w-4 h-4" /> Launch Clean Projector
          </button>
          <button
            type="button"
            onClick={handleThemeToggle}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-medium text-amber-100 cursor-pointer transition"
          >
            {settings.theme === 'christmas' ? 'Theme: Holiday' : 'Theme: Midnight'}
          </button>
          <button
            type="button"
            aria-label="Toggle Sound on Projector"
            onClick={() => handleSetSettings((s) => ({ ...s, soundEnabled: !s.soundEnabled }))}
            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-100 cursor-pointer transition"
          >
            {settings.soundEnabled ? (
              <Volume2 className="w-4 h-4 text-amber-200" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </button>
        </div>
      </header>

      {storageAlert && (
        <div className="max-w-6xl mx-auto px-4 py-2.5 rounded-xl bg-amber-950/90 border border-amber-400/60 text-amber-100 text-xs flex items-center justify-between gap-3 shadow-lg">
          <span>{storageAlert}</span>
          <button
            type="button"
            onClick={() => setStorageAlert(null)}
            aria-label="Dismiss storage alert"
            className="text-amber-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Remote Transport & Live Winner Monitor */}
      <section className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 p-5 rounded-2xl bg-[#111936] border border-slate-700/80 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Remote Race Transport
            </h2>
            <div className="text-xs text-slate-300">
              Active Rappellers: <strong className="text-white">{eligibleParticipants.length}</strong>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-300 mr-1">Winners per Race:</span>
            {[1, 3, 5, 10].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => {
                  wishSound.playUiClick();
                  setWinnerCount(num);
                }}
                className={`px-3 py-1 rounded-full text-xs font-bold cursor-pointer transition ${
                  winnerCount === num
                    ? 'bg-[#ece5d8] text-[#2b3245]'
                    : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {num} Winner{num > 1 ? 's' : ''}
              </button>
            ))}
            <input
              type="number"
              aria-label="Custom winners count"
              min={1}
              max={100}
              value={winnerCount}
              onChange={(e) => setWinnerCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="w-16 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-amber-200 font-bold"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-300 mr-1">Climb Time:</span>
            {[10, 20, 30, 45, 60].map((secs) => (
              <button
                key={secs}
                type="button"
                onClick={() => {
                  wishSound.playUiClick();
                  handleSetSettings((s) => ({ ...s, raceDurationSeconds: secs }));
                }}
                className={`px-3 py-1 rounded-full text-xs font-bold cursor-pointer transition ${
                  settings.raceDurationSeconds === secs
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {secs}s
              </button>
            ))}
            <ClimbDurationInput
              value={settings.raceDurationSeconds}
              min={5}
              max={300}
              onChange={(secs) => handleSetSettings((s) => ({ ...s, raceDurationSeconds: secs }))}
              inputClassName="w-16 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-amber-200 font-bold text-center focus:outline-none focus:border-amber-400"
              unitClassName="text-xs text-slate-400 font-semibold select-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="controller-round-label" className="text-xs text-slate-300 shrink-0">
              Round Label:
            </label>
            <input
              id="controller-round-label"
              type="text"
              maxLength={48}
              value={settings.currentRoundLabel}
              onChange={(e) =>
                handleSetSettings((s) => ({ ...s, currentRoundLabel: e.target.value }))
              }
              placeholder="Optional (e.g. Grand Prize / Round 1)"
              className="flex-1 max-w-xs px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-amber-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled={stage !== 'idle' || eligibleParticipants.length < 1}
              onClick={() => {
                wishSound.playUiClick();
                syncRef.current?.post({ type: 'CMD_START_RACE', count: clampedWinnerCount });
              }}
              className="vonotec-festive-btn px-6 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 cursor-pointer"
            >
              <Flag className="w-4 h-4 text-amber-200" />
              <span>
                Start Rappelling Race ({clampedWinnerCount} Winner
                {clampedWinnerCount > 1 ? 's' : ''})
              </span>
            </button>

            {stage === 'racing' && (
              <button
                type="button"
                onClick={() => syncRef.current?.post({ type: 'CMD_SKIP_RACE' })}
                className="px-5 py-2.5 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 text-sm font-bold flex items-center gap-1.5 cursor-pointer transition"
              >
                <FastForward className="w-4 h-4" /> Skip to Finish
              </button>
            )}

            {stage === 'reveal_single' && (
              <>
                <button
                  type="button"
                  onClick={() => syncRef.current?.post({ type: 'CMD_ADVANCE_REVEAL' })}
                  className="px-5 py-2.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-sm font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <span>Next / Continue</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => syncRef.current?.post({ type: 'CMD_SKIP_TO_END' })}
                  className="px-4 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-slate-100 cursor-pointer transition"
                >
                  Skip to Podium
                </button>
              </>
            )}

            {stage === 'summary_multi' && (
              <button
                type="button"
                onClick={() => syncRef.current?.post({ type: 'CMD_CLOSE_SUMMARY' })}
                className="px-5 py-2.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-sm font-bold flex items-center gap-1.5 cursor-pointer transition"
              >
                <X className="w-4 h-4" /> Close Podium on Projector
              </button>
            )}
          </div>
        </div>

        {/* Right: Live Winner Monitor */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-[#111936] border border-slate-700/80 flex flex-col justify-between space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-sky-200">
            Live Stage Monitor
          </h2>

          {currentPull && stage === 'reveal_single' ? (
            <div className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800 space-y-1">
              <div className="text-[11px] font-bold uppercase text-amber-300">
                #{currentPull.finishRank} Rooftop Champion
                {typeof currentPull.finishTimeSeconds === 'number'
                  ? ` • ${currentPull.finishTimeSeconds.toFixed(1)}s`
                  : ''}
              </div>
              <div
                className={`font-display text-xl font-bold text-white truncate ${
                  currentPull.status === 'absent' ? 'line-through opacity-50' : ''
                }`}
              >
                {currentPull.participant.name}
              </div>
              {(currentPull.participant.department || currentPull.participant.title) && (
                <div className="text-xs text-slate-300 truncate">
                  {[currentPull.participant.department, currentPull.participant.title]
                    .filter(Boolean)
                    .join(' • ')}
                </div>
              )}
            </div>
          ) : stage === 'summary_multi' ? (
            <div className="text-xs text-slate-200 max-h-28 overflow-y-auto space-y-1 pr-1">
              {currentBatch.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 px-2.5 py-1 rounded bg-slate-950/60"
                >
                  <span
                    className={`font-medium truncate ${
                      item.status === 'absent' ? 'line-through text-rose-300' : 'text-white'
                    }`}
                  >
                    #{item.finishRank} {item.participant.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => syncRef.current?.post({ type: 'CMD_RERACE_ABSENT', pullId: item.id })}
                    className="text-[10px] text-amber-300 hover:underline shrink-0 cursor-pointer"
                  >
                    Re-Race
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300">
              {stage === 'racing'
                ? 'Rappellers are scaling the 100F skyscraper on the main projector!'
                : 'Projector is idle. Add/paste rappellers below and press Start Rappelling Race.'}
            </div>
          )}

          {currentPull && stage === 'reveal_single' && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={currentPull.status === 'absent'}
                onClick={() =>
                  syncRef.current?.post({ type: 'CMD_MARK_ABSENT', pullId: currentPull.id })
                }
                className="flex-1 px-3 py-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 disabled:opacity-45 border border-rose-400/40 text-xs font-semibold text-rose-100 flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {currentPull.status === 'absent' ? 'Absent' : 'Mark Absent'}
              </button>
              <button
                type="button"
                onClick={() =>
                  syncRef.current?.post({ type: 'CMD_RERACE_ABSENT', pullId: currentPull.id })
                }
                className="flex-1 px-3 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Re-Race Now
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Embedded Full Management Panel */}
      <section className="max-w-6xl mx-auto">
        <ManageModal
          isOpen={true}
          embedded={true}
          initialTab="participants"
          onClose={() => {}}
          participants={participants}
          setParticipants={handleSetParticipants}
          history={history}
          setHistory={handleSetHistory}
          settings={settings}
          setSettings={handleSetSettings}
          onResetDemo={() => {
            handleSetParticipants(DEFAULT_PARTICIPANTS);
            handleSetHistory([]);
            handleSetSettings(DEFAULT_SETTINGS);
          }}
          onPlayClick={() => wishSound.playUiClick()}
        />
      </section>
    </div>
  );
};
