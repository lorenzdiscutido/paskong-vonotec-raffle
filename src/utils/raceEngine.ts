import { Participant } from '../types/raffle';
import { createId, secureRandom } from './rng';

export const ROOFTOP_FLOOR = 100;

export type RappellerEventKind = 'rappelling' | 'boost' | 'slip' | 'gust' | 'finished';

export type RaceSfxCue = 'none' | 'start' | 'boost' | 'slip' | 'photo' | 'finish';

export interface RappellerState {
  participant: Participant;
  laneIndex: number;
  laneX: number;
  colorHue: number;
  altitude: number;
  velocity: number;
  targetVelocity: number;
  state: RappellerEventKind;
  stateTimer: number;
  eventLabel: string;
  ropeSway: number;
  animPhase: number;
  finishRank?: number;
  finishTime?: number;
}

export interface RaceEventFeedItem {
  id: string;
  text: string;
  kind: RappellerEventKind | 'system';
  colorHue?: number;
}

export interface RaceSimulation {
  rappellers: RappellerState[];
  targetWinners: number;
  dramaIntensity: number;
  targetDurationSeconds: number;
  elapsed: number;
  countdown: number;
  isPhotoFinish: boolean;
  isComplete: boolean;
  finishedIds: string[];
  events: RaceEventFeedItem[];
  lastEventSfx: RaceSfxCue;
}

const BOOST_LABELS = ['SURGE!', 'SECOND WIND!', 'TURBO PULL!'] as const;
const SLIP_LABELS = ['ROPE SLIP!', 'GLASS SLIP!', 'CABLE DROP!'] as const;
const GUST_LABELS = ['CROSSWIND', 'SKY GUST'] as const;

function randRange(min: number, max: number): number {
  return min + secureRandom() * (max - min);
}

function pushFeedEvent(sim: RaceSimulation, item: RaceEventFeedItem) {
  sim.events = [item, ...sim.events].slice(0, 6);
}

export function createRaceSimulation(
  participants: Participant[],
  targetWinners: number,
  dramaIntensity = 0.55,
  targetDurationSeconds = 20
): RaceSimulation {
  const active = participants.filter((p) => p.active && p.weight > 0);
  const clampedTarget = Math.max(1, Math.min(targetWinners, Math.max(1, active.length)));
  const clampedDrama = Math.max(0, Math.min(1, dramaIntensity));
  const clampedDuration = Math.max(5, Math.min(300, Math.round(targetDurationSeconds) || 20));

  // Fisher-Yates shuffle so rope lane placement is unpredictable each race
  const laneOrder = active.map((_, idx) => idx);
  for (let i = laneOrder.length - 1; i > 0; i--) {
    const j = Math.floor(secureRandom() * (i + 1));
    const tmp = laneOrder[i];
    laneOrder[i] = laneOrder[j];
    laneOrder[j] = tmp;
  }

  const total = active.length;
  const rappellers: RappellerState[] = active.map((participant, idx) => {
    const laneIndex = laneOrder[idx];
    const laneX = total <= 1 ? 0.5 : 0.04 + (laneIndex / (total - 1)) * 0.92;
    const colorHue = Math.round((laneIndex * 137.508) % 360);
    return {
      participant,
      laneIndex,
      laneX,
      colorHue,
      altitude: 0,
      velocity: 0,
      targetVelocity: 0,
      state: 'rappelling',
      stateTimer: 0,
      eventLabel: '',
      ropeSway: 0,
      animPhase: secureRandom() * Math.PI * 2,
    };
  });

  rappellers.sort((a, b) => a.laneIndex - b.laneIndex);

  return {
    rappellers,
    targetWinners: clampedTarget,
    dramaIntensity: clampedDrama,
    targetDurationSeconds: clampedDuration,
    elapsed: 0,
    countdown: 3.0,
    isPhotoFinish: false,
    isComplete: active.length === 0,
    finishedIds: [],
    events: [
      {
        id: createId(),
        text: `${active.length} rappeller${active.length === 1 ? '' : 's'} strapped in at Ground Floor!`,
        kind: 'system',
      },
    ],
    lastEventSfx: 'none',
  };
}

