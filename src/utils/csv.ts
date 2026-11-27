import Papa from 'papaparse';
import { Participant, PullResult, RaffleSettings } from '../types/raffle';
import { createId } from './rng';

const NAME_KEYS = ['name', 'fullname', 'full_name', 'participant', 'employee', 'guest', 'member', 'person'];
const DEPT_KEYS = ['department', 'dept', 'team', 'group', 'division', 'unit', 'vision', 'branch'];
const TITLE_KEYS = ['title', 'role', 'position', 'designation', 'epithet'];
const WEIGHT_KEYS = ['weight', 'tickets', 'entries', 'chances', 'count', 'multiplier'];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export interface CsvImportResult {
  participants: Participant[];
  skippedRows: number;
}

/**
 * Parses CSV text into Participant objects.
 * Supports both headered CSVs (Name, Department, Title, Tickets) and plain 1-column lists.
 */
export function parseParticipantsCsv(csvText: string): CsvImportResult {
  const trimmed = csvText.trim();
  if (!trimmed) {
    return { participants: [], skippedRows: 0 };
  }

  // First inspect raw rows to determine if row 0 is a header row
  const rawParsed = Papa.parse<string[]>(trimmed, {
    skipEmptyLines: true,
  });

  const rows = rawParsed.data;
  if (rows.length === 0) {
    return { participants: [], skippedRows: 0 };
  }

  const firstRowNormalized = rows[0].map(normalizeHeader);
  const hasRecognizedHeader = firstRowNormalized.some(
    (col) =>
      NAME_KEYS.includes(col) ||
      DEPT_KEYS.includes(col) ||
      TITLE_KEYS.includes(col) ||
      WEIGHT_KEYS.includes(col)
  );

  let nameIdx = 0;
  let deptIdx = 1;
  let titleIdx = 2;
  let weightIdx = 3;
  let startRow = 0;

  if (hasRecognizedHeader) {
    startRow = 1;
    nameIdx = firstRowNormalized.findIndex((c) => NAME_KEYS.includes(c));
    if (nameIdx === -1) nameIdx = 0;
    deptIdx = firstRowNormalized.findIndex((c) => DEPT_KEYS.includes(c));
    titleIdx = firstRowNormalized.findIndex((c) => TITLE_KEYS.includes(c));
    weightIdx = firstRowNormalized.findIndex((c) => WEIGHT_KEYS.includes(c));
  }

  const participants: Participant[] = [];
  let skippedRows = 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    const rawName = (row[nameIdx] ?? '').trim();
    if (!rawName) {
      skippedRows++;
      continue;
    }

    const rawDept = deptIdx >= 0 ? (row[deptIdx] ?? '').trim() : '';
    const rawTitle = titleIdx >= 0 ? (row[titleIdx] ?? '').trim() : '';
    const rawWeight = weightIdx >= 0 ? (row[weightIdx] ?? '').trim() : '';
    const parsedWeight = Number(rawWeight);
    const weight = Number.isFinite(parsedWeight) && parsedWeight > 0 ? Math.min(100, Math.round(parsedWeight)) : 1;

    participants.push({
      id: createId(),
      name: rawName,
      department: rawDept || undefined,
      title: rawTitle || undefined,
      weight,
      active: true,
    });
  }

  return { participants, skippedRows };
}

export type DuplicateStrategy = 'skip' | 'merge_tickets' | 'allow';

export function mergeImportedParticipants(
  existing: Participant[],
  incoming: Participant[],
  strategy: DuplicateStrategy,
  replaceAll: boolean
): {
  merged: Participant[];
  addedCount: number;
  mergedCount: number;
  skippedCount: number;
} {
  const baseList: Participant[] = replaceAll ? [] : existing.map((p) => ({ ...p }));

  if (strategy === 'allow') {
    return {
      merged: [...incoming, ...baseList],
      addedCount: incoming.length,
      mergedCount: 0,
      skippedCount: 0,
    };
  }

  const indexByName = new Map<string, number>();
  baseList.forEach((p, idx) => {
    const key = p.name.trim().toLowerCase();
    if (!indexByName.has(key)) {
      indexByName.set(key, idx);
    }
  });

  const toPrepend: Participant[] = [];
  let addedCount = 0;
  let mergedCount = 0;
  let skippedCount = 0;

  for (const item of incoming) {
    const key = item.name.trim().toLowerCase();
    const existingIdx = indexByName.get(key);

    if (existingIdx !== undefined) {
      if (strategy === 'skip') {
        skippedCount++;
        continue;
      }

      // merge_tickets
      if (existingIdx >= 0) {
        const target = baseList[existingIdx];
        target.weight = Math.min(100, target.weight + item.weight);
        if (!target.department && item.department) target.department = item.department;
        if (!target.title && item.title) target.title = item.title;
      } else {
        // Negative sentinel indexes items already queued in toPrepend
        const prependTarget = toPrepend[Math.abs(existingIdx) - 1];
        if (prependTarget) {
          prependTarget.weight = Math.min(100, prependTarget.weight + item.weight);
          if (!prependTarget.department && item.department) prependTarget.department = item.department;
          if (!prependTarget.title && item.title) prependTarget.title = item.title;
        }
      }
      mergedCount++;
      continue;
    }

    toPrepend.push({ ...item });
    // Store negative 1-based index into toPrepend so intra-CSV duplicates also deduplicate cleanly
    indexByName.set(key, -toPrepend.length);
    addedCount++;
  }

  return {
    merged: [...toPrepend, ...baseList],
    addedCount,
    mergedCount,
    skippedCount,
  };
}

