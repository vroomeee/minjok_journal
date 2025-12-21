import { Form, Link, redirect, useActionData } from "react-router";
import type { Route } from "./+types/login";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { supabase, headers } = createSupabaseServerClient(request);
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message || "Failed to sign in", headers };
  }

  return redirect("/", { headers });
}

export default function Login() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="page">
      <Nav />
      <div className="page-body" style={{ maxWidth: 480 }}>
        <div className="section">
          <h1 style={{ fontSize: 22, marginBottom: 6 }}>Sign In</h1>
          <p className="muted" style={{ marginBottom: 12 }}>
            Access your account.
          </p>

          {actionData?.error && (
            <div className="section-compact subtle" style={{ marginBottom: 10 }}>
              <p className="text-sm" style={{ color: "#f6b8bd" }}>
                {actionData.error}
              </p>
            </div>
          )}

          <Form method="post" className="list">
            <div>
              <label className="label">Email</label>
              <input type="email" name="email" required className="input" />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" name="password" required className="input" />
            </div>
            <div className="row">
              <button type="submit" className="btn btn-accent">
                Sign In
              </button>
              <Link to="/auth/signup" className="btn btn-ghost">
                Create account
              </Link>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
