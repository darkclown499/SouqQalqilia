import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ── In-memory deduplication ───────────────────────────────────────────────────
const lastNotified = new Map<string, number>();
const DEDUP_WINDOW_MS = 30_000; // 30s window — groups rapid messages in same conversation
const ACTIVE_POLL_THRESHOLD_MS = 10_000;

function cleanupDedup() {
  const cutoff = Date.now() - DEDUP_WINDOW_MS * 20;
  for (const [k, v] of lastNotified.entries()) {
    if (v < cutoff) lastNotified.delete(k);
  }
}

// ── Expo ticket error categories ─────────────────────────────────────────────
// Errors that mean the token is permanently dead and should be purged from DB.
const PERMANENT_TOKEN_ERRORS = new Set([
  'DeviceNotRegistered',
  'InvalidCredentials',
  'MessageTooBig',
  'MessageRateExceeded',
]);

// ── Send a single Expo push notification ─────────────────────────────────────
async function sendExpoPush(payload: object): Promise<{ ok: boolean; result?: any; error?: string }> {
  try {
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
      return { ok: false, error: `Expo HTTP ${res.status}: ${errText}` };
    }
    return { ok: true, result: await res.json() };
  } catch (e: any) {
    return { ok: false, error: `Network error: ${e?.message ?? e}` };
  }
}

