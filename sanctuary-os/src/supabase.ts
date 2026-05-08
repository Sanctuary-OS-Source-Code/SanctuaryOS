import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://chphhvpcgcpnyvshsudh.supabase.co";

const supabaseAnonKey = "sb_publishable_EdCfD4meHLUUgoTRkfwsTA_PFXnZx8D";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
