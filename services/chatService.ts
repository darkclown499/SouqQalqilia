import { getSupabaseClient } from '@/template';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// ── Constants ─────────────────────────────────────────────────────────────────
const OFFLINE_QUEUE_KEY = 'chat_offline_queue_v1';
const MESSAGES_CACHE_PREFIX = 'chat_messages_';
const CONVERSATIONS_CACHE_KEY = 'chat_conversations_cache_v1';
const OFFLINE_QUEUE_MAX = 50;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CONVERSATIONS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Types ─────────────────────────────────────────────────────────────────────
export interface QueuedMessage {
  tempId: string;
  conversationId: string;
  content: string;
  image_url?: string;
  message_type: 'text' | 'image';
  created_at: string;
}

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
  unread_count?: number;
  buyer_name?: string;
  seller_name?: string;
  buyer_avatar?: string | null;
  seller_avatar?: string | null;
  archived_at?: string | null; // ✅ إضافة دعم الأرشفة
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  image_url?: string | null;
  message_type?: 'text' | 'image';
  read_at?: string | null;
  delivered_at?: string | null;
  created_at: string;
  _pending?: boolean;
  _failed?: boolean;
  deleted_by?: string | null; // ✅ إضافة دعم الحذف من طرف واحد
}

export interface LocationMessage {
  latitude: number;
  longitude: number;
  address?: string;
}

// ── Offline message queue ─────────────────────────────────────────────────────
export async function getOfflineQueue(): Promise<QueuedMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveOfflineQueue(queue: QueuedMessage[]): Promise<void> {
  try {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export async function addToOfflineQueue(msg: QueuedMessage): Promise<void> {
  const q = await getOfflineQueue();
  q.push(msg);
  const trimmed = q.length > OFFLINE_QUEUE_MAX ? q.slice(q.length - OFFLINE_QUEUE_MAX) : q;
  await saveOfflineQueue(trimmed);
}

export async function removeFromOfflineQueue(tempId: string): Promise<void> {
  const q = await getOfflineQueue();
  await saveOfflineQueue(q.filter(m => m.tempId !== tempId));
}

// ── Conversation caching ─────────────────────────────────────────────────────
export async function cacheConversations(conversations: Conversation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CONVERSATIONS_CACHE_KEY, JSON.stringify({
      data: conversations,
      timestamp: Date.now(),
    }));
  } catch {}
}

export async function getCachedConversations(): Promise<Conversation[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CONVERSATIONS_CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CONVERSATIONS_CACHE_TTL_MS) {
      await AsyncStorage.removeItem(CONVERSATIONS_CACHE_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

export async function clearConversationsCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CONVERSATIONS_CACHE_KEY);
  } catch {}
}

// ── Message caching ──────────────────────────────────────────────────────────
export async function cacheMessages(conversationId: string, messages: Message[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${MESSAGES_CACHE_PREFIX}${conversationId}`,
      JSON.stringify({ data: messages, timestamp: Date.now() })
    );
  } catch {}
}

export async function getCachedMessages(conversationId: string): Promise<Message[] | null> {
  try {
    const raw = await AsyncStorage.getItem(`${MESSAGES_CACHE_PREFIX}${conversationId}`);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL_MS) {
      await AsyncStorage.removeItem(`${MESSAGES_CACHE_PREFIX}${conversationId}`);
      return null;
    }
    return data;
  } catch { return null; }
}

export async function clearConversationCache(conversationId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${MESSAGES_CACHE_PREFIX}${conversationId}`);
  } catch {}
}

// ── Helper to enrich conversation with names ─────────────────────────────────
function enrichConversation(conv: any): Conversation {
  const buyer = conv.buyer;
  const seller = conv.seller;
  return {
    ...conv,
    buyer_name: buyer?.username || buyer?.email?.split('@')[0] || 'مستخدم',
    seller_name: seller?.username || seller?.email?.split('@')[0] || 'مستخدم',
    buyer_avatar: buyer?.avatar_url || null,
    seller_avatar: seller?.avatar_url || null,
  };
}

