import React, { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { ChevronRight, RefreshCw, ShieldAlert, Sparkles, Trees, Trophy, X } from 'lucide-react';
import { PullResult, ThemeId, WishStage } from '../types/raffle';
import { AnimatedWinterBackdrop } from './AnimatedWinterBackdrop';

interface SplashRevealOverlayProps {
  stage: WishStage;
  results: PullResult[];
  currentIndex: number;
  theme: ThemeId;
  onAdvanceSingle: () => void;
  onSkipToEnd: () => void;
  onCloseSummary: () => void;
  onMarkAbsent: (pullId: string) => void;
  onReRaceAbsent: (pullId: string) => void;
  onCardUnveiled?: () => void;
}

export const SplashRevealOverlay: React.FC<SplashRevealOverlayProps> = ({
  stage,
  results,
  currentIndex,
  theme,
  onAdvanceSingle,
  onSkipToEnd,
  onCloseSummary,
  onMarkAbsent,
  onReRaceAbsent,
  onCardUnveiled,
}) => {
  const [revealedPullId, setRevealedPullId] = useState<string | null>(null);
  const timersRef = useRef<number[]>([]);
  const unveiledPullIdRef = useRef<string | null>(null);
  const currentPull = results[currentIndex];
  const currentPullId = currentPull?.id ?? null;
  const phase: 'silhouette' | 'revealed' =
    currentPullId !== null && revealedPullId === currentPullId ? 'revealed' : 'silhouette';

  const clearAllTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const triggerUnveil = useCallback(
    (pullId: string) => {
      if (unveiledPullIdRef.current === pullId) return;
      unveiledPullIdRef.current = pullId;
      clearAllTimers();
      setRevealedPullId(pullId);
      onCardUnveiled?.();

      confetti({
        particleCount: 95,
        spread: 80,
        origin: { y: 0.55 },
        colors:
          theme === 'christmas'
            ? ['#18355e', '#d63f22', '#fbbf24', '#fde68a', '#10b981', '#ffffff']
            : ['#18355e', '#d63f22', '#38bdf8', '#fbbf24', '#ffffff'],
      });
    },
    [clearAllTimers, onCardUnveiled, theme]
  );

  useEffect(() => {
    if (stage !== 'reveal_single' || !currentPullId) {
      clearAllTimers();
      unveiledPullIdRef.current = null;
      return;
    }

    clearAllTimers();
    unveiledPullIdRef.current = null;

    const delayMs = results.length > 1 ? 650 : 900;
    const revealTimer = window.setTimeout(() => {
      triggerUnveil(currentPullId);
    }, delayMs);
    timersRef.current.push(revealTimer);

    return () => {
      clearAllTimers();
    };
  }, [stage, currentIndex, currentPullId, results.length, clearAllTimers, triggerUnveil]);

  // Keyboard navigation during Single Winner & Multi-Winner Podium
  useEffect(() => {
    if (stage !== 'reveal_single' && stage !== 'summary_multi') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (stage === 'reveal_single' && currentPullId) {
        if (e.key === 'Escape') {
          e.preventDefault();
          onSkipToEnd();
        } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
          const activeTag = document.activeElement?.tagName;
          if (activeTag === 'BUTTON' && e.key === 'Enter') return;
          e.preventDefault();
          if (phase === 'silhouette') {
            triggerUnveil(currentPullId);
          } else {
            onAdvanceSingle();
          }
        }
      } else if (stage === 'summary_multi') {
        if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
          const activeTag = document.activeElement?.tagName;
          if (activeTag === 'BUTTON' && e.key !== 'Escape') return;
          e.preventDefault();
          onCloseSummary();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stage, phase, currentPullId, triggerUnveil, onAdvanceSingle, onSkipToEnd, onCloseSummary]);

  if (stage !== 'reveal_single' && stage !== 'summary_multi') return null;

  // ============================================================================
  // 1. ROOFTOP CHAMPION SPOTLIGHT (NAME PICKER ONLY)
  // ============================================================================
  if (stage === 'reveal_single' && currentPull) {
    const isAbsent = currentPull.status === 'absent';
    const rank = currentPull.finishRank ?? currentIndex + 1;

    return (
      <div
        onClick={() => {
          if (phase === 'silhouette') {
            triggerUnveil(currentPull.id);
          } else {
            onAdvanceSingle();
          }
        }}
        className="fixed inset-0 z-30 flex flex-col justify-between p-6 md:p-10 bg-[#0e1f38] overflow-hidden cursor-pointer"
      >
        <AnimatedWinterBackdrop theme={theme} accentHex="#fbbf24" dimLevel="normal" />

        {/* Top Bar */}
        <div className="relative z-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold tracking-widest uppercase text-slate-200/85">
              Paskong Vonotec Winner {currentIndex + 1} / {results.length}
            </span>
            <span className="px-3 py-0.5 rounded-full bg-amber-400/20 border border-amber-300/70 text-amber-200 text-xs font-bold tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              <span>
                #{rank} to 100F Summit
                {typeof currentPull.finishTimeSeconds === 'number'
                  ? ` • ${currentPull.finishTimeSeconds.toFixed(1)}s`
                  : ''}
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSkipToEnd();
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-white/90 hover:text-amber-200 font-semibold text-base cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            <span>Skip</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Center Stage: Silhouette -> Rooftop Champion Card */}
        <div className="relative z-20 flex-1 flex items-center justify-center my-2">
          {phase === 'silhouette' ? (
            <div className="flex flex-col items-center justify-center space-y-5 animate-silhouette">
              <div className="relative w-44 h-44 sm:w-56 sm:h-56 rounded-full bg-[#091024]/90 border-2 border-amber-300/60 flex items-center justify-center shadow-[0_0_80px_rgba(251,191,36,0.45)]">
                <Trophy className="w-20 h-20 text-amber-300/85 animate-pulse" />
              </div>
              <span className="font-display text-xs tracking-[0.35em] uppercase text-slate-200/85">
                Tap or press Space to announce winner...
              </span>
            </div>
          ) : (
            <div
              key={`splash-${currentPull.id}`}
              className="relative flex flex-col items-center text-center max-w-3xl space-y-5 animate-splash-unveil"
            >
              {/* Champion Crest with Subtle Orbit Ring Halo */}
              <div className="relative flex items-center justify-center mb-1">
                <div className="pointer-events-none absolute -inset-10 rounded-full blur-3xl opacity-45 bg-amber-400" />
                <div className="pointer-events-none absolute -inset-8 opacity-40 animate-orbit-slow text-amber-200">
                  <svg viewBox="0 0 200 200" fill="none" aria-hidden="true" className="w-full h-full">
                    <circle
                      cx="100"
                      cy="100"
                      r="94"
                      stroke="currentColor"
                      strokeWidth="0.7"
                      strokeDasharray="3 5"
                    />
                    <circle
                      cx="100"
                      cy="100"
                      r="86"
                      stroke="currentColor"
                      strokeWidth="0.4"
                      strokeOpacity="0.65"
                    />
                  </svg>
                </div>
                <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-yellow-500 border-4 border-white/85 flex flex-col items-center justify-center text-slate-950 shadow-[0_0_45px_rgba(251,191,36,0.7)]">
                  <Trophy className="w-10 h-10 sm:w-12 sm:h-12" />
                  <span className="text-[11px] font-black uppercase tracking-wider leading-none mt-0.5">
                    #{rank}
                  </span>
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[11px] font-bold text-emerald-200 tracking-wider uppercase">
                <Trees className="w-3.5 h-3.5 text-emerald-300" />
                <span>Standing Tall Together</span>
              </div>

              {(currentPull.participant.department || currentPull.participant.title) && (
                <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-white/10 border border-white/25 text-xs font-semibold tracking-wider uppercase text-amber-100">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>
                    {[currentPull.participant.department, currentPull.participant.title]
                      .filter(Boolean)
                      .join(' • ')}
                  </span>
                </div>
              )}

              <h1
                className={`font-display text-4xl sm:text-6xl md:text-7xl font-black text-white tracking-wide drop-shadow-[0_6px_28px_rgba(0,0,0,0.9)] ${
                  isAbsent ? 'line-through opacity-45' : ''
                }`}
              >
                {currentPull.participant.name}
              </h1>

              <p className="text-sm sm:text-base text-amber-100/90 font-medium">
                {rank === 1
                  ? 'First Rappeller to conquer the 100F Vonotec Tower!'
                  : `Finished #${rank} at the 100F Vonotec Tower!`}
              </p>
            </div>
          )}
        </div>

        {/* Bottom Bar: Mark Absent / Instant Re-Race */}
        <div className="relative z-20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {phase === 'revealed' && (
              <>
                <button
                  type="button"
                  disabled={isAbsent}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkAbsent(currentPull.id);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-rose-950/80 hover:bg-rose-900 disabled:opacity-55 border border-rose-400/40 text-xs font-semibold text-rose-100 cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                >
                  <ShieldAlert className="w-4 h-4" />
                  {isAbsent ? 'Marked Absent' : 'Rappeller Absent? Mark Absent'}
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReRaceAbsent(currentPull.id);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-400/20 hover:bg-amber-400/35 border border-amber-300/60 text-xs font-bold text-amber-100 cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {isAbsent ? 'Re-Race Replacement Now' : 'Absent? Re-Race Now'}
                </button>
              </>
            )}
          </div>

          <span className="text-xs sm:text-sm text-slate-200/85 font-medium">
            {currentIndex + 1 < results.length
              ? 'Click anywhere or press Space for next winner'
              : results.length > 1
              ? 'Click anywhere or press Space for Rooftop Podium'
              : 'Click anywhere or press Space to return'}
          </span>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. MULTI-WINNER ROOFTOP FINISH PODIUM (NAME PICKER ONLY)
  // ============================================================================
  const sortedResults = [...results].sort((a, b) => a.finishRank - b.finishRank);

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-between px-4 sm:px-8 py-6 bg-[#0e1f38] overflow-y-auto">
      <AnimatedWinterBackdrop theme={theme} accentHex="#fbbf24" dimLevel="summary" />

      <div className="relative z-20 flex items-center justify-between max-w-6xl w-full mx-auto">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 mb-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[11px] font-bold text-emerald-200 tracking-wider uppercase">
            <Trees className="w-3.5 h-3.5 text-emerald-300" />
            <span>Paskong Vonotec</span>
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-black text-white">
            Standing Tall Together — {sortedResults.length} Winning Rappellers
          </h2>
          <p className="text-xs text-slate-300">
            A Christmas of Gratitude • Ordered by arrival at 100F Rooftop Summit
          </p>
        </div>
        <button
          type="button"
          aria-label="Close podium and return"
          onClick={onCloseSummary}
          className="w-9 h-9 rounded-full bg-[#ede6d8] hover:bg-white border-2 border-[#cfc4ae] flex items-center justify-center text-[#3b4354] shadow-lg cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          <X className="w-5 h-5 stroke-[2.5]" />
        </button>
      </div>

      <div className="relative z-20 my-auto py-6 max-w-6xl w-full mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {sortedResults.map((pull, idx) => {
            const isFirst = pull.finishRank === 1;
            const isAbsent = pull.status === 'absent';
            return (
              <div
                key={pull.id}
                style={{ animationDelay: `${idx * 65}ms` }}
                className={`animate-arch-card rounded-2xl p-4 border flex flex-col justify-between gap-3 shadow-xl backdrop-blur-md ${
                  isFirst
                    ? 'bg-gradient-to-b from-amber-500/25 via-amber-950/60 to-slate-950/85 border-amber-300/80'
                    : 'bg-slate-900/80 border-slate-700/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                      isFirst
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-sky-500/20 text-sky-200 border border-sky-400/40'
                    }`}
                  >
                    #{pull.finishRank}
                  </span>
                  {typeof pull.finishTimeSeconds === 'number' && (
                    <span className="text-[11px] font-semibold text-amber-200/90 tabular-nums">
                      {pull.finishTimeSeconds.toFixed(1)}s
                    </span>
                  )}
                </div>

                <div className="text-center py-2 space-y-1">
                  <div
                    className={`font-display text-lg font-extrabold text-white leading-snug ${
                      isAbsent ? 'line-through opacity-45' : ''
                    }`}
                  >
                    {pull.participant.name}
                  </div>
                  {(pull.participant.department || pull.participant.title) && (
                    <div className="text-xs text-slate-300 truncate">
                      {pull.participant.department || pull.participant.title}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-center gap-2 pt-1 border-t border-white/10">
                  <button
                    type="button"
                    disabled={isAbsent}
                    onClick={() => onMarkAbsent(pull.id)}
                    className="px-2.5 py-1 rounded text-[11px] text-slate-300 hover:text-rose-200 disabled:opacity-40 cursor-pointer transition"
                  >
                    {isAbsent ? 'Absent' : 'Absent?'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onReRaceAbsent(pull.id)}
                    className="px-2.5 py-1 rounded bg-amber-400/15 hover:bg-amber-400/30 border border-amber-300/40 text-[11px] font-semibold text-amber-200 cursor-pointer transition"
                  >
                    Re-Race
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative z-20 flex justify-center">
        <button
          type="button"
          onClick={onCloseSummary}
          className="px-6 py-2.5 rounded-full bg-[#ede6d8] hover:bg-white text-[#2b3245] font-bold text-sm shadow-lg cursor-pointer transition"
        >
          Back to Skyscraper Race
        </button>
      </div>
    </div>
  );
};
