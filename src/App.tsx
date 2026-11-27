import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Flag,
  Maximize2,
  MonitorUp,
  Plus,
  Settings2,
  Trophy,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Participant, PullResult, RaffleSettings, WishStage } from './types/raffle';
import { DEFAULT_PARTICIPANTS, DEFAULT_SETTINGS } from './data/defaults';
import { createId } from './utils/rng';
import { RappellerState } from './utils/raceEngine';
import { wishSound } from './utils/soundEngine';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from './utils/storage';
import { SyncMessage, createWishSyncChannel } from './utils/syncChannel';
import { SummitRaceCanvas } from './components/SummitRaceCanvas';
import { SplashRevealOverlay } from './components/SplashRevealOverlay';
import { ManageModal } from './components/ManageModal';
import { HostControllerView } from './components/HostControllerView';
import { ClimbDurationInput } from './components/ClimbDurationInput';
import { RegistrationMobileView } from './components/RegistrationMobileView';
import { RegistrationKioskView } from './components/RegistrationKioskView';
import { isSupabaseConfigured } from './utils/supabaseClient';
import {
  fetchRegistrations,
  mergeRegistrationsIntoParticipants,
  subscribeToRegistrations,
} from './utils/registrationService';

function getViewMode(): 'controller' | 'projector' | 'register' | 'kiosk' | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('view');
  if (v === 'controller' || v === 'projector' || v === 'register' || v === 'kiosk') return v;
  return null;
}

export function App() {
  const viewMode = useMemo(() => getViewMode(), []);

  if (viewMode === 'controller') {
    return <HostControllerView />;
  }
  if (viewMode === 'register') {
    return <RegistrationMobileView />;
  }
  if (viewMode === 'kiosk') {
    return <RegistrationKioskView />;
  }

  return <MainStageApp isProjector={viewMode === 'projector'} />;
}

