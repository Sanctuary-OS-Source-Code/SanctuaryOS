import { createClient } from "@supabase/supabase-js";

// The Bridge coordinates
const supabaseUrl = "https://chphhvpcgcpnyvshsudh.supabase.co";
// The Public access key
const supabaseAnonKey = "sb_publishable_EdCfD4meHLUUgoTRkfwsTA_PFXnZx8D";

// Export the active connection to be used anywhere in the OS
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
