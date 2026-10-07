-- Minimal etterligning av Supabase for testene: roller, auth.uid()/email()/role(), storage og testbrukere.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create extension if not exists pgcrypto;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, created_at timestamptz default now());
-- Som i Supabase: les fra enkeltinnstilling (tester) eller fra JWT-en PostgREST setter
create function auth.claim(k text) returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.' || k, true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> k) $$;
create function auth.uid() returns uuid language sql stable as $$ select auth.claim('sub')::uuid $$;
create function auth.role() returns text language sql stable as $$ select auth.claim('role') $$;
create function auth.email() returns text language sql stable as $$ select auth.claim('email') $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, jsonb_build_object('aal', auth.claim('aal'))) $$;
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text);
create role authenticator login password 'test' noinherit;
grant anon, authenticated, service_role to authenticator;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, created_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[]; begin _parts := string_to_array(name, '/'); return _parts[1:array_length(_parts,1)-1]; end $$;
create publication supabase_realtime;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects, storage.buckets to authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@test.no'),
  ('00000000-0000-0000-0000-00000000000b', 'kari.demo@heirsplit.no'),
  ('00000000-0000-0000-0000-00000000000c', 'lars.demo@heirsplit.no'),
  ('00000000-0000-0000-0000-00000000000d', 'mona.demo@heirsplit.no'),
  ('00000000-0000-0000-0000-0000000000e1', 'eva@test.no'),
  ('00000000-0000-0000-0000-0000000000f1', 'frank@test.no'),
  ('00000000-0000-0000-0000-0000000000a9', 'outsider@test.no');
