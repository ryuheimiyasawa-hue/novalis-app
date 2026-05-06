-- =============================================================================
-- Philippine Community v2 — Initial schema
-- 準拠: ~/.claude/plans/claude-me-bot-federated-cook.md §4
-- =============================================================================

-- 拡張
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- 共通: updated_at 自動更新トリガー関数
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- profiles
-- =============================================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  facebook_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'ja' CHECK (preferred_language IN ('ja', 'en', 'tl')),
  prefecture_code TEXT NOT NULL,
  city_name TEXT NOT NULL,
  trial_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trial_ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 新規ユーザー作成時に profiles 自動作成（trial_ends_at = +30 days）
-- prefecture_code/city_name は登録時の必須化のため一時的に空文字、
-- アプリ側のオンボーディングで NOT NULL を満たす値で UPDATE する運用。
-- 既定値を空文字にしているのは migration 時の制約衝突回避。
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    facebook_id,
    display_name,
    email,
    avatar_url,
    prefecture_code,
    city_name,
    trial_started_at,
    trial_ends_at
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'provider_id', NEW.id::text),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'User'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    '',
    '',
    NOW(),
    NOW() + INTERVAL '30 days'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE INDEX idx_profiles_prefecture ON profiles(prefecture_code);
CREATE INDEX idx_profiles_facebook_id ON profiles(facebook_id);

-- =============================================================================
-- admin_roles
-- =============================================================================
CREATE TABLE admin_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- =============================================================================
-- chat_usage（月次カウンタ、JST月初 lazy reset）
-- =============================================================================
CREATE TABLE chat_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_yyyymm TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, period_yyyymm)
);

CREATE INDEX idx_chat_usage_user_period ON chat_usage(user_id, period_yyyymm);

-- =============================================================================
-- subscriptions
-- =============================================================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('monthly', '3months', '6months', '12months')),
  status TEXT NOT NULL CHECK (status IN ('pending_payment', 'active', 'expired', 'canceled')),
  komoju_subscription_id TEXT,
  komoju_payment_id TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  amount_jpy INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'gcash', 'bank_transfer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id, status);
CREATE INDEX idx_subscriptions_active_ends ON subscriptions(ends_at) WHERE status = 'active';

-- =============================================================================
-- bank_transfer_pending（銀行振込仮扱い）
-- =============================================================================
CREATE TABLE bank_transfer_pending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  expected_amount_jpy INTEGER NOT NULL,
  expected_payer_name TEXT NOT NULL,
  reference_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'failed', 'expired')),
  matched_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_btp_status ON bank_transfer_pending(status);

-- =============================================================================
-- conversations + messages（オペレーターモード対応）
-- =============================================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'messenger')),
  title TEXT,
  mode TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'operator')),
  operator_user_id UUID REFERENCES profiles(id),
  operator_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_mode ON conversations(mode) WHERE mode = 'operator';

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'operator', 'system')),
  sender_user_id UUID REFERENCES profiles(id),
  content TEXT NOT NULL,
  is_escalated BOOLEAN NOT NULL DEFAULT false,
  whitelist_decision JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- =============================================================================
-- operator_takeover_logs
-- =============================================================================
CREATE TABLE operator_takeover_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  operator_user_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL CHECK (action IN ('takeover', 'release')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operator_logs_conv ON operator_takeover_logs(conversation_id, created_at);

-- =============================================================================
-- messenger_links
-- =============================================================================
CREATE TABLE messenger_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  messenger_psid TEXT NOT NULL UNIQUE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messenger_links_user ON messenger_links(user_id);

-- =============================================================================
-- categories
-- =============================================================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name_ja TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_tl TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO categories (slug, name_ja, name_en, name_tl, icon, sort_order) VALUES
  ('visa',         '在留資格・ビザ',     'Visa & Residency',           'Visa at Residency',                              'passport',     1),
  ('social_ins',   '社会保険',           'Social Insurance',           'Social Insurance',                               'shield',       2),
  ('family',       '夫婦間トラブル',     'Family & Marriage',          'Mga Problema sa Pag-aasawa',                     'heart',        3),
  ('school',       '学校関連',           'School',                     'Paaralan',                                       'book-open',    4),
  ('admin_proc',   '行政手続き',         'Administrative Procedures',  'Mga Pamamaraan sa Pamahalaan',                   'file-text',    5),
  ('escalation',   '士業相談',           'Expert Consultation',        'Konsultasyon ng Eksperto',                       'briefcase',    6),
  ('restaurants',  '飲食店',             'Restaurants',                'Mga Restawran',                                  'utensils',     7);

-- =============================================================================
-- articles
-- =============================================================================
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id),
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  title_ja TEXT NOT NULL,
  title_en TEXT,
  title_tl TEXT,
  body_ja TEXT NOT NULL,
  body_en TEXT,
  body_tl TEXT,
  prefecture_code TEXT,
  city_name TEXT,
  author_id UUID REFERENCES profiles(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_articles_category ON articles(category_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_pref_status ON articles(prefecture_code, status);

-- =============================================================================
-- faqs
-- =============================================================================
CREATE TABLE faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id),
  question_ja TEXT NOT NULL,
  question_en TEXT,
  question_tl TEXT,
  answer_ja TEXT NOT NULL,
  answer_en TEXT,
  answer_tl TEXT,
  prefecture_code TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER faqs_updated_at
  BEFORE UPDATE ON faqs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_faqs_category ON faqs(category_id);
CREATE INDEX idx_faqs_published ON faqs(is_published);

-- =============================================================================
-- experts（士業）
-- =============================================================================
CREATE TABLE experts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  specialty_ja TEXT,
  specialty_en TEXT,
  specialty_tl TEXT,
  bio_ja TEXT,
  bio_en TEXT,
  bio_tl TEXT,
  prefecture_code TEXT,
  city_name TEXT,
  avatar_url TEXT,
  calendar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_experts_active ON experts(is_active);
CREATE INDEX idx_experts_pref_active ON experts(prefecture_code, is_active);

-- =============================================================================
-- restaurants（飲食店カタログ）
-- =============================================================================
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  prefecture_code TEXT NOT NULL,
  city_name TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  cuisine_type TEXT,
  hours TEXT,
  photo_url TEXT,
  description_ja TEXT,
  description_en TEXT,
  description_tl TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_restaurants_pref_city ON restaurants(prefecture_code, city_name);
CREATE INDEX idx_restaurants_active ON restaurants(is_active);

-- =============================================================================
-- inquiries（士業エスカレ）
-- =============================================================================
CREATE TABLE inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expert_id UUID REFERENCES experts(id),
  category_id UUID REFERENCES categories(id),
  source_message_id UUID REFERENCES messages(id),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'resolved', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER inquiries_updated_at
  BEFORE UPDATE ON inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_inquiries_user ON inquiries(user_id);
CREATE INDEX idx_inquiries_status ON inquiries(status);

-- =============================================================================
-- content_embeddings（RAG用）
-- =============================================================================
CREATE TABLE content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('article', 'faq')),
  source_id UUID NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('ja', 'en', 'tl')),
  chunk_text TEXT NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  embedding VECTOR(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_embeddings_vec ON content_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- =============================================================================
-- consent_logs
-- =============================================================================
CREATE TABLE consent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('terms', 'privacy')),
  version TEXT NOT NULL,
  language TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consent_logs_user ON consent_logs(user_id);

