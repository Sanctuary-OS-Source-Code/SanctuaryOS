-- ============================================================================
-- SANCTUARY OS: CORE HUB DATABASE SCHEMA (V0.5.7)
-- ============================================================================
-- This schema defines the central Sanctuary OS Hub database ("Keepers Core").
-- It governs global Citizen authentication, Master Game Schemas, Chameleon
-- Themes, Global Lexicons, Core Heuristics, Keeper Support, and Spoke Uplinks.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. CLEANUP (IDEMPOTENT RESET)
-- ============================================================================
DROP TABLE IF EXISTS dispatch_poll_votes CASCADE;
DROP TABLE IF EXISTS system_broadcasts CASCADE;
DROP TABLE IF EXISTS keeper_dispatch_poll_votes CASCADE;
DROP TABLE IF EXISTS keeper_system_broadcasts CASCADE;
DROP TABLE IF EXISTS keeper_heuristic_signatures CASCADE;
DROP TABLE IF EXISTS keeper_tickets CASCADE;
DROP TABLE IF EXISTS keeper_support_categories CASCADE;
DROP TABLE IF EXISTS sanctuary_theme_images CASCADE;
DROP TABLE IF EXISTS sanctuary_themes CASCADE;
DROP TABLE IF EXISTS sanctuary_lexicons CASCADE;
DROP TABLE IF EXISTS sanctuary_schemas CASCADE;
DROP TABLE IF EXISTS sanctuary_games CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS hardware_bans CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ============================================================================
-- 2. CORE IDENTITY & SPOKE REGISTRY TABLES
-- ============================================================================

-- Global OS Profiles (Single Sign-On Source of Truth)
-- Note: Spoke-level roles (Wayfinder, Oversight, Architect, Mason) live in each
-- Spoke database's `profiles` table. Only `citizen` and `keeper` live here.
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    email TEXT,
    role TEXT DEFAULT 'citizen',
    is_banned BOOLEAN DEFAULT false,
    blacklist_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Master Game Schemas (Engine configurations for supported games)