// ── Fetch conversations ──────────────────────────────────────────────────────
export async function fetchMyConversations(options?: {
  includeArchived?: boolean;
}): Promise<{ data: Conversation[]; error: string | null }> {
  const { includeArchived = false } = options || {};
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: [], error: 'Not authenticated' };

    let query = supabase
      .from('conversations')
      .select(`
        *,
        ads(title, status, user_id, ad_images(url, position)),
        buyer:user_profiles!conversations_buyer_id_fkey(username, email, avatar_url),
        seller:user_profiles!conversations_seller_id_fkey(username, email, avatar_url)
      `)
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false });

    // ✅ تصفية المحادثات المؤرشفة
    if (!includeArchived) {
      query = (query as any).is('archived_at', null);
    }

    const { data, error } = await query;

    if (error) return { data: [], error: error.message };

    // Batch unread count
    const convIds = (data as any[]).map((c) => c.id);
    let unreadMap: Record<string, number> = {};
    if (convIds.length > 0) {
      const { data: unreadRows } = await supabase
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', convIds)
        .is('read_at', null)
        .neq('sender_id', user.id)
        .is('deleted_by', null); // ✅ تجاهل الرسائل المحذوفة
      (unreadRows ?? []).forEach((row: any) => {
        unreadMap[row.conversation_id] = (unreadMap[row.conversation_id] ?? 0) + 1;
      });
    }

    const enriched = (data as any[]).map((conv) => ({
      ...enrichConversation(conv),
      unread_count: unreadMap[conv.id] ?? 0,
    }));

    // ✅ تخزين مؤقت
    await cacheConversations(enriched);

    return { data: enriched as Conversation[], error: null };
  } catch (e: any) {
    console.error('[fetchMyConversations] Error:', e);
    return { data: [], error: e?.message ?? 'Failed to fetch conversations' };
  }
}

// ── Archive conversation ─────────────────────────────────────────────────────
export async function archiveConversation(conversationId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('conversations')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', conversationId);
    if (error) throw error;
    await clearConversationsCache();
    return { error: null };
  } catch (e: any) {
    console.error('[archiveConversation] Error:', e);
    return { error: e?.message ?? 'Failed to archive conversation' };
  }
}

export async function unarchiveConversation(conversationId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('conversations')
      .update({ archived_at: null })
      .eq('id', conversationId);
    if (error) throw error;
    await clearConversationsCache();
    return { error: null };
  } catch (e: any) {
    console.error('[unarchiveConversation] Error:', e);
    return { error: e?.message ?? 'Failed to unarchive conversation' };
  }
}

// ── Mark all messages as read ───────────────────────────────────────────────
export async function markAllMessagesRead(userId: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    
    // ✅ الحصول على جميع conversation IDs التي يشارك فيها المستخدم
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
    
    if (convError) throw convError;
    if (!conversations || conversations.length === 0) {
      return { error: null }; // لا توجد محادثات
    }
    
    const conversationIds = conversations.map(c => c.id);
    
    // ✅ تحديث جميع الرسائل غير المقروءة في تلك المحادثات
    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .in('conversation_id', conversationIds)
      .neq('sender_id', userId)
      .is('read_at', null)
      .is('deleted_by', null);
    
    if (error) throw error;
    return { error: null };
  } catch (e: any) {
    console.error('[markAllMessagesRead] Error:', e);
    return { error: e?.message ?? 'Failed to mark all as read' };
  }
}

// ── Get unread count ─────────────────────────────────────────────────────────
export async function getUnreadCount(userId: string): Promise<{ count: number; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    
    // ✅ الحصول على جميع conversation IDs
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
    
    if (convError) throw convError;
    if (!conversations || conversations.length === 0) {
      return { count: 0, error: null };
    }
    
    const conversationIds = conversations.map(c => c.id);
    
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .in('conversation_id', conversationIds)
      .neq('sender_id', userId)
      .is('read_at', null)
      .is('deleted_by', null);
    
    if (error) throw error;
    return { count: count ?? 0, error: null };
  } catch (e: any) {
    console.error('[getUnreadCount] Error:', e);
    return { count: 0, error: e?.message ?? 'Failed to get unread count' };
  }
}

