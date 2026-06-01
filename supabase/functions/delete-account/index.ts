import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Extract JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Create a regular client to verify the user's identity via JWT
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify the token is valid and get the user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      console.error('Auth error:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Deleting account for user: ${user.id}`);

    // Use admin client to delete the user from auth
    // This triggers CASCADE deletion on user_profiles → ads, messages, favorites, etc.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Try admin SDK first, fall back to REST API
    const { error: adminErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    
    if (adminErr) {
      console.log('Admin SDK failed, trying REST API:', adminErr.message);
      // Fall back to REST API with service role
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      const deleteRes = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${user.id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!deleteRes.ok) {
        const errText = await deleteRes.text();
        console.error('REST API delete error:', errText);
        // Last resort: delete from user_profiles only (triggers CASCADE)
        const { error: profileErr } = await supabaseAdmin
          .from('user_profiles')
          .delete()
          .eq('id', user.id);
        if (profileErr) {
          console.error('Profile delete error:', profileErr.message);
          return new Response(
            JSON.stringify({ error: `Failed to delete account: ${profileErr.message}` }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.log(`Profile deleted (auth record may remain): ${user.id}`);
        return new Response(
          JSON.stringify({ success: true, note: 'profile_deleted' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    console.log(`Account deleted successfully: ${user.id}`);
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('Unexpected error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message ?? 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
