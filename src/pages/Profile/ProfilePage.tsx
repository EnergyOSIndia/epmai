import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchMe, logout } from "@/store/slice/authSlice";
import type { AuthUser } from "@/store/features/authTypes";

// Fields we show as labelled rows; everything else goes in "Other details".
const KNOWN: { key: keyof AuthUser; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "full_name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "role", label: "Role" },
  { key: "id", label: "User ID" },
  { key: "is_active", label: "Active" },
  { key: "is_admin", label: "Administrator" },
  { key: "created_at", label: "Member since" },
];

function displayValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function initials(user: AuthUser | null): string {
  const base = (user?.name || user?.full_name || user?.email || "?") as string;
  const parts = base.replace(/@.*/, "").split(/[.\s_-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

export function ProfilePage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, meLoading, meError } = useAppSelector((s) => s.auth);

  useEffect(() => {
    if (!user) dispatch(fetchMe());
  }, [user, dispatch]);

  const onLogout = () => {
    dispatch(logout());
    navigate({ to: "/login" });
  };

  const extras = user
    ? Object.entries(user).filter(([k]) => !KNOWN.some((f) => f.key === k) && !k.startsWith("_"))
    : [];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <Button variant="outline" size="sm" onClick={() => dispatch(fetchMe())} disabled={meLoading}>
          {meLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {meError && !user && (
        <p role="alert" className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{meError}</p>
      )}

      {meLoading && !user ? (
        <div className="grid place-items-center rounded-xl border bg-card py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : user ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center gap-4 border-b bg-muted/20 p-6">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
              {initials(user)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">
                {displayValue(user.name || user.full_name || user.email)}
              </div>
              <div className="truncate text-sm text-muted-foreground">{displayValue(user.email)}</div>
              {user.role && (
                <span className="mt-1 inline-block rounded bg-accent px-1.5 py-0.5 text-[11px] font-semibold capitalize text-foreground">
                  {String(user.role)}
                </span>
              )}
            </div>
          </div>

          <dl className="divide-y">
            {KNOWN.filter((f) => user[f.key] !== undefined).map((f) => (
              <div key={String(f.key)} className="flex items-center justify-between gap-4 px-6 py-3">
                <dt className="text-sm text-muted-foreground">{f.label}</dt>
                <dd className="text-sm font-medium">{displayValue(user[f.key])}</dd>
              </div>
            ))}
            {extras.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 px-6 py-3">
                <dt className="text-sm capitalize text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                <dd className="max-w-[60%] truncate text-sm font-medium">{displayValue(v)}</dd>
              </div>
            ))}
          </dl>

          <div className="border-t p-4">
            <Button variant="destructive" onClick={onLogout} className="w-full sm:w-auto">
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
