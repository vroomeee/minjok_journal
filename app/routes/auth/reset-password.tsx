import { Link, redirect, useFetcher, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return redirect("/auth/login", { headers });
  }

  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const password = (formData.get("password") as string) || "";
  const repeat = (formData.get("repeatPassword") as string) || "";

  if (!password) {
    return Response.json({ error: "Password is required" }, { status: 400 });
  }

  if (password !== repeat) {
    return Response.json({ error: "Passwords do not match." }, { status: 400 });
  }

  const { supabase, headers } = createSupabaseServerClient(request);
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return Response.json(
      { error: error.message || "Could not reset password." },
      { status: 400, headers }
    );
  }

  return redirect("/auth/login?reset=1", { headers });
}

export default function ResetPassword() {
  const fetcher = useFetcher<typeof action>();
  const error = fetcher.data?.error;
  const loading = fetcher.state === "submitting";

  return (
    <div className="page">
      <Nav />
      <div className="page-body" style={{ maxWidth: 520 }}>
        <div className="section">
          <h1 style={{ fontSize: 22, marginBottom: 6 }}>Reset your password</h1>
          <p className="muted" style={{ marginBottom: 12 }}>
            Enter a new password for your account.
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
              <label className="label" htmlFor="password">
                New password
              </label>
              <input id="password" name="password" type="password" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="repeatPassword">
                Repeat password
              </label>
              <input
                id="repeatPassword"
                name="repeatPassword"
                type="password"
                required
                className="input"
              />
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <Link to="/auth/login" className="btn btn-ghost">
                Back to login
              </Link>
              <button type="submit" className="btn btn-accent" disabled={loading}>
                {loading ? "Saving..." : "Save new password"}
              </button>
            </div>
          </fetcher.Form>
        </div>
      </div>
    </div>
  );
}
