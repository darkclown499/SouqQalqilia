import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_VERIFY_SERVICE_SID = Deno.env.get('TWILIO_VERIFY_SERVICE_SID') ?? '';

// Service role client — full privileges, no auth headers
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate and normalise phone number to E.164 format.
 */
function validateE164(phone: string): string | null {
  const stripped = phone.replace(/[\s\-().]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(stripped)) return null;
  return stripped;
}

/**
 * Confirm user email via RPC (SECURITY DEFINER — bypasses admin IP restrictions).
 * Falls back to Admin API updateUserById.
 */
async function confirmUserEmail(userId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc('confirm_user_email', { user_id: userId });
    if (!error) { console.log('Email confirmed via RPC:', userId); return; }
    console.warn('RPC confirm fallback:', error.message);
  } catch (ex: any) {
    console.warn('RPC exception, trying admin API:', ex?.message);
  }
  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { email_confirm: true });
    if (error) console.warn('updateUserById (non-fatal):', error.message);
    else console.log('Email confirmed via admin API:', userId);
  } catch (ex: any) {
    console.warn('Admin API exception (non-fatal):', ex?.message);
  }
}

/**
 * Derive synthetic Supabase credentials from a phone number.
 *
 * SECURITY: The password is keyed with SERVICE_ROLE_KEY so it cannot be
 * guessed by external parties even if they know the phone number.
 */
async function getSyntheticCredentials(phone: string): Promise<{ email: string; password: string }> {
  const digits = phone.replace(/[^0-9]/g, '');
  const email = `phone_${digits}@sms.souqqalqilya.local`;

  // Derive a secret password: HMAC-SHA256(phone, SERVICE_ROLE_KEY)
  const keyData = new TextEncoder().encode(SUPABASE_SERVICE_ROLE_KEY);
  const msgData = new TextEncoder().encode(`sms_auth:${digits}`);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const password = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);

  return { email, password };
}

/** Create or sign-in a Supabase user for the given phone number. Returns session. */
async function getOrCreatePhoneUser(phoneNumber: string) {
  const normalizedPhone = phoneNumber.replace(/[\s\-().]/g, '');
  const { email: syntheticEmail, password: syntheticPassword } = await getSyntheticCredentials(normalizedPhone);

  // 1. Try signing in (existing user)
  const { data: existing, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
    email: syntheticEmail,
    password: syntheticPassword,
  });

  if (!signInErr && existing?.session) {
    console.log('Existing user signed in:', normalizedPhone);
    return existing.session;
  }

  const signInMsg = signInErr?.message?.toLowerCase() ?? '';
  const isUnconfirmed = signInMsg.includes('email not confirmed') || signInMsg.includes('not confirmed');

  if (isUnconfirmed) {
    const { data: profile } = await supabaseAdmin
      .from('user_profiles').select('id').eq('email', syntheticEmail).maybeSingle();

    if (profile?.id) {
      await confirmUserEmail(profile.id);
      const { data: retry, error: retryErr } = await supabaseAdmin.auth.signInWithPassword({
        email: syntheticEmail, password: syntheticPassword,
      });
      if (!retryErr && retry?.session) return retry.session;
    }
  }

  // 2. New user — sign up
  console.log('Creating new user for:', normalizedPhone);
  const { data: signUp, error: signUpErr } = await supabaseAdmin.auth.signUp({
    email: syntheticEmail,
    password: syntheticPassword,
    options: { data: { phone: normalizedPhone, auth_method: 'sms_otp' } },
  });

  if (signUpErr) {
    const msg = signUpErr.message?.toLowerCase() ?? '';
    if (!msg.includes('already registered') && !msg.includes('already been registered')) {
      throw new Error(`فشل إنشاء الحساب: ${signUpErr.message}`);
    }
  }

  const newId = signUp?.user?.id;
  if (newId) {
    await confirmUserEmail(newId);
    await supabaseAdmin.from('user_profiles').upsert({
      id: newId,
      email: syntheticEmail,
      phone: normalizedPhone,
      username: '',
    }, { onConflict: 'id', ignoreDuplicates: false });
  }

  // 3. Final sign-in
  const { data: final, error: finalErr } = await supabaseAdmin.auth.signInWithPassword({
    email: syntheticEmail, password: syntheticPassword,
  });

  if (!finalErr && final?.session) return final.session;

  // Last resort: look up via profile table
  const { data: fallbackProfile } = await supabaseAdmin
    .from('user_profiles').select('id').eq('email', syntheticEmail).maybeSingle();
  if (fallbackProfile?.id) {
    await confirmUserEmail(fallbackProfile.id);
    const { data: last, error: lastErr } = await supabaseAdmin.auth.signInWithPassword({
      email: syntheticEmail, password: syntheticPassword,
    });
    if (!lastErr && last?.session) return last.session;
    throw new Error(`تعذّر تسجيل الدخول: ${lastErr?.message ?? 'لا توجد جلسة'}`);
  }

  throw new Error(`تعذّر تسجيل الدخول بعد إنشاء الحساب: ${finalErr?.message ?? 'لا توجد جلسة'}`);
}

