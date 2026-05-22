import { getSupabaseClient } from '@/template';

export interface Conversation {
  id: string;
  ad_id: string;
  buyer_id: string;
  seller_id: string;
  last_message?: string;
  last_message_at: string;
  created_at: string;
  ads?: { title: string; status?: string; user_id?: string };
  buyer?: { username: string; email: string };
  seller?: { username: string; email: string };
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  read_at?: string | null;
  created_at: string;
}

export async function fetchMyConversations(): Promise<{ data: Conversation[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: [], error: 'Not authenticated' };

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      ads(title, status, user_id),
      buyer:user_profiles!conversations_buyer_id_fkey(username, email, avatar_url),
      seller:user_profiles!conversations_seller_id_fkey(username, email, avatar_url),
      ad_images!inner(url)
    `)
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order('last_message_at', { ascending: false });

  if (error) return { data: [], error: error.message };

  // Attach per-conversation unread count
  const enriched = await Promise.all(
    (data as any[]).map(async (conv) => {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .is('read_at', null)
        .neq('sender_id', user.id);
      return { ...conv, unread_count: count ?? 0 };
    })
  );

  return { data: enriched as Conversation[], error: null };
}

export async function fetchOrCreateConversation(
  adId: string,
  sellerId: string
): Promise<{ data: Conversation | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('ad_id', adId)
    .eq('buyer_id', user.id)
    .single();

  if (existing) return { data: existing as Conversation, error: null };

  const { data, error } = await supabase
    .from('conversations')
    .insert({ ad_id: adId, buyer_id: user.id, seller_id: sellerId })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Conversation, error: null };
}

export async function fetchConversationById(id: string): Promise<{ data: Conversation | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      ads(title, status, user_id),
      buyer:user_profiles!conversations_buyer_id_fkey(username, email, avatar_url),
      seller:user_profiles!conversations_seller_id_fkey(username, email, avatar_url),
      ad_images(url)
    `)
    .eq('id', id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Conversation, error: null };
}

export async function fetchMessages(conversationId: string): Promise<{ data: Message[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: data as Message[], error: null };
}

export async function sendMessage(
  conversationId: string,
  content: string
): Promise<{ data: Message | null; recipientId: string | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, recipientId: null, error: 'Not authenticated' };

  // Insert message
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: user.id, content })
    .select()
    .single();

  if (error) return { data: null, recipientId: null, error: error.message };

  // Update conversation last_message
  await supabase
    .from('conversations')
    .update({ last_message: content, last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  // Determine recipient
  const { data: conv } = await supabase
    .from('conversations')
    .select('buyer_id, seller_id')
    .eq('id', conversationId)
    .single();

  const recipientId = conv
    ? (conv.buyer_id === user.id ? conv.seller_id : conv.buyer_id)
    : null;

  return { data: data as Message, recipientId, error: null };
}

/**
 * Send a push notification to the message recipient via the push-notify edge function.
 * Fire-and-forget — never throws.
 */
export async function notifyRecipient(
  recipientId: string,
  senderName: string,
  messageContent: string,
  conversationId?: string,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    // Non-blocking — don't await the result in the critical path
    supabase.functions.invoke('push-notify', {
      body: {
        recipient_id: recipientId,
        sender_name: senderName,
        message_preview: messageContent.substring(0, 100),
        conversation_id: conversationId,
      },
    }).catch(() => {}); // swallow all errors silently
  } catch (_) {}
}

/** Mark all messages in a conversation as read (for the current user, messages not sent by them) */
export async function markMessagesRead(
  conversationId: string,
  currentUserId: string
): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_id', currentUserId)
    .is('read_at', null);

  // Reset app icon badge to 0 — fire-and-forget
  supabase.functions.invoke('push-notify', {
    body: { action: 'reset_badge', user_id: currentUserId },
  }).catch(() => {});
}

/** Update typing indicator for the current user in a conversation */
export async function updateTypingIndicator(
  conversationId: string,
  isBuyer: boolean,
  isTyping: boolean
): Promise<void> {
  const supabase = getSupabaseClient();
  const col = isBuyer ? 'buyer_typing_at' : 'seller_typing_at';
  const value = isTyping ? new Date().toISOString() : null;
  await supabase
    .from('conversations')
    .update({ [col]: value })
    .eq('id', conversationId);
}

/** Fetch typing status for a conversation */
export async function fetchTypingStatus(
  conversationId: string
): Promise<{ buyer_typing_at: string | null; seller_typing_at: string | null }> {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('conversations')
    .select('buyer_typing_at, seller_typing_at')
    .eq('id', conversationId)
    .single();
  return {
    buyer_typing_at: data?.buyer_typing_at ?? null,
    seller_typing_at: data?.seller_typing_at ?? null,
  };
}

/** Delete a conversation and all its messages (CASCADE handles messages) */
export async function deleteConversation(
  conversationId: string
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId);
  return { error: error ? error.message : null };
}

/** Save or update the Expo push token for the current user */
export async function savePushToken(token: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('user_profiles')
      .update({ push_token: token })
      .eq('id', user.id);
  } catch (_) {}
}