-- =============================================================================
-- webhook_logs（idempotency: Komoju 二重配信防止）
-- =============================================================================
CREATE TABLE webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('komoju', 'messenger')),
  external_event_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source, external_event_id)
);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_self_select ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_self_update ON profiles FOR UPDATE USING (auth.uid() = id);

-- admin_roles
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_roles_self ON admin_roles FOR SELECT USING (auth.uid() = user_id);

-- chat_usage
ALTER TABLE chat_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_usage_self ON chat_usage FOR SELECT USING (auth.uid() = user_id);

-- subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_self ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- bank_transfer_pending
ALTER TABLE bank_transfer_pending ENABLE ROW LEVEL SECURITY;
CREATE POLICY btp_self ON bank_transfer_pending FOR SELECT
  USING (EXISTS (SELECT 1 FROM subscriptions s WHERE s.id = subscription_id AND s.user_id = auth.uid()));

-- conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversations_self_select ON conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY conversations_self_insert ON conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY conversations_self_update ON conversations FOR UPDATE USING (auth.uid() = user_id);

-- messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_owner_select ON messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY messages_owner_insert ON messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));

-- operator_takeover_logs: RLSは有効、ポリシーは意図的に作らない。
-- service_role 経由（admin API ルート内の admin client）でのみ書き込み・参照する。
-- これにより一般ユーザーは介入ログにアクセス不可となる（士業法対応の証跡保護）。
ALTER TABLE operator_takeover_logs ENABLE ROW LEVEL SECURITY;

-- messenger_links
ALTER TABLE messenger_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY messenger_links_self ON messenger_links FOR SELECT USING (auth.uid() = user_id);

-- categories（誰でも閲覧）
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY categories_public_read ON categories FOR SELECT USING (true);

-- articles（公開済みは誰でも閲覧）
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY articles_public_read ON articles FOR SELECT USING (status = 'published');

-- faqs
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY faqs_public_read ON faqs FOR SELECT USING (is_published = true);

-- experts
ALTER TABLE experts ENABLE ROW LEVEL SECURITY;
CREATE POLICY experts_public_read ON experts FOR SELECT USING (is_active = true);

-- restaurants
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
CREATE POLICY restaurants_public_read ON restaurants FOR SELECT USING (is_active = true);

-- inquiries
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY inquiries_self_select ON inquiries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY inquiries_self_insert ON inquiries FOR INSERT WITH CHECK (auth.uid() = user_id);

-- content_embeddings: RLSは有効、ポリシーは意図的に作らない（service_role 専用）。
-- 一般ユーザーから embedding を直接参照する用途はなく、検索は match_content RPC 経由で行う。
ALTER TABLE content_embeddings ENABLE ROW LEVEL SECURITY;

-- consent_logs
ALTER TABLE consent_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY consent_logs_self_select ON consent_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY consent_logs_self_insert ON consent_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- webhook_logs: RLSは有効、ポリシーは意図的に作らない（service_role 専用）。
-- Komoju/Messenger Webhook 受信処理が UNIQUE(source, external_event_id) で
-- idempotency を担保するための内部テーブルで、一般ユーザーがアクセスする用途はない。
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- match_content RPC（pgvector 検索）
-- =============================================================================
CREATE OR REPLACE FUNCTION match_content(
  query_embedding VECTOR(768),
  match_language TEXT,
  match_threshold FLOAT DEFAULT 0.3,
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  source_type TEXT,
  source_id UUID,
  chunk_text TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.source_type,
    ce.source_id,
    ce.chunk_text,
    1 - (ce.embedding <=> query_embedding) AS similarity
  FROM content_embeddings ce
  WHERE ce.language = match_language
    AND 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- =============================================================================
-- 完了
-- =============================================================================
