import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout, resendOtp, verifyOtp } from "@/store/slice/authSlice";
import { AuthLayout } from "./AuthLayout";

const OTP_LEN = 6;
const RESEND_COOLDOWN = 30; // seconds

export function VerifyOtpPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { pendingEmail, verifyLoading, verifyError, resendLoading, resendError, accessToken } =
    useAppSelector((s) => s.auth);

  const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(""));
  // A code was just sent by /auth/login, so the resend starts on cooldown.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // No pending login → go back to the login page. Already signed in → go home.
  useEffect(() => {
    if (accessToken) navigate({ to: "/" });
    else if (!pendingEmail) navigate({ to: "/login" });
  }, [pendingEmail, accessToken, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const code = digits.join("");

  const submit = async (value: string) => {
    if (value.length !== OTP_LEN || !pendingEmail) return;
    const result = await dispatch(verifyOtp({ email: pendingEmail, otp: value }));
    if (verifyOtp.fulfilled.match(result)) {
      toast.success("Signed in");
      navigate({ to: "/" });
    } else {
      setDigits(Array(OTP_LEN).fill(""));
      inputs.current[0]?.focus();
    }
  };

  const setDigit = (i: number, v: string) => {
    const only = v.replace(/\D/g, "");
    if (!only) {
      setDigits((d) => { const n = [...d]; n[i] = ""; return n; });
      return;
    }
    // Support pasting the whole code into any box.
    if (only.length > 1) {
      const next = only.slice(0, OTP_LEN).split("");
      const filled = Array(OTP_LEN).fill("").map((_, idx) => next[idx] ?? "");
      setDigits(filled);
      const last = Math.min(next.length, OTP_LEN) - 1;
      inputs.current[last]?.focus();
      if (filled.join("").length === OTP_LEN) submit(filled.join(""));
      return;
    }
    setDigits((d) => {
      const n = [...d];
      n[i] = only;
      if (n.join("").length === OTP_LEN) submit(n.join(""));
      return n;
    });
    if (i < OTP_LEN - 1) inputs.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < OTP_LEN - 1) inputs.current[i + 1]?.focus();
  };

  const onResend = async () => {
    if (!pendingEmail || cooldown > 0) return;
    const result = await dispatch(resendOtp({ email: pendingEmail }));
    if (resendOtp.fulfilled.match(result)) {
      toast.success(result.payload);
      setCooldown(RESEND_COOLDOWN);
      setDigits(Array(OTP_LEN).fill(""));
      inputs.current[0]?.focus();
    }
  };

  const onBack = () => {
    dispatch(logout());
    navigate({ to: "/login" });
  };

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={<>We sent a {OTP_LEN}-digit code to <span className="font-medium text-foreground">{pendingEmail}</span>.</>}
      footer={
        <button onClick={onBack} className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Use a different account
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex justify-center gap-2" onPaste={(e) => { e.preventDefault(); setDigit(0, e.clipboardData.getData("text")); }}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              aria-label={`Digit ${i + 1}`}
              autoFocus={i === 0}
              className="h-12 w-11 rounded-md border border-input bg-transparent text-center text-lg font-semibold shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              disabled={verifyLoading}
            />
          ))}
        </div>

        {(verifyError || resendError) && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {verifyError || resendError}
          </p>
        )}

        <Button className="w-full" disabled={verifyLoading || code.length !== OTP_LEN} onClick={() => submit(code)}>
          {verifyLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {verifyLoading ? "Verifying…" : "Verify & sign in"}
        </Button>

        <div className="text-center text-sm text-muted-foreground">
          Didn&apos;t get the code?{" "}
          <button
            onClick={onResend}
            disabled={cooldown > 0 || resendLoading}
            className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          >
            {resendLoading ? "Resending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
