export interface FaqListRow {
  id: string;
  category_id: string | null;
  question_ja: string;
  prefecture_code: string | null;
  is_published: boolean;
  sort_order: number;
  updated_at: string;
  created_at: string;
  category: { id: string; slug: string; name_ja: string } | null;
}

export interface FaqFull {
  id: string;
  category_id: string | null;
  question_ja: string;
  question_en: string | null;
  question_tl: string | null;
  answer_ja: string;
  answer_en: string | null;
  answer_tl: string | null;
  prefecture_code: string | null;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryOption {
  id: string;
  slug: string;
  name_ja: string;
}