function MainStageApp({ isProjector }: { isProjector: boolean }) {
  const [participants, setParticipants] = useState<Participant[]>(() =>
    loadFromStorage(STORAGE_KEYS.participants, DEFAULT_PARTICIPANTS)
  );
  const [history, setHistory] = useState<PullResult[]>(() =>
    loadFromStorage(STORAGE_KEYS.history, [])
  );
  const [settings, setSettings] = useState<RaffleSettings>(() => {
    const loaded = loadFromStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
    if (
      !loaded.eventTitle ||
      loaded.eventTitle === 'Holiday Skyscraper Rappelling Race' ||
      loaded.eventTitle === 'Skyscraper Rappelling Race' ||
      loaded.eventTitle === 'Celestia Wish'
    ) {
      return {
        ...loaded,
        eventTitle: DEFAULT_SETTINGS.eventTitle,
        eventSubtitle: DEFAULT_SETTINGS.eventSubtitle,
      };
    }
    return {
      ...DEFAULT_SETTINGS,
      ...loaded,
    };
  });

  // Active race & winner spotlight state
  const [stage, setStage] = useState<WishStage>('idle');
  const [winnerCount, setWinnerCount] = useState(1);
  const [targetWinnerCount, setTargetWinnerCount] = useState(1);
  const [currentBatch, setCurrentBatch] = useState<PullResult[]>([]);
  const [revealIndex, setRevealIndex] = useState(0);
  const [sequenceKey, setSequenceKey] = useState(0);
  const [skipNonce, setSkipNonce] = useState(0);
  const [wishCaption, setWishCaption] = useState('');

  // Modal & alert state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'participants' | 'history' | 'settings'>('participants');
  const [alertBanner, setAlertBanner] = useState<string | null>(null);
  const [externalProjectorActive, setExternalProjectorActive] = useState(false);

  const syncRef = useRef<ReturnType<typeof createWishSyncChannel> | null>(null);
  const completedSeqRef = useRef(-1);
  const externalProjectorSeenRef = useRef(0);
  const reRaceSlotRef = useRef<{
    replacePullId: string;
    returnToSummary: boolean;
    prevBatch: PullResult[];
  } | null>(null);
  const returnToSummaryAfterSingleRef = useRef(false);

  const persistWithQuotaGuard = useCallback(<T,>(key: string, value: T) => {
    const res = saveToStorage(key, value);
    if (res.quotaExceeded) {
      setAlertBanner('Browser storage is full — export Winners CSV or clear older history.');
    }
  }, []);

  useEffect(() => {
    persistWithQuotaGuard(STORAGE_KEYS.participants, participants);
  }, [participants, persistWithQuotaGuard]);

  useEffect(() => {
    persistWithQuotaGuard(STORAGE_KEYS.history, history);
  }, [history, persistWithQuotaGuard]);

  useEffect(() => {
    persistWithQuotaGuard(STORAGE_KEYS.settings, settings);
    wishSound.enabled = settings.soundEnabled;
  }, [settings, persistWithQuotaGuard]);

  // Cross-tab backup listener
  useEffect(() => {
    const handleStorageEvent = (e: StorageEvent) => {
      if (!e.newValue) return;
      try {
        if (e.key === STORAGE_KEYS.participants) {
          setParticipants(JSON.parse(e.newValue));
        } else if (e.key === STORAGE_KEYS.history) {
          setHistory(JSON.parse(e.newValue));
        } else if (e.key === STORAGE_KEYS.settings) {
          setSettings(JSON.parse(e.newValue));
        }
      } catch (err) {
        console.warn('[storage] Ignored malformed cross-tab write:', err);
      }
    };
    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
  }, []);

  // Auto-sync live Supabase venue registrations into the active pool while idle
  useEffect(() => {
    if (!isSupabaseConfigured() || stage !== 'idle') return;
    let cancelled = false;

    const syncCloud = async () => {
      const { records, error } = await fetchRegistrations();
      if (cancelled || error) return;
      setParticipants((prev) => {
        const { merged, addedCount, removedCount } = mergeRegistrationsIntoParticipants(
          prev,
          records
        );
        return addedCount > 0 || removedCount > 0 ? merged : prev;
      });
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

  const eligibleParticipants = useMemo(
    () => participants.filter((p) => p.active && p.weight > 0),
    [participants]
  );

  const cloudRegisteredCount = useMemo(
    () => eligibleParticipants.filter((p) => p.id.startsWith('reg_')).length,
    [eligibleParticipants]
  );

  const hasWeightedEntries = useMemo(
    () => eligibleParticipants.some((p) => p.weight > 1),
    [eligibleParticipants]
  );

  const openModalWithTab = useCallback(
    (tab: 'participants' | 'history' | 'settings') => {
      if (isProjector) return;
      wishSound.playUiClick();
      setModalTab(tab);
      setModalOpen(true);
    },
    [isProjector]
  );

  const triggerRace = useCallback(
    (requestedCount: number) => {
      if (stage !== 'idle') return;
      if (eligibleParticipants.length === 0) {
        setAlertBanner('No active rappellers left! Paste names or upload a CSV list.');
        if (!isProjector) openModalWithTab('participants');
        return;
      }

      const clampedCount = Math.max(1, Math.min(requestedCount, eligibleParticipants.length));
      setAlertBanner(null);
      setTargetWinnerCount(clampedCount);
      setSequenceKey((k) => k + 1);
      setStage('racing');
    },
    [stage, eligibleParticipants.length, isProjector, openModalWithTab]
  );

  const handleRaceComplete = useCallback(
    (finishedRappellers: RappellerState[]) => {
      if (completedSeqRef.current === sequenceKey) return;
      completedSeqRef.current = sequenceKey;

      const winCount = Math.min(finishedRappellers.length, targetWinnerCount);
      if (winCount === 0) {
        reRaceSlotRef.current = null;
        returnToSummaryAfterSingleRef.current = false;
        setStage('idle');
        return;
      }

      const trimmedRound = settings.currentRoundLabel.trim() || undefined;
      const results: PullResult[] = [];
      const winnerIds = new Set<string>();

      for (let i = 0; i < winCount; i++) {
        const rappeller = finishedRappellers[i];
        winnerIds.add(rappeller.participant.id);
        results.push({
          id: createId(),
          participant: {
            ...rappeller.participant,
            active: settings.removeWinnerOnDraw ? false : rappeller.participant.active,
          },
          timestamp: Date.now() + i,
          status: 'won',
          finishRank: rappeller.finishRank ?? i + 1,
          finishTimeSeconds: rappeller.finishTime,
          roundLabel: trimmedRound,
        });
      }

      if (settings.removeWinnerOnDraw) {
        setParticipants((prev) =>
          prev.map((p) => (winnerIds.has(p.id) ? { ...p, active: false } : p))
        );
      }

      setHistory((prev) => [...results, ...prev]);

      const slot = reRaceSlotRef.current;
      reRaceSlotRef.current = null;

      if (slot && results.length === 1) {
        const replaceIdx = slot.prevBatch.findIndex((item) => item.id === slot.replacePullId);
        if (replaceIdx >= 0) {
          const replacement: PullResult = {
            ...results[0],
            finishRank: slot.prevBatch[replaceIdx].finishRank,
          };
          const patchedBatch = slot.prevBatch.map((item, idx) =>
            idx === replaceIdx ? replacement : item
          );
          setCurrentBatch(patchedBatch);
          setRevealIndex(replaceIdx);
          returnToSummaryAfterSingleRef.current = slot.returnToSummary;
          wishSound.playSummitVictory(settings.theme === 'christmas');
          setStage('reveal_single');
          return;
        }
      }

      returnToSummaryAfterSingleRef.current = false;
      setCurrentBatch(results);
      setRevealIndex(0);
      wishSound.playSummitVictory(settings.theme === 'christmas');
      setStage('reveal_single');
    },
    [
      sequenceKey,
      targetWinnerCount,
      settings.removeWinnerOnDraw,
      settings.theme,
      settings.currentRoundLabel,
    ]
  );

  const handleSkipRace = useCallback(() => {
    if (stage !== 'racing') return;
    wishSound.playUiClick();
    setSkipNonce((n) => n + 1);
  }, [stage]);

  const handleAdvanceSingle = useCallback(() => {
    wishSound.playUiClick();
    if (returnToSummaryAfterSingleRef.current) {
      returnToSummaryAfterSingleRef.current = false;
      setStage('summary_multi');
      return;
    }
    if (revealIndex + 1 < currentBatch.length) {
      setRevealIndex((i) => i + 1);
    } else if (currentBatch.length > 1) {
      setStage('summary_multi');
    } else {
      setStage('idle');
    }
  }, [revealIndex, currentBatch.length]);

  const handleSkipRevealToEnd = useCallback(() => {
    wishSound.playUiClick();
    returnToSummaryAfterSingleRef.current = false;
    if (currentBatch.length > 1) {
      setStage('summary_multi');
    } else {
      setStage('idle');
    }
  }, [currentBatch.length]);

  const handleMarkAbsent = useCallback(
    (pullId: string) => {
      wishSound.playUiClick();
      const target = currentBatch.find((item) => item.id === pullId);
      if (!target || target.status === 'absent') return;

      setCurrentBatch((prev) =>
        prev.map((item) => (item.id === pullId ? { ...item, status: 'absent' } : item))
      );
      setHistory((prev) =>
        prev.map((item) => (item.id === pullId ? { ...item, status: 'absent' } : item))
      );
    },
    [currentBatch]
  );

  const handleReRaceAbsent = useCallback(
    (pullId: string) => {
      const target = currentBatch.find((item) => item.id === pullId);
      if (!target) return;

      if (eligibleParticipants.length === 0) {
        setAlertBanner('No active rappellers left to run a replacement race!');
        setStage('idle');
        if (!isProjector) openModalWithTab('participants');
        return;
      }

      wishSound.playUiClick();

      const updatedBatch = currentBatch.map((item) =>
        item.id === pullId ? { ...item, status: 'absent' as const } : item
      );
      if (target.status !== 'absent') {
        setCurrentBatch(updatedBatch);
        setHistory((prev) =>
          prev.map((item) => (item.id === pullId ? { ...item, status: 'absent' } : item))
        );
      }

      reRaceSlotRef.current =
        updatedBatch.length > 1
          ? {
              replacePullId: pullId,
              returnToSummary: stage === 'summary_multi',
              prevBatch: updatedBatch,
            }
          : null;
      returnToSummaryAfterSingleRef.current = false;

      setTargetWinnerCount(1);
      setSequenceKey((k) => k + 1);
      setStage('racing');
    },
    [currentBatch, stage, eligibleParticipants.length, isProjector, openModalWithTab]
  );

  // Escape skips live race (Spacebar intentionally excluded to prevent accidental skips)
  useEffect(() => {
    if (stage !== 'racing') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        handleSkipRace();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stage, handleSkipRace]);

  const latestRef = useRef({
    stage,
    currentBatch,
    revealIndex,
    wishCaption,
    activeCount: eligibleParticipants.length,
    participants,
    history,
    settings,
    triggerRace,
    handleSkipRace,
    handleAdvanceSingle,
    handleSkipRevealToEnd,
    handleMarkAbsent,
    handleReRaceAbsent,
  });

  useEffect(() => {
    latestRef.current = {
      stage,
      currentBatch,
      revealIndex,
      wishCaption,
      activeCount: eligibleParticipants.length,
      participants,
      history,
      settings,
      triggerRace,
      handleSkipRace,
      handleAdvanceSingle,
      handleSkipRevealToEnd,
      handleMarkAbsent,
      handleReRaceAbsent,
    };
  });

  const postSnapshot = useCallback(() => {
    if (!isProjector && Date.now() - externalProjectorSeenRef.current < 5000) {
      return;
    }
    const cur = latestRef.current;
    syncRef.current?.post({
      type: 'STATE_SNAPSHOT',
      payload: {
        stage: cur.stage,
        currentBatch: cur.currentBatch,
        revealIndex: cur.revealIndex,
        wishCaption: cur.wishCaption,
        activeCount: cur.activeCount,
        participants: cur.participants,
        history: cur.history,
        settings: cur.settings,
      },
    });
  }, [isProjector]);

  useEffect(() => {
    const channel = createWishSyncChannel((msg: SyncMessage) => {
      if (msg.type === 'PROJECTOR_HEARTBEAT') {
        if (!isProjector) {
          externalProjectorSeenRef.current = Date.now();
          setExternalProjectorActive(true);
        }
        return;
      }
      if (msg.type === 'PROJECTOR_RELEASE') {
        if (!isProjector) {
          externalProjectorSeenRef.current = 0;
          setExternalProjectorActive(false);
        }
        return;
      }

      const yieldedToProjector =
        !isProjector && Date.now() - externalProjectorSeenRef.current < 5000;
      const cur = latestRef.current;
      switch (msg.type) {
        case 'REQUEST_STATE':
          if (!yieldedToProjector) postSnapshot();
          break;
        case 'CMD_START_RACE':
          if (!yieldedToProjector) cur.triggerRace(msg.count);
          break;
        case 'CMD_SKIP_RACE':
          if (!yieldedToProjector) cur.handleSkipRace();
          break;
        case 'CMD_ADVANCE_REVEAL':
          if (!yieldedToProjector) cur.handleAdvanceSingle();
          break;
        case 'CMD_SKIP_TO_END':
          if (!yieldedToProjector) cur.handleSkipRevealToEnd();
          break;
        case 'CMD_CLOSE_SUMMARY':
          if (!yieldedToProjector) {
            wishSound.playUiClick();
            setStage('idle');
          }
          break;
        case 'CMD_MARK_ABSENT':
          if (!yieldedToProjector) cur.handleMarkAbsent(msg.pullId);
          break;
        case 'CMD_RERACE_ABSENT':
          if (!yieldedToProjector) cur.handleReRaceAbsent(msg.pullId);
          break;
        case 'CMD_UPDATE_DATA':
          if (msg.participants) setParticipants(msg.participants);
          if (msg.history) setHistory(msg.history);
          if (msg.settings) setSettings(msg.settings);
          break;
      }
    });

    syncRef.current = channel;

    let heartbeatId: number | undefined;
    let expiryId: number | undefined;
    const handleBeforeUnload = () => {
      if (isProjector) channel.post({ type: 'PROJECTOR_RELEASE' });
    };

    if (isProjector) {
      channel.post({ type: 'PROJECTOR_HEARTBEAT' });
      heartbeatId = window.setInterval(() => {
        channel.post({ type: 'PROJECTOR_HEARTBEAT' });
      }, 2000);
      window.addEventListener('beforeunload', handleBeforeUnload);
    } else {
      expiryId = window.setInterval(() => {
        if (
          externalProjectorSeenRef.current > 0 &&
          Date.now() - externalProjectorSeenRef.current >= 5000
        ) {
          externalProjectorSeenRef.current = 0;
          setExternalProjectorActive(false);
        }
      }, 2500);
    }

    return () => {
      if (heartbeatId !== undefined) window.clearInterval(heartbeatId);
      if (expiryId !== undefined) window.clearInterval(expiryId);
      if (isProjector) {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        channel.post({ type: 'PROJECTOR_RELEASE' });
      }
      channel.close();
      syncRef.current = null;
    };
  }, [postSnapshot, isProjector]);

  useEffect(() => {
    postSnapshot();
  }, [stage, currentBatch, revealIndex, wishCaption, participants, history, settings, postSnapshot]);

  const handleResetDemo = () => {
    setParticipants(DEFAULT_PARTICIPANTS);
    setHistory([]);
    setSettings(DEFAULT_SETTINGS);
  };

  const toggleFullscreen = () => {
    wishSound.playUiClick();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('[fullscreen] Toggle failed:', err);
      });
    } else {
      document.exitFullscreen().catch((err) => {
        console.warn('[fullscreen] Exit failed:', err);
      });
    }
  };

  const openHostControllerWindow = () => {
    wishSound.playUiClick();
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'controller');
    window.open(url.toString(), 'CelestiaHostController', 'width=1140,height=840');
  };

  const titleWords = settings.eventTitle.trim().split(/\s+/);
  const titleLine1 = titleWords.slice(0, Math.ceil(titleWords.length / 2)).join(' ');
  const titleLine2 = titleWords.slice(Math.ceil(titleWords.length / 2)).join(' ');

  const isXmas = settings.theme === 'christmas';
  const clampedWinnerCount = Math.max(
    1,
    Math.min(winnerCount, Math.max(1, eligibleParticipants.length))
  );

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none">
      {/* 1. Live 100-Story Skyscraper & Rappelling Race Canvas */}
      <SummitRaceCanvas
        theme={settings.theme}
        stage={stage}
        participants={participants}
        targetWinnerCount={targetWinnerCount}
        dramaIntensity={settings.dramaIntensity}
        raceDurationSeconds={settings.raceDurationSeconds}
        roundLabel={settings.currentRoundLabel}
        sequenceKey={sequenceKey}
        skipNonce={skipNonce}
        onRaceComplete={handleRaceComplete}
        onCaptionChange={setWishCaption}
        onSkipRace={handleSkipRace}
      />

      {/* 2. Skyscraper Ground Lobby Launcher (Idle Stage) */}
      {stage === 'idle' && (
        <div className="relative z-10 w-full h-full flex flex-col justify-between px-4 sm:px-8 py-4 sm:py-5">
          {/* Top Header */}
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-display font-black text-lg sm:text-xl text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
                Paskong Vonotec
              </span>
              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#d63f22]/20 border border-[#d63f22]/50 text-[11px] font-black text-amber-200 tracking-wider uppercase">
                Standing Tall Together
              </span>
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={() => openModalWithTab('participants')}
                title={isProjector ? 'Ready Rappellers' : 'Add or paste rappellers'}
                className={`flex items-center gap-2 ${
                  isProjector ? 'px-3' : 'pl-3 pr-1'
                } py-1 rounded-full bg-slate-950/70 hover:bg-slate-950/90 border border-white/20 backdrop-blur-md text-white text-xs sm:text-sm font-bold ${
                  isProjector ? 'cursor-default' : 'cursor-pointer'
                } transition`}
              >
                <Users className="w-4 h-4 text-sky-300" />
                <span>{eligibleParticipants.length} Rappellers</span>
                {cloudRegisteredCount > 0 && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {cloudRegisteredCount} Live
                  </span>
                )}
                {!isProjector && (
                  <span className="w-5 h-5 rounded-full bg-[#ede5d5] text-slate-900 flex items-center justify-center">
                    <Plus className="w-3.5 h-3.5 stroke-[2.8]" />
                  </span>
                )}
              </button>

              <button
                type="button"
                aria-label="Toggle Audio"
                onClick={() => setSettings((s) => ({ ...s, soundEnabled: !s.soundEnabled }))}
                className="w-8 h-8 rounded-full bg-slate-950/60 hover:bg-slate-900 border border-white/25 flex items-center justify-center text-white cursor-pointer transition"
              >
                {settings.soundEnabled ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {!isProjector && (
                <button
                  type="button"
                  aria-label="Open Backstage Host Controller Window"
                  title="Open Backstage Host Controller Window"
                  onClick={openHostControllerWindow}
                  className="hidden sm:flex w-8 h-8 rounded-full bg-slate-950/60 hover:bg-slate-900 border border-white/25 items-center justify-center text-amber-200 cursor-pointer transition"
                >
                  <MonitorUp className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                aria-label="Toggle Fullscreen"
                onClick={toggleFullscreen}
                className="hidden sm:flex w-8 h-8 rounded-full bg-slate-950/60 hover:bg-slate-900 border border-white/25 items-center justify-center text-white cursor-pointer transition"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>

              {!isProjector ? (
                <button
                  type="button"
                  aria-label="Open Settings"
                  onClick={() => openModalWithTab('settings')}
                  className="w-8 h-8 rounded-full bg-[#ede6d8] hover:bg-white border-2 border-[#cfc4ae] flex items-center justify-center text-[#3b4354] shadow-md cursor-pointer transition"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
              ) : (
                <a
                  href={window.location.pathname}
                  title="Exit Clean Projector Mode"
                  className="px-2.5 py-1 rounded-full bg-slate-950/40 hover:bg-slate-900/90 border border-white/15 text-[10px] text-white/50 hover:text-white transition"
                >
                  Exit Projector
                </a>
              )}
            </div>
          </header>

          {alertBanner && (
            <div className="mx-auto px-5 py-1.5 rounded-full bg-rose-950/90 border border-rose-400/50 text-rose-100 text-xs font-medium shadow-lg">
              {alertBanner}
            </div>
          )}

          {!isProjector && externalProjectorActive && (
            <div className="mx-auto px-5 py-1.5 rounded-full bg-sky-950/90 border border-sky-400/50 text-sky-100 text-xs font-medium shadow-lg">
              Clean Projector window active — remote race commands route to the Projector tab.
            </div>
          )}

          {/* Center Launch Card (Pure Name Picker) */}
          <main className="my-auto flex items-center justify-center py-2">
            <div className="relative w-full max-w-2xl rounded-3xl border-2 border-[#18355e]/90 bg-[#0e1f38]/92 backdrop-blur-md p-6 sm:p-9 shadow-[0_24px_80px_rgba(14,31,56,0.85)] text-center space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#d63f22]/20 border border-[#d63f22]/60 text-xs font-bold uppercase tracking-widest text-amber-200 shadow-[0_0_15px_rgba(214,63,34,0.35)]">
                <Trophy className="w-3.5 h-3.5 text-amber-300" /> Paskong Vonotec • Raffle Name Picker
              </div>

              <div className="space-y-3">
                <h1 className="font-display text-3xl sm:text-5xl font-black leading-[1.1] tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
                  <span className="text-white">{titleLine1} </span>
                  {titleLine2 && (
                    <span className={isXmas ? 'text-[#fbbf24]' : 'text-[#38bdf8]'}>{titleLine2}</span>
                  )}
                </h1>

                {/* Theme Tagline Banner (Vonotec Navy & Festive Crimson Gradient) */}
                <div className="inline-block px-5 py-2 rounded-xl bg-gradient-to-r from-[#18355e]/95 via-[#d63f22]/85 to-[#18355e]/95 border-2 border-amber-300/60 shadow-[0_4px_22px_rgba(214,63,34,0.35)]">
                  <span className="font-display font-black text-xs sm:text-sm tracking-[0.18em] text-white uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                    {settings.eventSubtitle}
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-200/90 max-w-lg mx-auto leading-relaxed">
                  All{' '}
                  <strong className="text-amber-300">{eligibleParticipants.length} Vonotec rappellers</strong>{' '}
                  scale the 100-story tower together — speed bursts & sudden rope slips
                  decide who reaches the summit first!
                </p>
              </div>

              {/* Winners per Race Selector */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <span className="text-xs font-semibold text-slate-300 mr-1">Winners to Pick:</span>
                {[1, 3, 5, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      wishSound.playUiClick();
                      setWinnerCount(num);
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer transition ${
                      winnerCount === num
                        ? 'bg-[#ece5d8] text-[#2b3245] shadow-md'
                        : 'bg-slate-900/80 border border-slate-700 text-slate-200 hover:border-amber-300/60'
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
                  onChange={(e) =>
                    setWinnerCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
                  }
                  className="w-16 px-2.5 py-1.5 rounded-full bg-slate-950 border border-slate-600 text-xs text-center text-amber-200 font-bold focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Climb Duration Selector */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="text-xs font-semibold text-slate-300 mr-1">Climb Time:</span>
                {[10, 20, 30, 45, 60].map((secs) => (
                  <button
                    key={secs}
                    type="button"
                    onClick={() => {
                      wishSound.playUiClick();
                      setSettings((s) => ({ ...s, raceDurationSeconds: secs }));
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer transition ${
                      settings.raceDurationSeconds === secs
                        ? 'bg-amber-400 text-slate-950 shadow-md'
                        : 'bg-slate-900/80 border border-slate-700 text-slate-200 hover:border-amber-300/60'
                    }`}
                  >
                    {secs}s
                  </button>
                ))}
                <ClimbDurationInput
                  value={settings.raceDurationSeconds}
                  min={5}
                  max={300}
                  onChange={(secs) => setSettings((s) => ({ ...s, raceDurationSeconds: secs }))}
                  inputClassName="w-16 px-2.5 py-1.5 rounded-full bg-slate-950 border border-slate-600 text-xs text-center text-amber-200 font-bold focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Optional Round Label & Weighted Entries Notice */}
              {!isProjector && (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center justify-center gap-2 w-full max-w-sm">
                    <label htmlFor="round-label-input" className="text-xs font-semibold text-slate-300 shrink-0">
                      Round:
                    </label>
                    <input
                      id="round-label-input"
                      type="text"
                      maxLength={48}
                      value={settings.currentRoundLabel}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, currentRoundLabel: e.target.value }))
                      }
                      placeholder="Optional round label (e.g. Minor Prize 1)"
                      className="flex-1 px-3 py-1.5 rounded-full bg-slate-950/90 border border-slate-700 text-xs text-amber-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  {hasWeightedEntries && (
                    <button
                      type="button"
                      onClick={() => openModalWithTab('participants')}
                      className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/45 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/25 cursor-pointer transition"
                    >
                      Weighted entries active — some rappellers have &gt;1 ticket (manage)
                    </button>
                  )}
                </div>
              )}

              {/* Primary CTA Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                {!isProjector && (
                  <button
                    type="button"
                    onClick={() => openModalWithTab('participants')}
                    className="vonotec-navy-pill px-5 py-3.5 rounded-full text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4 text-amber-300" />
                    <span>Add / Paste Rappellers ({eligibleParticipants.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={eligibleParticipants.length < 1}
                  onClick={() => triggerRace(clampedWinnerCount)}
                  className="vonotec-festive-btn px-8 py-3.5 rounded-full text-sm sm:text-base font-extrabold flex items-center gap-2 cursor-pointer"
                >
                  <Flag className="w-4 h-4 text-amber-200" />
                  <span>
                    Start Rappelling Race
                    {clampedWinnerCount > 1 ? ` (Top ${clampedWinnerCount})` : ''}
                  </span>
                </button>
              </div>
            </div>
          </main>

          {/* Bottom Utility Bar */}
          <footer className="flex flex-wrap items-center justify-between gap-4">
            {!isProjector ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => openModalWithTab('participants')}
                  className="vonotec-navy-pill px-4 py-1.5 rounded-full text-xs font-bold cursor-pointer"
                >
                  Rappellers ({participants.length})
                </button>
                <button
                  type="button"
                  onClick={() => openModalWithTab('history')}
                  className="vonotec-navy-pill px-4 py-1.5 rounded-full text-xs font-bold cursor-pointer"
                >
                  Winners Log ({history.length})
                </button>
                <button
                  type="button"
                  onClick={() => openModalWithTab('settings')}
                  className="vonotec-navy-pill px-4 py-1.5 rounded-full text-xs font-bold cursor-pointer"
                >
                  Settings
                </button>
              </div>
            ) : (
              <div className="text-xs font-semibold text-slate-300/80">
                {eligibleParticipants.length} active rappellers ready for ascent
              </div>
            )}

            <div className="text-xs text-slate-300/80 hidden sm:block">
              Supports 100s of rappellers • Live surges, rope slips & 100F photo finish
            </div>
          </footer>
        </div>
      )}

      {/* 3. Rooftop Champion Spotlight & Multi-Winner Podium */}
      <SplashRevealOverlay
        stage={stage}
        results={currentBatch}
        currentIndex={revealIndex}
        theme={settings.theme}
        onAdvanceSingle={handleAdvanceSingle}
        onSkipToEnd={handleSkipRevealToEnd}
        onCloseSummary={() => {
          wishSound.playUiClick();
          setStage('idle');
        }}
        onMarkAbsent={handleMarkAbsent}
        onReRaceAbsent={handleReRaceAbsent}
        onCardUnveiled={() => wishSound.playCardUnveil()}
      />

      {/* 4. Rappellers & Race Management Modal */}
      {!isProjector && (
        <ManageModal
          isOpen={modalOpen}
          initialTab={modalTab}
          onClose={() => setModalOpen(false)}
          participants={participants}
          setParticipants={setParticipants}
          history={history}
          setHistory={setHistory}
          settings={settings}
          setSettings={setSettings}
          onResetDemo={handleResetDemo}
          onPlayClick={() => wishSound.playUiClick()}
        />
      )}
    </div>
  );
}

export default App;
