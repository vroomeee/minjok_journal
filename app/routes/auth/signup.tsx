import {
  Link,
  redirect,
  useFetcher,
  useSearchParams,
  type ActionFunctionArgs,
} from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createSupabaseServerClient(request);

  const url = new URL(request.url);
  const origin = url.origin;

  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const repeatPassword = formData.get("repeat-password") as string;

  if (!password) {
    return Response.json({ error: "Password is required" }, { status: 400, headers });
  }

  if (password !== repeatPassword) {
    return Response.json({ error: "Passwords do not match" }, { status: 400, headers });
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // This matches the confirm route that exchanges the token, then redirects home.
      emailRedirectTo: `${origin}/auth/confirm?next=/`,
    },
  });

  if (error) {
    return Response.json(
      { error: error.message || "Failed to sign up" },
      { status: 400, headers }
    );
  }

  return redirect("/auth/signup?success=1", { headers });
};

export default function Signup() {
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
