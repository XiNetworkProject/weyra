export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  // Supabase is a retired prototype adapter. Weyra's target data platform is its
  // own PostgreSQL/auth/media stack, so legacy credentials must never activate it.
  return null;
}

export function isSupabaseConfigured() {
  return false;
}
