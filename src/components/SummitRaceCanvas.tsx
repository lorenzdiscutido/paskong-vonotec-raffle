import React, { useEffect, useRef, useState } from 'react';
import { Building2, FastForward, Flag, Snowflake, Trophy, Zap } from 'lucide-react';
import { Participant, ThemeId, WishStage } from '../types/raffle';
import {
  createRaceSimulation,
  fastForwardRace,
  getRaceLeaderboard,
  RaceEventFeedItem,
  RaceSimulation,
  RappellerState,
  ROOFTOP_FLOOR,
  stepRaceSimulation,
} from '../utils/raceEngine';
import { wishSound } from '../utils/soundEngine';

interface SummitRaceCanvasProps {
  theme: ThemeId;
  stage: WishStage;
  participants: Participant[];
  targetWinnerCount: number;
  dramaIntensity: number;
  raceDurationSeconds: number;
  sequenceKey: number;
  skipNonce: number;
  onRaceComplete: (winners: RappellerState[]) => void;
  onCaptionChange?: (caption: string) => void;
  onSkipRace?: () => void;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  kind: 'spark' | 'ice';
}

interface SnowFlake {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
}

interface SkyStar {
  x: number;
  y: number;
  r: number;
  phase: number;
}

interface RaceHudSnapshot {
  countdown: number;
  elapsed: number;
  targetDuration: number;
  isPhotoFinish: boolean;
  isComplete: boolean;
  leaders: RappellerState[];
  totalRappellers: number;
  events: RaceEventFeedItem[];
}

const MAX_PARTICLES = 140;
const MAX_SNOW = 130;
const MAX_STARS = 110;
const VISIBLE_FLOORS = 42;
const WINDOW_COLS = 14;

const FLOOR_LANDMARKS = [
  { floor: 0, label: '0F VONOTEC GROUND LOBBY' },
  { floor: 25, label: '25F SKYLINE LOUNGE' },
  { floor: 50, label: '50F OBSERVATION DECK' },
  { floor: 75, label: '75F PENTHOUSE TOWER' },
  { floor: 100, label: '100F ROOFTOP SUMMIT' },
] as const;

const BG_TOWERS = [
  { xFrac: 0.0, wFrac: 0.085, hFrac: 0.72 },
  { xFrac: 0.055, wFrac: 0.095, hFrac: 0.56 },
  { xFrac: 0.85, wFrac: 0.09, hFrac: 0.61 },
  { xFrac: 0.92, wFrac: 0.085, hFrac: 0.78 },
] as const;

function getBuildingBounds(width: number): { left: number; right: number; width: number } {
  if (width >= 1024) {
    const left = Math.max(244, width * 0.19);
    const right = width - Math.max(68, width * 0.06);
    return { left, right, width: right - left };
  }
  const left = width * 0.05;
  const right = width * 0.9;
  return { left, right, width: right - left };
}

