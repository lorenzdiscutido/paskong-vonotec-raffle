import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Search,
  Smartphone,
  Tablet,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { AnimatedWinterBackdrop } from './AnimatedWinterBackdrop';
import { isSupabaseConfigured } from '../utils/supabaseClient';
import {
  RegistrationRecord,
  deleteRegistration,
  fetchRegistrations,
  getKioskPin,
  registerAttendee,
  subscribeToRegistrations,
} from '../utils/registrationService';

const KIOSK_UNLOCK_SESSION_KEY = 'vonotec_kiosk_unlocked_v1';

export const RegistrationKioskView: React.FC = () => {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem(KIOSK_UNLOCK_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [records, setRecords] = useState<RegistrationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Walk-in registration form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const supabaseReady = isSupabaseConfigured();

  const refreshList = useCallback(async () => {
    if (!supabaseReady) return;
    setLoading(true);
    const { records: rows, error } = await fetchRegistrations();
    setLoading(false);
    if (error) {
      setLoadError(error);
    } else {
      setLoadError(null);
      setRecords(rows);
    }
  }, [supabaseReady]);

  useEffect(() => {
    if (!unlocked || !supabaseReady) return;
    void refreshList();
    return subscribeToRegistrations(() => {
      void refreshList();
    });
  }, [unlocked, supabaseReady, refreshList]);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim() === getKioskPin()) {
      setUnlocked(true);
      setPinError(false);
      try {
        window.sessionStorage.setItem(KIOSK_UNLOCK_SESSION_KEY, '1');
      } catch {
        // Ignore sessionStorage errors in restricted environments
      }
    } else {
      setPinError(true);
    }
  };

  const handleLock = () => {
    setUnlocked(false);
    setPinInput('');
    try {
      window.sessionStorage.removeItem(KIOSK_UNLOCK_SESSION_KEY);
    } catch {
      // Ignore
    }
  };

  const handleRegisterWalkIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);
    setSubmitting(true);

    const res = await registerAttendee({
      fullName,
      email,
      contactNumber,
      source: 'kiosk',
    });

    setSubmitting(false);

    if (!res.ok || !res.record) {
      setFormFeedback({
        type: 'error',
        text: res.error ?? 'Failed to register attendee.',
      });
      return;
    }

    setFormFeedback({
      type: 'success',
      text: `Checked in ${res.record.full_name}!`,
    });
    setFullName('');
    setEmail('');
    setContactNumber('');
    void refreshList();
    nameInputRef.current?.focus();
  };

  const handleDelete = async (rec: RegistrationRecord) => {
    if (!window.confirm(`Remove "${rec.full_name}" from live registrations?`)) {
      return;
    }
    const res = await deleteRegistration(rec.id);
    if (res.ok) {
      setRecords((prev) => prev.filter((r) => r.id !== rec.id));
    } else {
      setLoadError(res.error ?? 'Failed to remove registration.');
    }
  };

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.email?.toLowerCase().includes(q) ?? false) ||
        (r.contact_number?.toLowerCase().includes(q) ?? false)
    );
  }, [records, searchQuery]);

  if (!unlocked) {
    return (
      <div className="relative min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <AnimatedWinterBackdrop theme="christmas" />
        <form
          onSubmit={handleUnlock}
          className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl space-y-4 text-center"
        >
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-400/15 border border-amber-300/30 flex items-center justify-center">
            <Lock className="w-6 h-6 text-amber-300" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-white">Usher Check-In Kiosk</h1>
            <p className="text-xs text-slate-400 mt-1">
              Enter the 4-digit event PIN to register walk-in guests.
            </p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => {
              setPinInput(e.target.value);
              setPinError(false);
            }}
            placeholder="Enter PIN (default: 1225)"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-center text-lg tracking-widest text-amber-200 font-bold focus:outline-none focus:border-amber-400"
          />
          {pinError && (
            <p className="text-xs text-rose-400 font-medium">Incorrect PIN. Try again.</p>
          )}
          <button
            type="submit"
            className="vonotec-festive-btn w-full py-2.5 rounded-xl font-display font-bold text-sm cursor-pointer"
          >
            Unlock Kiosk
          </button>
          <a
            href="?"
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Main Stage
          </a>
        </form>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col">
      <AnimatedWinterBackdrop theme="christmas" />

      {/* Header */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img
            src="/vonotec-logo.png"
            alt="Vonotec"
            className="h-6 w-auto object-contain"
          />
          <div>
            <h1 className="font-display text-lg font-bold text-white leading-tight">
              Usher Check-In Kiosk
            </h1>
            <p className="text-[11px] text-slate-400">
              Register phone-less guests &amp; monitor live check-ins
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-xs font-bold text-emerald-200 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>{records.length} Registered</span>
          </div>
          <button
            type="button"
            onClick={handleLock}
            className="px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" /> Lock
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {!supabaseReady && (
          <div className="lg:col-span-12 rounded-xl border border-amber-400/40 bg-amber-950/60 px-4 py-3 text-xs text-amber-200 flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-300" />
            <span>
              Supabase environment variables are not configured yet (`VITE_SUPABASE_URL` &amp;
              `VITE_SUPABASE_ANON_KEY`).
            </span>
          </div>
        )}

        {/* Left: Walk-in Form */}
        <section className="lg:col-span-5">
          <form
            onSubmit={handleRegisterWalkIn}
            className="rounded-2xl border border-slate-700/80 bg-slate-900/90 p-5 shadow-xl backdrop-blur-xl space-y-4"
          >
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <UserPlus className="w-5 h-5 text-amber-300" />
              <h2 className="font-display text-base font-bold text-white">
                Register Walk-In Guest
              </h2>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="kiosk-full-name"
                className="block text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                Full Name <span className="text-rose-400">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="kiosk-full-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Maria Santos"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="kiosk-email"
                className="block text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                Email Address <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              <input
                id="kiosk-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. maria@email.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="kiosk-contact"
                className="block text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                Contact Number <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              <input
                id="kiosk-contact"
                type="tel"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="e.g. 0917 123 4567"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            {formFeedback && (
              <div
                className={`rounded-xl px-3.5 py-2.5 text-xs flex items-start gap-2 border ${
                  formFeedback.type === 'success'
                    ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-200'
                    : 'border-rose-500/40 bg-rose-950/60 text-rose-200'
                }`}
              >
                {formFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-300" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-300" />
                )}
                <span>{formFeedback.text}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !supabaseReady}
              className="vonotec-festive-btn w-full py-3 rounded-xl font-display font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              <span>{submitting ? 'Adding Guest...' : 'Check In Guest'}</span>
            </button>
          </form>
        </section>

        {/* Right: Live Attendee List */}
        <section className="lg:col-span-7 flex flex-col rounded-2xl border border-slate-700/80 bg-slate-900/90 p-5 shadow-xl backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-4">
            <h2 className="font-display text-base font-bold text-white">
              Live Registered Attendees
            </h2>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, email, or phone..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {loadError && (
            <div className="mb-3 rounded-xl border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-xs text-rose-200">
              {loadError}
            </div>
          )}

          <div className="flex-1 overflow-y-auto max-h-[520px] space-y-2 pr-1">
            {loading && records.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">Loading registrations...</p>
            ) : filteredRecords.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">
                {records.length === 0
                  ? 'No guests registered yet.'
                  : 'No matching attendees found.'}
              </p>
            ) : (
              filteredRecords.map((rec) => {
                const contactMeta = [rec.email, rec.contact_number].filter(Boolean).join(' • ');
                return (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white truncate">
                          {rec.full_name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            rec.source === 'mobile'
                              ? 'bg-sky-500/15 text-sky-300 border border-sky-400/20'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-400/20'
                          }`}
                        >
                          {rec.source === 'mobile' ? (
                            <Smartphone className="w-2.5 h-2.5" />
                          ) : (
                            <Tablet className="w-2.5 h-2.5" />
                          )}
                          {rec.source === 'mobile' ? 'Phone' : 'Kiosk'}
                        </span>
                      </div>
                      {contactMeta && (
                        <p className="text-xs text-slate-400 truncate">{contactMeta}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDelete(rec)}
                      title="Remove entry"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
