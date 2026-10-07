-- ============================================================
-- Demo-boet «Fam. Hansen sitt bo» — 3 demo-arvinger og konflikter
--
-- STEG 1 (før scriptet kjøres):
--   Supabase Dashboard → Authentication → Users → Add user. Opprett med «Auto Confirm User»:
--     kari.demo@heirsplit.no, lars.demo@heirsplit.no, mona.demo@heirsplit.no
--   Bruk sterke, tilfeldige passord. Passordet til mona settes også som hemmeligheten
--   DEMO_PASSWORD for edge-funksjonen demo-login (se supabase/README.md). Kari og Lars
--   trenger ingen kjent innlogging.
--
-- STEG 2: Kjør dette scriptet i SQL Editor, etter supabase/legacy/* og supabase/migrations/*.
--
-- Demokontoene er skrivebeskyttet i databasen (is_demo_user()); demoen nullstilles av
-- reset_demo_estate() hver gang noen åpner den.
-- ============================================================

DO $$
DECLARE
  kari_id uuid;
  lars_id uuid;
  mona_id uuid;
  my_id   uuid;
  demo_emails text[] := ARRAY['kari.demo@heirsplit.no','lars.demo@heirsplit.no','mona.demo@heirsplit.no'];
BEGIN

  -- Finn demo-brukernes IDs (Supabase tildeler dem når du oppretter via Dashboard)
  SELECT id INTO kari_id FROM auth.users WHERE email = 'kari.demo@heirsplit.no';
  SELECT id INTO lars_id FROM auth.users WHERE email = 'lars.demo@heirsplit.no';
  SELECT id INTO mona_id FROM auth.users WHERE email = 'mona.demo@heirsplit.no';

  IF kari_id IS NULL OR lars_id IS NULL OR mona_id IS NULL THEN
    RAISE EXCEPTION
      E'Demo-brukere ikke funnet.\nOpprett kari/lars/mona via Dashboard → Authentication → Users og kjør scriptet på nytt.';
  END IF;

  -- Finn app-eierens ID (første ikke-demo-bruker)
  SELECT id INTO my_id FROM auth.users
  WHERE email IS NOT NULL AND email <> ALL(demo_emails)
  ORDER BY created_at ASC LIMIT 1;

  IF my_id IS NULL THEN
    RAISE EXCEPTION 'Fant ikke din brukerkonto. Logg inn i appen minst én gang først.';
  END IF;

  -- ============================================================
  -- DEL 1: Profiler for demo-brukerne
  -- ============================================================

  INSERT INTO profiles (user_id, display_name, avatar_color, email) VALUES
    (kari_id, 'Kari Hansen',      '#c4855a', 'kari.demo@heirsplit.no'),
    (lars_id, 'Lars Hansen',      '#6b8fa8', 'lars.demo@heirsplit.no'),
    (mona_id, 'Mona Hansen-Dahl', '#7aaa7a', 'mona.demo@heirsplit.no')
  ON CONFLICT (user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        avatar_color = EXCLUDED.avatar_color;

  -- ============================================================
  -- DEL 2: Demo-boet
  -- ============================================================

  INSERT INTO estates (id, name, description, owner_id, invite_code, status, total_value, split_mode)
  VALUES (
    'deed0001-0000-0000-0000-000000000001',
    'Fam. Hansen sitt bo',
    'Boet etter Astrid og Per Hansen – Bærum, 2025. Hus, innbo og familieklenodier fordeles mellom tre arvinger.',
    my_id, 'HANSEN2025', 'active', 158400, 'equal'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO estate_members (estate_id, user_id, role) VALUES
    ('deed0001-0000-0000-0000-000000000001', my_id,    'admin'),
    ('deed0001-0000-0000-0000-000000000001', kari_id,  'admin'),
    ('deed0001-0000-0000-0000-000000000001', lars_id,  'admin'),
    ('deed0001-0000-0000-0000-000000000001', mona_id,  'admin')
  ON CONFLICT (estate_id, user_id) DO UPDATE SET role = 'admin';

  INSERT INTO heirs (estate_id, name, email, relationship, percentage) VALUES
    ('deed0001-0000-0000-0000-000000000001', 'Kari Hansen',      'kari.demo@heirsplit.no', 'Barn', 33.3),
    ('deed0001-0000-0000-0000-000000000001', 'Lars Hansen',      'lars.demo@heirsplit.no', 'Barn', 33.3),
    ('deed0001-0000-0000-0000-000000000001', 'Mona Hansen-Dahl', 'mona.demo@heirsplit.no', 'Barn', 33.4)
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- DEL 3: Kategorier
  -- ============================================================

  INSERT INTO categories (id, label, emoji, estate_id) VALUES
    ('cafe0001-0000-0000-0000-000000000001', 'Møbler',               '🛋️', 'deed0001-0000-0000-0000-000000000001'),
    ('cafe0001-0000-0000-0000-000000000002', 'Kunst og bilder',      '🖼️', 'deed0001-0000-0000-0000-000000000001'),
    ('cafe0001-0000-0000-0000-000000000003', 'Smykker og ur',        '💍', 'deed0001-0000-0000-0000-000000000001'),
    ('cafe0001-0000-0000-0000-000000000004', 'Elektronikk',          '📺', 'deed0001-0000-0000-0000-000000000001'),
    ('cafe0001-0000-0000-0000-000000000005', 'Kjøkken og porselen',  '🍳', 'deed0001-0000-0000-0000-000000000001'),
    ('cafe0001-0000-0000-0000-000000000006', 'Minner og arvestykker','🪆', 'deed0001-0000-0000-0000-000000000001')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- DEL 4: Gjenstander
  -- ============================================================

  INSERT INTO items (id, estate_id, title, description, category_id, image_url, estimated_value, condition, added_by_name, status) VALUES

  ('face0001-0000-0000-0000-000000000001', 'deed0001-0000-0000-0000-000000000001',
   'Bestemors gyngestol',
   'Eiketre gyngestol fra 1960-tallet, håndlaget av bestefar Per. Har stått i stua i over 60 år. Original pute med blomstermønster.',
   'cafe0001-0000-0000-0000-000000000001',
   'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=600&q=80',
   8500, 'good', 'Demo', 'active'),

  ('face0002-0000-0000-0000-000000000002', 'deed0001-0000-0000-0000-000000000001',
   'Antikk eiketresbord',
   'Solid spisebord i eik, ca. 1920. Plass til 10 personer. Har vært familiens midtpunkt i tre generasjoner.',
   'cafe0001-0000-0000-0000-000000000001',
   'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80',
   24000, 'fair', 'Demo', 'active'),

  ('face0003-0000-0000-0000-000000000003', 'deed0001-0000-0000-0000-000000000001',
   'Mahognibokkhylle fra 1940',
   'Stor bokhylle i mahogni med glassdører. Plass til ca. 300 bøker. Tilhørende boksamling medfølger.',
   'cafe0001-0000-0000-0000-000000000001',
   'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80',
   4800, 'good', 'Demo', 'active'),

  ('face0004-0000-0000-0000-000000000004', 'deed0001-0000-0000-0000-000000000001',
   'Oljemaleri «Fjord i solnedgang»',
   'Signert oljemaleri av norsk maler K. Andreassen, 1978. 80×120 cm. Originalt pynteramme i gull.',
   'cafe0001-0000-0000-0000-000000000002',
   'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=600&q=80',
   35000, 'excellent', 'Demo', 'active'),

  ('face0005-0000-0000-0000-000000000005', 'deed0001-0000-0000-0000-000000000001',
   'Kinesisk porselesvase, Qing-dynastiet',
   'Blå og hvit porselensvase, antagelig fra Qing-dynastiet (1800-tall). Trolig kopi, men av høy kvalitet.',
   'cafe0001-0000-0000-0000-000000000002',
   'https://images.unsplash.com/photo-1588345921523-c2dcdb7f1dcd?w=600&q=80',
   6500, 'excellent', 'Demo', 'active'),

  ('face0006-0000-0000-0000-000000000006', 'deed0001-0000-0000-0000-000000000001',
   'Vintage Rolex Oyster (1962)',
   'Herreur i stål med originalt lær-armbånd. Kjøpt av Per Hansen i 1962. Originalkasse medfølger.',
   'cafe0001-0000-0000-0000-000000000003',
   'https://images.unsplash.com/photo-1606800052052-a08af7148866?w=600&q=80',
   45000, 'fair', 'Demo', 'active'),

  ('face0007-0000-0000-0000-000000000007', 'deed0001-0000-0000-0000-000000000001',
   'Perle- og diamanthalskjede',
   'Hvitt gull med 18 søsterperler og diamantlås. Bryllupsgave til Astrid i 1961.',
   'cafe0001-0000-0000-0000-000000000003',
   'https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?w=600&q=80',
   18000, 'excellent', 'Demo', 'active'),

  ('face0008-0000-0000-0000-000000000008', 'deed0001-0000-0000-0000-000000000001',
   'Bang & Olufsen musikksystem',
   'B&O Beosound stereo fra 2019. Høyttalere + forsterker + CD-spiller. Fungerer perfekt.',
   'cafe0001-0000-0000-0000-000000000004',
   'https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=600&q=80',
   12000, 'good', 'Demo', 'active'),

  ('face0009-0000-0000-0000-000000000009', 'deed0001-0000-0000-0000-000000000001',
   'Stavangerflint porselen (18 deler)',
   'Komplett middagsservise, 1960-modellen «Flint Blue». 18 deler. Noe slitasje, ingen sprekker.',
   'cafe0001-0000-0000-0000-000000000005',
   'https://images.unsplash.com/photo-1577553698842-aba12d2d17e4?w=600&q=80',
   3200, 'fair', 'Demo', 'active'),

  ('face0010-0000-0000-0000-000000000010', 'deed0001-0000-0000-0000-000000000001',
   'Kristallglass (Hadeland, 12 stk)',
   'Hvitvinsglass fra Hadeland Glassverk, 1970-tallet. 12 stykk, ingen mangler.',
   'cafe0001-0000-0000-0000-000000000005',
   'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=600&q=80',
   2400, 'excellent', 'Demo', 'active'),

  ('face0011-0000-0000-0000-000000000011', 'deed0001-0000-0000-0000-000000000001',
   'Familiealbum 1958–2010',
   'Tre innbundne fotoalbum med over 400 familiefoto. Inkluderer bryllupsbilder og barndomsbilder.',
   'cafe0001-0000-0000-0000-000000000006',
   'https://images.unsplash.com/photo-1567026734534-2c90e2a6fde5?w=600&q=80',
   NULL, 'good', 'Demo', 'active'),

  ('face0012-0000-0000-0000-000000000012', 'deed0001-0000-0000-0000-000000000001',
   'Husflid-sykmaskin (Singer, 1938)',
   'Elektrisk Singer-sykmaskin fra 1938. Sjelden modell. Fungerer med ny ledning.',
   'cafe0001-0000-0000-0000-000000000006',
   'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
   1200, 'fair', 'Demo', 'active')

  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- DEL 5: Interesser — konflikter
  --   Gyngestol        → du + Kari
  --   Eiketresbord     → Lars + Mona
  --   Oljemaleri       → du + Lars + Mona (3-veis!)
  --   Rolex            → Kari + Mona
  --   B&O              → du + Lars
  --   Familiealbum     → Kari + Lars + Mona (3-veis!)
  -- ============================================================

  -- Rydd først eventuelle gamle interesser for disse gjenstandene
  -- (i tilfelle scriptet kjøres på nytt med nye UUIDs for demo-brukerne)
  DELETE FROM interests WHERE item_id IN (
    'face0001-0000-0000-0000-000000000001',
    'face0002-0000-0000-0000-000000000002',
    'face0003-0000-0000-0000-000000000003',
    'face0004-0000-0000-0000-000000000004',
    'face0005-0000-0000-0000-000000000005',
    'face0006-0000-0000-0000-000000000006',
    'face0007-0000-0000-0000-000000000007',
    'face0008-0000-0000-0000-000000000008',
    'face0009-0000-0000-0000-000000000009',
    'face0011-0000-0000-0000-000000000011'
  );

  -- Gyngestol: du + Kari
  INSERT INTO interests (item_id, user_id, reason) VALUES
    ('face0001-0000-0000-0000-000000000001', my_id,
     'Jeg husker den fra barndommen — bestemor satt alltid der og strikket'),
    ('face0001-0000-0000-0000-000000000001', kari_id,
     'Mamma elsket den stolen. Jeg vil ta vare på den til barna mine');

  -- Eiketresbord: Lars + Mona
  INSERT INTO interests (item_id, user_id, reason) VALUES
    ('face0002-0000-0000-0000-000000000002', lars_id,
     'Vi har plass til det i stua og det vil passe perfekt med vår stil'),
    ('face0002-0000-0000-0000-000000000002', mona_id,
     'Vi mangler et skikkelig spisebord — dette er drømmen');

  -- Oljemaleri: du + Lars + Mona
  INSERT INTO interests (item_id, user_id, reason) VALUES
    ('face0004-0000-0000-0000-000000000004', my_id,
     'Det hørte alltid til i stua. Jeg kan ikke forestille meg det noe annet sted'),
    ('face0004-0000-0000-0000-000000000004', lars_id,
     'Pappa var veldig glad i dette maleriet. Jeg vil beholde minnet'),
    ('face0004-0000-0000-0000-000000000004', mona_id,
     'Det er det mest verdifulle i boet — og det er vakkert');

  -- Rolex: Kari + Mona
  INSERT INTO interests (item_id, user_id, reason) VALUES
    ('face0006-0000-0000-0000-000000000006', kari_id,
     'Pappa hadde den på seg hver dag. Den betyr mye for meg'),
    ('face0006-0000-0000-0000-000000000006', mona_id,
     'Jeg er den eneste som bruker ur, og det er et klassisk stykke');

  -- B&O: du + Lars
  INSERT INTO interests (item_id, user_id, reason) VALUES
    ('face0008-0000-0000-0000-000000000008', my_id,
     'Jeg bruker musikkanlegg daglig og dette er av fantastisk kvalitet'),
    ('face0008-0000-0000-0000-000000000008', lars_id,
     'Er stor B&O-fan. Har alltid likt dette anlegget');

  -- Familiealbum: Kari + Lars + Mona
  INSERT INTO interests (item_id, user_id, reason) VALUES
    ('face0011-0000-0000-0000-000000000011', kari_id,
     'Bildene betyr alt. Jeg vil skanne dem og dele digitalt med alle'),
    ('face0011-0000-0000-0000-000000000011', lars_id,
     'Vi bør alle ha tilgang — men noen må oppbevare originalene'),
    ('face0011-0000-0000-0000-000000000011', mona_id,
     'Jeg har barn som ikke har sett disse bildene ennå');

  -- Kinesisk vase: kun Kari
  INSERT INTO interests (item_id, user_id, reason) VALUES
    ('face0005-0000-0000-0000-000000000005', kari_id,
     'Har alltid vært fascinert av den. Vil gjerne ha den i hylla mi');

  -- Halskjede: kun Mona
  INSERT INTO interests (item_id, user_id, reason) VALUES
    ('face0007-0000-0000-0000-000000000007', mona_id,
     'Jeg er eneste datter som bruker smykker — og det er mors smykke');

  -- Bokhylle: kun Lars
  INSERT INTO interests (item_id, user_id, reason) VALUES
    ('face0003-0000-0000-0000-000000000003', lars_id,
     'Jeg er den eneste som har plass til den — og jeg er bibliofil');

  -- Porselen: kun Mona
  INSERT INTO interests (item_id, user_id, reason) VALUES
    ('face0009-0000-0000-0000-000000000009', mona_id,
     'Stavangerflint er en norsk klassiker. Vil bruke det til jul');

  -- Sykmaskin og Kristallglass: ingen interesserte (vises som "ingen vil ha")

  RAISE NOTICE 'Demo-boet er klart! Eier: %, Kari: %, Lars: %, Mona: %', my_id, kari_id, lars_id, mona_id;

END $$;

-- ============================================================
-- Ferdig! Demo-boet «Fam. Hansen sitt bo»:
--   12 gjenstander, 5 konflikter, 4 med én interessert, 2 ingen vil ha
-- Åpne demoen fra forsiden («Test ut demo»).
-- ============================================================
