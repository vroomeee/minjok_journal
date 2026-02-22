import {
  Link,
  redirect,
  useFetcher,
  useSearchParams,
  type ActionFunctionArgs,
} from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { buildAuthFeedback, type AuthFeedbackCode } from "~/lib/auth-feedback";

type ForgotPasswordActionData = {
  code?: AuthFeedbackCode;
  error?: string;
  hint?: string;
};

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = (formData.get("email") as string) || "";

  const { supabase, headers } = createSupabaseServerClient(request);
  const origin = new URL(request.url).origin;

  if (!email) {
    return Response.json(
      { code: "unknown", error: "Email is required", hint: "Enter the email used for your account." },
      { status: 400, headers }
    );
  }

  // If the email isn't in our profiles table, bail early with a helpful message.
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!existingProfile) {
    return Response.json(
      {
        code: "account_not_found",
        error: "We could not find an account with that email.",
        hint: "Check for typos, or sign up if you have not created an account yet.",
      },
      { status: 400, headers }
    );
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/auth/reset-password`,
  });

  if (error) {
    const feedback = buildAuthFeedback("forgot_password", error);
    return Response.json(
      feedback,
      { status: 400, headers }
    );
  }

  return redirect("/auth/forgot-password?success=1", { headers });
}

export default function ForgotPassword() {
  const fetcher = useFetcher<ForgotPasswordActionData>();
  const [searchParams] = useSearchParams();

  const success = searchParams.has("success");
  const error = fetcher.data?.error;
  const hint = fetcher.data?.hint;
  const loading = fetcher.state === "submitting";
  const prefilledEmail = searchParams.get("email") || "";

  return (
    <div className="page">
      <Nav />
      <div
        className="page-body"
        style={{
          maxWidth: 520,
          minHeight: "calc(100vh - 140px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="section" style={{ width: "100%" }}>
          {success ? (
            <>
              <h1 style={{ fontSize: 22, marginBottom: 6 }}>Check your email</h1>
              <p className="muted" style={{ marginBottom: 12 }}>
                If that email is registered, you&apos;ll get a link to set a new password. The link
                expires quickly, so use it soon.
              </p>
              <div className="section-compact" style={{ borderColor: "var(--border)" }}>
                <p className="text-sm" style={{ color: "var(--accent)" }}>
                  Didn&apos;t get it? Check spam or request another email.
                </p>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <Link to="/auth/login" className="btn btn-accent">
                  Back to login
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 22, marginBottom: 6 }}>Reset your password</h1>
              <p className="muted" style={{ marginBottom: 12 }}>
                Enter your email and we&apos;ll send you a secure reset link.
              </p>

              {error && (
                <div className="section-compact" style={{ marginBottom: 10 }}>
                  <p className="text-sm" style={{ color: "#f6b8bd" }}>
                    {error}
                  </p>
                  {hint && (
                    <p className="text-sm muted" style={{ marginTop: 6 }}>
                      {hint}
                    </p>
                  )}
                </div>
              )}

              <fetcher.Form method="post" className="list">
                <div>
                  <label className="label" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    className="input"
                    defaultValue={prefilledEmail}
                  />
                </div>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <Link to="/auth/login" className="btn btn-ghost">
                    Back to login
                  </Link>
                  <button type="submit" className="btn btn-accent" disabled={loading}>
                    {loading ? "Sending..." : "Send reset email"}
                  </button>
                </div>
              </fetcher.Form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
