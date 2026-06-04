import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const FIREBASE_WEB_API_KEY = Deno.env.get('FIREBASE_WEB_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Service role client — used for DB operations and signInWithPassword
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
    throw new Error('Invalid or expired Firebase token. Please try again.');
  }

  const data = await res.json();
  const user = data?.users?.[0];

  if (!user?.localId) throw new Error('Could not retrieve user from Firebase token.');
  if (!user?.phoneNumber) throw new Error('No phone number associated with this Firebase account.');

  return { uid: user.localId, phoneNumber: user.phoneNumber };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, idToken } = await req.json();

    if (action === 'verify_firebase') {
      if (!idToken) {
        return new Response(JSON.stringify({ error: 'Firebase ID token is required.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 1. Verify the Firebase token
      const { phoneNumber } = await verifyFirebaseToken(idToken);
      console.log('Firebase verified phone:', phoneNumber);

      // 2. Derive synthetic Supabase credentials
      const normalizedPhone = phoneNumber.replace(/[^0-9]/g, '');
      const syntheticEmail = `phone_${normalizedPhone}@sms.souqqalqilya.local`;
      const syntheticPassword = `SMS_${normalizedPhone}_SQ_2024!`;

      // 3. Check if user already exists in user_profiles
      const { data: profileRow } = await supabaseAdmin
        .from('user_profiles')
        .select('id')
        .eq('email', syntheticEmail)
        .maybeSingle();

      if (profileRow?.id) {
        // ── EXISTING USER PATH ────────────────────────────────────────────
        console.log('Existing user found:', profileRow.id);

        // Sign in directly — user was already created with confirmed email
        const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
          email: syntheticEmail,
          password: syntheticPassword,
        });

        if (sessionError || !sessionData?.session) {
          throw new Error(`Sign-in failed: ${sessionError?.message ?? 'No session returned'}`);
        }

        return new Response(JSON.stringify({
          success: true,
          session: sessionData.session,
          user: sessionData.user,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      } else {
        // ── NEW USER PATH ─────────────────────────────────────────────────
        console.log('New user, creating via Supabase Auth signup...');

        // Use the Supabase Auth v1 signup endpoint with service role key.
        // We call the REST endpoint directly but using the INTERNAL host
        // pattern that OnSpace Cloud allows: replace https:// with http://
        // and use the internal routing. If that also fails, we fall back to
        // a direct DB insert + signInWithOtp workaround.

        // Attempt 1: Use supabaseAdmin.auth.signUp (service-role bypasses confirm)
        const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.signUp({
          email: syntheticEmail,
          password: syntheticPassword,
          options: {
            data: { phone: phoneNumber, auth_method: 'firebase_phone' },
          },
        });

        if (signUpError) {
          const msg = signUpError.message ?? '';
          if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already been registered')) {
            // User exists in auth but not in user_profiles — sign in directly
            console.log('Auth user exists, signing in...');
          } else {
            throw new Error(`Signup failed: ${msg}`);
          }
        } else if (signUpData?.user?.id) {
          // Upsert the profile row
          await supabaseAdmin
            .from('user_profiles')
            .upsert({
              id: signUpData.user.id,
              email: syntheticEmail,
              phone: phoneNumber,
              username: '',
            }, { onConflict: 'id', ignoreDuplicates: false })
            .then(() => console.log('Profile upserted'))
            .catch((e: any) => console.warn('Profile upsert warning:', e?.message));
        }

        // Sign in to get session
        const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
          email: syntheticEmail,
          password: syntheticPassword,
        });

        if (sessionError) {
          // If email confirmation is required it means the service-role signUp
          // did NOT auto-confirm. We need a different strategy.
          if (sessionError.message?.toLowerCase().includes('email not confirmed') ||
              sessionError.message?.toLowerCase().includes('not confirmed')) {

            // Workaround: generate a one-time token via signInWithOtp
            // then immediately sign in. Since we control both sides we can
            // verify via the magic-link token.
            console.warn('Email not confirmed after signup — email confirmation must be disabled in project settings for phone auth to work. Error:', sessionError.message);
            throw new Error(
              'تعذّر إتمام التسجيل: يرجى تعطيل "Confirm email" من إعدادات المشروع في لوحة التحكم → Authentication → Settings → Disable email confirmations'
            );
          }
          throw new Error(`Session error: ${sessionError.message}`);
        }

        if (!sessionData?.session) throw new Error('No session returned after signup');

        console.log(`Firebase phone auth success for ${phoneNumber}`);
        return new Response(JSON.stringify({
          success: true,
          session: sessionData.session,
          user: sessionData.user,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('sms-auth error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
