export interface CategoryRow {
  id: string;
  slug: string;
  name_ja: string;
  name_en: string;
  name_tl: string;
  icon: string | null;
  sort_order: number;
  is_system: boolean;
  created_at: string;
}
