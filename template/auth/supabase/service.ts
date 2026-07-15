// template/auth/supabase/service.ts

import { getSupabaseClient } from '@/template';
import { AuthError, Session, User } from '@supabase/supabase-js';
import { AuthResult, SendOTPResult, LogoutResult, SignUpResult, GoogleSignInResult } from '../types';

// ── Helper: convert Supabase errors to friendly messages ──────────────────
function formatAuthError(error: AuthError | string): string {
  const message = typeof error === 'string' ? error : error.message;
  if (message.includes('Invalid login credentials')) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }
  if (message.includes('Email not confirmed')) {
    return 'يرجى تأكيد بريدك الإلكتروني أولاً.';
  }
  if (message.includes('User already registered')) {
    return 'هذا البريد الإلكتروني مسجل بالفعل.';
  }
  if (message.includes('Password should be at least 6 characters')) {
    return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.';
  }
  if (message.includes('Invalid email')) {
    return 'البريد الإلكتروني غير صحيح.';
  }
  if (message.includes('rate limit') || message.includes('RequestRateLimitReached')) {
    return 'تم تجاوز عدد المحاولات. يرجى الانتظار دقيقة ثم المحاولة مجدداً.';
  }
  return message;
}

// ── Auth Service ─────────────────────────────────────────────────────────────
export const authService = {
  // ── Send OTP for email verification ──────────────────────────────────────
  async sendOTP(email: string): Promise<SendOTPResult> {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: true,
        },
      });
      if (error) {
        return { error: formatAuthError(error) };
      }
      return { error: null };
    } catch (error: any) {
      return { error: formatAuthError(error.message || 'Failed to send OTP') };
    }
  },

  // ── Verify OTP and login/register ────────────────────────────────────────
  async verifyOTPAndLogin(email: string, otp: string, options?: { password?: string }): Promise<AuthResult> {
    try {
      const supabase = getSupabaseClient();
      // First, verify the OTP
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp.trim(),
        type: 'email',
      });

      if (verifyError) {
        return { error: formatAuthError(verifyError), user: null };
      }

      // If password was provided during registration, update the user's password
      if (options?.password && verifyData.user) {
        const { error: updateError } = await supabase.auth.updateUser({
          password: options.password,
        });
        if (updateError) {
          // Non-fatal – user is still logged in
          console.warn('Password update failed:', updateError);
        }
      }

      // Fetch user profile to check if username exists
      let user = verifyData.user;
      if (user) {
        try {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('username')
            .eq('id', user.id)
            .maybeSingle();

          // If no profile exists, create one
          if (!profile) {
            await supabase.from('user_profiles').insert({
              id: user.id,
              email: user.email,
              username: user.email?.split('@')[0] || '',
            });
          }
        } catch (err) {
          console.warn('Profile fetch/creation error:', err);
        }
      }

      return { error: null, user };
    } catch (error: any) {
      return { error: formatAuthError(error.message || 'Verification failed'), user: null };
    }
  },

  // ── Sign up with email and password ──────────────────────────────────────
  async signUpWithPassword(email: string, password: string, metadata?: Record<string, any>): Promise<SignUpResult> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: metadata,
        },
      });

      if (error) {
        return { error: formatAuthError(error), user: null };
      }

      // Create user profile
      if (data.user) {
        try {
          await supabase.from('user_profiles').insert({
            id: data.user.id,
            email: data.user.email,
            username: metadata?.username || data.user.email?.split('@')[0] || '',
          });
        } catch (err) {
          console.warn('Profile creation error:', err);
        }
      }

      return { error: null, user: data.user };
    } catch (error: any) {
      return { error: formatAuthError(error.message || 'Registration failed'), user: null };
    }
  },

  // ── Sign in with email and password ──────────────────────────────────────
  async signInWithPassword(email: string, password: string): Promise<AuthResult> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        return { error: formatAuthError(error), user: null };
      }

      return { error: null, user: data.user };
    } catch (error: any) {
      return { error: formatAuthError(error.message || 'Login failed'), user: null };
    }
  },

  // ── Sign in with Google ──────────────────────────────────────────────────
  async signInWithGoogle(): Promise<GoogleSignInResult> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: Platform.OS === 'web'
            ? (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '')
            : 'souqqalqilya://auth/callback',
          queryParams: {
            prompt: 'select_account',
            access_type: 'offline',
          },
        },
      });

      if (error) {
        return { error: formatAuthError(error) };
      }

      return { url: data.url, error: null };
    } catch (error: any) {
      return { error: formatAuthError(error.message || 'Google sign-in failed') };
    }
  },

  // ── Logout ────────────────────────────────────────────────────────────────
  async logout(): Promise<LogoutResult> {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        return { error: formatAuthError(error) };
      }
      return { error: null };
    } catch (error: any) {
      return { error: formatAuthError(error.message || 'Logout failed') };
    }
  },

  // ── Refresh session ──────────────────────────────────────────────────────
  async refreshSession(): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn('Refresh session error:', error);
      }
      // If session is refreshed successfully, data.session contains the new session
    } catch (error) {
      console.warn('Refresh session error:', error);
    }
  },

  // ── Get current session ─────────────────────────────────────────────────
  async getSession(): Promise<{ session: Session | null; error: string | null }> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        return { session: null, error: formatAuthError(error) };
      }
      return { session: data.session, error: null };
    } catch (error: any) {
      return { session: null, error: formatAuthError(error.message || 'Failed to get session') };
    }
  },

  // ── Get current user ─────────────────────────────────────────────────────
  async getUser(): Promise<{ user: User | null; error: string | null }> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        return { user: null, error: formatAuthError(error) };
      }
      return { user: data.user, error: null };
    } catch (error: any) {
      return { user: null, error: formatAuthError(error.message || 'Failed to get user') };
    }
  },

  // ── Reset password ──────────────────────────────────────────────────────
  async resetPassword(email: string): Promise<{ error: string | null }> {
    try {
      const supabase = getSupabaseClient();
      const redirectTo = Platform.OS === 'web'
        ? (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '')
        : 'souqqalqilya://auth/callback';
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
      if (error) {
        return { error: formatAuthError(error) };
      }
      return { error: null };
    } catch (error: any) {
      return { error: formatAuthError(error.message || 'Failed to send reset link') };
    }
  },
};

// ── Export for backward compatibility ──────────────────────────────────────
export default authService;