function rollNextRappellerSegment(
  rappeller: RappellerState,
  dramaIntensity: number,
  isInTopPack: boolean,
  durationScale: number,
  suppressSlip: boolean
): { kind: RappellerEventKind; sfx: RaceSfxCue; feedText?: string } {
  const boostThreshold = 0.14 + dramaIntensity * 0.16;
  const slipThreshold =
    !suppressSlip && rappeller.altitude > 10 ? 0.10 + dramaIntensity * 0.16 : 0;
  const gustThreshold = 0.09 + dramaIntensity * 0.08;
  const staminaBonus = Math.min(0.1, Math.max(0, rappeller.participant.weight - 1) * 0.02);

  const r = secureRandom();
  if (r < boostThreshold + staminaBonus) {
    rappeller.state = 'boost';
    rappeller.targetVelocity = randRange(13.5, 19.5);
    rappeller.stateTimer = randRange(0.75, 1.6) * durationScale;
    rappeller.eventLabel = BOOST_LABELS[Math.floor(secureRandom() * BOOST_LABELS.length)];
    rappeller.ropeSway = randRange(-0.4, 0.4);
    return {
      kind: 'boost',
      sfx: isInTopPack ? 'boost' : 'none',
      feedText: isInTopPack ? `${rappeller.participant.name} hit a ${rappeller.eventLabel}` : undefined,
    };
  }

  if (r < boostThreshold + staminaBonus + slipThreshold) {
    rappeller.state = 'slip';
    rappeller.targetVelocity = -randRange(4.5, 11.0);
    rappeller.stateTimer = randRange(0.5, 1.05) * durationScale;
    rappeller.eventLabel = SLIP_LABELS[Math.floor(secureRandom() * SLIP_LABELS.length)];
    rappeller.ropeSway = (secureRandom() < 0.5 ? -1 : 1) * randRange(0.7, 1.25);
    return {
      kind: 'slip',
      sfx: isInTopPack ? 'slip' : 'none',
      feedText: isInTopPack ? `${rappeller.participant.name} suffered a ${rappeller.eventLabel}` : undefined,
    };
  }

  if (r < boostThreshold + staminaBonus + slipThreshold + gustThreshold) {
    rappeller.state = 'gust';
    rappeller.targetVelocity = randRange(1.6, 4.0);
    rappeller.stateTimer = randRange(0.75, 1.45) * durationScale;
    rappeller.eventLabel = GUST_LABELS[Math.floor(secureRandom() * GUST_LABELS.length)];
    rappeller.ropeSway = (secureRandom() < 0.5 ? -1 : 1) * randRange(0.45, 0.9);
    return { kind: 'gust', sfx: 'none' };
  }

  rappeller.state = 'rappelling';
  rappeller.targetVelocity = randRange(6.2, 10.4);
  rappeller.stateTimer = randRange(0.55, 1.4) * durationScale;
  rappeller.eventLabel = '';
  return { kind: 'rappelling', sfx: 'none' };
}

