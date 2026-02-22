import { Link, useFetcher, redirect, useSearchParams, type ActionFunctionArgs } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { buildAuthFeedback, type AuthFeedbackCode } from "~/lib/auth-feedback";

type LoginActionData = {
  code?: AuthFeedbackCode;
  error?: string;
  hint?: string;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createSupabaseServerClient(request);

  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email) {
    return Response.json(
      { code: "unknown", error: "Email is required", hint: "Enter the email used for your account." },
      { status: 400, headers }
    );
  }

  if (!password) {
    return Response.json(
      { code: "unknown", error: "Password is required", hint: "Enter your account password to continue." },
      { status: 400, headers }
    );
  }

  // If the email isn't in our profiles table, show a friendly message.
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!existingProfile) {
    return Response.json(
      {
        code: "account_not_found",
        error: "No account found with that email.",
        hint: "Check for typos, or create a new account if you have not signed up yet.",
      },
      { status: 400, headers }
    );
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const feedback = buildAuthFeedback("login", error);
    return Response.json(
      feedback,
      { status: 400, headers }
    );
  }

  return redirect("/", { headers });
};

export default function Login() {
  const fetcher = useFetcher<LoginActionData>();
  const [searchParams] = useSearchParams();
  const error = fetcher.data?.error;
  const hint = fetcher.data?.hint;
  const code = fetcher.data?.code;
  const loading = fetcher.state === "submitting";
  const resetComplete = searchParams.has("reset");
  const prefilledEmail = searchParams.get("email") || "";
  const submittedEmail = fetcher.formData?.get("email");
  const attemptedEmail = typeof submittedEmail === "string" ? submittedEmail : prefilledEmail;
  const resendHref = attemptedEmail
    ? `/auth/resend?email=${encodeURIComponent(attemptedEmail)}`
    : "/auth/resend";
  const forgotPasswordHref = attemptedEmail
    ? `/auth/forgot-password?email=${encodeURIComponent(attemptedEmail)}`
    : "/auth/forgot-password";

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
          <h1 style={{ fontSize: 22, marginBottom: 6 }}>Sign In</h1>
          <p className="muted" style={{ marginBottom: 12 }}>
            Access your account to submit and review papers.
          </p>

          {resetComplete && (
            <div className="section-compact" style={{ borderColor: "var(--border)", marginBottom: 12 }}>
              <p className="text-sm" style={{ color: "var(--accent)" }}>
                Password updated. You can sign in with your new credentials.
              </p>
            </div>
          )}

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
              {(code === "email_not_confirmed" ||
                code === "invalid_credentials" ||
                code === "account_not_found") && (
                <div className="row" style={{ marginTop: 8 }}>
                  {code === "email_not_confirmed" && (
                    <Link to={resendHref} className="btn btn-ghost">
                      Resend confirmation email
                    </Link>
                  )}
                  {code === "invalid_credentials" && (
                    <Link to={forgotPasswordHref} className="btn btn-ghost">
                      Reset password
                    </Link>
                  )}
                  {code === "account_not_found" && (
                    <Link to="/auth/signup" className="btn btn-ghost">
                      Create account
                    </Link>
                  )}
                </div>
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
                type="email"
                name="email"
                required
                className="input"
                defaultValue={prefilledEmail}
              />
            </div>
            <div>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                <label className="label" htmlFor="password">
                  Password
                </label>
                <Link to="/auth/forgot-password" className="muted" style={{ fontSize: 13 }}>
                  Forgot password?
                </Link>
              </div>
              <input id="password" type="password" name="password" required className="input" />
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <Link to="/auth/signup" className="btn btn-ghost">
                Create account
              </Link>
              <button type="submit" className="btn btn-accent" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </div>
          </fetcher.Form>
        </div>
      </div>
    </div>
  );
}
