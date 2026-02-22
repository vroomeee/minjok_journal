import { Link, useFetcher, useSearchParams } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { buildAuthFeedback, type AuthFeedbackCode } from "~/lib/auth-feedback";

type ResendActionData = {
  code?: AuthFeedbackCode;
  error?: string;
  hint?: string;
  resent?: boolean;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createSupabaseServerClient(request);
  const url = new URL(request.url);
  const origin = url.origin;

  const formData = await request.formData();
  const email = formData.get("email") as string;

  if (!email) {
    return Response.json(
      { code: "unknown", error: "Email is required", hint: "Enter the email address used during signup." },
      { status: 400, headers }
    );
  }

  // If the email isn't in our profiles table, bail early.
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
        hint: "Check for typos, or sign up if you do not have an account yet.",
      },
      { status: 400, headers }
    );
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/` },
  });

  if (error) {
    const feedback = buildAuthFeedback("resend", error);
    return Response.json(
      feedback,
      { status: 400, headers }
    );
  }

  return Response.json({ resent: true }, { headers });
};

export default function ResendConfirmationEmail() {
  const fetcher = useFetcher<ResendActionData>();
  const [searchParams] = useSearchParams();
  const loading = fetcher.state === "submitting";
  const error = fetcher.data?.error;
  const hint = fetcher.data?.hint;
  const code = fetcher.data?.code;
  const resent = fetcher.data?.resent;
  const prefilledEmail = searchParams.get("email") || "";
  const submittedEmail = fetcher.formData?.get("email");
  const attemptedEmail = typeof submittedEmail === "string" ? submittedEmail : prefilledEmail;
  const loginHref = attemptedEmail
    ? `/auth/login?email=${encodeURIComponent(attemptedEmail)}`
    : "/auth/login";

  return (
    <div className="page">
      <Nav />
      <div className="page-body" style={{ maxWidth: 520 }}>
        <div className="section">
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Resend Confirmation Email</h1>
          <p className="muted" style={{ marginBottom: 12 }}>
            Enter your signup email to get a fresh confirmation link.
          </p>

          {error && (
            <div className="section-compact subtle" style={{ marginBottom: 10 }}>
              <p className="text-sm" style={{ color: "#f6b8bd" }}>
                {error}
              </p>
              {hint && (
                <p className="text-sm muted" style={{ marginTop: 6 }}>
                  {hint}
                </p>
              )}
              {code === "already_confirmed" && (
                <div className="row" style={{ marginTop: 8 }}>
                  <Link to={loginHref} className="btn btn-ghost">
                    Go to login
                  </Link>
                </div>
              )}
            </div>
          )}

          {resent && (
            <div className="section-compact" style={{ marginBottom: 10 }}>
              <p className="text-sm" style={{ color: "var(--accent)" }}>
                Confirmation email sent. Check your inbox.
              </p>
            </div>
          )}

          <fetcher.Form method="post" className="list">
            <div>
              <label className="label" htmlFor="resend-email">
                Email
              </label>
              <input
                id="resend-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                className="input"
                defaultValue={prefilledEmail}
              />
            </div>
            <div className="row" style={{ marginTop: 8, justifyContent: "space-between" }}>
              <Link to="/auth/signup" className="btn btn-ghost">
                Back to signup
              </Link>
              <button type="submit" className="btn btn-accent" disabled={loading}>
                {loading ? "Sending..." : "Send email"}
              </button>
            </div>
          </fetcher.Form>
        </div>
      </div>
    </div>
  );
}