// ── Fetch or create conversation ─────────────────────────────────────────────
export async function fetchOrCreateConversation(
  adId: string,
  sellerId: string
): Promise<{ data: Conversation | null; error: string | null }> {
  try {
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
  } catch (e: any) {
    console.error('[fetchOrCreateConversation] Error:', e);
    return { data: null, error: e?.message ?? 'Failed to create conversation' };
  }
}

// ── Fetch conversation by ID ────────────────────────────────────────────────
export async function fetchConversationById(id: string): Promise<{ data: Conversation | null; error: string | null }> {
  try {
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
    return { data: enrichConversation(data) as Conversation, error: null };
  } catch (e: any) {
    console.error('[fetchConversationById] Error:', e);
    return { data: null, error: e?.message ?? 'Failed to fetch conversation' };
  }
}

// ── Get last message ─────────────────────────────────────────────────────────
export async function getLastMessage(conversationId: string): Promise<{ data: Message | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .is('deleted_by', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return { data: data?.[0] ?? null, error: null };
  } catch (e: any) {
    console.error('[getLastMessage] Error:', e);
    return { data: null, error: e?.message ?? 'Failed to get last message' };
  }
}

// ── Mark messages as delivered ──────────────────────────────────────────────
export async function markMessagesDelivered(
  conversationId: string,
  currentUserId: string,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase
      .from('messages')
      .update({ delivered_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', currentUserId)
      .is('delivered_at', null)
      .is('deleted_by', null);
  } catch { /* fire-and-forget */ }
}

// ── Fetch messages ──────────────────────────────────────────────────────────
export async function fetchMessages(conversationId: string): Promise<{ data: Message[]; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .is('deleted_by', null)
      .order('created_at', { ascending: true });

    if (error) return { data: [], error: error.message };

    // ✅ تخزين مؤقت
    await cacheMessages(conversationId, data as Message[]);
    return { data: data as Message[], error: null };
  } catch (e: any) {
    console.error('[fetchMessages] Error:', e);
    return { data: [], error: e?.message ?? 'Network error' };
  }
}

// ── Fetch messages since ─────────────────────────────────────────────────────
export async function fetchMessagesSince(
  conversationId: string,
  since: string,
  isBuyer: boolean | null,
  currentUserId?: string,
): Promise<{ data: Message[]; typing: string | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();

    const [msgsResult, convResult] = await Promise.all([
      supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .gt('created_at', since)
        .is('deleted_by', null)
        .order('created_at', { ascending: true }),
      isBuyer !== null
        ? supabase
            .from('conversations')
            .select('buyer_typing_at, seller_typing_at')
            .eq('id', conversationId)
            .single()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (msgsResult.error) return { data: [], typing: null, error: msgsResult.error.message };

    if (currentUserId && msgsResult.data && msgsResult.data.length > 0) {
      const undelivered = msgsResult.data.filter(
        (m: any) => m.sender_id !== currentUserId && !m.delivered_at
      );
      if (undelivered.length > 0) {
        markMessagesDelivered(conversationId, currentUserId).catch(() => {});
      }
    }

    let typing: string | null = null;
    if (!convResult.error && isBuyer !== null && convResult.data) {
      typing = isBuyer
        ? (convResult.data as any).seller_typing_at ?? null
        : (convResult.data as any).buyer_typing_at ?? null;
    }

    return { data: msgsResult.data as Message[], typing, error: null };
  } catch (e: any) {
    console.error('[fetchMessagesSince] Error:', e);
    return { data: [], typing: null, error: e?.message ?? 'Network error' };
  }
}

// ── Update last polled ──────────────────────────────────────────────────────
export async function updateLastPolled(
  conversationId: string,
  isBuyer: boolean | null,
): Promise<void> {
  if (isBuyer === null) return;
  try {
    const supabase = getSupabaseClient();
    const col = isBuyer ? 'buyer_last_polled_at' : 'seller_last_polled_at';
    await supabase
      .from('conversations')
      .update({ [col]: new Date().toISOString() })
      .eq('id', conversationId);
  } catch { /* fire-and-forget */ }
}

// ── Upload chat image ───────────────────────────────────────────────────────
export async function uploadChatImage(
  fileUri: string,
  fileName: string,
): Promise<{ url: string | null; error: string | null }> {
  const supabase = getSupabaseClient();
  let storagePath: string | null = null;
  let uploadAttempted = false;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { url: null, error: 'Not authenticated' };

    const ext = fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mimeType =
      ext === 'png' ? 'image/png' :
      ext === 'pdf' ? 'application/pdf' :
      ext === 'mp4' ? 'video/mp4' :
      ext === 'mov' ? 'video/quicktime' :
      ext === 'm4a' || ext === 'mp3' || ext === 'aac' ? 'audio/mp4' : 'image/jpeg';

    storagePath = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const response = await fetch(fileUri);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }
    const uploadData = await response.arrayBuffer();

    uploadAttempted = true;
    const { error: uploadError } = await supabase.storage
      .from('chat-images')
      .upload(storagePath, uploadData, { contentType: mimeType, upsert: false });

    if (uploadError) {
      supabase.storage.from('chat-images').remove([storagePath]).catch(() => {});
      return { url: null, error: uploadError.message };
    }

    const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(storagePath);
    return { url: urlData.publicUrl, error: null };
  } catch (e: any) {
    if (uploadAttempted && storagePath) {
      supabase.storage.from('chat-images').remove([storagePath]).catch(() => {});
    }
    console.error('[uploadChatImage] Error:', e);
    return { url: null, error: e?.message ?? 'Upload failed' };
  }
}