// ─── Twilio Verify API helpers ────────────────────────────────────────────────

const TWILIO_VERIFY_BASE = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}`;
const twilioAuth = () => `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`;

/**
 * Send OTP via Twilio Verify Service.
 * Twilio handles code generation, SMS delivery, expiry (10 min), and rate limiting.
 */
async function sendVerifyOtp(phone: string): Promise<void> {
  const res = await fetch(`${TWILIO_VERIFY_BASE}/Verifications`, {
    method: 'POST',
    headers: {
      Authorization: twilioAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: phone, Channel: 'sms' }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Twilio Verify send error:', text);
    try {
      const json = JSON.parse(text);
      const code: number = json?.code ?? 0;
      if (code === 60200) throw new Error('رقم الهاتف غير صالح.');
      if (code === 60203) throw new Error('تم تجاوز الحد الأقصى لمحاولات الإرسال. انتظر قليلاً وأعد المحاولة.');
      if (code === 60205) throw new Error('لا يمكن إرسال رمز SMS لهذا الرقم.');
      if (code === 20429) throw new Error('طلبات كثيرة جداً. انتظر دقيقة وأعد المحاولة.');
      throw new Error(json?.message ?? 'فشل إرسال رمز التحقق.');
    } catch (e: any) {
      if (e.message !== 'فشل إرسال رمز التحقق.' && !e.message.startsWith('Unexpected')) throw e;
    }
    throw new Error('فشل إرسال رمز التحقق. تحقق من الرقم وأعد المحاولة.');
  }
}

/**
 * Check OTP via Twilio Verify Service.
 * Returns true if code is valid and approved.
 */
async function checkVerifyOtp(phone: string, code: string): Promise<boolean> {
  const res = await fetch(`${TWILIO_VERIFY_BASE}/VerificationCheck`, {
    method: 'POST',
    headers: {
      Authorization: twilioAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: phone, Code: code }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Twilio Verify check error:', text);
    try {
      const json = JSON.parse(text);
      const errCode: number = json?.code ?? 0;
      // 20404 = verification not found or already used/expired
      if (errCode === 20404) return false;
      throw new Error(json?.message ?? 'خطأ في التحقق من الرمز.');
    } catch (e: any) {
      if (!e.message.startsWith('Unexpected')) throw e;
    }
    throw new Error('خطأ في التحقق من الرمز.');
  }

  const json = await res.json();
  // Twilio returns status: "approved" when correct, "pending" when wrong
  return json?.status === 'approved';
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ── ACTION: send_otp ──────────────────────────────────────────────────────
    if (action === 'send_otp') {
      const rawPhone: string = body.phone ?? '';

      const phone = validateE164(rawPhone);
      if (!phone) {
        return new Response(JSON.stringify({ error: 'رقم الهاتف غير صالح. يجب أن يكون بصيغة دولية مثل +970591234567' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Twilio Verify handles rate limiting, OTP generation, and SMS delivery
      await sendVerifyOtp(phone);

      console.log(`Verify OTP sent to ${phone}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── ACTION: verify_otp ────────────────────────────────────────────────────
    if (action === 'verify_otp') {
      const rawPhone: string = body.phone ?? '';
      const otp: string = (body.otp ?? '').trim();

      const phone = validateE164(rawPhone);
      if (!phone || !otp) {
        return new Response(JSON.stringify({ error: 'رقم الهاتف ورمز التحقق مطلوبان.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!/^\d{6}$/.test(otp)) {
        return new Response(JSON.stringify({ error: 'رمز التحقق يجب أن يتكون من 6 أرقام.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Twilio Verify checks the code (handles expiry and single-use internally)
      const approved = await checkVerifyOtp(phone, otp);
      if (!approved) {
        return new Response(JSON.stringify({ error: 'الرمز غير صحيح أو منتهي الصلاحية.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Code is valid — get or create Supabase session
      const session = await getOrCreatePhoneUser(phone);

      console.log(`Phone auth success for ${phone}`);
      return new Response(JSON.stringify({ success: true, session, user: session.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── LEGACY: verify_firebase (deprecated) ─────────────────────────────────
    if (action === 'verify_firebase') {
      return new Response(JSON.stringify({ error: 'Firebase phone auth لم يعد مدعوماً. استخدم send_otp و verify_otp.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'إجراء غير معروف' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('sms-auth error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'خطأ داخلي في الخادم' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
