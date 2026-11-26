import { describe, expect, it } from 'vitest';
import {
  exportWinnersCsv,
  mergeImportedParticipants,
  parseParticipantsCsv,
} from '../csv';
import { Participant, PullResult } from '../../types/raffle';

describe('csv utilities', () => {
  it('parses headered CSV with alias columns, skips blanks, and clamps weights', () => {
    const csv = [
      'Employee,Team,Role,Tickets',
      'Alice Johnson,Engineering,Lead,3',
      ',Engineering,Empty,2',
      'Bob Lee,Design,Artist,250',
      'Cara Ng,Ops,Coordinator,-5',
    ].join('\n');

    const result = parseParticipantsCsv(csv);
    expect(result.skippedRows).toBe(1);
    expect(result.participants).toHaveLength(3);
    expect(result.participants[0]).toMatchObject({
      name: 'Alice Johnson',
      department: 'Engineering',
      title: 'Lead',
      weight: 3,
      active: true,
    });
    expect(result.participants[1].weight).toBe(100);
    expect(result.participants[2].weight).toBe(1);
  });

  it('parses headerless single-column participant lists', () => {
    const result = parseParticipantsCsv('Aria\nMarcus\nElena');
    expect(result.skippedRows).toBe(0);
    expect(result.participants.map((p) => p.name)).toEqual(['Aria', 'Marcus', 'Elena']);
    expect(result.participants.every((p) => p.weight === 1)).toBe(true);
  });

  it('merges imported participants according to duplicate strategy', () => {
    const existing: Participant[] = [
      { id: 'e1', name: 'Aria Winterbourne', weight: 2, active: true },
    ];
    const incoming: Participant[] = [
      { id: 'i1', name: 'aria winterbourne', department: 'Design', weight: 3, active: true },
      { id: 'i2', name: 'Lucas Vance', weight: 1, active: true },
      { id: 'i3', name: 'Lucas Vance', title: 'Cryo Lead', weight: 999, active: true },
    ];

    const skipped = mergeImportedParticipants(existing, incoming, 'skip', false);
    expect(skipped.addedCount).toBe(1);
    expect(skipped.skippedCount).toBe(2);
    expect(skipped.merged).toHaveLength(2);

    const mergedTickets = mergeImportedParticipants(existing, incoming, 'merge_tickets', false);
    expect(mergedTickets.addedCount).toBe(1);
    expect(mergedTickets.mergedCount).toBe(2);
    expect(mergedTickets.merged.find((p) => p.id === 'e1')).toMatchObject({
      weight: 5,
      department: 'Design',
    });
    expect(mergedTickets.merged.find((p) => p.name === 'Lucas Vance')).toMatchObject({
      weight: 100,
      title: 'Cryo Lead',
    });

    const replaced = mergeImportedParticipants(existing, incoming, 'allow', true);
    expect(replaced.addedCount).toBe(3);
    expect(replaced.merged).toHaveLength(3);
  });

  it('exports confirmed and absent winners in CSV format without prize columns', () => {
    const history: PullResult[] = [
      {
        id: 'pull-1',
        participant: { id: 'p1', name: 'Aria', department: 'Design', title: 'Architect', weight: 1, active: false },
        timestamp: 1735100000000,
        status: 'won',
        finishRank: 1,
        finishTimeSeconds: 12.34,
      },
      {
        id: 'pull-2',
        participant: { id: 'p2', name: 'Bob', weight: 1, active: false },
        timestamp: 1735100005000,
        status: 'absent',
        finishRank: 2,
      },
    ];

    const csv = exportWinnersCsv(history);
    expect(csv).toContain('Timestamp,Rank,Winner,Department,Title,FinishTime,Status');
    expect(csv).toContain('#1,Aria,Design,Architect,12.34s,Confirmed Winner');
    expect(csv).toContain('#2,Bob,,,,Absent (Re-Raced)');
  });
});
