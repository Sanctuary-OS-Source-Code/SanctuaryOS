-- Enable the UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. IDENTITIES & ROLES
-- ==========================================
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY, 
    username TEXT, 
    role TEXT DEFAULT 'citizen'
);

-- Auto-create profile trigger on Supabase Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role) 
  VALUES (new.id, new.raw_user_meta_data->>'username', 'citizen');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created 
  AFTER INSERT ON auth.users 
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user(); 

-- ==========================================
-- 2. WORKSPACE / MULTI-DATABASE ROUTING
-- ==========================================
CREATE TABLE sanctuary_games (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    schema_id TEXT UNIQUE NOT NULL,
    supabase_url TEXT,
    supabase_anon_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 3. GLOBAL ASSETS & CONFIGURATIONS
-- ==========================================
CREATE TABLE sanctuary_themes (
    id TEXT PRIMARY KEY,
    theme_data JSONB,
    version INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sanctuary_lexicons (
    id TEXT PRIMARY KEY,
    name TEXT,
    badge TEXT,
    version INTEGER,
    lexicon_data JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sanctuary_schemas (
    id TEXT PRIMARY KEY,
    schema_data JSONB,
    version INTEGER,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 4. OVERSIGHT & LOGGING
-- ==========================================
CREATE TABLE audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    action TEXT NOT NULL,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    target_table TEXT NOT NULL,
    target_name TEXT,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- AUDIT LOG SECURITY TRIGGERS
-- ==========================================
CREATE OR REPLACE FUNCTION prevent_audit_modifications()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are append-only. Modification or deletion is strictly forbidden.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_audit_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modifications();

CREATE TRIGGER trg_prevent_audit_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modifications();

CREATE TABLE keeper_system_broadcasts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    message TEXT NOT NULL,
    category TEXT NOT NULL,
    code_snippet TEXT,
    is_active BOOLEAN DEFAULT true,
    is_pinned TEXT,
    target_audience TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE keeper_tickets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    ticket_type TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 5. KEEPERS INFRASTRUCTURE
-- ==========================================
CREATE TABLE keeper_support_categories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    category_code TEXT NOT NULL,
    category_name TEXT NOT NULL,
    description TEXT,
    ticket_destination TEXT,
    escalation_path TEXT,
    is_active BOOLEAN DEFAULT true,
    custom_fields JSONB DEFAULT '[]',
    requires_target_mod BOOLEAN DEFAULT false,
    requires_target_user BOOLEAN DEFAULT false,
    show_title_box BOOLEAN DEFAULT true,
    show_description_box BOOLEAN DEFAULT true,
    show_logs_box BOOLEAN DEFAULT false,
    attach_blueprints BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 6. KEEPERS ROW LEVEL SECURITY POLICIES
-- ==========================================
ALTER TABLE keeper_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create tickets" ON keeper_tickets FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users can view their own tickets" ON keeper_tickets FOR SELECT USING (auth.uid() = author_id);
CREATE POLICY "Users can update their own tickets" ON keeper_tickets FOR UPDATE USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

ALTER TABLE keeper_support_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view support categories" ON keeper_support_categories FOR SELECT USING (true);

ALTER TABLE keeper_system_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view system broadcasts" ON keeper_system_broadcasts FOR SELECT USING (true);