// ── UUID generator ──────────────────────────────────────────────────────────
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ── Send message ─────────────────────────────────────────────────────────────
export async function sendMessage(
  conversationId: string,
  content: string,
  imageUrl?: string,
  clientMessageId?: string,
): Promise<{ data: Message | null; recipientId: string | null; isBuyerSending: boolean; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, recipientId: null, isBuyerSending: false, error: 'Not authenticated' };

    const messageType = imageUrl ? 'image' : 'text';
    const messageContent = imageUrl ? (content || '📷 صورة') : content;
    const messageId = clientMessageId ?? generateUUID();

    const { data, error } = await supabase
      .from('messages')
      .upsert({
        id: messageId,
        conversation_id: conversationId,
        sender_id: user.id,
        content: messageContent,
        image_url: imageUrl ?? null,
        message_type: messageType,
      }, { onConflict: 'id', ignoreDuplicates: false })
      .select()
      .single();

    if (error) return { data: null, recipientId: null, isBuyerSending: false, error: error.message };

    const lastMsgContent = imageUrl ? (content || '📷 صورة') : content;
    const [, convResult] = await Promise.all([
      supabase
        .from('conversations')
        .update({ last_message: lastMsgContent, last_message_at: new Date().toISOString() })
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
  } catch (e: any) {
    console.error('[sendMessage] Error:', e);
    return { data: null, recipientId: null, isBuyerSending: false, error: e?.message ?? 'Failed to send message' };
  }
}

// ── Notify recipient ────────────────────────────────────────────────────────
export async function notifyRecipient(
  recipientId: string,
  senderName: string,
  messageContent: string,
  conversationId?: string,
  isBuyerRecipient?: boolean,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.functions.invoke('push-notify', {
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

// ── Mark messages as read ───────────────────────────────────────────────────
export async function markMessagesRead(
  conversationId: string,
  currentUserId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', currentUserId)
      .is('read_at', null)
      .is('deleted_by', null); // ✅ التأكد من عدم قراءة الرسائل المحذوفة

    if (error) {
      console.warn('[markMessagesRead] DB error:', error.message);
      throw new Error(error.message);
    }
    return { error: null };
  } catch (e: any) {
    console.error('[markMessagesRead] Error:', e);
    return { error: e?.message ?? 'Failed to mark messages as read' };
  }
}

// ── Update typing indicator ─────────────────────────────────────────────────
export async function updateTypingIndicator(
  conversationId: string,
  isBuyer: boolean,
  isTyping: boolean
): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const col = isBuyer ? 'buyer_typing_at' : 'seller_typing_at';
    const value = isTyping ? new Date().toISOString() : null;
    const { error } = await supabase
      .from('conversations')
      .update({ [col]: value })
      .eq('id', conversationId);
    if (error) throw error;
    return { error: null };
  } catch (e: any) {
    console.error('[updateTypingIndicator] Error:', e);
    return { error: e?.message ?? 'Failed to update typing indicator' };
  }
}

