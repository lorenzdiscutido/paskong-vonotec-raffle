import { SupabaseClient, createClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null | undefined;

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(
    typeof url === 'string' &&
      url.startsWith('http') &&
      typeof key === 'string' &&
      key.trim().length > 10
  );
}

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;
  if (!isSupabaseConfigured()) {
    cachedClient = null;
    return null;
  }
  cachedClient = createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string
  );
  return cachedClient;
}
