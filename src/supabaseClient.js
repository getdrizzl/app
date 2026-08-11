import { createClient } from '@supabase/supabase-js'

// Replace these with your actual Supabase project credentials
export const SUPABASE_URL = 'https://suwlhlcgkmrwhcaxdkee.supabase.co/'
export const SUPABASE_ANON_KEY = 'sb_publishable_t4t58TIWxDKKt025M2QM6g_PwwZjxBD'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)