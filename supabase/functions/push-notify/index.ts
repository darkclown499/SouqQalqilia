import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ── In-memory deduplication ───────────────────────────────────────────────────
// Key: `${recipient_id}:${conversation_id}` — Value: timestamp (ms)
// Prevents sending multiple notifications for rapid messages in the same chat.
// Note: resets on cold-start (Edge Function restarts) — this is acceptable
// since a new cold-start means a new instance; the 8s window is generous enough.
const lastNotified = new Map<string, number>();
const DEDUP_WINDOW_MS = 8_000; // 8 seconds

function cleanupDedup() {
  const cutoff = Date.now() - DEDUP_WINDOW_MS * 20;
  for (const [k, v] of lastNotified.entries()) {
    if (v < cutoff) lastNotified.delete(k);
  }
}

serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const body = await req.json();

    // ── 1. Badge reset shortcut ────────────────────────────────────────────────
    if (body.action === 'reset_badge') {
      const { user_id } = body as { user_id: string };
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: 'Missing user_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { data: profile, error: pErr } = await supabaseAdmin
        .from('user_profiles')
        .select('push_token')
        .eq('id', user_id)
        .single();

      if (pErr) {
        console.error('[push-notify:reset_badge] Profile fetch error:', pErr.message);
      }

      const pushToken: string | null = profile?.push_token ?? null;
      if (pushToken && pushToken.startsWith('ExponentPushToken')) {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({
            to: pushToken,
            badge: 0,
            'content-available': 1,
            priority: 'normal',
          }),
        });
        const result = await res.json();
        console.log('[push-notify:reset_badge] Expo response:', JSON.stringify(result));
      }

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 2. Send new message notification ──────────────────────────────────────
    const {
      recipient_id,
      sender_name,
      message_preview,
      conversation_id,
    }: {
      recipient_id: string;
      sender_name: string;
      message_preview: string;
      conversation_id?: string;
    } = body;

    if (!recipient_id || !sender_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: recipient_id, sender_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Deduplication check ────────────────────────────────────────────────────
    if (conversation_id) {
      const dedupKey = `${recipient_id}:${conversation_id}`;
      const lastTime = lastNotified.get(dedupKey) ?? 0;
      const now = Date.now();

      if (now - lastTime < DEDUP_WINDOW_MS) {
        console.log(`[push-notify] Dedup skip — key=${dedupKey}, elapsed=${now - lastTime}ms`);
        return new Response(
          JSON.stringify({ ok: true, skipped: 'dedup' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      lastNotified.set(dedupKey, now);
      if (lastNotified.size > 500) cleanupDedup();
    }

    // ── Fetch recipient profile and unread count in parallel ──────────────────
    const [profileResult, convResult] = await Promise.all([
      supabaseAdmin
        .from('user_profiles')
        .select('push_token')
        .eq('id', recipient_id)
        .single(),
      supabaseAdmin
        .from('conversations')
        .select('id')
        .or(`buyer_id.eq.${recipient_id},seller_id.eq.${recipient_id}`),
    ]);

    if (profileResult.error) {
      console.error('[push-notify] Profile fetch error:', profileResult.error.message);
    }

    const pushToken: string | null = profileResult.data?.push_token ?? null;

    // ── Validate token ─────────────────────────────────────────────────────────
    if (!pushToken) {
      console.log(`[push-notify] No push token for recipient=${recipient_id}`);
      return new Response(
        JSON.stringify({ ok: true, skipped: 'no_token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!pushToken.startsWith('ExponentPushToken')) {
      console.warn(`[push-notify] Invalid token format for recipient=${recipient_id}: ${pushToken.substring(0, 20)}...`);
      return new Response(
        JSON.stringify({ ok: true, skipped: 'invalid_token_format' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Calculate unread badge count ───────────────────────────────────────────
    const convIds: string[] = (convResult.data ?? []).map((c: any) => c.id);
    let unreadCount = 1;

    if (convIds.length > 0) {
      const { count, error: countErr } = await supabaseAdmin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
        .neq('sender_id', recipient_id)
        .in('conversation_id', convIds);

      if (countErr) {
        console.warn('[push-notify] Unread count error:', countErr.message);
      } else {
        unreadCount = count ?? 1;
      }
    }

    // ── Send via Expo Push API ─────────────────────────────────────────────────
    const expoPayload = {
      to: pushToken,
      title: `سوق قلقيلية — ${sender_name}`,
      body: message_preview.substring(0, 100),
      sound: 'default',
      badge: unreadCount,
      'content-available': 1,
      channelId: 'messages', // Android notification channel
      data: {
        type: 'new_message',
        recipient_id,
        conversation_id: conversation_id ?? null,
        unread_count: unreadCount,
      },
      priority: 'high',
    };

    const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(expoPayload),
    });

    if (!expoRes.ok) {
      const errText = await expoRes.text();
      console.error(`[push-notify] Expo API HTTP error ${expoRes.status}: ${errText}`);
      return new Response(
        JSON.stringify({ error: `Expo API error: ${expoRes.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const expoResult = await expoRes.json();

    // ── Check Expo-level errors in the response body ───────────────────────────
    const ticket = expoResult?.data;
    if (ticket?.status === 'error') {
      console.error(`[push-notify] Expo ticket error: ${ticket.message} (${ticket.details?.error})`);
      // DeviceNotRegistered means the token is stale — clear it
      if (ticket.details?.error === 'DeviceNotRegistered') {
        await supabaseAdmin
          .from('user_profiles')
          .update({ push_token: null })
          .eq('id', recipient_id);
        console.log(`[push-notify] Cleared stale token for recipient=${recipient_id}`);
      }
    } else {
      console.log(`[push-notify] Sent OK to recipient=${recipient_id}, badge=${unreadCount}, conv=${conversation_id ?? 'n/a'}`);
    }

    return new Response(
      JSON.stringify({ ok: true, expo: expoResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err: any) {
    console.error('[push-notify] Unexpected error:', err?.message ?? err);
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
