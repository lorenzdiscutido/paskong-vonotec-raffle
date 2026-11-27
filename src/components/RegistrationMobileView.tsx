import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Ticket,
  UserCheck,
} from 'lucide-react';
import { AnimatedWinterBackdrop } from './AnimatedWinterBackdrop';
import { isSupabaseConfigured } from '../utils/supabaseClient';
import { RegistrationRecord, registerAttendee } from '../utils/registrationService';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../utils/storage';

const GUEST_PASS_KEY = `${STORAGE_KEYS.settings}_guest_pass_v1`;

export const RegistrationMobileView: React.FC = () => {
  const [savedPass, setSavedPass] = useState<RegistrationRecord | null>(() =>
    loadFromStorage<RegistrationRecord | null>(GUEST_PASS_KEY, null)
  );
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    if (savedPass) {
      saveToStorage(GUEST_PASS_KEY, savedPass);
    }
  }, [savedPass]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    const res = await registerAttendee({
      fullName,
      email,
      contactNumber,
      source: 'mobile',
    });

    setSubmitting(false);

    if (!res.ok || !res.record) {
      setErrorMsg(res.error ?? 'Could not complete registration.');
      return;
    }

    setSavedPass(res.record);
    confetti({
      particleCount: 75,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#18355e', '#d63f22', '#fbbf24', '#10b981', '#ffffff'],
    });
  };

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-4 py-8">
      <AnimatedWinterBackdrop theme="christmas" />

      <div className="relative z-10 w-full max-w-md space-y-5">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-900/85 border border-amber-300/35 shadow-lg backdrop-blur-md">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/95 shadow-sm">
              <img
                src="/vonotec-logo.png"
                alt="Vonotec"
                className="h-4 w-auto object-contain"
              />
            </span>
            <span className="text-xs font-bold tracking-wider text-amber-200 uppercase">
              Paskong Vonotec 2026
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold text-white tracking-wide">
            Christmas Party Check-In
          </h1>
          <p className="text-xs text-slate-300 tracking-wide">
            Standing Tall Together: A Christmas of Gratitude
          </p>
        </div>

        {!supabaseReady && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-950/60 px-4 py-3 text-xs text-amber-200 flex items-start gap-2.5 backdrop-blur-md">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
            <span>
              Live registration database is not connected yet. Ask the event host to finish
              configuring Supabase, or check in at the Usher Desk.
            </span>
          </div>
        )}

        {savedPass ? (
          /* Digital Raffle Pass */
          <div className="rounded-2xl border border-amber-300/40 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl space-y-5 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-300" />
            </div>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-emerald-300">
                <Ticket className="w-3.5 h-3.5" />
                <span>Official Christmas Party Pass</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-white">
                {savedPass.full_name}
              </h2>
              {savedPass.email && (
                <p className="text-xs text-amber-200">{savedPass.email}</p>
              )}
              {savedPass.contact_number && (
                <p className="text-xs text-slate-400">{savedPass.contact_number}</p>
              )}
            </div>

            <div className="rounded-xl bg-slate-950/70 border border-slate-800 px-4 py-3 text-xs text-slate-300 space-y-1">
              <p className="font-semibold text-white flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                Welcome to Paskong Vonotec!
              </p>
              <p className="text-slate-400">
                You&apos;re all checked in for tonight&apos;s Christmas celebration. Checked in at{' '}
                {new Date(savedPass.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                .
              </p>
            </div>
          </div>
        ) : (
          /* Registration Form */
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-700/80 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl space-y-4"
          >
            <div className="space-y-1">
              <label
                htmlFor="guest-full-name"
                className="block text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                Full Name <span className="text-rose-400">*</span>
              </label>
              <input
                id="guest-full-name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Juan Dela Cruz"
                autoComplete="name"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="guest-email"
                className="block text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                Email Address <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              <input
                id="guest-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. juan@email.com"
                autoComplete="email"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="guest-contact"
                className="block text-xs font-bold uppercase tracking-wider text-slate-300"
              >
                Contact Number <span className="text-slate-500 font-normal">(Optional)</span>
              </label>
              <input
                id="guest-contact"
                type="tel"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="e.g. 0917 123 4567"
                autoComplete="tel"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            {errorMsg && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/60 px-3.5 py-2.5 text-xs text-rose-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-300" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !supabaseReady}
              className="vonotec-festive-btn w-full py-3 rounded-xl font-display font-bold text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserCheck className="w-5 h-5" />
              <span>{submitting ? 'Checking In...' : 'Check In to the Party'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
