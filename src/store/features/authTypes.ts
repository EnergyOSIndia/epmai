// The auth endpoints return generic JSON objects, so the user shape is open-ended. We surface the
// fields the API commonly sends and keep the rest in `raw` for display on the profile page.
export interface AuthUser {
  id?: string | number;
  email?: string;
  name?: string;
  full_name?: string;
  role?: string;
  is_active?: boolean;
  is_admin?: boolean;
  created_at?: string;
  [key: string]: unknown;
}

export interface AuthState {
  // Tokens (mirrored from localStorage; lib/auth.ts is the source of truth).
  accessToken: string | null;
  // The email awaiting OTP verification (step 1 → step 2 of login).
  pendingEmail: string | null;
  user: AuthUser | null;

  loginLoading: boolean;
  loginError: string | null;

  verifyLoading: boolean;
  verifyError: string | null;

  resendLoading: boolean;
  resendError: string | null;

  meLoading: boolean;
  meError: string | null;
  // Whether the initial "am I logged in?" check has finished (gates the route guard on first paint).
  bootstrapped: boolean;
}
