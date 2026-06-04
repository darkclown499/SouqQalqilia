import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const FIREBASE_WEB_API_KEY = Deno.env.get('FIREBASE_WEB_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Verify a Firebase ID token using the Firebase Auth REST API.
 * Returns the decoded user info (uid, phoneNumber) or throws.
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

  if (!user?.localId) {
    throw new Error('Could not retrieve user from Firebase token.');
  }
  if (!user?.phoneNumber) {
    throw new Error('No phone number associated with this Firebase account.');
  }

  return { uid: user.localId, phoneNumber: user.phoneNumber };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, idToken } = await req.json();

    // ── VERIFY FIREBASE TOKEN & CREATE / SIGN IN SUPABASE USER ──
    if (action === 'verify_firebase') {
      if (!idToken) {
        return new Response(JSON.stringify({ error: 'Firebase ID token is required.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 1. Verify the Firebase token
      const { phoneNumber } = await verifyFirebaseToken(idToken);

      // 2. Derive synthetic Supabase credentials from phone
      const normalizedPhone = phoneNumber.replace(/[^0-9]/g, '');
      const syntheticEmail = `phone_${normalizedPhone}@sms.souqqalqilya.local`;
      const syntheticPassword = `SMS_${normalizedPhone}_SQ_2024!`;

      // 3. Check if a Supabase user already exists for this phone
      const { data: profileData } = await supabaseAdmin
        .from('user_profiles')
        .select('id')
        .eq('email', syntheticEmail)
        .maybeSingle();

      if (!profileData?.id) {
        // New user — use direct REST API to bypass ipNotInner restriction on admin JS client
        const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            email: syntheticEmail,
            password: syntheticPassword,
            email_confirm: true,
            phone: phoneNumber,
            user_metadata: { phone: phoneNumber, auth_method: 'firebase_phone' },
          }),
        });

        const createJson = await createRes.json();

        if (!createRes.ok) {
          const msg: string = createJson?.msg ?? createJson?.message ?? createJson?.error ?? '';
          // If user already exists (race condition), continue to sign-in
          if (!msg.toLowerCase().includes('already') && !msg.toLowerCase().includes('registered')) {
            console.error('REST createUser error:', createJson);
            throw new Error(`Failed to create user: ${msg}`);
          }
        } else if (createJson?.id) {
          // Store phone in profile
          await supabaseAdmin
            .from('user_profiles')
            .upsert({
              id: createJson.id,
              email: syntheticEmail,
              phone: phoneNumber,
              username: '',
            }, { onConflict: 'id', ignoreDuplicates: false })
            .then(() => {}).catch(() => {});
        }
      } else {
        // Existing user — ensure email is confirmed via REST API
        const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${profileData.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ email_confirm: true }),
        });
        if (!updateRes.ok) console.warn('Could not confirm email for existing user');
      }

      // 4. Sign in to get a Supabase session
      const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
        email: syntheticEmail,
        password: syntheticPassword,
      });

      if (sessionError || !sessionData.session) {
        throw new Error(`Session error: ${sessionError?.message}`);
      }

      console.log(`Firebase phone auth success for ${phoneNumber}`);
      return new Response(JSON.stringify({
        success: true,
        session: sessionData.session,
        user: sessionData.user,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
