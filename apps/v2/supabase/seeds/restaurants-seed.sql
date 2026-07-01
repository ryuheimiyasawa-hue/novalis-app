-- Example restaurant rows for the P2-J catalog (LOCAL / REFERENCE ONLY).
--
-- NOT applied to production. The live catalog shows the empty state until
-- real, operator-curated restaurants are added (via the admin UI, or by
-- seeding the real list). These rows document the expected shape and let a
-- local / preview environment render the catalog. Names are generic examples,
-- not real businesses.
--
-- Apply locally with: psql "$DATABASE_URL" -f supabase/seeds/restaurants-seed.sql

INSERT INTO restaurants
  (name, prefecture_code, city_name, address, cuisine_type, hours, photo_url,
   description_ja, description_en, description_tl, is_active)
VALUES
  (
    'Sample Kainan Tokyo',
    'JP-13', '新宿区', '東京都新宿区大久保1-1-1', 'Filipino',
    E'11:00-22:00\n(月曜定休)',
    NULL,
    'フィリピン家庭料理のサンプル店舗です。実データ投入時に置き換えてください。',
    'Example Filipino home-cooking restaurant. Replace with real data.',
    'Halimbawang restawran ng lutong-bahay na Filipino. Palitan ng totoong data.',
    true
  ),
  (
    'Sample Sari-Sari Osaka',
    'JP-27', '大阪市', '大阪府大阪市生野区1-2-3', 'Grocery',
    '10:00-20:00',
    NULL,
    'フィリピン食材店のサンプルです。',
    'Example Filipino grocery store.',
    'Halimbawang grocery ng mga produktong Filipino.',
    true
  ),
  (
    'Sample Inactive Nagoya',
    'JP-23', '名古屋市', NULL, 'Filipino',
    NULL, NULL,
    '非公開（is_active=false）のサンプル。一覧には出ません。',
    'Inactive example; hidden from the public list.',
    'Halimbawang hindi aktibo; nakatago sa listahan.',
    false
  );
