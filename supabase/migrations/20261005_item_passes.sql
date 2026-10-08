-- «Ikke interessert»: lagrer at en arving har tatt stilling til en gjenstand og sagt nei takk.
-- Sammen med interests gir dette svar på om alle har tatt stilling til alle gjenstander, som
-- kreves før Løsningsmetoder kan brukes. Kjøres i Supabase SQL Editor FØR frontend deployes,
-- ellers blir Løsningsmetoder stående låst (ingen «nei takk» kan lagres).

create table if not exists public.item_passes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (item_id, user_id)
);

create index if not exists item_passes_item_id_idx on public.item_passes(item_id);

alter table public.item_passes enable row level security;

-- Medlemmer av boet kan se hvem som har sagt nei takk.
drop policy if exists "Members can read passes in their estates" on public.item_passes;
create policy "Members can read passes in their estates" on public.item_passes for select using (
  exists (
    select 1 from public.items i
    join public.estate_members m on m.estate_id = i.estate_id
    where i.id = item_passes.item_id and m.user_id = auth.uid()
  )
);

-- Brukere kan bare legge inn og fjerne sine egne, og bare i bo de er medlem av.
drop policy if exists "Members can add own passes" on public.item_passes;
create policy "Members can add own passes" on public.item_passes for insert with check (
  user_id = auth.uid() and exists (
    select 1 from public.items i
    join public.estate_members m on m.estate_id = i.estate_id
    where i.id = item_passes.item_id and m.user_id = auth.uid()
  )
);

drop policy if exists "Users can remove own passes" on public.item_passes;
create policy "Users can remove own passes" on public.item_passes for delete using (user_id = auth.uid());

-- Sanntidsoppdatering på bo-siden.
alter publication supabase_realtime add table public.item_passes;

notify pgrst, 'reload schema';