// ── Fetch typing status ─────────────────────────────────────────────────────
export async function fetchTypingStatus(
  conversationId: string
): Promise<{ buyer_typing_at: string | null; seller_typing_at: string | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('conversations')
      .select('buyer_typing_at, seller_typing_at')
      .eq('id', conversationId)
      .single();
    if (error) throw error;
    return {
      buyer_typing_at: data?.buyer_typing_at ?? null,
      seller_typing_at: data?.seller_typing_at ?? null,
      error: null,
    };
  } catch (e: any) {
    console.error('[fetchTypingStatus] Error:', e);
    return { buyer_typing_at: null, seller_typing_at: null, error: e?.message ?? 'Failed to fetch typing status' };
  }
}

// ── Delete conversation ─────────────────────────────────────────────────────
export async function deleteConversation(
  conversationId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);
    if (error) throw error;
    await clearConversationsCache();
    return { error: null };
  } catch (e: any) {
    console.error('[deleteConversation] Error:', e);
    return { error: e?.message ?? 'Failed to delete conversation' };
  }
}

// ── Delete message for everyone ─────────────────────────────────────────────
export async function deleteMessageForEveryone(
  messageId: string,
  conversationId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    // ✅ حذف نهائي للرسالة (من جميع الأطراف)
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('conversation_id', conversationId);
    if (error) throw error;
    // ✅ تحديث last_message في المحادثة
    const lastMsg = await getLastMessage(conversationId);
    if (lastMsg.data) {
      await supabase
        .from('conversations')
        .update({
          last_message: lastMsg.data.content,
          last_message_at: lastMsg.data.created_at,
        })
        .eq('id', conversationId);
    } else {
      await supabase
        .from('conversations')
        .update({ last_message: null, last_message_at: null })
        .eq('id', conversationId);
    }
    return { error: null };
  } catch (e: any) {
    console.error('[deleteMessageForEveryone] Error:', e);
    return { error: e?.message ?? 'Failed to delete message' };
  }
}

// ── Delete message for user (soft delete) ──────────────────────────────────
export async function deleteMessageForUser(
  messageId: string,
  userId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('messages')
      .update({ deleted_by: userId })
      .eq('id', messageId);
    if (error) throw error;
    return { error: null };
  } catch (e: any) {
    console.error('[deleteMessageForUser] Error:', e);
    return { error: e?.message ?? 'Failed to delete message' };
  }
}

// ── Forward message ─────────────────────────────────────────────────────────
export async function forwardMessage(
  messageId: string,
  targetConversationId: string
): Promise<{ data: Message | null; error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: 'Not authenticated' };

    // جلب الرسالة الأصلية
    const { data: original, error: fetchError } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (fetchError || !original) {
      return { data: null, error: fetchError?.message ?? 'Message not found' };
    }

    // إنشاء رسالة جديدة في المحادثة المستهدفة
    const newId = generateUUID();
    const { data: newMessage, error: insertError } = await supabase
      .from('messages')
      .insert({
        id: newId,
        conversation_id: targetConversationId,
        sender_id: user.id,
        content: original.content,
        image_url: original.image_url,
        message_type: original.message_type,
      })
      .select()
      .single();

    if (insertError) return { data: null, error: insertError.message };

    // تحديث last_message في المحادثة المستهدفة
    await supabase
      .from('conversations')
      .update({
        last_message: original.content || '📷 صورة',
        last_message_at: new Date().toISOString(),
      })
      .eq('id', targetConversationId);

    return { data: newMessage as Message, error: null };
  } catch (e: any) {
    console.error('[forwardMessage] Error:', e);
    return { data: null, error: e?.message ?? 'Failed to forward message' };
  }
}

// ── Track chat event ────────────────────────────────────────────────────────
export async function trackChatEvent(event: string, data?: any): Promise<void> {
  // No-op: analytics_events table does not exist. Events are tracked via app_statistics.
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('app_statistics').insert({
      event_name: event,
      user_id: user?.id ?? null,
      metadata: data ?? null,
    }).catch(() => {});
  } catch {}
}

