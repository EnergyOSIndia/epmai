import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import BASE_URL from "../../../BASE_URL";
import {
  authFetch,
  clearTokens,
  extractTokens,
  getAccessToken,
  readApiError,
  setTokens,
} from "@/lib/auth";
import type { AuthState, AuthUser } from "../features/authTypes";

const initialState: AuthState = {
  accessToken: getAccessToken(),
  pendingEmail: null,
  user: null,
  loginLoading: false,
  loginError: null,
  verifyLoading: false,
  verifyError: null,
  resendLoading: false,
  resendError: null,
  meLoading: false,
  meError: null,
  bootstrapped: false,
};

const jsonHeaders = { "Content-Type": "application/json", accept: "application/json" };

// Step 1: email + password. The API emails a login code; no tokens yet.
export const login = createAsyncThunk<
  { email: string; message: string },
  { email: string; password: string },
  { rejectValue: string }
>("auth/login", async ({ email, password }, { rejectWithValue }) => {
  const res = await fetch(`${BASE_URL}auth/login`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return rejectWithValue(await readApiError(res, "Login failed. Check your email and password."));
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const message = typeof body?.message === "string" ? body.message : "A login code has been sent to your email.";
  return { email, message };
});

// Step 2: the emailed code → access + refresh tokens.
export const verifyOtp = createAsyncThunk<
  AuthUser | null,
  { email: string; otp: string },
  { rejectValue: string }
>("auth/verifyOtp", async ({ email, otp }, { rejectWithValue, dispatch }) => {
  const res = await fetch(`${BASE_URL}auth/verify-otp`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email, otp }),
  });
  if (!res.ok) return rejectWithValue(await readApiError(res, "That code didn't work. Try again or resend."));
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const { access, refresh } = extractTokens(body);
  if (!access) return rejectWithValue("Verification succeeded but no access token was returned.");
  setTokens(access, refresh);
  // Load the profile now so the app has the user straight away.
  const me = await dispatch(fetchMe()).unwrap().catch(() => null);
  return me;
});

// Resend a new code for the same login.
export const resendOtp = createAsyncThunk<
  string,
  { email: string },
  { rejectValue: string }
>("auth/resendOtp", async ({ email }, { rejectWithValue }) => {
  const res = await fetch(`${BASE_URL}auth/resend-otp`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email }),
  });
  if (!res.ok) return rejectWithValue(await readApiError(res, "Couldn't resend the code. Try again."));
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return typeof body?.message === "string" ? body.message : "A new code has been sent to your email.";
});

// The logged-in user (requires a valid access token; authFetch handles refresh).
export const fetchMe = createAsyncThunk<
  AuthUser,
  void,
  { rejectValue: string }
>("auth/fetchMe", async (_, { rejectWithValue }) => {
  const res = await authFetch(`${BASE_URL}auth/me`);
  if (!res.ok) return rejectWithValue(await readApiError(res, "Couldn't load your profile."));
  return (await res.json()) as AuthUser;
});

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    logout: (state) => {
      clearTokens();
      state.accessToken = null;
      state.user = null;
      state.pendingEmail = null;
      state.loginError = null;
      state.verifyError = null;
      state.resendError = null;
      state.meError = null;
    },
    setPendingEmail: (state, action: { payload: string | null }) => {
      state.pendingEmail = action.payload;
    },
    // Marks the first-load auth check complete without a /me call (e.g. no token stored).
    markBootstrapped: (state) => {
      state.bootstrapped = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loginLoading = true;
        state.loginError = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loginLoading = false;
        state.pendingEmail = action.payload.email;
      })
      .addCase(login.rejected, (state, action) => {
        state.loginLoading = false;
        state.loginError = action.payload ?? action.error.message ?? "Login failed.";
      });

    builder
      .addCase(verifyOtp.pending, (state) => {
        state.verifyLoading = true;
        state.verifyError = null;
      })
      .addCase(verifyOtp.fulfilled, (state, action) => {
        state.verifyLoading = false;
        state.accessToken = getAccessToken();
        state.user = action.payload;
        state.pendingEmail = null;
        state.bootstrapped = true;
      })
      .addCase(verifyOtp.rejected, (state, action) => {
        state.verifyLoading = false;
        state.verifyError = action.payload ?? action.error.message ?? "Verification failed.";
      });

    builder
      .addCase(resendOtp.pending, (state) => {
        state.resendLoading = true;
        state.resendError = null;
      })
      .addCase(resendOtp.fulfilled, (state) => {
        state.resendLoading = false;
      })
      .addCase(resendOtp.rejected, (state, action) => {
        state.resendLoading = false;
        state.resendError = action.payload ?? action.error.message ?? "Couldn't resend the code.";
      });

    builder
      .addCase(fetchMe.pending, (state) => {
        state.meLoading = true;
        state.meError = null;
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.meLoading = false;
        state.user = action.payload;
        state.accessToken = getAccessToken();
        state.bootstrapped = true;
      })
      .addCase(fetchMe.rejected, (state, action) => {
        state.meLoading = false;
        state.meError = action.payload ?? action.error.message ?? null;
        // Token was invalid/expired and couldn't be refreshed.
        state.accessToken = getAccessToken();
        if (!state.accessToken) state.user = null;
        state.bootstrapped = true;
      });
  },
});

export const { logout, setPendingEmail, markBootstrapped } = authSlice.actions;
export default authSlice.reducer;
