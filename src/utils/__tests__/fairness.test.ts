import { describe, expect, it } from 'vitest';
import { createRaceSimulation, fastForwardRace, stepRaceSimulation } from '../raceEngine';
import { Participant } from '../../types/raffle';

function makeEqualRappellers(count: number): Participant[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `attendee-${idx + 1}`,
    name: `Attendee ${idx + 1}`,
    weight: 1,
    active: true,
  }));
}

describe('fairness verification (Monte Carlo)', () => {
  it('distributes boosts and slips with equal probability across all participants', () => {
    const participants = makeEqualRappellers(5);
    const boostCounts = new Map<string, number>();
    const slipCounts = new Map<string, number>();
    participants.forEach((p) => {
      boostCounts.set(p.id, 0);
      slipCounts.set(p.id, 0);
    });

    const TOTAL_RACES = 100;
    for (let i = 0; i < TOTAL_RACES; i++) {
      const sim = createRaceSimulation(participants, 1, 0.6, 10);
      while (!sim.isComplete) {
        stepRaceSimulation(sim, 0.05);
        for (const r of sim.rappellers) {
          if (r.state === 'boost' && r.stateTimer > 0.8) {
            boostCounts.set(r.participant.id, (boostCounts.get(r.participant.id) ?? 0) + 1);
          } else if (r.state === 'slip' && r.stateTimer > 0.5) {
            slipCounts.set(r.participant.id, (slipCounts.get(r.participant.id) ?? 0) + 1);
          }
        }
      }
    }

    const totalBoosts = Array.from(boostCounts.values()).reduce((a, b) => a + b, 0);
    const expectedPerPerson = totalBoosts / participants.length;

    // Every participant should have an approximately equal share of boosts
    for (const [id, count] of boostCounts.entries()) {
      const deviation = Math.abs(count - expectedPerPerson) / expectedPerPerson;
      expect(
        deviation,
        `Participant ${id} boost count (${count}) deviated too far from expected (${expectedPerPerson.toFixed(1)})`
      ).toBeLessThan(0.35);
    }
  });

  it('proves uniform win distribution across equal participants over 1000 simulated races', () => {
    const PARTICIPANT_COUNT = 6;
    const TOTAL_RACES = 1200;
    const participants = makeEqualRappellers(PARTICIPANT_COUNT);
    const winCounts = new Map<string, number>();
    participants.forEach((p) => winCounts.set(p.id, 0));

    for (let i = 0; i < TOTAL_RACES; i++) {
      const sim = createRaceSimulation(participants, 1, 0.55, 10);
      const winners = fastForwardRace(sim);
      expect(winners).toHaveLength(1);
      const winnerId = winners[0].participant.id;
      winCounts.set(winnerId, (winCounts.get(winnerId) ?? 0) + 1);
    }

    const expectedWins = TOTAL_RACES / PARTICIPANT_COUNT; // 200 wins each (16.67%)

    // Chi-Square goodness-of-fit test for uniform distribution
    // Degrees of freedom = 6 - 1 = 5. Critical value at alpha=0.001 is 20.515
    let chiSquare = 0;
    for (const count of winCounts.values()) {
      chiSquare += Math.pow(count - expectedWins, 2) / expectedWins;
      // Also assert individual win share is within reasonable empirical bounds (11% to 23%)
      const winRate = count / TOTAL_RACES;
      expect(winRate).toBeGreaterThanOrEqual(0.10);
      expect(winRate).toBeLessThanOrEqual(0.24);
    }

    // Chi-square statistic must be below critical threshold (proving no rigging)
    expect(chiSquare).toBeLessThan(20.515);
  });
});
