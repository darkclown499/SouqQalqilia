import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// خدمة إرسال الرسائل القصيرة (بدلاً من Twilio)
const SMS_API_URL = 'http://hotsms.ps/sendbulksms.php';
const SMS_USER = 'SoqQalqilya';
const SMS_PASS = '4878338';
const SMS_SENDER = 'SoqQalqilya';

// عميل Supabase بصلاحيات كاملة
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── دوال مساعدة ──────────────────────────────────────────────────────────────

/** تحقق من صيغة رقم الهاتف (E.164) مع السماح بـ +970 أو +972 */
function validatePhone(phone: string): string | null {
  const stripped = phone.replace(/[\s\-().]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(stripped)) return null;
  return stripped;
}

/** توليد رمز OTP عشوائي مكون من 6 أرقام */
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** إرسال رسالة SMS عبر خدمة hotsms.ps */
async function sendSms(phone: string, otp: string): Promise<void> {
  const text = `رمز التحقق الخاص بك في تطبيق سوق قلقيلية هو: ${otp}`;
  const url = `${SMS_API_URL}?user_name=${SMS_USER}&user_pass=${SMS_PASS}&sender=${SMS_SENDER}&mobile=${encodeURIComponent(phone)}&type=2&text=${encodeURIComponent(text)}`;

  const response = await fetch(url);
  const responseText = await response.text();

  if (!response.ok) {
    console.error('SMS API error:', response.status, responseText);
    throw new Error('فشل إرسال الرسالة القصيرة. تأكد من اتصال الإنترنت وحاول مجدداً.');
  }

  // يمكن فحص استجابة الخادم إذا كانت تحتوي على خطأ (حسب وثائق الخدمة)
  if (responseText.toLowerCase().includes('error') || responseText.toLowerCase().includes('fail')) {
    console.error('SMS API returned error:', responseText);
    throw new Error('فشل إرسال الرسالة القصيرة. يرجى المحاولة لاحقاً.');
  }

  console.log('SMS sent successfully to', phone);
}

/** تأكيد البريد الإلكتروني للمستخدم (دالة مساعدة) */
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

/** إنشاء أو تسجيل دخول مستخدم بناءً على رقم الهاتف (نفس المنطق السابق) */
async function getOrCreatePhoneUser(phoneNumber: string) {
  const normalizedPhone = phoneNumber.replace(/[^0-9]/g, '');
  const syntheticEmail = `phone_${normalizedPhone}@sms.souqqalqilya.local`;

  // اشتقاق كلمة مرور آمنة باستخدام HMAC (مثل السابق)
  const keyData = new TextEncoder().encode(SUPABASE_SERVICE_ROLE_KEY);
  const msgData = new TextEncoder().encode(`sms_auth:${normalizedPhone}`);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const syntheticPassword = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);

  // محاولة تسجيل الدخول
  let { data: existing, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
    email: syntheticEmail,
    password: syntheticPassword,
  });

  if (!signInErr && existing?.session) {
    console.log('Existing user signed in:', normalizedPhone);
    return existing.session;
  }

  // إذا فشل، نحاول إنشاء مستخدم جديد
  console.log('Creating new user for:', normalizedPhone);
  const { data: signUp, error: signUpErr } = await supabaseAdmin.auth.signUp({
    email: syntheticEmail,
    password: syntheticPassword,
    options: { data: { phone: normalizedPhone, auth_method: 'sms_otp' } },
  });

  if (signUpErr) {
    // إذا كان المستخدم موجوداً مسبقاً، نحاول حذفه وإعادة إنشائه (حل للمشاكل)
    if (signUpErr.message?.toLowerCase().includes('already registered')) {
      // حذف المستخدم القديم
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 50 });
      const authUser = users?.find((u: any) => u.email === syntheticEmail);
      if (authUser) {
        await supabaseAdmin.auth.admin.deleteUser(authUser.id);
        console.log('Deleted existing user:', authUser.id);
        // إعادة المحاولة
        const { data: retrySignUp, error: retryErr } = await supabaseAdmin.auth.signUp({
          email: syntheticEmail,
          password: syntheticPassword,
          options: { data: { phone: normalizedPhone, auth_method: 'sms_otp' } },
        });
        if (retryErr) throw new Error(`فشل إنشاء الحساب: ${retryErr.message}`);
        const newId = retrySignUp?.user?.id;
        if (newId) {
          await confirmUserEmail(newId);
          await supabaseAdmin.from('user_profiles').upsert({
            id: newId,
            email: syntheticEmail,
            phone: normalizedPhone,
            username: '',
          }, { onConflict: 'id', ignoreDuplicates: false });
        }
      } else {
        throw new Error('تعذر العثور على المستخدم الموجود مسبقاً.');
      }
    } else {
      throw new Error(`فشل إنشاء الحساب: ${signUpErr.message}`);
    }
  } else {
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
  }

  // تسجيل الدخول مجدداً
  const { data: final, error: finalErr } = await supabaseAdmin.auth.signInWithPassword({
    email: syntheticEmail,
    password: syntheticPassword,
  });
  if (finalErr) throw new Error(`تعذّر تسجيل الدخول بعد إنشاء الحساب: ${finalErr.message}`);
  return final.session;
}

