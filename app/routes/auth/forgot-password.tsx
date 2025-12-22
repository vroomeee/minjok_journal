import {
  Link,
  redirect,
  useFetcher,
  useSearchParams,
  type ActionFunctionArgs,
} from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = (formData.get("email") as string) || "";

  const { supabase, headers } = createSupabaseServerClient(request);
  const origin = new URL(request.url).origin;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/auth/reset-password`,
  });

  if (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to send reset email.",
      },
      { status: 400, headers }
    );
  }

  return redirect("/auth/forgot-password?success=1", { headers });
}

export default function ForgotPassword() {
  const fetcher = useFetcher<typeof action>();
  const [searchParams] = useSearchParams();

  const success = searchParams.has("success");
  const error = fetcher.data?.error;
  const loading = fetcher.state === "submitting";

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
