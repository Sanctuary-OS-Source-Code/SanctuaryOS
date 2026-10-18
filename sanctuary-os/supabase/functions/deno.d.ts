// Ambient type declarations for Supabase Edge Functions (Deno runtime) in VS Code
declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): Record<string, string>;
  }
  export const env: Env;
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, any>,
  ): {
    from: (table: string) => any;
    rpc: (
      fn: string,
      params?: Record<string, any>,
    ) => Promise<{ data: any; error: any }>;
    auth: any;
  };
}