CREATE TABLE sanctuary_schemas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    schema_data JSONB NOT NULL,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Master Lexicons (Standard English, Sanctuary Cyberpunk, Sims Friendly)
CREATE TABLE sanctuary_lexicons (
    id TEXT PRIMARY KEY,
    name TEXT,
    badge TEXT,
    version INTEGER DEFAULT 1,
    lexicon_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Master Chameleon Themes
CREATE TABLE sanctuary_themes (
    id TEXT PRIMARY KEY,
    name TEXT,
    version INTEGER DEFAULT 1,
    theme_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cloud Theme Background & Asset Images
CREATE TABLE sanctuary_theme_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    theme_id TEXT REFERENCES sanctuary_themes(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_data TEXT NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Registered Community Spoke Databases (Active Workspaces)
CREATE TABLE sanctuary_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    schema_id TEXT NOT NULL,
    supabase_url TEXT NOT NULL,
    supabase_anon_key TEXT NOT NULL,
    supabase_service_key TEXT,
    icon TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 3. GLOBAL SECURITY, CORE HEURISTICS & IMMUTABLE AUDIT TRAIL
-- ============================================================================

CREATE TABLE hardware_bans (
    hwid_hash TEXT PRIMARY KEY,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE keeper_heuristic_signatures (
    id TEXT PRIMARY KEY,
    signature TEXT NOT NULL,
    match_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'malware',
    source TEXT NOT NULL DEFAULT 'keepers_core',
    enabled BOOLEAN DEFAULT true,
    created_by TEXT DEFAULT 'Keepers Core',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT,
    target_table TEXT,
    target_name TEXT,
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reason TEXT,
    game_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 4. KEEPERS CORE SUPPORT, DISPATCHES, POLLS & WEB DIRECTIVES
-- ============================================================================

CREATE TABLE keeper_support_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_code TEXT NOT NULL UNIQUE,
    category_name TEXT NOT NULL,
    description TEXT,
    ticket_destination TEXT DEFAULT 'keepers',
    escalation_path TEXT DEFAULT 'standard',
    is_active BOOLEAN DEFAULT true,
    custom_fields JSONB DEFAULT '[]'::jsonb,
    requires_target_mod BOOLEAN DEFAULT false,
    requires_target_user BOOLEAN DEFAULT false,
    show_title_box BOOLEAN DEFAULT true,
    show_description_box BOOLEAN DEFAULT true,
    show_logs_box BOOLEAN DEFAULT false,
    attach_blueprints BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE keeper_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ticket_type TEXT,
    title TEXT,
    description TEXT,
    status TEXT DEFAULT 'NEW',
    target_mod_id UUID,
    target_blueprint_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Internal Network Dispatches & Alerts (Keepers -> Wayfinders / Oversight / Masons / Citizens)
CREATE TABLE keeper_system_broadcasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    message TEXT NOT NULL,
    category TEXT DEFAULT 'Information',
    target_audience TEXT DEFAULT 'All',
    action_required TEXT DEFAULT 'No Action Required',
    poll_data JSONB,
    code_snippet TEXT,
    is_pinned TEXT DEFAULT 'false',
    is_active BOOLEAN DEFAULT true,
    author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE keeper_dispatch_poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES keeper_system_broadcasts(id) ON DELETE CASCADE,
    poll_id TEXT NOT NULL DEFAULT 'default',
    option_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (broadcast_id, user_id, option_id)
);

-- Public Web Portal Broadcasts (System Directives, Website News, Legal Covenants)
CREATE TABLE system_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    title TEXT,
    description TEXT,
    message TEXT,
    category TEXT DEFAULT 'Information',
    is_active BOOLEAN DEFAULT true,
    target_audience TEXT DEFAULT 'All',
    action_required TEXT DEFAULT 'No Action Required',
    poll_data JSONB,
    code_snippet TEXT,
    is_pinned TEXT
);

CREATE TABLE dispatch_poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id UUID NOT NULL REFERENCES system_broadcasts(id) ON DELETE CASCADE,
    poll_id TEXT NOT NULL DEFAULT 'default',
    option_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (broadcast_id, user_id, option_id)
);

-- ============================================================================
-- 5. TRIGGERS & AUTH AUTOMATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'username',
    new.email,
    'citizen'
  );
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE OR REPLACE FUNCTION prevent_audit_modifications()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are append-only. Modification or deletion is strictly forbidden.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_os_audit_log_immutability
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modifications();

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanctuary_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanctuary_lexicons ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanctuary_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanctuary_theme_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanctuary_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE keeper_heuristic_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE keeper_support_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE keeper_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE keeper_system_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE keeper_dispatch_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_poll_votes ENABLE ROW LEVEL SECURITY;

-- Public Read Policies
CREATE POLICY "Allow public read profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Allow public read schemas" ON sanctuary_schemas FOR SELECT USING (true);
CREATE POLICY "Allow public read lexicons" ON sanctuary_lexicons FOR SELECT USING (true);
CREATE POLICY "Allow public read themes" ON sanctuary_themes FOR SELECT USING (true);
CREATE POLICY "Allow public read theme images" ON sanctuary_theme_images FOR SELECT USING (true);
CREATE POLICY "Allow public read games" ON sanctuary_games FOR SELECT USING (true);
CREATE POLICY "Allow public select on hardware_bans" ON hardware_bans FOR SELECT USING (true);
CREATE POLICY "Public can view core heuristic signatures" ON keeper_heuristic_signatures FOR SELECT USING (true);
CREATE POLICY "Allow public read audit logs" ON audit_logs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Public can view support categories" ON keeper_support_categories FOR SELECT USING (true);
CREATE POLICY "Public can view keeper broadcasts" ON keeper_system_broadcasts FOR SELECT USING (true);
CREATE POLICY "Public can view keeper dispatch poll votes" ON keeper_dispatch_poll_votes FOR SELECT USING (true);
CREATE POLICY "Public can view system broadcasts" ON system_broadcasts FOR SELECT USING (true);
CREATE POLICY "Public can view dispatch poll votes" ON dispatch_poll_votes FOR SELECT USING (true);

-- Write & Management Policies
CREATE POLICY "Allow user to update own profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Allow keepers to update any profile" ON profiles FOR UPDATE USING ((SELECT p.role FROM profiles p WHERE p.id = auth.uid()) = 'keeper');

CREATE POLICY "Allow authenticated insert/update schemas" ON sanctuary_schemas FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated insert/update lexicons" ON sanctuary_lexicons FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated insert/update themes" ON sanctuary_themes FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow all access theme images" ON sanctuary_theme_images FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Keepers can manage games" ON sanctuary_games FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'keeper'));
CREATE POLICY "Allow authenticated insert on hardware_bans" ON hardware_bans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Keepers can manage core heuristic signatures" ON keeper_heuristic_signatures FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('keeper', 'admin')));
CREATE POLICY "Allow public insert audit logs" ON audit_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Keepers can manage support categories" ON keeper_support_categories FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'keeper'));
CREATE POLICY "Users can view their own tickets" ON keeper_tickets FOR SELECT USING (auth.uid() = author_id);
CREATE POLICY "Users can create tickets" ON keeper_tickets FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users can update their own tickets" ON keeper_tickets FOR UPDATE USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Keepers can view all tickets" ON keeper_tickets FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'keeper'));
CREATE POLICY "Keepers can update all tickets" ON keeper_tickets FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'keeper'));

CREATE POLICY "Authenticated users can manage keeper broadcasts" ON keeper_system_broadcasts FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage keeper dispatch poll votes" ON keeper_dispatch_poll_votes FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage system broadcasts" ON system_broadcasts FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage dispatch poll votes" ON dispatch_poll_votes FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

SELECT 'Sanctuary OS Core Hub Schema V0.5.7 Initialized Successfully' AS status;
