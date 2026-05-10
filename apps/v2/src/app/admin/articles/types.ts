export type ArticleStatus = "draft" | "published" | "archived";

export interface ArticleListRow {
  id: string;
  category_id: string | null;
  slug: string;
  status: ArticleStatus;
  title_ja: string;
  prefecture_code: string | null;
  published_at: string | null;
  updated_at: string;
  created_at: string;
  category: { id: string; slug: string; name_ja: string } | null;
}

export interface ArticleFull {
  id: string;
  category_id: string | null;
  slug: string;
  status: ArticleStatus;
  title_ja: string;
  title_en: string | null;
  title_tl: string | null;
  body_ja: string;
  body_en: string | null;
  body_tl: string | null;
  prefecture_code: string | null;
  city_name: string | null;
  author_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryOption {
  id: string;
  slug: string;
  name_ja: string;
}
