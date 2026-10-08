-- ============================================================
-- HEIRSPLIT — Complete Supabase SQL Setup
-- Run this in Supabase SQL Editor (one time)
-- ============================================================

-- 1. PROFILES
create table if not exists profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique not null,
  display_name text not null,
  avatar_color text default '#8c7b6b',
  email text,
  plan text default 'free' check (plan in ('free','family','business','enterprise')),
  is_founder boolean default false,
  created_at timestamptz default now()
);

-- 2. ESTATES
create table if not exists estates (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  owner_id uuid references auth.users(id) on delete set null,
  invite_code text unique not null,
  branding_color text default '#1a1410',
  branding_logo text,
  status text default 'active',
  created_at timestamptz default now()
);

-- 3. ESTATE MEMBERS
create table if not exists estate_members (
  id uuid default gen_random_uuid() primary key,
  estate_id uuid references estates(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text default 'member' check (role in ('admin','member')),
  joined_at timestamptz default now(),
  unique(estate_id, user_id)
);

-- 4. CATEGORIES
create table if not exists categories (
  id uuid default gen_random_uuid() primary key,
  label text not null,
  emoji text default '📦',
  created_at timestamptz default now()
);

insert into categories (label, emoji) values
  ('Furniture','🛋️'), ('Art & pictures','🖼️'), ('Books','📚'),
  ('Kitchen','🍳'), ('Decorations','🏺'), ('Electronics','📺'),
  ('Clothing & textiles','🧣'), ('Jewelry','💍'), ('Other','📦')
on conflict do nothing;

-- 5. ITEMS
create table if not exists items (
  id uuid default gen_random_uuid() primary key,
  estate_id uuid references estates(id) on delete cascade not null,
  title text not null,
  description text,
  category_id uuid references categories(id) on delete set null,
  image_url text,
  estimated_value text,
  added_by uuid references auth.users(id) on delete set null,
  added_by_name text,
  status text default 'active' check (status in ('active','assigned')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

-- 6. INTERESTS
create table if not exists interests (
  id uuid default gen_random_uuid() primary key,
  item_id uuid references items(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  reason text,
  created_at timestamptz default now(),
  unique(item_id, user_id)
);

-- 7. COMMENTS
create table if not exists comments (
  id uuid default gen_random_uuid() primary key,
  item_id uuid references items(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

-- 8. FEEDBACK
create table if not exists feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete set null,
  estate_id uuid references estates(id) on delete set null,
  type text default 'general',
  content text,
  nps_score int check (nps_score between 1 and 10),
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table estates enable row level security;
alter table estate_members enable row level security;
alter table categories enable row level security;
alter table items enable row level security;
alter table interests enable row level security;
alter table comments enable row level security;
alter table feedback enable row level security;

-- Profiles
create policy "Users can view all profiles" on profiles for select using (auth.role()='authenticated');
create policy "Users can insert own profile" on profiles for insert with check (auth.uid()=user_id);
create policy "Users can update own profile" on profiles for update using (auth.uid()=user_id);

-- Estates
create policy "Members can view their estates" on estates for select using (
  id in (select estate_id from estate_members where user_id=auth.uid())
);
create policy "Authenticated can create estates" on estates for insert with check (auth.role()='authenticated');
create policy "Admins can update estates" on estates for update using (
  id in (select estate_id from estate_members where user_id=auth.uid() and role='admin')
);

-- Estate members
create policy "Members can view estate members" on estate_members for select using (
  estate_id in (select estate_id from estate_members em where em.user_id=auth.uid())
);
create policy "Authenticated can join estates" on estate_members for insert with check (auth.role()='authenticated');
create policy "Admins can remove members" on estate_members for delete using (
  auth.uid()=user_id or
  estate_id in (select estate_id from estate_members where user_id=auth.uid() and role='admin')
);

-- Categories
create policy "Authenticated can view categories" on categories for select using (auth.role()='authenticated');
create policy "Authenticated can create categories" on categories for insert with check (auth.role()='authenticated');
create policy "Authenticated can delete categories" on categories for delete using (auth.role()='authenticated');

-- Items
create policy "Estate members can view items" on items for select using (
  estate_id in (select estate_id from estate_members where user_id=auth.uid())
);
create policy "Estate members can create items" on items for insert with check (
  estate_id in (select estate_id from estate_members where user_id=auth.uid())
);
create policy "Estate members can update items" on items for update using (
  estate_id in (select estate_id from estate_members where user_id=auth.uid())
);
create policy "Admins can delete items" on items for delete using (
  estate_id in (select estate_id from estate_members where user_id=auth.uid() and role='admin')
);

-- Interests
create policy "Estate members can view interests" on interests for select using (
  item_id in (select id from items where estate_id in (select estate_id from estate_members where user_id=auth.uid()))
);
create policy "Members can add interests" on interests for insert with check (auth.uid()=user_id);
create policy "Members can remove own interests" on interests for delete using (auth.uid()=user_id);

-- Comments
create policy "Estate members can view comments" on comments for select using (
  item_id in (select id from items where estate_id in (select estate_id from estate_members where user_id=auth.uid()))
);
create policy "Members can add comments" on comments for insert with check (auth.uid()=user_id);
create policy "Members can delete own comments" on comments for delete using (auth.uid()=user_id);

-- Feedback
create policy "Users can submit feedback" on feedback for insert with check (auth.role()='authenticated');
create policy "Founder can view feedback" on feedback for select using (
  (select is_founder from profiles where user_id=auth.uid()) = true
);

-- ============================================================
-- STORAGE
-- ============================================================

insert into storage.buckets (id, name, public) values ('item-images','item-images',true) on conflict do nothing;

create policy "Authenticated can upload images" on storage.objects for insert with check (bucket_id='item-images' and auth.role()='authenticated');
create policy "Images are publicly accessible" on storage.objects for select using (bucket_id='item-images');

-- ============================================================
-- REALTIME
-- ============================================================

alter publication supabase_realtime add table items;
alter publication supabase_realtime add table interests;
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table estate_members;

-- ============================================================
-- SET YOURSELF AS FOUNDER
-- Run this AFTER signing up with your own email:
-- ============================================================

-- update profiles set is_founder = true where email = 'YOUR_EMAIL_HERE';

-- Done! ✓
