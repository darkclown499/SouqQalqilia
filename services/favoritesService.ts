import { getSupabaseClient } from '@/template';
import { Ad } from './adsService';

export interface Favorite {
  id: string;
  user_id: string;
  ad_id: string;
  created_at: string;
}

export async function fetchMyFavoriteIds(): Promise<{ data: string[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: null };

  const { data, error } = await supabase
    .from('favorites')
    .select('ad_id')
    .eq('user_id', user.id);

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((f: any) => f.ad_id), error: null };
}

export async function fetchMyFavoriteAds(): Promise<{ data: Ad[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('favorites')
    .select(`
      ad_id,
      ads(*, categories(id, name, icon, color), ad_images(id, url, position))
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: error.message };
  const ads = (data ?? []).map((f: any) => f.ads).filter(Boolean) as Ad[];
  return { data: ads, error: null };
}

export async function addFavorite(adId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('favorites')
    .insert({ user_id: user.id, ad_id: adId });

  if (!error) {
    // Fire-and-forget: notify ad owner that their listing was liked
    try {
      const { data: adRow } = await supabase
        .from('ads')
        .select('user_id, title')
        .eq('id', adId)
        .single();
      const ownerId: string | undefined = adRow?.user_id;
      const adTitle: string = adRow?.title ?? '';
      if (ownerId && ownerId !== user.id) {
        const senderName = user.user_metadata?.username ?? user.email?.split('@')[0] ?? 'مستخدم';
        supabase.functions.invoke('push-notify', {
          body: {
            recipient_id: ownerId,
            sender_name: senderName,
            message_preview: `❤️ "أعجبه " ${adTitle}`,
          },
        }).catch(() => {});
      }
    } catch { /* non-critical, never block */ }
  }

  return { error: error ? error.message : null };
}

export async function removeFavorite(adId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('ad_id', adId);
  return { error: error ? error.message : null };
}

export async function toggleFavorite(
  adId: string,
  isFavorited: boolean
): Promise<{ error: string | null }> {
  return isFavorited ? removeFavorite(adId) : addFavorite(adId);
}
