import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ── In-memory deduplication ───────────────────────────────────────────────────
// Prevents sending duplicate push notifications for rapid messages in the same
// conversation within the dedup window.
const lastNotified = new Map<string, number>();
const DEDUP_WINDOW_MS = 8_000;

// How recent a poll must be to consider the recipient "active in chat"
// If the recipient polled within this window, skip the push notification.
const ACTIVE_POLL_THRESHOLD_MS = 10_000; // 10 seconds

function cleanupDedup() {
  const cutoff = Date.now() - DEDUP_WINDOW_MS * 20;
  for (const [k, v] of lastNotified.entries()) {
    if (v < cutoff) lastNotified.delete(k);
  }
}

// ── Send a single Expo push notification ─────────────────────────────────────
async function sendExpoPush(payload: object): Promise<{ ok: boolean; result?: any; error?: string }> {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: `Expo API error ${res.status}: ${errText}` };
  }
  return { ok: true, result: await res.json() };
}

// ── Send a batch of up to 100 tokens via Expo Push API ───────────────────────
async function sendExpoBatch(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ sent: number; failed: number }> {
  const BATCH_SIZE = 100;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const payload = batch.map(token => ({
      to: token,
      title,
      body,
      sound: 'default',
      channelId: 'messages',
      data: data ?? {},
      priority: 'high',
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`[push-notify:broadcast] Batch ${i / BATCH_SIZE + 1} HTTP error ${res.status}`);
      failed += batch.length;
      continue;
    }

    const result = await res.json();
    const tickets: any[] = Array.isArray(result?.data) ? result.data : [];
    tickets.forEach((t: any) => { t?.status === 'ok' ? sent++ : failed++; });
    console.log(`[push-notify:broadcast] Batch ${i / BATCH_SIZE + 1}: sent=${sent} failed=${failed}`);
  }

  return { sent, failed };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const body = await req.json();

    // ── ACTION: broadcast ─────────────────────────────────────────────────────
    if (body.action === 'broadcast') {
      const authHeader = req.headers.get('Authorization');
      const token = authHeader?.replace('Bearer ', '');
      if (!token) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
      if (userErr || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (!profile?.is_admin) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Admin only' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { title, message, data: extraData } = body as {
        title: string;
        message: string;
        data?: Record<string, any>;
      };

      if (!title?.trim() || !message?.trim()) {
        return new Response(
          JSON.stringify({ error: 'title and message are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { data: profiles, error: fetchErr } = await supabaseAdmin
        .from('user_profiles')
        .select('push_token')
        .not('push_token', 'is', null)
        .like('push_token', 'ExponentPushToken%');

      if (fetchErr) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch tokens: ${fetchErr.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const tokens: string[] = (profiles ?? [])
        .map((p: any) => p.push_token as string)
        .filter(Boolean);

      if (tokens.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, sent: 0, failed: 0, total: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      console.log(`[push-notify:broadcast] Sending to ${tokens.length} devices...`);
      const { sent, failed } = await sendExpoBatch(tokens, title.trim(), message.trim(), {
        type: 'broadcast',
        ...(extraData ?? {}),
      });

      console.log(`[push-notify:broadcast] Done. sent=${sent} failed=${failed} total=${tokens.length}`);
      return new Response(
        JSON.stringify({ ok: true, sent, failed, total: tokens.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── ACTION: reset_badge ───────────────────────────────────────────────────
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

      if (pErr) console.error('[push-notify:reset_badge] Profile fetch error:', pErr.message);

      const pushToken: string | null = profile?.push_token ?? null;
      if (pushToken && pushToken.startsWith('ExponentPushToken')) {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ to: pushToken, badge: 0, 'content-available': 1, priority: 'normal' }),
        });
        const result = await res.json();
        console.log('[push-notify:reset_badge] Expo response:', JSON.stringify(result));
      }

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── ACTION: send message notification (default) ───────────────────────────
    const {
      recipient_id,
      sender_name,
      message_preview,
      conversation_id,
      is_buyer_recipient,
    }: {
      recipient_id: string;
      sender_name: string;
      message_preview: string;
      conversation_id?: string;
      /** true = recipient is the buyer; false = recipient is the seller */
      is_buyer_recipient?: boolean;
    } = body;

    if (!recipient_id || !sender_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: recipient_id, sender_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Smart skip: recipient is actively viewing the chat ────────────────────
    // If the recipient polled within ACTIVE_POLL_THRESHOLD_MS, they are already
    // seeing the message in real-time — sending a push notification would be
    // redundant and noisy. Skip it.
    if (conversation_id && is_buyer_recipient !== undefined) {
      const polledCol = is_buyer_recipient ? 'buyer_last_polled_at' : 'seller_last_polled_at';
      const { data: convRow } = await supabaseAdmin
        .from('conversations')
        .select(polledCol)
        .eq('id', conversation_id)
        .single();

      const lastPolled: string | null = convRow?.[polledCol] ?? null;
      if (lastPolled) {
        const elapsed = Date.now() - new Date(lastPolled).getTime();
        if (elapsed < ACTIVE_POLL_THRESHOLD_MS) {
          console.log(
            `[push-notify] Recipient is active (last poll ${elapsed}ms ago) — skipping notification for conv=${conversation_id}`
          );
          return new Response(
            JSON.stringify({ ok: true, skipped: 'recipient_active' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }
    }

    // ── Deduplication ─────────────────────────────────────────────────────────
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

    // ── Fetch push token + unread count in parallel ───────────────────────────
    const [profileResult, convResult] = await Promise.all([
      supabaseAdmin.from('user_profiles').select('push_token').eq('id', recipient_id).single(),
      supabaseAdmin.from('conversations').select('id').or(`buyer_id.eq.${recipient_id},seller_id.eq.${recipient_id}`),
    ]);

    if (profileResult.error) console.error('[push-notify] Profile fetch error:', profileResult.error.message);

    const pushToken: string | null = profileResult.data?.push_token ?? null;
    if (!pushToken) {
      console.log(`[push-notify] No push token for recipient=${recipient_id}`);
      return new Response(JSON.stringify({ ok: true, skipped: 'no_token' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!pushToken.startsWith('ExponentPushToken')) {
      console.warn(`[push-notify] Invalid token format for recipient=${recipient_id}`);
      return new Response(JSON.stringify({ ok: true, skipped: 'invalid_token_format' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const convIds: string[] = (convResult.data ?? []).map((c: any) => c.id);
    let unreadCount = 1;
    if (convIds.length > 0) {
      const { count, error: countErr } = await supabaseAdmin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
        .neq('sender_id', recipient_id)
        .in('conversation_id', convIds);
      if (countErr) console.warn('[push-notify] Unread count error:', countErr.message);
      else unreadCount = count ?? 1;
    }

    const { ok, result: expoResult, error: expoErr } = await sendExpoPush({
      to: pushToken,
      title: `سوق قلقيلية — ${sender_name}`,
      body: message_preview.substring(0, 100),
      sound: 'default',
      badge: unreadCount,
      'content-available': 1,
      channelId: 'messages',
      data: {
        type: 'new_message',
        recipient_id,
        conversation_id: conversation_id ?? null,
        unread_count: unreadCount,
      },
      priority: 'high',
    });

    if (!ok) {
      console.error(`[push-notify] ${expoErr}`);
      return new Response(JSON.stringify({ error: expoErr }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const ticket = expoResult?.data;
    if (ticket?.status === 'error') {
      console.error(`[push-notify] Expo ticket error: ${ticket.message} (${ticket.details?.error})`);
      if (ticket.details?.error === 'DeviceNotRegistered') {
        await supabaseAdmin.from('user_profiles').update({ push_token: null }).eq('id', recipient_id);
        console.log(`[push-notify] Cleared stale token for recipient=${recipient_id}`);
      }
    } else {
      console.log(`[push-notify] Sent OK to recipient=${recipient_id}, badge=${unreadCount}`);
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
