import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER') ?? '';

// Service role client — full privileges, no auth headers
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a 6-digit OTP */
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hash OTP with SHA-256 keyed by phone number.
 * Prevents plaintext OTP exposure if the phone_otps table is ever leaked.
 */
async function hashOtp(otp: string, phone: string): Promise<string> {
  const data = new TextEncoder().encode(otp + '|' + phone);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validate and normalise phone number to E.164 format.
 * Rejects anything that doesn't look like a valid international number.
 */
function validateE164(phone: string): string | null {
  const stripped = phone.replace(/[\s\-().]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(stripped)) return null;
  return stripped;
}

/** Send SMS via Twilio */
async function sendSmsTwilio(to: string, body: string): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const form = new URLSearchParams({ To: to, From: TWILIO_PHONE_NUMBER, Body: body });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Twilio error response:', text);
    // Parse Twilio error code for a helpful message
    try {
      const json = JSON.parse(text);
      const code: number = json?.code ?? 0;
      // 21211 = invalid 'To' number, 21608 = unverified number (trial account)
      if (code === 21211 || code === 21614) throw new Error('رقم الهاتف غير صالح. تأكد من الرقم وأعد المحاولة.');
      if (code === 21608) throw new Error('رقم الهاتف غير مُفعَّل في حساب Twilio التجريبي.');
      throw new Error(`Twilio: ${json?.message ?? text}`);
    } catch (parseErr: any) {
      if (parseErr.message.startsWith('Twilio:') || parseErr.message.startsWith('رقم')) throw parseErr;
    }
    throw new Error('فشل إرسال رسالة التحقق. تحقق من رقم الهاتف وأعد المحاولة.');
  }
}

/**
 * Clean up expired and old used OTPs for a phone number.
 * Called automatically before inserting a new OTP — keeps the table lean.
 */
async function cleanupOtps(phone: string): Promise<void> {
  try {
    // Delete expired OTPs (any phone, older than 30 minutes)
    await supabaseAdmin
      .from('phone_otps')
      .delete()
      .lt('expires_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());

    // Delete used OTPs for this phone
    await supabaseAdmin
      .from('phone_otps')
      .delete()
      .eq('phone', phone)
      .eq('used', true);
  } catch (ex: any) {
    console.warn('cleanup non-fatal:', ex?.message);
  }
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
 * This prevents an attacker from bypassing OTP by calling Supabase Auth directly.
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
    // User exists but unconfirmed — find via profile and confirm
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

      // Validate E.164 format
      const phone = validateE164(rawPhone);
      if (!phone) {
        return new Response(JSON.stringify({ error: 'رقم الهاتف غير صالح. يجب أن يكون بصيغة دولية مثل +970591234567' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Cleanup stale records before inserting
      await cleanupOtps(phone);

      // Rate limit: max 3 active OTPs per phone in last 10 minutes
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('phone_otps')
        .select('*', { count: 'exact', head: true })
        .eq('phone', phone)
        .eq('used', false)
        .gte('created_at', tenMinsAgo);

      if ((count ?? 0) >= 3) {
        return new Response(JSON.stringify({ error: 'طلبات كثيرة جداً. انتظر 10 دقائق وأعد المحاولة.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const otp = generateOtp();
      const otpHash = await hashOtp(otp, phone);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

      // Store hashed OTP — plaintext otp never persisted
      const { error: insertErr } = await supabaseAdmin.from('phone_otps').insert({
        phone,
        otp_code: otpHash,   // stored as SHA-256 hash
        expires_at: expiresAt,
        used: false,
      });

      if (insertErr) {
        console.error('OTP insert error:', insertErr);
        throw new Error('فشل حفظ رمز التحقق.');
      }

      // Send via Twilio
      const msg = `رمز التحقق لسوق قلقيلية: ${otp}\nصالح لمدة 10 دقائق.\nSouq Qalqilya code: ${otp}`;
      await sendSmsTwilio(phone, msg);

      console.log(`OTP sent to ${phone}`);
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

      // Hash the provided OTP to compare with stored hash
      const otpHash = await hashOtp(otp, phone);

      // Find latest unused, unexpired OTP for this phone
      const { data: otpRow, error: otpErr } = await supabaseAdmin
        .from('phone_otps')
        .select('*')
        .eq('phone', phone)
        .eq('otp_code', otpHash)   // compare hashes
        .eq('used', false)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (otpErr) {
        console.error('OTP query error:', otpErr);
        throw new Error('خطأ في التحقق من الرمز.');
      }

      if (!otpRow) {
        return new Response(JSON.stringify({ error: 'الرمز غير صحيح أو منتهي الصلاحية.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Mark OTP as used immediately (prevents replay attacks)
      await supabaseAdmin.from('phone_otps').update({ used: true }).eq('id', otpRow.id);

      // Get or create Supabase user
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