// ── Send broadcast in safe batches of 20 ─────────────────────────────────────
// Returns per-token results so callers can purge stale tokens.
async function sendExpoBatch(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, any>,
  supabaseAdmin?: any,
): Promise<{
  sent: number;
  failed: number;
  errors: { token: string; error: string }[];
  staleTokens: string[];
}> {
  // Expo recommends ≤100 per request; we use 20 to stay well under limits
  // and to get more granular retry points.
  const BATCH_SIZE = 20;
  let sent = 0;
  let failed = 0;
  const errors: { token: string; error: string }[] = [];
  const staleTokens: string[] = [];

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batchTokens = tokens.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tokens.length / BATCH_SIZE);

    const messages = batchTokens.map(token => ({
      to: token,
      title,
      body,
      sound: 'default',
      channelId: 'messages',
      data: data ?? {},
      priority: 'high',
    }));

    console.log(
      `[push-notify:broadcast] Batch ${batchNum}/${totalBatches} — sending ${batchTokens.length} tokens...`
    );

    let responseJson: any;
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(messages),
      });

      const responseText = await res.text();

      if (!res.ok) {
        // HTTP-level failure (network/rate-limit/server error)
        console.error(
          `[push-notify:broadcast] Batch ${batchNum} HTTP error ${res.status}: ${responseText}`
        );
        failed += batchTokens.length;
        batchTokens.forEach(token => errors.push({ token, error: `HTTP ${res.status}: ${responseText.slice(0, 200)}` }));
        continue;
      }

      try {
        responseJson = JSON.parse(responseText);
      } catch {
        console.error(`[push-notify:broadcast] Batch ${batchNum} unparseable response: ${responseText.slice(0, 300)}`);
        failed += batchTokens.length;
        batchTokens.forEach(token => errors.push({ token, error: 'Unparseable Expo response' }));
        continue;
      }
    } catch (netErr: any) {
      // Network/fetch-level failure
      console.error(`[push-notify:broadcast] Batch ${batchNum} network error: ${netErr?.message ?? netErr}`);
      failed += batchTokens.length;
      batchTokens.forEach(token => errors.push({ token, error: `Network: ${netErr?.message}` }));
      continue;
    }

    // ── Parse per-ticket results ──────────────────────────────────────────────
    const tickets: any[] = Array.isArray(responseJson?.data) ? responseJson.data : [];

    if (tickets.length === 0) {
      // Expo sometimes wraps errors at the top level (e.g. auth failure)
      const topError = responseJson?.errors?.[0]?.message ?? responseJson?.error ?? JSON.stringify(responseJson);
      console.error(`[push-notify:broadcast] Batch ${batchNum} — no tickets in response. Top-level error: ${topError}`);
      failed += batchTokens.length;
      batchTokens.forEach(token => errors.push({ token, error: `Expo top-level: ${topError}` }));
      continue;
    }

    for (let j = 0; j < tickets.length; j++) {
      const ticket = tickets[j];
      const token = batchTokens[j];

      if (ticket?.status === 'ok') {
        sent++;
        console.log(`[push-notify:broadcast]   ✅ OK  token=${token?.slice(-10)}`);
      } else {
        failed++;
        const ticketError: string = ticket?.message ?? ticket?.details?.error ?? JSON.stringify(ticket);
        const errorCode: string = ticket?.details?.error ?? 'Unknown';
        console.error(
          `[push-notify:broadcast]   ❌ FAIL token=${token?.slice(-10)} code=${errorCode} msg=${ticketError}`
        );
        errors.push({ token: token ?? 'unknown', error: `${errorCode}: ${ticketError}` });

        // Mark permanently dead tokens for DB cleanup
        if (PERMANENT_TOKEN_ERRORS.has(errorCode)) {
          staleTokens.push(token);
          console.warn(`[push-notify:broadcast]   🗑 Stale token queued for cleanup: ${token?.slice(-10)}`);
        }
      }
    }

    console.log(
      `[push-notify:broadcast] Batch ${batchNum}/${totalBatches} complete — batchSent=${sent} batchFailed=${failed}`
    );

    // Small delay between batches to respect Expo rate limits
    if (i + BATCH_SIZE < tokens.length) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // ── Auto-purge DeviceNotRegistered tokens from DB ─────────────────────────
  if (staleTokens.length > 0 && supabaseAdmin) {
    console.log(`[push-notify:broadcast] Purging ${staleTokens.length} stale token(s) from DB...`);
    const { error: purgeErr } = await supabaseAdmin
      .from('user_profiles')
      .update({ push_token: null })
      .in('push_token', staleTokens);
    if (purgeErr) {
      console.error(`[push-notify:broadcast] Token purge failed: ${purgeErr.message}`);
    } else {
      console.log(`[push-notify:broadcast] Purged ${staleTokens.length} stale token(s) successfully.`);
    }
  }

  return { sent, failed, errors, staleTokens };
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
          JSON.stringify({ error: 'Unauthorized — missing Authorization header' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Verify admin identity
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
      if (userErr || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized — invalid token' }),
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
          JSON.stringify({ error: 'Forbidden — admin only' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { title, message, data: extraData, dry_run } = body as {
        title: string;
        message: string;
        data?: Record<string, any>;
        /** dry_run=true fetches tokens and validates but does NOT call Expo API */
        dry_run?: boolean;
      };

      if (!title?.trim() || !message?.trim()) {
        return new Response(
          JSON.stringify({ error: 'title and message are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Fetch all valid Expo tokens
      const { data: profiles, error: fetchErr } = await supabaseAdmin
        .from('user_profiles')
        .select('push_token')
        .not('push_token', 'is', null)
        .like('push_token', 'ExponentPushToken%');

      if (fetchErr) {
        console.error(`[push-notify:broadcast] Token fetch failed: ${fetchErr.message}`);
        return new Response(
          JSON.stringify({ error: `Failed to fetch tokens: ${fetchErr.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const tokens: string[] = (profiles ?? [])
        .map((p: any) => p.push_token as string)
        .filter((t: string) => t && t.startsWith('ExponentPushToken') && t.length > 20);

      console.log(`[push-notify:broadcast] Found ${tokens.length} valid token(s). dry_run=${!!dry_run}`);

      if (tokens.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, sent: 0, failed: 0, total: 0, message: 'No valid push tokens found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Dry-run mode: validate tokens without calling Expo
      if (dry_run) {
        return new Response(
          JSON.stringify({
            ok: true,
            dry_run: true,
            total: tokens.length,
            sample_tokens: tokens.slice(0, 3).map(t => t.slice(-12)),
            message: 'Dry run — no notifications sent',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      console.log(`[push-notify:broadcast] Starting broadcast to ${tokens.length} device(s)...`);
      const { sent, failed, errors, staleTokens } = await sendExpoBatch(
        tokens,
        title.trim(),
        message.trim(),
        { type: 'broadcast', ...(extraData ?? {}) },
        supabaseAdmin,
      );

      console.log(
        `[push-notify:broadcast] ✅ Complete — sent=${sent} failed=${failed} stale=${staleTokens.length} total=${tokens.length}`
      );

      // Return first 10 errors as diagnostic info (not exposing full token strings)
      const diagnosticErrors = errors.slice(0, 10).map(e => ({
        tokenSuffix: e.token.slice(-12),
        error: e.error,
      }));

      return new Response(
        JSON.stringify({
          ok: true,
          sent,
          failed,
          total: tokens.length,
          stale_purged: staleTokens.length,
          ...(failed > 0 ? { sample_errors: diagnosticErrors } : {}),
        }),
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
        const { ok, result, error: expoErr } = await sendExpoPush({
          to: pushToken,
          badge: 0,
          'content-available': 1,
          priority: 'normal',
        });
        if (!ok) {
          console.error('[push-notify:reset_badge] Expo error:', expoErr);
        } else {
          const ticket = result?.data;
          if (ticket?.status === 'error') {
            console.error(`[push-notify:reset_badge] Ticket error: ${ticket.message} (${ticket.details?.error})`);
            if (ticket.details?.error === 'DeviceNotRegistered') {
              await supabaseAdmin.from('user_profiles').update({ push_token: null }).eq('id', user_id);
              console.log(`[push-notify:reset_badge] Cleared stale token for user=${user_id}`);
            }
          }
        }
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
      is_buyer_recipient?: boolean;
    } = body;

    if (!recipient_id || !sender_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: recipient_id, sender_name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Smart skip: recipient is actively viewing this chat ───────────────────
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
            `[push-notify] Recipient active (last poll ${elapsed}ms ago) — skipping conv=${conversation_id}`
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

    // ── Fetch push token + unread count ───────────────────────────────────────
    const [profileResult, convResult] = await Promise.all([
      supabaseAdmin.from('user_profiles').select('push_token').eq('id', recipient_id).single(),
      supabaseAdmin.from('conversations').select('id').or(`buyer_id.eq.${recipient_id},seller_id.eq.${recipient_id}`),
    ]);

    if (profileResult.error) console.error('[push-notify] Profile fetch error:', profileResult.error.message);

    const pushToken: string | null = profileResult.data?.push_token ?? null;
    if (!pushToken) {
      console.log(`[push-notify] No push token for recipient=${recipient_id}`);
      return new Response(
        JSON.stringify({ ok: true, skipped: 'no_token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!pushToken.startsWith('ExponentPushToken')) {
      console.warn(`[push-notify] Invalid token format for recipient=${recipient_id}: ${pushToken.slice(0, 20)}`);
      // Purge the invalid token
      await supabaseAdmin.from('user_profiles').update({ push_token: null }).eq('id', recipient_id);
      return new Response(
        JSON.stringify({ ok: true, skipped: 'invalid_token_format' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Unread count for badge
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
      body: (message_preview ?? '').substring(0, 100),
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
      console.error(`[push-notify] Expo send failed: ${expoErr}`);
      return new Response(
        JSON.stringify({ error: expoErr }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ticket = expoResult?.data;
    if (ticket?.status === 'error') {
      const errorCode: string = ticket.details?.error ?? 'Unknown';
      console.error(`[push-notify] Expo ticket error: code=${errorCode} msg=${ticket.message}`);
      if (errorCode === 'DeviceNotRegistered') {
        await supabaseAdmin.from('user_profiles').update({ push_token: null }).eq('id', recipient_id);
        console.log(`[push-notify] Cleared stale token for recipient=${recipient_id}`);
      }
    } else {
      console.log(`[push-notify] ✅ Sent to recipient=${recipient_id}, badge=${unreadCount}`);
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
