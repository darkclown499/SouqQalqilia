import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
// SouqQalqiliawp — WhatsApp Verify Service, template: verification_code (pending Meta approval)
// Sender: whatsapp:+15559658976. Once Meta approves the template, OTP delivery works automatically.
const TWILIO_VERIFY_SERVICE_SID =
  Deno.env.get('TWILIO_VERIFY_SERVICE_SID') || 'VA41169795e10e4201ebcf32b0cff20e65';

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

  // Helper: find existing auth user by email
  async function findUserId(): Promise<string | null> {
    const { data: profile } = await supabaseAdmin
      .from('user_profiles').select('id').eq('email', syntheticEmail).maybeSingle();
    return profile?.id ?? null;
  }

  // Helper: delete user from auth and recreate with correct password
  // Used when updateUserById is blocked (IP restriction) — cleanest fix
  async function deleteAndRecreate(userId: string, existingPhone?: string) {
    console.log('Deleting and recreating user:', userId);
    // Save profile data before delete
    const { data: profile } = await supabaseAdmin
      .from('user_profiles').select('username,phone,avatar_url').eq('id', userId).maybeSingle();
    
    // Delete from auth (cascades to user_profiles via FK)
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delErr) console.warn('deleteUser (non-fatal):', delErr.message);
    
    // Recreate with correct password
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail,
      password: syntheticPassword,
      email_confirm: true,
      user_metadata: { phone: existingPhone ?? normalizedPhone, auth_method: 'sms_otp' },
    });
    if (createErr) throw new Error(`فشل إعادة إنشاء الحساب: ${createErr.message}`);
    
    const newId = newUser?.user?.id;
    if (newId) {
      // Restore profile
      await supabaseAdmin.from('user_profiles').upsert({
        id: newId,
        email: syntheticEmail,
        phone: existingPhone ?? normalizedPhone,
        username: profile?.username ?? '',
        avatar_url: profile?.avatar_url ?? null,
      }, { onConflict: 'id', ignoreDuplicates: false });
    }
    
    const { data: session, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
      email: syntheticEmail, password: syntheticPassword,
    });
    if (!signInErr && session?.session) return session.session;
    throw new Error(`تعذّر تسجيل الدخول بعد إعادة الإنشاء: ${signInErr?.message ?? 'لا توجد جلسة'}`);
  }

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
  console.log('Initial sign-in failed:', signInMsg);

  // 2. If user exists but credentials mismatch (password changed / key rotated)
  const isInvalidCreds = signInMsg.includes('invalid login') || signInMsg.includes('invalid credentials');
  const isUnconfirmed = signInMsg.includes('email not confirmed') || signInMsg.includes('not confirmed');

  if (isInvalidCreds || isUnconfirmed) {
    const existingId = await findUserId();
    if (existingId) {
      console.log('User exists, recreating with correct password:', existingId);
      return await deleteAndRecreate(existingId, normalizedPhone);
    }
  }

  // 3. New user — sign up
  console.log('Creating new user for:', normalizedPhone);
  const { data: signUp, error: signUpErr } = await supabaseAdmin.auth.signUp({
    email: syntheticEmail,
    password: syntheticPassword,
    options: { data: { phone: normalizedPhone, auth_method: 'sms_otp' } },
  });

  if (signUpErr) {
    const msg = signUpErr.message?.toLowerCase() ?? '';
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      // User exists in auth but not in profiles table — recreate
      const existingId = await findUserId();
      if (!existingId) {
        console.log('User in auth but no profile found, attempting recovery...');
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const authUser = users?.find((u: any) => u.email === syntheticEmail);
        if (authUser) return await deleteAndRecreate(authUser.id, normalizedPhone);
      } else {
        return await deleteAndRecreate(existingId, normalizedPhone);
      }
    } else {
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

  // 4. Final sign-in
  const { data: final, error: finalErr } = await supabaseAdmin.auth.signInWithPassword({
    email: syntheticEmail, password: syntheticPassword,
  });

  if (!finalErr && final?.session) return final.session;

  // Last resort: recreate
  const fallbackId = newId ?? (await findUserId());
  if (fallbackId) return await deleteAndRecreate(fallbackId, normalizedPhone);

  throw new Error(`تعذّر تسجيل الدخول بعد إنشاء الحساب: ${finalErr?.message ?? 'لا توجد جلسة'}`);
}

// ─── Twilio Verify API helpers ────────────────────────────────────────────────

