export interface ExpertListRow {
  id: string;
  name: string;
  title: string;
  prefecture_code: string | null;
  city_name: string | null;
  calendar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ExpertFull {
  id: string;
  name: string;
  title: string;
  specialty_ja: string | null;
  specialty_en: string | null;
  specialty_tl: string | null;
  bio_ja: string | null;
  bio_en: string | null;
  bio_tl: string | null;
  prefecture_code: string | null;
  city_name: string | null;
  avatar_url: string | null;
  calendar_url: string | null;
  is_active: boolean;
  created_at: string;
}