// ── Send location message ───────────────────────────────────────────────────
export async function sendLocation(
  conversationId: string,
  location: { latitude: number; longitude: number; address?: string }
): Promise<{ data: Message | null; error: string | null }> {
  try {
    const content = JSON.stringify({
      type: 'location',
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address || '',
    });
    return await sendMessage(conversationId, content);
  } catch (e: any) {
    console.error('[sendLocation] Error:', e);
    return { data: null, error: e?.message ?? 'Failed to send location' };
  }
}

// ── Save push token ─────────────────────────────────────────────────────────
export async function savePushToken(token: string): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const { error } = await supabase
      .from('user_profiles')
      .update({ push_token: token })
      .eq('id', user.id);
    if (error) throw error;
    return { error: null };
  } catch (e: any) {
    console.error('[savePushToken] Error:', e);
    return { error: e?.message ?? 'Failed to save push token' };
  }
}

// ── Get online status ───────────────────────────────────────────────────────
export async function checkUserOnline(userId: string): Promise<{ isOnline: boolean; lastSeen: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_profiles')
      .select('last_seen_at, is_online')
      .eq('id', userId)
      .single();
    if (error) throw error;
    const isOnline = data?.is_online === true;
    const lastSeen = data?.last_seen_at ?? null;
    return { isOnline, lastSeen };
  } catch (e: any) {
    console.error('[checkUserOnline] Error:', e);
    return { isOnline: false, lastSeen: null };
  }
}

// ── Update online status ────────────────────────────────────────────────────
export async function updateOnlineStatus(isOnline: boolean): Promise<{ error: string | null }> {
  try {
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated' };
    const { error } = await supabase
      .from('user_profiles')
      .update({
        is_online: isOnline,
        last_seen_at: isOnline ? null : new Date().toISOString(),
      })
      .eq('id', user.id);
    if (error) throw error;
    return { error: null };
  } catch (e: any) {
    console.error('[updateOnlineStatus] Error:', e);
    return { error: e?.message ?? 'Failed to update online status' };
  }
}

// ── Typing status with debounce helper ─────────────────────────────────────
let typingTimeout: NodeJS.Timeout | null = null;

export async function sendTypingIndicator(
  conversationId: string,
  isBuyer: boolean,
  isTyping: boolean
): Promise<void> {
  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }

  if (isTyping) {
    // إرسال إشارة "يكتب" فوراً
    await updateTypingIndicator(conversationId, isBuyer, true);
    // تعيين مؤقت لإرسال إشارة "توقف الكتابة" بعد 3 ثوانٍ من عدم النشاط
    typingTimeout = setTimeout(async () => {
      await updateTypingIndicator(conversationId, isBuyer, false);
      typingTimeout = null;
    }, 3000);
  } else {
    await updateTypingIndicator(conversationId, isBuyer, false);
  }
}

// ── Smart notification check ───────────────────────────────────────────────
export async function shouldSendNotification(
  recipientId: string,
  conversationId: string,
  senderId: string
): Promise<boolean> {
  try {
    // التحقق من وجود المستخدم في المحادثة
    const { data: conv } = await getSupabaseClient()
      .from('conversations')
      .select('buyer_last_polled_at, seller_last_polled_at')
      .eq('id', conversationId)
      .single();

    if (!conv) return true;

    // التحقق من آخر مرة قام فيها المستخدم بفتح المحادثة
    const lastPolled = conv.buyer_last_polled_at || conv.seller_last_polled_at;
    if (lastPolled) {
      const timeSincePoll = Date.now() - new Date(lastPolled).getTime();
      // إذا كان المستخدم قد فتح المحادثة خلال الـ 10 ثواني الأخيرة، لا نرسل إشعاراً
      if (timeSincePoll < 10000) return false;
    }

    // التحقق من حالة الاتصال للمستخدم
    const { isOnline } = await checkUserOnline(recipientId);
    if (isOnline) return false;

    return true;
  } catch {
    return true;
  }
}