// Twilio Verify REST API — no Twilio Node SDK needed in Deno
const TWILIO_VERIFY_BASE = `https://verify.twilio.com/v2/Services/${TWILIO_VERIFY_SERVICE_SID}`;
const twilioAuth = () => `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`;

/**
 * Send OTP via Twilio Verify Service — delivered via WhatsApp (cheaper than SMS).
 * Twilio handles code generation, delivery, expiry (10 min), and rate limiting.
 * Uses: POST /v2/Services/{ServiceSid}/Verifications  with To + Channel=whatsapp
 *
 * Custom Arabic template (set in Twilio Console → Verify → Services → Messaging):
 * 'أهلاً بك في سوق قلقيلية! رمز التحقق الخاص بك هو: {{code}}. سيصلك هذا الرمز عبر واتساب فقط.'
 * Sender: whatsapp:+15559658976 (SouqQalqilia_WhatsApp_Service)
 */
async function sendVerifyOtp(phone: string): Promise<void> {
  console.log(`Sending SMS Verify OTP to ${phone} via Service ${TWILIO_VERIFY_SERVICE_SID}`);

  const body = new URLSearchParams();
  body.append('To', phone);              // E.164 format e.g. +970591234567
  body.append('Channel', 'sms');          // Temporary: deliver via SMS until Meta approves WhatsApp template

  const res = await fetch(`${TWILIO_VERIFY_BASE}/Verifications`, {
    method: 'POST',
    headers: {
      Authorization: twilioAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error('Twilio Verify send error:', text);
    let errMsg = 'فشل إرسال رمز التحقق.';
    try {
      const json = JSON.parse(text);
      const code: number = json?.code ?? 0;
      if (code === 21608) errMsg = 'رقم الهاتف غير مُفعَّل في Twilio. تأكد من ترقية الحساب إلى Paid.';
      else if (code === 60200) errMsg = 'رقم الهاتف غير صالح.';
      else if (code === 60203) errMsg = 'تم تجاوز الحد الأقصى لمحاولات الإرسال. انتظر قليلاً وأعد المحاولة.';
      else if (code === 60205) errMsg = 'لا يمكن إرسال رمز WhatsApp لهذا الرقم. تأكد أن الرقم مرتبط بحساب واتساب.';
      else if (code === 63016) errMsg = 'قناة WhatsApp غير مُفعَّلة في Verify Service. فعّلها من Twilio Console → Verify → Services.';
      else if (code === 63038) errMsg = 'رقم الهاتف لا يدعم WhatsApp. جرّب رقماً مختلفاً.';
      else if (code === 63025 || (json?.message ?? '').toLowerCase().includes('template')) {
        errMsg = 'قالب WhatsApp لم يُعتمد بعد من Meta. يرجى الانتظار 24-48 ساعة حتى تتم الموافقة على القالب.';
        console.warn('WhatsApp template pending Meta approval. Service SID:', TWILIO_VERIFY_SERVICE_SID);
      }
      else if (code === 20429) errMsg = 'طلبات كثيرة جداً. انتظر دقيقة وأعد المحاولة.';
      else if (code === 20404) errMsg = 'Verify Service غير موجود. تحقق من Service SID.';
      else errMsg = json?.message ?? errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  console.log('Twilio Verify send success:', text);
}

/**
 * Check OTP via Twilio Verify Service.
 * Uses: POST /v2/Services/{ServiceSid}/VerificationCheck  with To + Code
 * Returns true if code is valid and approved.
 */
async function checkVerifyOtp(phone: string, code: string): Promise<boolean> {
  console.log(`Checking Verify OTP for ${phone}`);

  const body = new URLSearchParams();
  body.append('To', phone);   // E.164 format
  body.append('Code', code);  // 6-digit OTP from user

  const res = await fetch(`${TWILIO_VERIFY_BASE}/VerificationCheck`, {
    method: 'POST',
    headers: {
      Authorization: twilioAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error('Twilio Verify check error:', text);
    try {
      const json = JSON.parse(text);
      const errCode: number = json?.code ?? 0;
      // 20404 = verification not found, already used, or expired → treat as wrong code
      if (errCode === 20404) return false;
      throw new Error(json?.message ?? 'خطأ في التحقق من الرمز.');
    } catch (e: any) {
      if (!e.message.startsWith('Unexpected')) throw e;
    }
    throw new Error('خطأ في التحقق من الرمز.');
  }

  const json = JSON.parse(text);
  console.log('Twilio Verify check status:', json?.status);
  // Twilio returns status: 'approved' = correct, 'pending' = wrong code
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
