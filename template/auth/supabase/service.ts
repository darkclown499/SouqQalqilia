// @ts-nocheck
import { getSupabaseClient } from '@/template';

class SupabaseAuthService {
  async sendOTP(email: string) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) throw error;
    return { success: true };
  }

  async signUpWithPassword(email: string, password: string, metadata: Record<string, any> = {}) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata }
    });
    if (error) throw error;
    return { user: data.user };
  }

  async signInWithPassword(email: string, password: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { user: data.user };
  }

  async verifyOTPAndLogin(email: string, otp: string, options?: { password?: string }) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    if (error) throw error;
    
    if (options?.password) {
      await supabase.auth.updateUser({ password: options.password });
    }
    return { user: data.user };
  }

  async logout() {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { success: true };
  }

  async getCurrentUser() {
    const supabase = getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user || null;
  }

  async refreshSession() {
    const supabase = getSupabaseClient();
    await supabase.auth.refreshSession();
  }

  onAuthStateChange(callback: (user: any) => void) {
    const supabase = getSupabaseClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      callback(session?.user || null);
    });
    return subscription;
  }

  async signInWithGoogle() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) throw error;
    return { url: data.url };
  }
}

export const authService = new SupabaseAuthService();