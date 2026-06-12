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
  buyer?: { username: string; email: string; avatar_url?: string | null };
  seller?: { username: string; email: string; avatar_url?: string | null };
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
      ads(title, status, user_id, ad_images(url, position)),
      buyer:user_profiles!conversations_buyer_id_fkey(username, email, avatar_url),
      seller:user_profiles!conversations_seller_id_fkey(username, email, avatar_url)
    `)
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order('last_message_at', { ascending: false });

  if (error) return { data: [], error: error.message };

  // Batch unread count: one query for all conversations (avoids N+1 queries)
  const convIds = (data as any[]).map((c) => c.id);
  let unreadMap: Record<string, number> = {};
  if (convIds.length > 0) {
    const { data: unreadRows } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', convIds)
      .is('read_at', null)
      .neq('sender_id', user.id);
    (unreadRows ?? []).forEach((row: any) => {
      unreadMap[row.conversation_id] = (unreadMap[row.conversation_id] ?? 0) + 1;
    });
  }
  const enriched = (data as any[]).map((conv) => ({
    ...conv,
    unread_count: unreadMap[conv.id] ?? 0,
  }));

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
      ads(title, status, user_id, ad_images(url, position)),
      buyer:user_profiles!conversations_buyer_id_fkey(username, email, avatar_url),
      seller:user_profiles!conversations_seller_id_fkey(username, email, avatar_url)
    `)
    .eq('id', id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as Conversation, error: null };
}

/** Full message fetch — used for initial load and pull-to-refresh */
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

/**
 * INCREMENTAL fetch — fetches only messages newer than `since` timestamp.
 * Also reads the other party's typing_at field in the same request.
 * This eliminates re-sending the full message history on every poll tick.
 *
 * @param since         ISO timestamp of the last known message
 * @param isBuyer       Role of the current user (determines which typing field to read)
 * @returns             New messages + the other party's typing timestamp
 */
export async function fetchMessagesSince(
  conversationId: string,
  since: string,
  isBuyer: boolean | null,
): Promise<{ data: Message[]; typing: string | null; error: string | null }> {
  const supabase = getSupabaseClient();

  // Run both queries in parallel: new messages + typing status
  const [msgsResult, convResult] = await Promise.all([
    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .gt('created_at', since)          // ← only messages strictly newer
      .order('created_at', { ascending: true }),
    // Only fetch typing field when we know the role
    isBuyer !== null
      ? supabase
          .from('conversations')
          .select('buyer_typing_at, seller_typing_at')
          .eq('id', conversationId)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (msgsResult.error) return { data: [], typing: null, error: msgsResult.error.message };

  // Determine which typing field belongs to the OTHER party
  let typing: string | null = null;
  if (isBuyer !== null && convResult.data) {
    typing = isBuyer
      ? (convResult.data as any).seller_typing_at ?? null
      : (convResult.data as any).buyer_typing_at ?? null;
  }

  return { data: msgsResult.data as Message[], typing, error: null };
}

/**
 * Record that the current user is actively viewing this conversation.
 * The push-notify edge function reads this to decide whether to send a push
 * notification (skips it if the recipient polled within the last 10 seconds).
 */
export async function updateLastPolled(
  conversationId: string,
  isBuyer: boolean | null,
): Promise<void> {
  if (isBuyer === null) return;
  const supabase = getSupabaseClient();
  const col = isBuyer ? 'buyer_last_polled_at' : 'seller_last_polled_at';
  await supabase
    .from('conversations')
    .update({ [col]: new Date().toISOString() })
    .eq('id', conversationId);
}

export async function sendMessage(
  conversationId: string,
  content: string
): Promise<{ data: Message | null; recipientId: string | null; isBuyerSending: boolean; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, recipientId: null, isBuyerSending: false, error: 'Not authenticated' };

  // Insert message
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: user.id, content })
    .select()
    .single();

  if (error) return { data: null, recipientId: null, isBuyerSending: false, error: error.message };

  // Update conversation last_message (parallel with recipient lookup)
  const [, convResult] = await Promise.all([
    supabase
      .from('conversations')
      .update({ last_message: content, last_message_at: new Date().toISOString() })
      .eq('id', conversationId),
    supabase
      .from('conversations')
      .select('buyer_id, seller_id')
      .eq('id', conversationId)
      .single(),
  ]);

  const conv = convResult.data;
  const recipientId = conv
    ? (conv.buyer_id === user.id ? conv.seller_id : conv.buyer_id)
    : null;
  const isBuyerSending = conv?.buyer_id === user.id;

  return { data: data as Message, recipientId, isBuyerSending, error: null };
}

/**
 * Send a push notification to the message recipient via the push-notify edge function.
 * Passes `is_buyer_recipient` so the edge function can check the correct polling column.
 * Fire-and-forget — never throws.
 */
export async function notifyRecipient(
  recipientId: string,
  senderName: string,
  messageContent: string,
  conversationId?: string,
  /** true = recipient is the buyer (seller just sent), false = recipient is the seller */
  isBuyerRecipient?: boolean,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    supabase.functions.invoke('push-notify', {
      body: {
        recipient_id: recipientId,
        sender_name: senderName,
        message_preview: messageContent.substring(0, 100),
        conversation_id: conversationId,
        is_buyer_recipient: isBuyerRecipient,
      },
    }).catch(() => {});
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

  // Reset app icon badge — fire-and-forget
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
