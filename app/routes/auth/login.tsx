import { Link, useFetcher, redirect, useSearchParams, type ActionFunctionArgs } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createSupabaseServerClient(request);

  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to sign in" },
      { status: 400, headers }
    );
  }

  return redirect("/", { headers });
};

export default function Login() {
  const fetcher = useFetcher<typeof action>();
  const [searchParams] = useSearchParams();
  const error = fetcher.data?.error;
  const loading = fetcher.state === "submitting";
  const resetComplete = searchParams.has("reset");

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
            </div>
          )}

          <fetcher.Form method="post" className="list">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input id="email" type="email" name="email" required className="input" />
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
