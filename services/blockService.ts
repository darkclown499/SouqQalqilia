import { getSupabaseClient } from '@/template';

// ── Simple module-level pub/sub for block list changes ────────────────────────
// Allows any screen (e.g. index.tsx) to re-fetch blockedIds when a block/unblock
// occurs in another screen (e.g. profile.tsx) without needing a shared Context.
type BlockChangeListener = () => void;
const _blockListeners: Set<BlockChangeListener> = new Set();

/** Subscribe to block list changes. Returns an unsubscribe function. */
export function subscribeToBlockChanges(listener: BlockChangeListener): () => void {
  _blockListeners.add(listener);
  return () => _blockListeners.delete(listener);
}

function notifyBlockChange() {
  _blockListeners.forEach(fn => fn());
}

/** Block a user — their content disappears from feed immediately (client-side filter) */
export async function blockUser(blockedId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  if (user.id === blockedId) return { error: 'Cannot block yourself' };

  const { error } = await supabase
    .from('blocked_users')
    .upsert({ blocker_id: user.id, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });

  if (!error) notifyBlockChange();
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

  if (!error) notifyBlockChange();
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
