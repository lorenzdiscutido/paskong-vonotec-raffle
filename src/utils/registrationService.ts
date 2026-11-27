import { Participant } from '../types/raffle';
import { getSupabaseClient } from './supabaseClient';

export type RegistrationSource = 'mobile' | 'kiosk';

export interface RegistrationRecord {
  id: string;
  full_name: string;
  email: string | null;
  contact_number: string | null;
  source: RegistrationSource;
  created_at: string;
}

export interface RegisterAttendeeInput {
  fullName: string;
  email?: string;
  contactNumber?: string;
  source: RegistrationSource;
}

export interface RegisterAttendeeResult {
  ok: boolean;
  record?: RegistrationRecord;
  error?: string;
  isDuplicate?: boolean;
}

export function getKioskPin(): string {
  const raw = import.meta.env.VITE_KIOSK_PIN;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : '1225';
}

export function normalizeNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function registerAttendee(
  input: RegisterAttendeeInput
): Promise<RegisterAttendeeResult> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      error: 'Registration database is not configured yet. Please ask the event host.',
    };
  }

  const fullName = input.fullName.trim().replace(/\s+/g, ' ');
  const email = input.email?.trim() || null;
  const contactNumber = input.contactNumber?.trim().replace(/\s+/g, ' ') || null;

  if (fullName.length < 2) {
    return { ok: false, error: 'Please enter your full name (at least 2 characters).' };
  }

  const { data, error } = await client
    .from('registrations')
    .insert({
      full_name: fullName,
      email,
      contact_number: contactNumber,
      source: input.source,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        isDuplicate: true,
        error: `"${fullName}" is already registered for the raffle!`,
      };
    }
    return { ok: false, error: error.message || 'Could not complete registration.' };
  }

  return { ok: true, record: data as RegistrationRecord };
}

export async function fetchRegistrations(): Promise<{
  records: RegistrationRecord[];
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { records: [], error: 'Supabase is not configured yet.' };
  }

  const { data, error } = await client
    .from('registrations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return { records: [], error: error.message };
  }

  return { records: (data ?? []) as RegistrationRecord[] };
}

export async function deleteRegistration(id: string): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, error: 'Supabase is not configured yet.' };
  }

  const { error } = await client.from('registrations').delete().eq('id', id);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export function subscribeToRegistrations(onChange: () => void): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const channel = client
    .channel('registrations_realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'registrations' },
      () => {
        onChange();
      }
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

/**
 * Merges cloud registrations into the local Participant pool without
 * duplicating existing entries or overwriting active/won/absent status.
 * Also removes stale `reg_*` entries that were deleted from Supabase.
 */
export function mergeRegistrationsIntoParticipants(
  existing: Participant[],
  registrations: RegistrationRecord[]
): { merged: Participant[]; addedCount: number; removedCount: number } {
  const validRegIds = new Set(registrations.map((r) => `reg_${r.id}`));
  const kept: Participant[] = [];
  let removedCount = 0;

  for (const p of existing) {
    if (p.id.startsWith('reg_') && !validRegIds.has(p.id)) {
      removedCount += 1;
      continue;
    }
    kept.push(p);
  }

  const byName = new Map<string, Participant>();
  const byRegId = new Set<string>();

  for (const p of kept) {
    byName.set(normalizeNameKey(p.name), p);
    byRegId.add(p.id);
  }

  const additions: Participant[] = [];
  for (const reg of registrations) {
    const regId = `reg_${reg.id}`;
    const nameKey = normalizeNameKey(reg.full_name);
    if (byRegId.has(regId) || byName.has(nameKey)) {
      continue;
    }
    const newParticipant: Participant = {
      id: regId,
      name: reg.full_name,
      weight: 1,
      active: true,
    };
    byName.set(nameKey, newParticipant);
    byRegId.add(regId);
    additions.push(newParticipant);
  }

  if (additions.length === 0 && removedCount === 0) {
    return { merged: existing, addedCount: 0, removedCount: 0 };
  }

  return { merged: [...kept, ...additions], addedCount: additions.length, removedCount };
}
