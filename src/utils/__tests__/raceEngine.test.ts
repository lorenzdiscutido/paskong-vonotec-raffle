import { describe, expect, it } from 'vitest';
import {
  createRaceSimulation,
  fastForwardRace,
  getRaceLeaderboard,
  ROOFTOP_FLOOR,
  stepRaceSimulation,
} from '../raceEngine';
import { Participant } from '../../types/raffle';

function makeRappellers(count = 6): Participant[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `r-${idx + 1}`,
    name: `Rappeller ${idx + 1}`,
    weight: idx === 0 ? 3 : 1,
    active: true,
  }));
}

describe('raceEngine', () => {
  it('initializes only active rappellers at 0F with countdown', () => {
    const roster: Participant[] = [
      ...makeRappellers(3),
      { id: 'inactive', name: 'Seated', weight: 2, active: false },
      { id: 'zero', name: 'ZeroWeight', weight: 0, active: true },
    ];

    const sim = createRaceSimulation(roster, 2, 0.55);
    expect(sim.rappellers).toHaveLength(3);
    expect(sim.targetWinners).toBe(2);
    expect(sim.countdown).toBeCloseTo(3.0);
    expect(sim.isComplete).toBe(false);
    expect(sim.rappellers.every((r) => r.altitude === 0)).toBe(true);
  });

  it('transitions cleanly out of countdown and keeps floors within [0, ROOFTOP_FLOOR]', () => {
    const sim = createRaceSimulation(makeRappellers(5), 1, 0.8);

    for (let i = 0; i < 70; i++) {
      stepRaceSimulation(sim, 0.05);
    }
    expect(sim.countdown).toBe(0);
    expect(sim.elapsed).toBeGreaterThan(0);

    for (let i = 0; i < 120; i++) {
      stepRaceSimulation(sim, 0.05);
      expect(
        sim.rappellers.every((r) => r.altitude >= 0 && r.altitude <= ROOFTOP_FLOOR)
      ).toBe(true);
    }
  });

  it('scales smoothly with 250 rappellers and triggers photo finish before 100F rooftop', () => {
    const sim = createRaceSimulation(makeRappellers(250), 5, 0.65);
    const winners = fastForwardRace(sim);

    expect(sim.isComplete).toBe(true);
    expect(sim.isPhotoFinish).toBe(true);
    expect(winners).toHaveLength(5);
    expect(winners.map((w) => w.finishRank)).toEqual([1, 2, 3, 4, 5]);
    expect(winners.every((w) => w.altitude === ROOFTOP_FLOOR && w.state === 'finished')).toBe(true);

    const board = getRaceLeaderboard(sim);
    expect(board[0].participant.id).toBe(winners[0].participant.id);
    expect(board).toHaveLength(250);
  });

  it('clamps invalid target durations and paces climbs near targetDurationSeconds', () => {
    const lowClamp = createRaceSimulation(makeRappellers(4), 1, 0.55, 1);
    const highClamp = createRaceSimulation(makeRappellers(4), 1, 0.55, 999);
    expect(lowClamp.targetDurationSeconds).toBe(5);
    expect(highClamp.targetDurationSeconds).toBe(300);

    const sim60 = createRaceSimulation(makeRappellers(12), 1, 0.55, 60);
    const winners60 = fastForwardRace(sim60);
    expect(winners60).toHaveLength(1);
    expect(winners60[0].finishTime).toBeGreaterThanOrEqual(52);
    expect(winners60[0].finishTime).toBeLessThanOrEqual(68);

    const sim30 = createRaceSimulation(makeRappellers(12), 1, 0.55, 30);
    const winners30 = fastForwardRace(sim30);
    expect(winners30).toHaveLength(1);
    expect(winners30[0].finishTime).toBeGreaterThanOrEqual(26);
    expect(winners30[0].finishTime).toBeLessThanOrEqual(35);

    const sim10 = createRaceSimulation(makeRappellers(12), 1, 0.55, 10);
    const winners10 = fastForwardRace(sim10);
    expect(winners10).toHaveLength(1);
    expect(winners10[0].finishTime).toBeGreaterThanOrEqual(7.5);
    expect(winners10[0].finishTime).toBeLessThanOrEqual(13.5);
  });

  it('returns completed immediately when roster has zero active rappellers', () => {
    const sim = createRaceSimulation([], 1, 0.55);
    expect(sim.isComplete).toBe(true);
    expect(fastForwardRace(sim)).toEqual([]);
  });
});
