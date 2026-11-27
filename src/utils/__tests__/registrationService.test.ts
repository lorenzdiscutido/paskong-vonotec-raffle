import { describe, expect, it } from 'vitest';
import { Participant } from '../../types/raffle';
import {
  RegistrationRecord,
  mergeRegistrationsIntoParticipants,
  normalizeNameKey,
} from '../registrationService';

describe('registrationService', () => {
  it('normalizes names consistently for duplicate detection', () => {
    expect(normalizeNameKey('  Juan   Dela Cruz  ')).toBe('juan dela cruz');
    expect(normalizeNameKey('MARIA SANTOS')).toBe('maria santos');
  });

  it('merges new Supabase registrations without duplicating existing or inactive entries', () => {
    const existing: Participant[] = [
      {
        id: 'p-1',
        name: 'Juan Dela Cruz',
        weight: 1,
        active: false, // Already won or absent
      },
      {
        id: 'reg_uuid-2',
        name: 'Maria Santos',
        weight: 1,
        active: true,
      },
    ];

    const cloudRecords: RegistrationRecord[] = [
      {
        id: 'uuid-1',
        full_name: '  juan   dela cruz ',
        email: 'juan@example.com',
        contact_number: '09171234567',
        source: 'mobile',
        created_at: '2026-11-27T08:00:00Z',
      },
      {
        id: 'uuid-2',
        full_name: 'Maria Santos',
        email: null,
        contact_number: null,
        source: 'kiosk',
        created_at: '2026-11-27T08:01:00Z',
      },
      {
        id: 'uuid-3',
        full_name: 'Pedro Penduko',
        email: 'pedro@example.com',
        contact_number: null,
        source: 'mobile',
        created_at: '2026-11-27T08:02:00Z',
      },
    ];

    const { merged, addedCount } = mergeRegistrationsIntoParticipants(existing, cloudRecords);
    expect(addedCount).toBe(1);
    expect(merged).toHaveLength(3);
    expect(merged[0].active).toBe(false);
    expect(merged[2]).toEqual({
      id: 'reg_uuid-3',
      name: 'Pedro Penduko',
      weight: 1,
      active: true,
    });
  });
});
