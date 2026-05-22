import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// In-memory deduplication: track last notified message per conversation
// Key: `${recipient_id}:${conversation_id}` — Value: timestamp (ms)
const lastNotified = new Map<string, number>();
const DEDUP_WINDOW_MS = 8000; // 8 seconds — ignore duplicates within this window

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // ── Badge reset shortcut ─────────────────────────────────────────────────
    if (body.action === 'reset_badge') {
      const { user_id } = body as { user_id: string };
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: 'Missing user_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('push_token')
        .eq('id', user_id)
        .single();
      const pushToken: string | null = profile?.push_token ?? null;
      if (pushToken && pushToken.startsWith('ExponentPushToken')) {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: pushToken,
            badge: 0,
            'content-available': 1,
            priority: 'normal',
          }),
        });
      }
      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

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

    // ── Deduplication: skip if same conversation was notified recently ────────
    if (conversation_id) {
      const dedupKey = `${recipient_id}:${conversation_id}`;
      const lastTime = lastNotified.get(dedupKey) ?? 0;
      const now = Date.now();
      if (now - lastTime < DEDUP_WINDOW_MS) {
        console.log(`[push-notify] Dedup skip for ${dedupKey}`);
        return new Response(
          JSON.stringify({ ok: true, skipped: 'dedup' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      lastNotified.set(dedupKey, now);
      // Cleanup old entries to prevent memory leak
      if (lastNotified.size > 500) {
        const cutoff = now - DEDUP_WINDOW_MS * 10;
        for (const [k, v] of lastNotified.entries()) {
          if (v < cutoff) lastNotified.delete(k);
        }
      }
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Fetch recipient push token and unread count
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

    const { data: profile, error: profileError } = profileResult;
    const convIds: string[] = (convResult.data ?? []).map((c: any) => c.id);

    let unreadCount = 1;
    if (convIds.length > 0) {
      const { count } = await supabaseAdmin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
        .neq('sender_id', recipient_id)
        .in('conversation_id', convIds);
      unreadCount = count ?? 1;
    }

    if (profileError) {
      console.error('[push-notify] Profile fetch error:', profileError.message);
    }

    const pushToken: string | null = profile?.push_token ?? null;

    if (!pushToken || !pushToken.startsWith('ExponentPushToken')) {
      return new Response(
        JSON.stringify({ ok: true, skipped: 'no_valid_token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Send via Expo Push Notification API ───────────────────────────────────
    const expoPayload = {
      to: pushToken,
      // "title" shows app name + sender name (shown in notification center)
      title: `سوق قلقيلية — ${sender_name}`,
      body: message_preview.substring(0, 100),
      sound: 'default',
      badge: unreadCount,
      'content-available': 1,
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

    const expoResult = await expoRes.json();
    console.log('[push-notify] Expo response:', JSON.stringify(expoResult));

    return new Response(
      JSON.stringify({ ok: true, expo: expoResult }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('[push-notify] Unexpected error:', err?.message);
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
