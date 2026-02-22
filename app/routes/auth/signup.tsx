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

type SignupActionData = {
  code?: AuthFeedbackCode;
  error?: string;
  hint?: string;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createSupabaseServerClient(request);

  const url = new URL(request.url);
  const origin = url.origin;

  const formData = await request.formData();
  const email = formData.get("email") as string;
  const fullName = formData.get("full-name") as string;
  const password = formData.get("password") as string;
  const repeatPassword = formData.get("repeat-password") as string;

  // If the email is already registered, bail early with a friendly message.
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile) {
    return Response.json(
      {
        code: "account_exists",
        error: "An account with this email already exists.",
        hint: "Try logging in. If you have not confirmed your email yet, resend the confirmation email.",
      },
      { status: 400, headers }
    );
  }

  if (!fullName) {
    return Response.json(
      { code: "unknown", error: "Full name is required", hint: "Enter your full name to finish signup." },
      { status: 400, headers }
    );
  }

  if (!password) {
    return Response.json(
      { code: "unknown", error: "Password is required", hint: "Choose a password to create your account." },
      { status: 400, headers }
    );
  }

  if (password.length < 8) {
    return Response.json(
      {
        code: "weak_password",
        error: "Password must be at least 8 characters",
        hint: "Use at least 8 characters and include a mix of letters, numbers, and symbols.",
      },
      { status: 400, headers }
    );
  }

  if (password !== repeatPassword) {
    return Response.json(
      { code: "unknown", error: "Passwords do not match", hint: "Re-enter both password fields so they match." },
      { status: 400, headers }
    );
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // This matches the confirm route that exchanges the token, then redirects home.
      emailRedirectTo: `${origin}/auth/confirm?next=/`,
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    const feedback = buildAuthFeedback("signup", error);
    return Response.json(
      feedback,
      { status: 400, headers }
    );
  }

  // Update the profile with the full name
  if (data.user) {
    await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", data.user.id);
  }

  return redirect("/auth/signup?success=1", { headers });
};

export default function Signup() {
  const fetcher = useFetcher<SignupActionData>();
  const [searchParams] = useSearchParams();

  const success = searchParams.has("success");
  const error = fetcher.data?.error;
  const hint = fetcher.data?.hint;
  const code = fetcher.data?.code;
  const loading = fetcher.state === "submitting";
  const submittedEmail = fetcher.formData?.get("email");
  const attemptedEmail = typeof submittedEmail === "string" ? submittedEmail : "";
  const loginHref = attemptedEmail ? `/auth/login?email=${encodeURIComponent(attemptedEmail)}` : "/auth/login";
  const resendHref = attemptedEmail ? `/auth/resend?email=${encodeURIComponent(attemptedEmail)}` : "/auth/resend";

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
              <h1 style={{ fontSize: 22, marginBottom: 6 }}>
                Thanks for signing up!
              </h1>
              <p className="muted" style={{ marginBottom: 12 }}>
                We sent a confirmation link to your inbox. Confirm your email,
                then sign in to continue.
              </p>
              <div
                className="section-compact"
                style={{ borderColor: "var(--border)" }}
              >
                <p className="text-sm" style={{ color: "var(--accent)" }}>
                  Check your email and complete verification to activate your
                  account.
                </p>
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <Link to="/auth/login" className="btn btn-accent">
                  Go to login
                </Link>
                <Link to="/auth/resend" className="btn btn-ghost">
                  Need a new confirmation email?
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 22, marginBottom: 6 }}>Create Account</h1>
              <p className="muted" style={{ marginBottom: 12 }}>
                Sign up to submit and review papers.
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
                  {code === "account_exists" && (
                    <div className="row" style={{ marginTop: 8 }}>
                      <Link to={loginHref} className="btn btn-ghost">
                        Go to login
                      </Link>
                      <Link to={resendHref} className="btn btn-ghost">
                        Resend confirmation email
                      </Link>
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
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="full-name">
                    Full Name
                  </label>
                  <input
                    id="full-name"
                    name="full-name"
                    type="text"
                    placeholder="Your full name"
                    required
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="repeat-password">
                    Repeat password
                  </label>
                  <input
                    id="repeat-password"
                    name="repeat-password"
                    type="password"
                    required
                    className="input"
                  />
                </div>
                <div
                  className="row"
                  style={{ justifyContent: "space-between" }}
                >
                  <Link to="/auth/login" className="btn btn-ghost">
                    Already have an account?
                  </Link>
                  <button
                    type="submit"
                    className="btn btn-accent"
                    disabled={loading}
                  >
                    {loading ? "Creating..." : "Sign Up"}
                  </button>
                </div>
              </fetcher.Form>
              <div className="row" style={{ marginTop: 12 }}>
                <Link to="/auth/resend" className="btn btn-ghost">
                  Need a new confirmation email?
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
