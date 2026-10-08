-- ============================================================
-- HEIRSPLIT v2 — Add tasks, documents, heirs tables
-- Run this in Supabase SQL Editor AFTER the main setup
-- ============================================================

-- Tasks
create table if not exists tasks (
  id uuid default gen_random_uuid() primary key,
  estate_id uuid references estates(id) on delete cascade not null,
  title text not null,
  description text,
  category text default 'Other',
  priority int default 99,
  completed boolean default false,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  due_date date,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

alter table tasks enable row level security;

create policy "Estate members can view tasks" on tasks for select using (
  estate_id in (select estate_id from estate_members where user_id = auth.uid())
);
create policy "Estate members can create tasks" on tasks for insert with check (
  estate_id in (select estate_id from estate_members where user_id = auth.uid())
);
create policy "Estate members can update tasks" on tasks for update using (
  estate_id in (select estate_id from estate_members where user_id = auth.uid())
);
create policy "Admins can delete tasks" on tasks for delete using (
  estate_id in (select estate_id from estate_members where user_id = auth.uid() and role = 'admin')
);

-- Documents
create table if not exists documents (
  id uuid default gen_random_uuid() primary key,
  estate_id uuid references estates(id) on delete cascade not null,
  name text not null,
  file_url text not null,
  file_path text not null,
  file_type text,
  file_size bigint,
  folder text default 'other',
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

alter table documents enable row level security;

create policy "Estate members can view documents" on documents for select using (
  estate_id in (select estate_id from estate_members where user_id = auth.uid())
);
create policy "Estate members can upload documents" on documents for insert with check (
  estate_id in (select estate_id from estate_members where user_id = auth.uid())
);
create policy "Uploader or admin can delete documents" on documents for delete using (
  uploaded_by = auth.uid() or
  estate_id in (select estate_id from estate_members where user_id = auth.uid() and role = 'admin')
);

-- Heirs
create table if not exists heirs (
  id uuid default gen_random_uuid() primary key,
  estate_id uuid references estates(id) on delete cascade not null,
  name text not null,
  email text,
  relationship text default 'Other',
  percentage numeric default 0,
  notes text,
  created_at timestamptz default now()
);

alter table heirs enable row level security;

create policy "Estate members can view heirs" on heirs for select using (
  estate_id in (select estate_id from estate_members where user_id = auth.uid())
);
create policy "Estate members can add heirs" on heirs for insert with check (
  estate_id in (select estate_id from estate_members where user_id = auth.uid())
);
create policy "Estate members can update heirs" on heirs for update using (
  estate_id in (select estate_id from estate_members where user_id = auth.uid())
);
create policy "Admins can delete heirs" on heirs for delete using (
  estate_id in (select estate_id from estate_members where user_id = auth.uid() and role = 'admin')
);

-- Add columns to estates
alter table estates add column if not exists total_value numeric;
alter table estates add column if not exists split_mode text default 'equal';

-- Storage bucket for documents
insert into storage.buckets (id, name, public) values ('estate-docs', 'estate-docs', true) on conflict do nothing;

create policy "Estate members can upload docs" on storage.objects for insert
  with check (bucket_id = 'estate-docs' and auth.role() = 'authenticated');
create policy "Estate docs are accessible" on storage.objects for select
  using (bucket_id = 'estate-docs');
create policy "Uploader can delete docs" on storage.objects for delete
  using (bucket_id = 'estate-docs' and auth.uid()::text = (storage.foldername(name))[1]);

-- Realtime for new tables
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table documents;
alter publication supabase_realtime add table heirs;

-- Done! ✓