export function stepRaceSimulation(sim: RaceSimulation, rawDt: number): RaceSimulation {
  sim.lastEventSfx = 'none';

  if (sim.isComplete || sim.rappellers.length === 0) {
    sim.isComplete = true;
    return sim;
  }

  const clampedDt = Math.max(0, Math.min(rawDt, 0.05));

  if (sim.countdown > 0) {
    sim.countdown -= clampedDt;
    if (sim.countdown <= 0) {
      sim.countdown = 0;
      sim.lastEventSfx = 'start';
      const baseScale = 14 / sim.targetDurationSeconds;
      for (const r of sim.rappellers) {
        r.targetVelocity = randRange(6.5, 10.5);
        r.velocity = r.targetVelocity * 0.65 * baseScale;
        r.stateTimer = randRange(0.45, 1.15);
        r.state = 'rappelling';
        r.eventLabel = '';
      }
      pushFeedEvent(sim, {
        id: createId(),
        text: 'GO! RAPPELLERS AWAY!',
        kind: 'system',
      });
    }
    return sim;
  }

  let leaderAltitude = 0;
  for (const r of sim.rappellers) {
    if (r.altitude > leaderAltitude) leaderAltitude = r.altitude;
  }

  if (
    !sim.isPhotoFinish &&
    (leaderAltitude >= 90 || (sim.elapsed >= sim.targetDurationSeconds * 0.85 && leaderAltitude >= 82))
  ) {
    sim.isPhotoFinish = true;
    sim.lastEventSfx = 'photo';
    pushFeedEvent(sim, {
      id: createId(),
      text: 'PHOTO FINISH AT THE ROOFTOP!',
      kind: 'system',
    });
  }

  const dt = clampedDt;
  sim.elapsed += dt;

  // Non-rigged schedule pacing: scales all rappellers uniformly toward targetDurationSeconds
  const progress = sim.elapsed / sim.targetDurationSeconds;
  const expectedLeaderFloor =
    progress < 0.85 ? (progress / 0.85) * 90 : 90 + ((progress - 0.85) / 0.15) * 10;
  const baseSpeedScale = 14 / sim.targetDurationSeconds;
  const floorDelta = expectedLeaderFloor - leaderAltitude;
  const maxCorrection = progress >= 0.95 ? 3.2 : 2.6;
  const paceCorrection = Math.max(0.22, Math.min(maxCorrection, 1 + floorDelta * 0.085));
  const upwardScale = baseSpeedScale * paceCorrection;
  const slipScale = Math.max(0.35, Math.min(1.5, baseSpeedScale * 1.15));
  const segmentDurationScale = Math.max(0.75, Math.min(1.6, sim.targetDurationSeconds / 20));
  const nearEndWindow = sim.targetDurationSeconds - sim.elapsed < 1.2;

  // Find top-5 threshold in O(n) via partial selection to stay fast for 500+ rappellers
  let top5Threshold = 0;
  if (sim.rappellers.length > 5) {
    const topAlt = [0, 0, 0, 0, 0];
    for (const r of sim.rappellers) {
      if (r.state === 'finished') continue;
      if (r.altitude > topAlt[4]) {
        topAlt[4] = r.altitude;
        for (let k = 4; k > 0 && topAlt[k] > topAlt[k - 1]; k--) {
          const tmp = topAlt[k];
          topAlt[k] = topAlt[k - 1];
          topAlt[k - 1] = tmp;
        }
      }
    }
    top5Threshold = topAlt[4];
  }

  const newFinishers: { rappeller: RappellerState; overshoot: number }[] = [];

  for (const r of sim.rappellers) {
    if (r.state === 'finished') continue;

    r.stateTimer -= dt;
    if (r.stateTimer <= 0) {
      const isInTopPack = r.altitude >= top5Threshold;
      const suppressSlip = nearEndWindow && r.altitude > 94;
      const rolled = rollNextRappellerSegment(
        r,
        sim.dramaIntensity,
        isInTopPack,
        segmentDurationScale,
        suppressSlip
      );
      if (rolled.sfx !== 'none' && sim.lastEventSfx === 'none') {
        sim.lastEventSfx = rolled.sfx;
      }
      if (rolled.feedText) {
        pushFeedEvent(sim, {
          id: createId(),
          text: rolled.feedText,
          kind: rolled.kind,
          colorHue: r.colorHue,
        });
      }
    }

    let effectiveTarget = r.targetVelocity;
    if (effectiveTarget > 0) {
      effectiveTarget *= upwardScale;
      // Uniform pack tension rules applied purely by current floor position
      if (r.altitude > 20 && r.altitude >= leaderAltitude - 2.5 && r.state !== 'boost') {
        effectiveTarget *= 0.88;
      } else if (leaderAltitude - r.altitude > 12 && r.state !== 'slip') {
        effectiveTarget *= 1.14;
      }
    } else if (effectiveTarget < 0) {
      effectiveTarget *= slipScale;
    }

    const accelRate = r.state === 'slip' ? 14 : 6.5;
    r.velocity += (effectiveTarget - r.velocity) * Math.min(1, accelRate * dt);
    r.altitude = Math.max(0, r.altitude + r.velocity * dt);
    r.animPhase += Math.max(2.2, Math.abs(r.velocity) * 1.15 + 1.8) * dt;
    r.ropeSway *= Math.pow(0.08, dt);

    if (r.altitude >= ROOFTOP_FLOOR) {
      newFinishers.push({ rappeller: r, overshoot: r.altitude - ROOFTOP_FLOOR });
    }
  }

  if (newFinishers.length > 0) {
    newFinishers.sort((a, b) => b.overshoot - a.overshoot);
    const maxWinners = Math.min(sim.targetWinners, sim.rappellers.length);
    for (const { rappeller } of newFinishers) {
      if (sim.finishedIds.length >= maxWinners) break;
      rappeller.altitude = ROOFTOP_FLOOR;
      rappeller.velocity = 0;
      rappeller.state = 'finished';
      rappeller.eventLabel = 'ROOFTOP!';
      rappeller.finishRank = sim.finishedIds.length + 1;
      rappeller.finishTime = Number(sim.elapsed.toFixed(2));
      sim.finishedIds.push(rappeller.participant.id);
      sim.lastEventSfx = 'finish';
      pushFeedEvent(sim, {
        id: createId(),
        text: `#${rappeller.finishRank} ${rappeller.participant.name} reached the Rooftop! (${rappeller.finishTime.toFixed(1)}s)`,
        kind: 'finished',
        colorHue: rappeller.colorHue,
      });
    }

    if (sim.finishedIds.length >= maxWinners) {
      sim.isComplete = true;
    }
  }

  return sim;
}

export function getRaceLeaderboard(sim: RaceSimulation): RappellerState[] {
  return [...sim.rappellers].sort((a, b) => {
    if (a.state === 'finished' && b.state === 'finished') {
      return (a.finishRank ?? 999) - (b.finishRank ?? 999);
    }
    if (a.state === 'finished') return -1;
    if (b.state === 'finished') return 1;
    return b.altitude - a.altitude;
  });
}

export function fastForwardRace(sim: RaceSimulation, maxSteps = 6000): RappellerState[] {
  let steps = 0;
  while (!sim.isComplete && steps < maxSteps) {
    stepRaceSimulation(sim, 0.05);
    steps++;
  }
  const count = Math.min(sim.targetWinners, sim.rappellers.length);
  return getRaceLeaderboard(sim).slice(0, count);
}
