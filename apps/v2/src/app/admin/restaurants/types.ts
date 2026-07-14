export interface RestaurantListRow {
  id: string;
  name: string;
  prefecture_code: string;
  city_name: string;
  cuisine_type: string | null;
  is_active: boolean;
  created_at: string;
}

export interface RestaurantFull {
  id: string;
  name: string;
  prefecture_code: string;
  city_name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  cuisine_type: string | null;
  hours: string | null;
  photo_url: string | null;
  description_ja: string | null;
  description_en: string | null;
  description_tl: string | null;
  is_active: boolean;
  created_at: string;
}
