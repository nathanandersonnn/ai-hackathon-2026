-- ─────────────────────────────────────────────
--  001 — workout_templates
--
--  This table was referenced by src/lib/supabase/workoutTemplates.js but had
--  never been created, so custom presets failed silently: the error was
--  swallowed by the .catch() at src/components/Workouts/Workouts.jsx:260 and
--  the UI just rendered an empty list.
--
--  Apply in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ─────────────────────────────────────────────

create table if not exists workout_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null,
  icon        text default '🏋️',
  tag         text,
  color       text default 'accent',
  description text,
  exercises   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists workout_templates_user_idx
  on workout_templates (user_id, created_at desc);

alter table workout_templates enable row level security;

create policy "Users access own workout_templates"
  on workout_templates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
