-- ============================================================
-- HEIRSPLIT v3 — AI Features SQL
-- Run in Supabase SQL Editor
-- ============================================================

-- Add new columns to items table for AI features
alter table items add column if not exists condition text default 'good';
alter table items add column if not exists purchase_price numeric;
alter table items add column if not exists purchase_year int;

-- Done! ✓
-- Now follow the Edge Functions setup below