// ─── المعالج الرئيسي ──────────────────────────────────────────────────────────

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
      const phone = validatePhone(rawPhone);
      if (!phone) {
        return new Response(JSON.stringify({ error: 'رقم الهاتف غير صالح. يجب أن يكون بصيغة دولية مثل +970591234567' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // توليد OTP
      const otp = generateOtp();
      // صلاحية 10 دقائق
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      // تخزين OTP في قاعدة البيانات
      const { error: insertError } = await supabaseAdmin
        .from('otp_verifications')
        .upsert({
          phone: phone,
          code: otp,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        }, { onConflict: 'phone', ignoreDuplicates: false });

      if (insertError) {
        console.error('Failed to store OTP:', insertError);
        return new Response(JSON.stringify({ error: 'خطأ في تخزين الرمز. حاول مجدداً.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // إرسال SMS
      try {
        await sendSms(phone, otp);
      } catch (smsError: any) {
        console.error('SMS sending failed:', smsError);
        return new Response(JSON.stringify({ error: smsError.message || 'فشل إرسال الرسالة القصيرة.' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`OTP sent to ${phone}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── ACTION: verify_otp ────────────────────────────────────────────────────
    if (action === 'verify_otp') {
      const rawPhone: string = body.phone ?? '';
      const otp: string = (body.otp ?? '').trim();
      const phone = validatePhone(rawPhone);
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

      // التحقق من OTP من قاعدة البيانات
      const { data: record, error: findError } = await supabaseAdmin
        .from('otp_verifications')
        .select('code, expires_at')
        .eq('phone', phone)
        .maybeSingle();

      if (findError || !record) {
        console.error('OTP record not found:', findError);
        return new Response(JSON.stringify({ error: 'الرمز غير صحيح أو منتهي الصلاحية.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // التحقق من صلاحية الرمز
      if (record.code !== otp) {
        return new Response(JSON.stringify({ error: 'الرمز غير صحيح.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const now = new Date();
      const expires = new Date(record.expires_at);
      if (now > expires) {
        return new Response(JSON.stringify({ error: 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // حذف السجل بعد الاستخدام (مرة واحدة)
      await supabaseAdmin.from('otp_verifications').delete().eq('phone', phone);

      // إنشاء جلسة المستخدم
      const session = await getOrCreatePhoneUser(phone);

      console.log(`Phone auth success for ${phone}`);
      return new Response(JSON.stringify({ success: true, session, user: session.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── ACTION: verify_firebase (مهمل) ──────────────────────────────────────
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