export function generateSampleCsv(): string {
  return [
    'Name,Department,Title,Tickets',
    'Aria Winterbourne,Vonotec Engineering,Senior Developer,1',
    'Lucas Vance,Vonotec Product,Product Manager,1',
    'Sophia Reyes,Vonotec Marketing,Brand Strategist,1',
    'Marcus Chen,Vonotec Operations,Operations Lead,1',
    'Elena Rostova,Vonotec Finance,Financial Analyst,1',
    'Gabriel Santos,Vonotec Engineering,Backend Engineer,1',
    'Hannah Kim,Vonotec People & Culture,HR Specialist,1',
    'Noah Patel,Vonotec Data Science,Data Analyst,1',
    'Chloe Laurent,Vonotec Creative Studio,UI/UX Designer,1',
    'Daniel Morales,Vonotec Customer Success,Account Manager,1',
    'Isabella Cruz,Vonotec Engineering,Frontend Engineer,1',
    'Liam OConnor,Vonotec IT & Security,Systems Admin,1',
  ].join('\n');
}

export function exportWinnersCsv(history: PullResult[]): string {
  const rows = history.map((item) => ({
    Timestamp: new Date(item.timestamp).toLocaleString(),
    Round: item.roundLabel ?? '',
    Rank: `#${item.finishRank}`,
    Winner: item.participant.name,
    Department: item.participant.department ?? '',
    Title: item.participant.title ?? '',
    FinishTime:
      typeof item.finishTimeSeconds === 'number' ? `${item.finishTimeSeconds.toFixed(2)}s` : '',
    Status: item.status === 'won' ? 'Confirmed Winner' : 'Absent (Re-Raced)',
  }));

  return Papa.unparse(rows);
}

export interface SessionBackupData {
  participants: Participant[];
  history: PullResult[];
  settings?: Partial<RaffleSettings>;
}

export function parseSessionBackupJson(
  text: string
): { ok: true; data: SessionBackupData } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON backup file.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Backup file must contain a JSON object.' };
  }

  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.participants) || !Array.isArray(record.history)) {
    return { ok: false, error: 'Backup file is missing participants or history arrays.' };
  }

  const participants: Participant[] = [];
  for (const item of record.participants) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    if (typeof p.name !== 'string' || !p.name.trim()) continue;
    const rawWeight = typeof p.weight === 'number' ? p.weight : Number(p.weight);
    const weight =
      Number.isFinite(rawWeight) && rawWeight > 0 ? Math.min(100, Math.round(rawWeight)) : 1;
    participants.push({
      id: typeof p.id === 'string' && p.id.trim() ? p.id : createId(),
      name: p.name.trim(),
      department: typeof p.department === 'string' && p.department.trim() ? p.department.trim() : undefined,
      title: typeof p.title === 'string' && p.title.trim() ? p.title.trim() : undefined,
      weight,
      active: typeof p.active === 'boolean' ? p.active : true,
    });
  }

  const history: PullResult[] = [];
  for (const item of record.history) {
    if (!item || typeof item !== 'object') continue;
    const h = item as Record<string, unknown>;
    if (!h.participant || typeof h.participant !== 'object') continue;
    const hp = h.participant as Record<string, unknown>;
    if (typeof hp.name !== 'string' || !hp.name.trim()) continue;
    history.push({
      id: typeof h.id === 'string' && h.id.trim() ? h.id : createId(),
      participant: {
        id: typeof hp.id === 'string' && hp.id.trim() ? hp.id : createId(),
        name: hp.name.trim(),
        department: typeof hp.department === 'string' ? hp.department : undefined,
        title: typeof hp.title === 'string' ? hp.title : undefined,
        weight: typeof hp.weight === 'number' && hp.weight > 0 ? hp.weight : 1,
        active: typeof hp.active === 'boolean' ? hp.active : false,
      },
      timestamp: typeof h.timestamp === 'number' ? h.timestamp : Date.now(),
      status: h.status === 'absent' ? 'absent' : 'won',
      finishRank: typeof h.finishRank === 'number' ? h.finishRank : 1,
      finishTimeSeconds: typeof h.finishTimeSeconds === 'number' ? h.finishTimeSeconds : undefined,
      roundLabel: typeof h.roundLabel === 'string' && h.roundLabel.trim() ? h.roundLabel.trim() : undefined,
    });
  }

  let settings: Partial<RaffleSettings> | undefined;
  if (record.settings && typeof record.settings === 'object') {
    const s = record.settings as Record<string, unknown>;
    settings = {};
    if (typeof s.eventTitle === 'string') settings.eventTitle = s.eventTitle;
    if (typeof s.eventSubtitle === 'string') settings.eventSubtitle = s.eventSubtitle;
    if (s.theme === 'christmas' || s.theme === 'celestial') settings.theme = s.theme;
    if (typeof s.removeWinnerOnDraw === 'boolean') settings.removeWinnerOnDraw = s.removeWinnerOnDraw;
    if (typeof s.dramaIntensity === 'number') settings.dramaIntensity = s.dramaIntensity;
    if (typeof s.raceDurationSeconds === 'number') settings.raceDurationSeconds = Math.max(5, Math.min(300, s.raceDurationSeconds));
    if (typeof s.soundEnabled === 'boolean') settings.soundEnabled = s.soundEnabled;
    if (typeof s.currentRoundLabel === 'string') settings.currentRoundLabel = s.currentRoundLabel;
  }

  return { ok: true, data: { participants, history, settings } };
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
