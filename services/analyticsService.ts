import { getSupabaseClient } from '@/template';

export async function trackEvent(eventName: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('app_statistics').insert({ event_name: eventName });
  } catch { /* non-critical, never block the user */ }
}
