-- Store AI reasoning and confidence from the value estimate so ItemDetailPage
-- can show a brief explanation and a soft "please verify" note for low-confidence estimates.
alter table public.items add column if not exists estimate_reasoning text;
alter table public.items add column if not exists estimate_confidence text; -- 'high' | 'medium' | 'low'

notify pgrst, 'reload schema';
