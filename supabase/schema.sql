-- ─────────────────────────────────────────────
--  MyFitBud.ai — Supabase schema
--
--  Run this in: Supabase Dashboard → SQL Editor → New Query
--  It creates the four tables the frontend reads from.
-- ─────────────────────────────────────────────

-- Enable UUID generation (Supabase usually has this on)
create extension if not exists "pgcrypto";

-- ── daily_logs ──────────────────────────────────────────
create table if not exists daily_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  date        date not null,
  weight      numeric,
  steps       integer,
  created_at  timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists daily_logs_user_date_idx on daily_logs (user_id, date desc);

-- ── workout_sessions ────────────────────────────────────
create table if not exists workout_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  date        date not null,
  label       text not null,
  exercises   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists workout_sessions_user_date_idx on workout_sessions (user_id, date desc);

-- ── user_goals ──────────────────────────────────────────
create table if not exists user_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  label       text not null,
  icon        text default '🎯',
  current     numeric default 0,
  target      numeric not null,
  unit        text default '',
  direction   text default 'up' check (direction in ('up', 'down')),
  color       text default 'accent',
  created_at  timestamptz not null default now()
);

create index if not exists user_goals_user_idx on user_goals (user_id);

-- ── milestones ──────────────────────────────────────────
create table if not exists milestones (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  label        text not null,
  earned       boolean not null default false,
  earned_date  date,
  created_at   timestamptz not null default now()
);

create index if not exists milestones_user_idx on milestones (user_id);

-- ─────────────────────────────────────────────
--  Row Level Security
--  RLS is enabled on every table. Each policy restricts
--  reads + writes so users only ever see their own rows.
-- ─────────────────────────────────────────────

alter table daily_logs enable row level security;
create policy "Users access own daily_logs"
  on daily_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table workout_sessions enable row level security;
create policy "Users access own workout_sessions"
  on workout_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table user_goals enable row level security;
create policy "Users access own user_goals"
  on user_goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table milestones enable row level security;
create policy "Users access own milestones"
  on milestones for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
