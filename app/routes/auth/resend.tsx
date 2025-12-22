import { Link, useFetcher } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createSupabaseServerClient(request);
  const url = new URL(request.url);
  const origin = url.origin;

  const formData = await request.formData();
  const email = formData.get("email") as string;

  if (!email) {
    return Response.json({ error: "Email is required" }, { status: 400, headers });
  }

  // If the email isn't in our profiles table, bail early.
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!existingProfile) {
    return Response.json(
      { error: "We couldn’t find an account with that email. Try signing up instead." },
      { status: 400, headers }
    );
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/` },
  });

  if (error) {
    const msg =
      error.message?.toLowerCase().includes("already confirmed") ||
      error.message?.toLowerCase().includes("already verified")
        ? "This email is already confirmed. You can log in now."
        : error.message || "Failed to resend confirmation email";
    return Response.json(
      { error: msg },
      { status: 400, headers }
    );
  }

  return Response.json({ resent: true }, { headers });
};

export default function ResendConfirmationEmail() {
  const fetcher = useFetcher<typeof action>();
  const loading = fetcher.state === "submitting";
  const error = fetcher.data?.error;
  const resent = fetcher.data?.resent;

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
