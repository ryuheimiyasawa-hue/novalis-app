-- Restaurant names and cities for English and Tagalog readers.
--
-- The cards showed `name` and `city_name` exactly as the admins typed
-- them, in Japanese ("カリエンテ・マニラ", "新宿区"), to every reader. The
-- description already had _en / _tl columns; the name and the city had
-- nothing to fall back to.
--
-- One English column each, used for both English and Tagalog: place
-- names and shop names are written in the Latin alphabet in Tagalog too,
-- the same convention `getPrefectureLabel` follows. Nullable, so existing
-- rows keep working and the pages fall back to the Japanese value until
-- an admin fills them in. Additive only: no existing column changes.

alter table public.restaurants
  add column if not exists name_en text,
  add column if not exists city_name_en text;

alter table public.restaurants
  add constraint restaurants_name_en_length check (name_en is null or char_length(name_en) <= 100),
  add constraint restaurants_city_name_en_length check (city_name_en is null or char_length(city_name_en) <= 100);
