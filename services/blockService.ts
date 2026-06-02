import { getSupabaseClient } from '@/template';

/** Block a user — their content disappears from feed immediately (client-side filter) */
export async function blockUser(blockedId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  if (user.id === blockedId) return { error: 'Cannot block yourself' };

  const { error } = await supabase
    .from('blocked_users')
    .upsert({ blocker_id: user.id, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });

  return { error: error ? error.message : null };
}

/** Unblock a user */
export async function unblockUser(blockedId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId);

  return { error: error ? error.message : null };
}

/** Fetch all user IDs that the current user has blocked */
export async function fetchBlockedIds(): Promise<string[]> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', user.id);

  return (data ?? []).map((row: any) => row.blocked_id as string);
}

/** Check if a specific user is blocked */
export async function isUserBlocked(blockedId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('blocked_users')
    .select('id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedId)
    .maybeSingle();

  return !!data;
}
