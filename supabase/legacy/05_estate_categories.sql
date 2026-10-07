-- ============================================================
-- HEIRSPLIT v5 — Per-estate categories
-- Run in Supabase SQL Editor
-- ============================================================

-- Add estate_id to categories table (nullable for backward compatibility)
alter table categories add column if not exists estate_id uuid references estates(id) on delete cascade;

-- Create index for estate-scoped lookups
create index if not exists categories_estate_id_idx on categories(estate_id);

-- Drop any existing RLS policies on categories
drop policy if exists "Anyone can read categories" on categories;
drop policy if exists "Authenticated can manage categories" on categories;

-- Enable RLS
alter table categories enable row level security;

-- Members of an estate can read its categories
create policy "Estate members can read categories"
  on categories for select
  using (
    estate_id is null
    or exists (
      select 1 from estate_members
      where estate_members.estate_id = categories.estate_id
        and estate_members.user_id = auth.uid()
    )
  );

-- Any authenticated user can insert categories for estates they belong to
create policy "Estate members can insert categories"
  on categories for insert
  with check (
    auth.uid() is not null
    and (
      estate_id is null
      or exists (
        select 1 from estate_members
        where estate_members.estate_id = categories.estate_id
          and estate_members.user_id = auth.uid()
      )
    )
  );

-- Any authenticated user can delete categories for estates they belong to
create policy "Estate members can delete categories"
  on categories for delete
  using (
    auth.uid() is not null
    and (
      estate_id is null
      or exists (
        select 1 from estate_members
        where estate_members.estate_id = categories.estate_id
          and estate_members.user_id = auth.uid()
      )
    )
  );
