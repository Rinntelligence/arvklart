-- ============================================================
-- HEIRSPLIT v4 — Goodwill & Work System
-- Run in Supabase SQL Editor
-- ============================================================

-- Chores/work tasks
create table if not exists chores (
  id uuid default gen_random_uuid() primary key,
  estate_id uuid references estates(id) on delete cascade not null,
  title text not null,
  description text,
  size text default 'medium' check (size in ('small','medium','large','dump')),
  points int default 35,
  assigned_to uuid references auth.users(id) on delete set null,
  added_by uuid references auth.users(id) on delete set null,
  completed boolean default false,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- Goodwill event log
create table if not exists goodwill_log (
  id uuid default gen_random_uuid() primary key,
  estate_id uuid references estates(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  event_type text not null,
  points int not null default 0,
  description text,
  reference_id uuid, -- item_id or chore_id
  created_at timestamptz default now()
);

-- RLS
alter table chores enable row level security;
alter table goodwill_log enable row level security;

create policy "Estate members can view chores" on chores for select using (
  estate_id in (select estate_id from estate_members where user_id = auth.uid())
);
create policy "Estate members can add chores" on chores for insert with check (
  estate_id in (select estate_id from estate_members where user_id = auth.uid())
);
create policy "Estate members can update chores" on chores for update using (
  estate_id in (select estate_id from estate_members where user_id = auth.uid())
);
create policy "Admins can delete chores" on chores for delete using (
  estate_id in (select estate_id from estate_members where user_id = auth.uid() and role = 'admin')
);

create policy "Estate members can view goodwill" on goodwill_log for select using (
  estate_id in (select estate_id from estate_members where user_id = auth.uid())
);
create policy "Members can add goodwill events" on goodwill_log for insert with check (
  auth.uid() = user_id
);

-- Realtime
alter publication supabase_realtime add table chores;
alter publication supabase_realtime add table goodwill_log;

-- Done! ✓