export const SummitRaceCanvas: React.FC<SummitRaceCanvasProps> = ({
  theme,
  stage,
  participants,
  targetWinnerCount,
  dramaIntensity,
  raceDurationSeconds,
  sequenceKey,
  skipNonce,
  onRaceComplete,
  onCaptionChange,
  onSkipRace,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const propsRef = useRef({
    theme,
    stage,
    participants,
    targetWinnerCount,
    dramaIntensity,
    raceDurationSeconds,
    onRaceComplete,
    onCaptionChange,
  });

  useEffect(() => {
    propsRef.current = {
      theme,
      stage,
      participants,
      targetWinnerCount,
      dramaIntensity,
      raceDurationSeconds,
      onRaceComplete,
      onCaptionChange,
    };
  }, [
    theme,
    stage,
    participants,
    targetWinnerCount,
    dramaIntensity,
    raceDurationSeconds,
    onRaceComplete,
    onCaptionChange,
  ]);

  const simRef = useRef<RaceSimulation | null>(null);
  const cameraAltRef = useRef(18);
  const completeHoldRef = useRef(0);
  const completedCalledRef = useRef(false);
  const lastCountdownCeilRef = useRef(2);
  const lastSfxTimeRef = useRef(0);
  const activeSequenceRef = useRef(-1);
  const prevSkipNonceRef = useRef(skipNonce);

  const [hud, setHud] = useState<RaceHudSnapshot | null>(null);

  // Initialize fresh live physics race on each sequenceKey when entering 'racing'
  useEffect(() => {
    if (stage !== 'racing') {
      if (stage === 'idle') {
        simRef.current = null;
        setHud(null);
      }
      return;
    }

    if (activeSequenceRef.current === sequenceKey) return;
    activeSequenceRef.current = sequenceKey;

    const sim = createRaceSimulation(
      propsRef.current.participants,
      Math.max(1, propsRef.current.targetWinnerCount),
      propsRef.current.dramaIntensity,
      propsRef.current.raceDurationSeconds
    );
    simRef.current = sim;
    cameraAltRef.current = 18;
    completeHoldRef.current = 0;
    completedCalledRef.current = false;
    lastCountdownCeilRef.current = Math.ceil(sim.countdown);
    lastSfxTimeRef.current = 0;

    wishSound.playCountdownTick(false);
    propsRef.current.onCaptionChange?.('Rappellers strapped in at Ground Floor...');
    setHud({
      countdown: sim.countdown,
      elapsed: 0,
      targetDuration: sim.targetDurationSeconds,
      isPhotoFinish: false,
      isComplete: false,
      leaders: getRaceLeaderboard(sim).slice(0, 5),
      totalRappellers: sim.rappellers.length,
      events: sim.events,
    });
  }, [stage, sequenceKey]);

  // Handle instant "Skip to Finish" fast-forward
  useEffect(() => {
    if (skipNonce === prevSkipNonceRef.current) return;
    prevSkipNonceRef.current = skipNonce;

    if (propsRef.current.stage !== 'racing' || completedCalledRef.current) return;
    const sim = simRef.current;
    if (!sim) return;

    completedCalledRef.current = true;
    const winners = fastForwardRace(sim);
    setHud({
      countdown: 0,
      elapsed: sim.elapsed,
      targetDuration: sim.targetDurationSeconds,
      isPhotoFinish: sim.isPhotoFinish,
      isComplete: true,
      leaders: getRaceLeaderboard(sim).slice(0, 5),
      totalRappellers: sim.rappellers.length,
      events: sim.events,
    });
    propsRef.current.onRaceComplete(winners);
  }, [skipNonce]);

  // Pre-allocated render loop & 2D Canvas Skyscraper Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0.6,
      size: 3,
      hue: 45,
      kind: 'spark',
    }));
    let particleCursor = 0;

    const spawnBurst = (
      x: number,
      y: number,
      count: number,
      hue: number,
      kind: 'spark' | 'ice'
    ) => {
      for (let i = 0; i < count; i++) {
        const p = particles[particleCursor];
        particleCursor = (particleCursor + 1) % MAX_PARTICLES;
        p.active = true;
        p.x = x + (Math.random() - 0.5) * 14;
        p.y = y + (Math.random() - 0.5) * 12;
        p.vx = (Math.random() - 0.5) * 90;
        p.vy = kind === 'spark' ? 40 + Math.random() * 110 : 60 + Math.random() * 140;
        p.maxLife = 0.45 + Math.random() * 0.45;
        p.life = p.maxLife;
        p.size = 2 + Math.random() * 3.5;
        p.hue = hue;
        p.kind = kind;
      }
    };

    const snowFlakes: SnowFlake[] = Array.from({ length: MAX_SNOW }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 1.1 + Math.random() * 2.4,
      speed: 0.04 + Math.random() * 0.1,
      drift: (Math.random() - 0.5) * 0.025,
    }));

    const skyStars: SkyStar[] = Array.from({ length: MAX_STARS }, () => ({
      x: Math.random(),
      y: Math.random() * 0.55,
      r: 0.7 + Math.random() * 1.3,
      phase: Math.random() * Math.PI * 2,
    }));

    const skylineImg = new Image();
    skylineImg.src = '/city-skyline-bg.jpg';
    const treeImg = new Image();
    treeImg.src = '/christmas-tree.svg';

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

    let cssWidth = window.innerWidth;
    let cssHeight = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const handleResize = () => {
      cssWidth = window.innerWidth;
      cssHeight = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    let lastTimestamp = performance.now();
    let elapsedTotal = 0;
    let lastHudSync = 0;
    let lastCaptionSync = 0;
    let rafId = 0;

    const floorToY = (floor: number, camAlt: number, height: number): number => {
      const pxPerFloor = height / VISIBLE_FLOORS;
      return height * 0.62 - (floor - camAlt) * pxPerFloor;
    };

    const drawRappellerFigure = (
      x: number,
      y: number,
      rappeller: RappellerState,
      isLeader: boolean,
      nowSec: number,
      crowdScale: number
    ) => {
      ctx.save();
      ctx.translate(x, y);
      if (crowdScale !== 1) {
        ctx.scale(crowdScale, crowdScale);
      }

      if (rappeller.state === 'slip') {
        ctx.rotate(0.35 * Math.sin(nowSec * 22));
      } else if (rappeller.state === 'boost') {
        ctx.rotate(Math.sin(nowSec * 14) * 0.06);
      }

      if (rappeller.state === 'boost' || isLeader) {
        const glowGrad = ctx.createRadialGradient(
          0,
          0,
          4,
          0,
          0,
          rappeller.state === 'boost' ? 30 : 22
        );
        glowGrad.addColorStop(
          0,
          rappeller.state === 'boost' ? 'rgba(251, 191, 36, 0.55)' : 'rgba(253, 224, 71, 0.25)'
        );
        glowGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(0, 0, rappeller.state === 'boost' ? 30 : 22, 0, Math.PI * 2);
        ctx.fill();
      } else if (rappeller.state === 'slip') {
        const slipGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 26);
        slipGrad.addColorStop(0, 'rgba(244, 63, 94, 0.5)');
        slipGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
        ctx.fillStyle = slipGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.fill();
      }

      const armSwing = rappeller.state === 'finished' ? 0 : Math.sin(rappeller.animPhase) * 6.5;
      const legSwing = rappeller.state === 'finished' ? 0 : Math.cos(rappeller.animPhase) * 5.5;

      // Subtle upward headlamp cone against skyscraper glass
      const beamGrad = ctx.createLinearGradient(0, -14, 0, -42);
      beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.3)');
      beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(-4, -14);
      ctx.lineTo(-14, -42);
      ctx.lineTo(14, -42);
      ctx.lineTo(4, -14);
      ctx.closePath();
      ctx.fill();

      // Boots / legs
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-3.5, 6);
      ctx.lineTo(-5.5, 14 + legSwing * 0.6);
      ctx.moveTo(3.5, 6);
      ctx.lineTo(5.5, 14 - legSwing * 0.6);
      ctx.stroke();

      // Harness / gear pack
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(-8.5, -5, 5, 11, 2);
      ctx.fill();
      ctx.stroke();

      // Animated arms pulling rappelling cable
      ctx.strokeStyle = `hsl(${rappeller.colorHue}, 75%, 64%)`;
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      if (rappeller.state === 'slip') {
        ctx.moveTo(-5, -3);
        ctx.lineTo(-13, -10);
        ctx.moveTo(5, -3);
        ctx.lineTo(13, -8);
      } else {
        ctx.moveTo(-5, -3);
        ctx.lineTo(-1, -13 + armSwing);
        ctx.moveTo(5, -3);
        ctx.lineTo(1, -13 - armSwing);
      }
      ctx.stroke();

      // Colored rappel suit torso
      ctx.fillStyle = `hsl(${rappeller.colorHue}, 78%, 54%)`;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(-6.5, -6, 13, 14, 4);
      ctx.fill();
      ctx.stroke();

      // Safety helmet & headlamp dot
      ctx.fillStyle = rappeller.state === 'boost' ? '#fde047' : '#f8fafc';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, -11, 5.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(0, -13.5, 1.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    };

    const drawRappellerLabel = (
      x: number,
      y: number,
      rappeller: RappellerState,
      rank: number,
      compact: boolean
    ) => {
      const clampedX = Math.max(54, Math.min(cssWidth - 54, x));
      const labelY = y - 24;

      ctx.save();
      if (compact) {
        ctx.font = '700 9.5px "Plus Jakarta Sans", sans-serif';
        const tag = `#${rank}`;
        const tw = ctx.measureText(tag).width + 8;
        ctx.fillStyle = 'rgba(10, 18, 36, 0.8)';
        ctx.strokeStyle = `hsla(${rappeller.colorHue}, 80%, 65%, 0.75)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(clampedX - tw / 2, labelY - 10, tw, 15, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, clampedX, labelY - 2.5);
        ctx.restore();
        return;
      }

      ctx.font = '700 11.5px "Plus Jakarta Sans", sans-serif';
      const displayName =
        rappeller.participant.name.length > 16
          ? `${rappeller.participant.name.slice(0, 15)}…`
          : rappeller.participant.name;
      const prefix = rank <= 3 ? `#${rank} ` : '';
      const fullText = `${prefix}${displayName}`;
      const textWidth = ctx.measureText(fullText).width;
      const pillW = Math.max(58, textWidth + 16);
      const pillH = 20;

      ctx.fillStyle =
        rank === 1
          ? 'rgba(120, 53, 15, 0.92)'
          : rappeller.state === 'slip'
          ? 'rgba(127, 29, 29, 0.9)'
          : rappeller.state === 'boost'
          ? 'rgba(146, 64, 14, 0.9)'
          : 'rgba(10, 18, 36, 0.88)';

      ctx.strokeStyle =
        rank === 1
          ? '#fbbf24'
          : rappeller.state === 'slip'
          ? '#fb7185'
          : rappeller.state === 'boost'
          ? '#fde047'
          : `hsla(${rappeller.colorHue}, 80%, 68%, 0.85)`;
      ctx.lineWidth = rank === 1 ? 1.8 : 1.2;

      ctx.beginPath();
      ctx.roundRect(clampedX - pillW / 2, labelY - pillH, pillW, pillH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = rank === 1 ? '#fef3c7' : '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fullText, clampedX, labelY - pillH / 2 + 0.5);

      if (rappeller.eventLabel && rappeller.state !== 'rappelling') {
        ctx.font = '800 9.5px "Plus Jakarta Sans", sans-serif';
        const evtText = rappeller.eventLabel;
        const ew = ctx.measureText(evtText).width + 10;
        ctx.fillStyle =
          rappeller.state === 'boost' || rappeller.state === 'finished'
            ? '#f59e0b'
            : rappeller.state === 'slip'
            ? '#e11d48'
            : '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(clampedX - ew / 2, labelY - pillH - 16, ew, 14, 4);
        ctx.fill();
        ctx.fillStyle =
          rappeller.state === 'boost' || rappeller.state === 'finished' ? '#1c1002' : '#ffffff';
        ctx.fillText(evtText, clampedX, labelY - pillH - 8.5);
      }

      ctx.restore();
    };

    const renderFrame = (now: number) => {
      rafId = requestAnimationFrame(renderFrame);
      const cur = propsRef.current;

      if (cur.stage === 'reveal_single' || cur.stage === 'summary_multi') {
        lastTimestamp = now;
        return;
      }

      const rawDt = Math.min(0.05, Math.max(0.001, (now - lastTimestamp) / 1000));
      lastTimestamp = now;
      elapsedTotal += rawDt;
      const bounds = getBuildingBounds(cssWidth);

      // 1. Step live race simulation when racing
      const sim = simRef.current;
      let leaderboard: RappellerState[] = [];

      if (cur.stage === 'racing' && sim) {
        if (!sim.isComplete) {
          const prevCountdownCeil = lastCountdownCeilRef.current;
          stepRaceSimulation(sim, rawDt);

          if (sim.countdown > 0) {
            const nextCeil = Math.ceil(sim.countdown);
            if (nextCeil < prevCountdownCeil && nextCeil > 0) {
              lastCountdownCeilRef.current = nextCeil;
              wishSound.playCountdownTick(false);
            }
          }

          if (sim.lastEventSfx === 'start') {
            wishSound.playCountdownTick(true);
            cur.onCaptionChange?.('Rappellers racing up the 100-story Skyscraper!');
          } else if (sim.lastEventSfx === 'photo') {
            wishSound.playPhotoFinishHeartbeat();
            cur.onCaptionChange?.('PHOTO FINISH AT THE ROOFTOP!');
          } else if (
            (sim.lastEventSfx === 'boost' || sim.lastEventSfx === 'slip') &&
            now - lastSfxTimeRef.current > 360
          ) {
            lastSfxTimeRef.current = now;
            if (sim.lastEventSfx === 'boost') {
              wishSound.playBoostSfx();
            } else {
              wishSound.playSlipSfx();
            }
          }
        } else if (!completedCalledRef.current) {
          completeHoldRef.current += rawDt;
          if (completeHoldRef.current >= 0.85) {
            completedCalledRef.current = true;
            const finalWinners = getRaceLeaderboard(sim).slice(
              0,
              Math.min(sim.targetWinners, sim.rappellers.length)
            );
            cur.onRaceComplete(finalWinners);
          }
        }

        leaderboard = getRaceLeaderboard(sim);
        const leaderAlt = leaderboard[0]?.altitude ?? 0;

        const desiredCamAlt =
          sim.countdown > 0
            ? 18
            : sim.isComplete
            ? 85
            : Math.max(18, Math.min(85, leaderAlt - 4));
        cameraAltRef.current += (desiredCamAlt - cameraAltRef.current) * Math.min(1, rawDt * 4.5);

        if (!sim.isComplete && sim.countdown <= 0) {
          for (const r of sim.rappellers) {
            if (r.state === 'boost' && Math.random() < 0.22) {
              const px = bounds.left + 24 + r.laneX * (bounds.width - 48);
              const py = floorToY(r.altitude, cameraAltRef.current, cssHeight);
              spawnBurst(px, py + 10, 2, 42, 'spark');
            } else if (r.state === 'slip' && Math.random() < 0.3) {
              const px = bounds.left + 24 + r.laneX * (bounds.width - 48);
              const py = floorToY(r.altitude, cameraAltRef.current, cssHeight);
              spawnBurst(px, py - 4, 2, 200, 'ice');
            }
          }
        }

        if (now - lastCaptionSync > 350 && sim.countdown <= 0 && !sim.isComplete && leaderboard[0]) {
          lastCaptionSync = now;
          const lead = leaderboard[0];
          cur.onCaptionChange?.(
            sim.isPhotoFinish
              ? `PHOTO FINISH — ${lead.participant.name} leads at ${lead.altitude.toFixed(1)}F!`
              : `${lead.participant.name} leads the climb at ${lead.altitude.toFixed(0)}F / 100F`
          );
        }

        if (now - lastHudSync > 95 || sim.isComplete) {
          lastHudSync = now;
          setHud({
            countdown: sim.countdown,
            elapsed: sim.elapsed,
            targetDuration: sim.targetDurationSeconds,
            isPhotoFinish: sim.isPhotoFinish,
            isComplete: sim.isComplete,
            leaders: leaderboard.slice(0, 5),
            totalRappellers: sim.rappellers.length,
            events: sim.events,
          });
        }
      } else {
        const sway = prefersReducedMotion ? 1.5 : 8;
        cameraAltRef.current = 52 + Math.sin(elapsedTotal * 0.16) * sway;
      }

      const camAlt = cameraAltRef.current;
      const isXmas = cur.theme === 'christmas';

      // =========================================================================
      // 2. RENDER CITY NIGHT SKY, STARS & DISTANT METROPOLIS SKYLINE
      // =========================================================================
      ctx.save();
      ctx.scale(dpr, dpr);

      const skyGrad = ctx.createLinearGradient(0, 0, 0, cssHeight);
      if (isXmas) {
        skyGrad.addColorStop(0, '#071224');
        skyGrad.addColorStop(0.55, '#0e1f38');
        skyGrad.addColorStop(1, '#18355e');
      } else {
        skyGrad.addColorStop(0, '#060718');
        skyGrad.addColorStop(0.55, '#111838');
        skyGrad.addColorStop(1, '#1a2a4c');
      }
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      for (const s of skyStars) {
        const alpha = 0.3 + 0.55 * (0.5 + 0.5 * Math.sin(elapsedTotal * 1.6 + s.phase));
        ctx.fillStyle = `rgba(226, 240, 255, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s.x * cssWidth, s.y * cssHeight, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle aurora / city horizon glow
      const auroraColor = isXmas ? 'rgba(34, 211, 153, 0.12)' : 'rgba(56, 189, 248, 0.13)';
      ctx.beginPath();
      const auroraBaseY = cssHeight * 0.16 + camAlt * 0.35;
      ctx.moveTo(0, auroraBaseY);
      for (let x = 0; x <= cssWidth; x += 64) {
        ctx.lineTo(
          x,
          auroraBaseY + Math.sin(x * 0.006 + elapsedTotal * 0.45) * 22
        );
      }
      ctx.lineTo(cssWidth, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = auroraColor;
      ctx.fill();

      // Real night city skyline photo backdrop (with parallax & Vonotec navy color grade)
      if (skylineImg.complete && skylineImg.naturalWidth > 0) {
        const imgScale = Math.max(
          cssWidth / skylineImg.naturalWidth,
          (cssHeight * 1.15) / skylineImg.naturalHeight
        );
        const drawW = skylineImg.naturalWidth * imgScale;
        const drawH = skylineImg.naturalHeight * imgScale;
        const drawX = (cssWidth - drawW) * 0.5;
        const parallaxY = ((camAlt / ROOFTOP_FLOOR) * (drawH - cssHeight)) * 0.45;
        const drawY = cssHeight - drawH + parallaxY;

        ctx.save();
        ctx.globalAlpha = 0.36;
        ctx.drawImage(skylineImg, drawX, drawY, drawW, drawH);
        ctx.restore();
      } else {
        const bgShiftY = camAlt * 2.1;
        for (let t = 0; t < BG_TOWERS.length; t++) {
          const tower = BG_TOWERS[t];
          const tx = tower.xFrac * cssWidth;
          const tw = tower.wFrac * cssWidth;
          const topY = cssHeight * (1 - tower.hFrac) + bgShiftY;

          ctx.fillStyle = isXmas ? '#0a162b' : '#0c132b';
          ctx.fillRect(tx, topY, tw, cssHeight - topY + 40);
        }
      }

      // =========================================================================
      // 3. MAIN 100-STORY TALL SKYSCRAPER FACADE, LIT WINDOWS & ROOFTOP FINISH
      // =========================================================================
      const bldgLeft = bounds.left;
      const bldgRight = bounds.right;
      const bldgWidth = bounds.width;
      const rooftopY = floorToY(ROOFTOP_FLOOR, camAlt, cssHeight);
      const groundY = floorToY(0, camAlt, cssHeight);
      const bldgTopY = Math.max(-40, rooftopY);
      const bldgBottomY = Math.min(cssHeight + 40, groundY + 40);

      if (bldgBottomY > bldgTopY) {
        // Steel & glass tower curtain wall (Vonotec Navy palette)
        const facadeGrad = ctx.createLinearGradient(bldgLeft, 0, bldgRight, 0);
        facadeGrad.addColorStop(0, '#0e1f38');
        facadeGrad.addColorStop(0.18, '#18355e');
        facadeGrad.addColorStop(0.5, '#22467b');
        facadeGrad.addColorStop(0.82, '#18355e');
        facadeGrad.addColorStop(1, '#0e1f38');
        ctx.fillStyle = facadeGrad;
        ctx.fillRect(bldgLeft, bldgTopY, bldgWidth, bldgBottomY - bldgTopY);

        // Architectural side steel columns with subtle Vonotec navy accent
        ctx.fillStyle = '#264878';
        ctx.fillRect(bldgLeft, bldgTopY, 8, bldgBottomY - bldgTopY);
        ctx.fillRect(bldgRight - 8, bldgTopY, 8, bldgBottomY - bldgTopY);

        // Pre-computed illuminated office window grid per floor (0..98)
        const pxPerFloor = cssHeight / VISIBLE_FLOORS;
        const minVisibleFloor = Math.max(1, Math.floor(camAlt - VISIBLE_FLOORS * 0.65));
        const maxVisibleFloor = Math.min(98, Math.ceil(camAlt + VISIBLE_FLOORS * 0.65));
        const usableWidth = bldgWidth - 36;
        const colStep = usableWidth / WINDOW_COLS;
        const winW = Math.max(8, colStep * 0.56);
        const winH = Math.max(6, pxPerFloor * 0.54);

        for (let f = minVisibleFloor; f <= maxVisibleFloor; f++) {
          const fy = floorToY(f, camAlt, cssHeight);
          // Floor slab divider girder
          ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
          ctx.fillRect(bldgLeft + 8, fy, bldgWidth - 16, 2.5);

          for (let c = 0; c < WINDOW_COLS; c++) {
            const hash = (f * 31 + c * 17) % 13;
            const wx = bldgLeft + 18 + c * colStep + (colStep - winW) * 0.5;
            const wy = fy - winH - 3;
            if (hash < 4) {
              ctx.fillStyle = 'rgba(253, 224, 71, 0.42)';
            } else if (hash < 7) {
              ctx.fillStyle = 'rgba(125, 211, 252, 0.24)';
            } else {
              ctx.fillStyle = 'rgba(9, 17, 34, 0.62)';
            }
            ctx.fillRect(wx, wy, winW, winH);
          }
        }

        // Diagonal architectural glass reflection sheen
        ctx.save();
        ctx.beginPath();
        ctx.rect(bldgLeft, bldgTopY, bldgWidth, bldgBottomY - bldgTopY);
        ctx.clip();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
        ctx.beginPath();
        ctx.moveTo(bldgLeft + bldgWidth * 0.15, bldgTopY);
        ctx.lineTo(bldgLeft + bldgWidth * 0.36, bldgTopY);
        ctx.lineTo(bldgLeft + bldgWidth * 0.08, bldgBottomY);
        ctx.lineTo(bldgLeft - bldgWidth * 0.12, bldgBottomY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Floor Landmark Lines & Badges
        for (const lm of FLOOR_LANDMARKS) {
          const ly = floorToY(lm.floor, camAlt, cssHeight);
          if (ly < -20 || ly > cssHeight + 20) continue;

          ctx.strokeStyle =
            lm.floor === ROOFTOP_FLOOR
              ? 'rgba(251, 191, 36, 0.92)'
              : 'rgba(186, 230, 253, 0.32)';
          ctx.lineWidth = lm.floor === ROOFTOP_FLOOR ? 2.5 : 1.2;
          ctx.setLineDash(lm.floor === ROOFTOP_FLOOR ? [10, 6] : [6, 8]);
          ctx.beginPath();
          ctx.moveTo(bldgLeft, ly);
          ctx.lineTo(bldgRight, ly);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.font = '700 10.5px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = lm.floor === ROOFTOP_FLOOR ? '#fde047' : 'rgba(226, 240, 255, 0.78)';
          ctx.textAlign = 'left';
          ctx.fillText(lm.label, bldgLeft + 14, ly - 6);
        }

        // Rooftop Parapet, Blinking Aircraft Warning Beacons & Finish Banner
        if (rooftopY > -150 && rooftopY < cssHeight + 60) {
          // Rooftop concrete/steel parapet ledge with Vonotec Crimson festive ribbon trim
          ctx.fillStyle = '#18355e';
          ctx.fillRect(bldgLeft - 8, rooftopY - 14, bldgWidth + 16, 14);
          ctx.fillStyle = '#d63f22';
          ctx.fillRect(bldgLeft - 8, rooftopY - 17, bldgWidth + 16, 4);

          // Tower Logo Sign atop Parapet
          ctx.font = '800 11px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = isXmas ? '#fde047' : '#7dd3fc';
          ctx.textAlign = 'center';
          ctx.fillText('VONOTEC TOWER', cssWidth * 0.5, rooftopY - 3.5);

          // Corner communication antennas with blinking red beacons
          const beaconAlpha = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(elapsedTotal * 5));
          for (const sideX of [bldgLeft + 18, bldgRight - 18]) {
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(sideX, rooftopY - 16);
            ctx.lineTo(sideX, rooftopY - 62);
            ctx.stroke();
            ctx.fillStyle = `rgba(214, 63, 34, ${beaconAlpha.toFixed(2)})`;
            ctx.beginPath();
            ctx.arc(sideX, rooftopY - 64, 4.2, 0, Math.PI * 2);
            ctx.fill();
          }

          // Finish Line Banner (Standing Tall Together — Vonotec Crimson & Gold)
          ctx.fillStyle = sim?.isComplete ? 'rgba(214, 63, 34, 0.65)' : 'rgba(24, 53, 94, 0.78)';
          ctx.fillRect(bldgLeft + 36, rooftopY - 40, bldgWidth - 72, 19);
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 1.8;
          ctx.strokeRect(bldgLeft + 36, rooftopY - 40, bldgWidth - 72, 19);

          ctx.font = '800 10.5px "Cinzel", serif';
          ctx.fillStyle = '#fef3c7';
          ctx.textAlign = 'center';
          ctx.fillText(
            sim?.isComplete
              ? 'A CHRISTMAS OF GRATITUDE — ROOFTOP CONQUERED'
              : 'STANDING TALL TOGETHER — 100F ROOFTOP',
            cssWidth * 0.5,
            rooftopY - 26
          );

          // Center Rooftop Prop (Real SVG Christmas Tree or Illuminated Spire)
          const propX = cssWidth * 0.5;
          const propY = rooftopY - 42;
          if (isXmas && treeImg.complete && treeImg.naturalWidth > 0) {
            ctx.drawImage(treeImg, propX - 24, propY - 58, 48, 58);
          } else if (isXmas) {
            ctx.fillStyle = '#065f46';
            for (let tier = 0; tier < 3; tier++) {
              const tw = 24 - tier * 5.5;
              const ty = propY - tier * 13;
              ctx.beginPath();
              ctx.moveTo(propX, ty - 20);
              ctx.lineTo(propX - tw, ty);
              ctx.lineTo(propX + tw, ty);
              ctx.closePath();
              ctx.fill();
            }
          } else {
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(propX, propY);
            ctx.lineTo(propX, propY - 48);
            ctx.stroke();

            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(propX, propY - 50, 4.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // =========================================================================
      // 4. RAPPELLING CABLES, RAPPELLERS & READABLE NAME TAGS
      // =========================================================================
      if (cur.stage === 'idle') {
        const previewCount = Math.min(
          14,
          Math.max(4, cur.participants.filter((p) => p.active).length)
        );
        for (let i = 0; i < previewCount; i++) {
          const rx = bldgLeft + 24 + (i / (previewCount - 1)) * (bldgWidth - 48);
          const sway = Math.sin(elapsedTotal * 1.1 + i * 0.7) * 4;
          ctx.strokeStyle = 'rgba(226, 232, 240, 0.25)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(rx, Math.max(0, rooftopY));
          ctx.quadraticCurveTo(
            rx + sway,
            cssHeight * 0.5,
            rx + sway * 0.5,
            Math.min(cssHeight, groundY)
          );
          ctx.stroke();
        }
      } else if (sim) {
        const rappellers = sim.rappellers;
        const totalRacers = rappellers.length;
        const crowdScale = totalRacers > 75 ? 0.66 : totalRacers > 35 ? 0.8 : 1;

        for (const r of rappellers) {
          const lanePxX = bldgLeft + 24 + r.laneX * (bldgWidth - 48);
          const anchorY = Math.max(-20, rooftopY);
          const rappellerY = floorToY(r.altitude, camAlt, cssHeight);
          const swayOffset = Math.sin(elapsedTotal * 8 + r.laneIndex) * r.ropeSway * 14;

          if (rooftopY > -20 && rooftopY < cssHeight + 20) {
            ctx.fillStyle = `hsl(${r.colorHue}, 80%, 70%)`;
            ctx.beginPath();
            ctx.arc(lanePxX, rooftopY, totalRacers > 60 ? 2 : 3, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.strokeStyle =
            r.state === 'boost'
              ? 'rgba(253, 224, 71, 0.9)'
              : r.state === 'slip'
              ? 'rgba(251, 113, 133, 0.85)'
              : totalRacers > 60
              ? 'rgba(226, 232, 240, 0.34)'
              : 'rgba(226, 232, 240, 0.55)';
          ctx.lineWidth = r.state === 'boost' ? 2.2 : totalRacers > 60 ? 1.1 : 1.6;
          ctx.beginPath();
          ctx.moveTo(lanePxX, anchorY);
          ctx.quadraticCurveTo(
            lanePxX + swayOffset,
            (anchorY + Math.min(cssHeight, rappellerY + 26)) * 0.5,
            lanePxX + swayOffset * 0.65,
            Math.max(anchorY, Math.min(cssHeight, rappellerY + 16))
          );
          ctx.stroke();
        }

        const drawOrder = [...rappellers].sort((a, b) => a.altitude - b.altitude);
        const rankMap = new Map<string, number>();
        leaderboard.forEach((r, idx) => rankMap.set(r.participant.id, idx + 1));

        for (const r of drawOrder) {
          const rank = rankMap.get(r.participant.id) ?? totalRacers;
          const swayOffset = Math.sin(elapsedTotal * 8 + r.laneIndex) * r.ropeSway * 10;
          const rx = bldgLeft + 24 + r.laneX * (bldgWidth - 48) + swayOffset;
          const ry = floorToY(r.altitude, camAlt, cssHeight);
          if (ry < -60 || ry > cssHeight + 60) continue;

          drawRappellerFigure(rx, ry, r, rank === 1, elapsedTotal, crowdScale);

          const showFullLabel =
            totalRacers <= 22 || rank <= 16 || r.state === 'boost' || r.state === 'slip';
          if (showFullLabel || rank <= 32) {
            drawRappellerLabel(rx, ry, r, rank, !showFullLabel);
          }
        }

        // Right-Edge Canvas Skyscraper Elevation Tracker (placed cleanly in right sky margin)
        const trackX = bldgRight + (cssWidth - bldgRight) * 0.5;
        const trackTop = Math.max(96, cssHeight * 0.18);
        const trackH = cssHeight * 0.64;
        ctx.fillStyle = 'rgba(10, 16, 32, 0.8)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(trackX - 9, trackTop - 10, 18, trackH + 20, 9);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(trackX - 1.5, trackTop, 3, trackH);

        for (const r of rappellers) {
          const frac = Math.max(0, Math.min(1, r.altitude / ROOFTOP_FLOOR));
          const dotY = trackTop + trackH * (1 - frac);
          const rank = rankMap.get(r.participant.id) ?? totalRacers;
          ctx.fillStyle = rank === 1 ? '#fbbf24' : `hsl(${r.colorHue}, 82%, 62%)`;
          ctx.beginPath();
          ctx.arc(trackX, dotY, rank === 1 ? 5 : 2.6, 0, Math.PI * 2);
          ctx.fill();
          if (rank === 1) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }
        }

        ctx.font = '700 9px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fde047';
        ctx.fillText('100F', trackX, trackTop - 15);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText('0F', trackX, trackTop + trackH + 22);
      }

      // =========================================================================
      // 5. BURST PARTICLES & DRIFTING SNOWFALL
      // =========================================================================
      for (const p of particles) {
        if (!p.active) continue;
        p.life -= rawDt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        p.x += p.vx * rawDt;
        p.y += p.vy * rawDt;
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle =
          p.kind === 'spark'
            ? `hsla(${p.hue}, 95%, 65%, ${alpha.toFixed(2)})`
            : `rgba(224, 242, 254, ${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      }

      const snowRate = (isXmas ? 1.35 : 0.75) * (prefersReducedMotion ? 0.35 : 1);
      ctx.fillStyle = 'rgba(240, 248, 255, 0.7)';
      for (const f of snowFlakes) {
        f.y += f.speed * rawDt * snowRate;
        f.x += f.drift * rawDt * snowRate;
        if (f.y > 1) {
          f.y = -0.02;
          f.x = Math.random();
        }
        if (f.x > 1) f.x = 0;
        if (f.x < 0) f.x = 1;
        ctx.beginPath();
        ctx.arc(f.x * cssWidth, f.y * cssHeight, f.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0 overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Live Race HUD Overlay (Non-Overlapping Top Bar & Left Sky Margin) */}
      {stage === 'racing' && hud && (
        <>
          {/* Dedicated Top HUD Bar (never covers rappellers) */}
          <div className="fixed top-0 inset-x-0 z-20 h-14 px-4 sm:px-6 bg-[#071224]/90 backdrop-blur-md border-b border-white/15 flex items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#d63f22]/25 border border-[#d63f22]/60 flex items-center justify-center text-amber-300 shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300 leading-tight truncate">
                  {targetWinnerCount > 1
                    ? `Top ${targetWinnerCount} to 100F Win`
                    : '1st to 100F Rooftop Wins'}
                </div>
                <div className="font-display text-xs sm:text-sm font-bold text-white leading-tight">
                  {hud.totalRappellers} Rappellers •{' '}
                  <span className="text-amber-300 tabular-nums">
                    {Math.max(0, hud.targetDuration - hud.elapsed).toFixed(0)}s left
                  </span>
                </div>
              </div>
            </div>

            {hud.events[0] && (
              <div className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#0e1f38]/90 border border-amber-300/40 text-xs font-bold text-white max-w-md truncate shadow-inner">
                {hud.events[0].kind === 'slip' ? (
                  <Snowflake className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                ) : hud.events[0].kind === 'finished' ? (
                  <Trophy className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                ) : hud.events[0].kind === 'system' ? (
                  <Flag className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                )}
                <span className="truncate">{hud.events[0].text}</span>
              </div>
            )}

            {onSkipRace && (
              <button
                type="button"
                onClick={onSkipRace}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#18355e] hover:bg-[#20457a] border border-amber-300/55 text-amber-200 font-bold text-xs sm:text-sm shadow-lg cursor-pointer transition shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                <span>Skip to Finish</span>
                <FastForward className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Left Sky Margin: Live Top-5 Leaders (completely outside skyscraper bounds on desktop) */}
          <div className="hidden lg:block fixed top-[68px] left-3 w-[220px] z-20 p-3 rounded-2xl bg-[#091224]/88 backdrop-blur-md border border-[#18355e] shadow-xl space-y-1.5 pointer-events-none">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-amber-200">
              <span className="flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5" /> Live Leaders
              </span>
              <span className="text-slate-300 tabular-nums">
                {hud.elapsed.toFixed(1)}s / {hud.targetDuration}s
              </span>
            </div>
            <div className="space-y-1">
              {hud.leaders.map((r, idx) => (
                <div
                  key={r.participant.id}
                  className="flex items-center justify-between gap-2 text-xs px-2 py-1 rounded-lg bg-slate-950/65"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: `hsl(${r.colorHue}, 80%, 60%)` }}
                    />
                    <span className="font-bold text-amber-300 shrink-0">#{idx + 1}</span>
                    <span className="text-white font-medium truncate">{r.participant.name}</span>
                  </div>
                  <span
                    className={`text-[11px] font-bold tabular-nums shrink-0 ${
                      r.state === 'boost'
                        ? 'text-amber-300'
                        : r.state === 'slip'
                        ? 'text-rose-400'
                        : 'text-sky-200'
                    }`}
                  >
                    {r.altitude.toFixed(0)}F
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Center Dramatic Status Banner */}
          <div className="fixed inset-0 z-20 pointer-events-none flex flex-col items-center justify-center text-center pt-14">
            {hud.countdown > 0 ? (
              <div className="px-10 py-6 rounded-3xl bg-[#081020]/80 backdrop-blur-md border-2 border-amber-300/70 shadow-[0_0_50px_rgba(251,191,36,0.35)]">
                <div className="text-xs uppercase tracking-[0.35em] text-amber-200 font-bold mb-1">
                  Rappellers Ready
                </div>
                <div className="font-display text-6xl sm:text-8xl font-black text-white drop-shadow-[0_4px_24px_rgba(251,191,36,0.75)]">
                  {Math.ceil(hud.countdown)}
                </div>
              </div>
            ) : hud.isComplete && hud.leaders[0] ? (
              <div className="px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500/90 via-yellow-400/95 to-amber-500/90 border-2 border-white shadow-[0_0_60px_rgba(251,191,36,0.85)] animate-splash-unveil">
                <div className="text-xs uppercase tracking-[0.28em] font-black text-slate-950 flex items-center justify-center gap-1.5">
                  <Flag className="w-4 h-4" /> ROOFTOP REACHED!
                </div>
                <div className="font-display text-2xl sm:text-4xl font-black text-slate-950 mt-0.5">
                  {hud.leaders[0].participant.name}
                </div>
              </div>
            ) : hud.isPhotoFinish ? (
              <div className="px-5 py-1.5 rounded-full bg-rose-600/85 border border-amber-200/80 text-white text-xs sm:text-sm font-black tracking-[0.22em] uppercase shadow-[0_0_30px_rgba(244,63,94,0.7)] animate-pulse">
                Photo Finish — Final Floors!
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};
