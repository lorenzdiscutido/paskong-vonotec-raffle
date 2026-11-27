-- Run this script once in your Supabase Dashboard -> SQL Editor -> New Query -> Run

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  contact_number text,
  source text not null default 'mobile' check (source in ('mobile', 'kiosk')),
  created_at timestamptz not null default now()
);

-- Prevent duplicate registrations by full name (case-insensitive, trimmed)
create unique index if not exists registrations_unique_name_idx
  on public.registrations (lower(trim(full_name)));

-- Enable Row Level Security
alter table public.registrations enable row level security;

-- Allow guests, kiosks, and the stage app to read, insert, and manage event registrations
drop policy if exists "Allow public read registrations" on public.registrations;
create policy "Allow public read registrations"
  on public.registrations for select
  using (true);

drop policy if exists "Allow public insert registrations" on public.registrations;
create policy "Allow public insert registrations"
  on public.registrations for insert
  with check (char_length(trim(full_name)) >= 2);

drop policy if exists "Allow public delete registrations" on public.registrations;
create policy "Allow public delete registrations"
  on public.registrations for delete
  using (true);

-- Enable Realtime updates for the Raffle Stage & Usher Kiosk
alter publication supabase_realtime add table public.registrations;
