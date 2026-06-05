import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER') ?? '';

// Service role client
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Generate a 6-digit OTP */
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Send SMS via Twilio */
async function sendSmsTwilio(to: string, body: string): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const creds = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const form = new URLSearchParams({ To: to, From: TWILIO_PHONE_NUMBER, Body: body });

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Twilio error:', text);
    throw new Error('فشل إرسال رسالة التحقق. تحقق من رقم الهاتف وأعد المحاولة.');
  }
}

/**
 * Confirm user email via direct SQL RPC (bypasses all admin IP restrictions).
 */
async function confirmUserEmail(userId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin.rpc('confirm_user_email', { user_id: userId });
    if (!error) { console.log('Email confirmed via RPC for:', userId); return; }
    console.warn('RPC confirm warning:', error.message);
  } catch (ex: any) {
    console.warn('RPC confirm exception:', ex?.message);
  }
  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { email_confirm: true });
    if (error) console.warn('updateUserById warning (non-fatal):', error.message);
    else console.log('Email confirmed via updateUserById for:', userId);
  } catch (ex: any) {
    console.warn('updateUserById exception (non-fatal):', ex?.message);
  }
}

/** Create or sign-in a Supabase user for the given phone number. Returns session. */
async function getOrCreatePhoneUser(phoneNumber: string) {
  const normalizedPhone = phoneNumber.replace(/[^0-9+]/g, '');
  const digits = normalizedPhone.replace(/[^0-9]/g, '');
  const syntheticEmail = `phone_${digits}@sms.souqqalqilya.local`;
  const syntheticPassword = `SMS_${digits}_SQ_2024!`;

  // 1. Try signing in (existing user)
  const { data: existing, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
    email: syntheticEmail,
    password: syntheticPassword,
  });

  if (!signInErr && existing?.session) {
    console.log('Existing user signed in:', phoneNumber);
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
  console.log('Creating new user for:', phoneNumber);
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

  // Last resort: find via profile
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // ── ACTION: send_otp ──────────────────────────────────────────────────────
    if (action === 'send_otp') {
      const { phone } = body;
      if (!phone) {
        return new Response(JSON.stringify({ error: 'رقم الهاتف مطلوب.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

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
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

      // Store OTP
      const { error: insertErr } = await supabaseAdmin.from('phone_otps').insert({
        phone,
        otp_code: otp,
        expires_at: expiresAt,
        used: false,
      });

      if (insertErr) {
        console.error('OTP insert error:', insertErr);
        throw new Error('فشل حفظ رمز التحقق.');
      }

      // Send via Twilio
      const msg = `رمز التحقق لسوق قلقيلية: ${otp}\nصالح لمدة 10 دقائق.\nVerification code for Souq Qalqilya: ${otp}`;
      await sendSmsTwilio(phone, msg);

      console.log(`OTP sent to ${phone}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── ACTION: verify_otp ────────────────────────────────────────────────────
    if (action === 'verify_otp') {
      const { phone, otp } = body;
      if (!phone || !otp) {
        return new Response(JSON.stringify({ error: 'رقم الهاتف ورمز التحقق مطلوبان.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find latest unused, unexpired OTP for this phone
      const { data: otpRow, error: otpErr } = await supabaseAdmin
        .from('phone_otps')
        .select('*')
        .eq('phone', phone)
        .eq('otp_code', otp)
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

      // Mark OTP as used
      await supabaseAdmin.from('phone_otps').update({ used: true }).eq('id', otpRow.id);

      // Get or create Supabase user
      const session = await getOrCreatePhoneUser(phone);

      console.log(`Phone auth success for ${phone}`);
      return new Response(JSON.stringify({ success: true, session, user: session.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── LEGACY ACTION: verify_firebase ────────────────────────────────────────
    // Keep for backward compatibility but Firebase flow is now deprecated
    if (action === 'verify_firebase') {
      return new Response(JSON.stringify({ error: 'استخدام Firebase phone auth لم يعد مدعوماً. استخدم send_otp و verify_otp بدلاً من ذلك.' }), {
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
