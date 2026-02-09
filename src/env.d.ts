/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_WORKSPACE_ID?: string;
  readonly VITE_SUPABASE_STORAGE_BUCKET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
