-- Run this once in Supabase: SQL Editor > New query > paste > Run.
-- BEFORE running: replace YOUR_ADMIN_EMAIL (two places, in the last policy at the bottom) with the email you will sign in with.

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  name        text    not null default '' check (char_length(name) <= 60),
  role        text    not null default '' check (char_length(role) <= 60),
  anonymous   boolean not null default false,
  rating      int     not null default 0 check (rating between 0 and 5),
  message     text    not null check (char_length(message) between 1 and 1000),
  status      text    not null default 'pending' check (status in ('pending','accepted','rejected')),
  source      text    not null default 'visitor' check (source in ('visitor','admin')),
  sort_order  int     not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Visitors: may ONLY add a pending visitor message (they cannot pick status, order or role).
drop policy if exists "visitors can submit" on public.feedback;
create policy "visitors can submit" on public.feedback
  for insert to anon
  with check (status = 'pending' and source = 'visitor' and sort_order = 0 and role = '');

-- Visitors: may ONLY read accepted feedback (what the slider shows).
drop policy if exists "visitors read accepted" on public.feedback;
create policy "visitors read accepted" on public.feedback
  for select to anon
  using (status = 'accepted');

-- Admin: full access, only for the one email you sign in with.
drop policy if exists "admin full access" on public.feedback;
create policy "admin full access" on public.feedback
  for all to authenticated
  using ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL')
  with check ((auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL');
