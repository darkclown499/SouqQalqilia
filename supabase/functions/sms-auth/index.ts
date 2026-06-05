import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const FIREBASE_WEB_API_KEY = Deno.env.get('FIREBASE_WEB_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Service role client
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Verify a Firebase ID token using the Firebase Auth REST API.
 */
async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; phoneNumber: string }> {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Firebase token verification failed:', text);
    throw new Error('رمز Firebase غير صالح أو منتهي الصلاحية. يرجى المحاولة مجدداً.');
  }

  const data = await res.json();
  const user = data?.users?.[0];

  if (!user?.localId) throw new Error('تعذّر استرداد بيانات المستخدم من Firebase.');
  if (!user?.phoneNumber) throw new Error('لا يوجد رقم هاتف مرتبط بهذا الحساب.');

  return { uid: user.localId, phoneNumber: user.phoneNumber };
}

/**
 * Confirm user email via direct SQL RPC (bypasses all admin IP restrictions).
 * Falls back gracefully if the RPC also fails.
 */
async function confirmUserEmail(userId: string): Promise<void> {
  // Primary: direct SQL via SECURITY DEFINER function (not affected by IP restrictions)
  try {
    const { error: rpcError } = await supabaseAdmin.rpc('confirm_user_email', { user_id: userId });
    if (!rpcError) {
      console.log('Email confirmed via RPC for:', userId);
      return;
    }
    console.warn('RPC confirm warning:', rpcError.message);
  } catch (rpcEx: any) {
    console.warn('RPC confirm exception:', rpcEx?.message);
  }

  // Fallback: try admin.updateUserById (may fail with ipNotInner on some plans)
  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    if (error) console.warn('updateUserById warning (non-fatal):', error.message);
    else console.log('Email confirmed via updateUserById for:', userId);
  } catch (adminEx: any) {
    console.warn('updateUserById exception (non-fatal):', adminEx?.message);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, idToken } = await req.json();

    if (action === 'verify_firebase') {
      if (!idToken) {
        return new Response(JSON.stringify({ error: 'Firebase ID token مطلوب.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 1. Verify the Firebase token and extract phone number
      const { phoneNumber } = await verifyFirebaseToken(idToken);
      console.log('Firebase verified phone:', phoneNumber);

      // 2. Derive synthetic Supabase credentials
      const normalizedPhone = phoneNumber.replace(/[^0-9]/g, '');
      const syntheticEmail = `phone_${normalizedPhone}@sms.souqqalqilya.local`;
      const syntheticPassword = `SMS_${normalizedPhone}_SQ_2024!`;

      // 3. Try to sign in first (handles existing users)
      const { data: existingSession, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: syntheticEmail,
        password: syntheticPassword,
      });

      if (!signInError && existingSession?.session) {
        // ── EXISTING CONFIRMED USER ─────────────────────────────────────
        console.log('Existing user signed in successfully');
        return new Response(JSON.stringify({
          success: true,
          session: existingSession.session,
          user: existingSession.user,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Sign-in failed — could be: user doesn't exist, OR email not confirmed
      const signInMsg = signInError?.message?.toLowerCase() ?? '';
      const isEmailNotConfirmed = signInMsg.includes('email not confirmed') || signInMsg.includes('not confirmed');
      const isInvalidCreds = signInMsg.includes('invalid login credentials') || signInMsg.includes('invalid_credentials');

      if (isEmailNotConfirmed) {
        // ── USER EXISTS BUT EMAIL NOT CONFIRMED ─────────────────────────
        console.log('User exists but email not confirmed — confirming via SQL RPC...');

        // Use SQL to find the user ID by email directly (avoids blocked listUsers admin API)
        const { data: profileData } = await supabaseAdmin
          .from('user_profiles')
          .select('id')
          .eq('email', syntheticEmail)
          .maybeSingle();

        const existingUserId = profileData?.id;

        if (existingUserId) {
          console.log('Found user via profile table, confirming...', existingUserId);
          await confirmUserEmail(existingUserId);

          // Retry sign-in after confirmation
          const { data: retrySession, error: retryError } = await supabaseAdmin.auth.signInWithPassword({
            email: syntheticEmail,
            password: syntheticPassword,
          });

          if (retryError || !retrySession?.session) {
            throw new Error(`فشل تسجيل الدخول بعد التأكيد: ${retryError?.message ?? 'لا توجد جلسة'}`);
          }

          return new Response(JSON.stringify({
            success: true,
            session: retrySession.session,
            user: retrySession.user,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else {
          // Profile not found — treat as new user, fall through to signup
          console.log('No profile found for unconfirmed user, will re-signup...');
        }
      }

      if (!isInvalidCreds && !isEmailNotConfirmed) {
        // Unexpected sign-in error
        throw new Error(`خطأ في تسجيل الدخول: ${signInError?.message}`);
      }

      // ── NEW USER PATH ─────────────────────────────────────────────────
      console.log('New user — creating account...');

      const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.signUp({
        email: syntheticEmail,
        password: syntheticPassword,
        options: {
          data: { phone: phoneNumber, auth_method: 'firebase_phone' },
        },
      });

      if (signUpError) {
        const msg = signUpError.message ?? '';
        const alreadyExists = msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already been registered');
        if (!alreadyExists) {
          throw new Error(`فشل إنشاء الحساب: ${msg}`);
        }
        // Already registered — treat as unconfirmed, try listUsers approach
      }

      const newUserId = signUpData?.user?.id;

      if (newUserId) {
        console.log('User created, confirming email for:', newUserId);

        // Confirm email using admin.updateUserById
        await confirmUserEmail(newUserId);

        // Upsert profile row
        const { error: profileErr } = await supabaseAdmin
          .from('user_profiles')
          .upsert({
            id: newUserId,
            email: syntheticEmail,
            phone: phoneNumber,
            username: '',
          }, { onConflict: 'id', ignoreDuplicates: false });

        if (profileErr) console.warn('Profile upsert warning:', profileErr.message);
      }

      // Sign in after creation + confirmation
      const { data: finalSession, error: finalError } = await supabaseAdmin.auth.signInWithPassword({
        email: syntheticEmail,
        password: syntheticPassword,
      });

      if (finalError || !finalSession?.session) {
        // Last resort: find user via profile table and confirm
        console.log('Final sign-in failed, attempting profile-based fallback...');
        const { data: profileFallback } = await supabaseAdmin
          .from('user_profiles')
          .select('id')
          .eq('email', syntheticEmail)
          .maybeSingle();

        if (profileFallback?.id) {
          await confirmUserEmail(profileFallback.id);

          const { data: lastTry, error: lastErr } = await supabaseAdmin.auth.signInWithPassword({
            email: syntheticEmail,
            password: syntheticPassword,
          });

          if (lastErr || !lastTry?.session) {
            throw new Error(`تعذّر تسجيل الدخول: ${lastErr?.message ?? 'لا توجد جلسة'}`);
          }

          return new Response(JSON.stringify({
            success: true,
            session: lastTry.session,
            user: lastTry.user,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        throw new Error(`تعذّر تسجيل الدخول بعد إنشاء الحساب: ${finalError?.message ?? 'لا توجد جلسة'}`);
      }

      console.log(`Firebase phone auth success for ${phoneNumber}`);
      return new Response(JSON.stringify({
        success: true,
        session: finalSession.session,
        user: finalSession.user,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
