import { Form, Link, redirect, useActionData } from "react-router";
import type { Route } from "./+types/signup";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

// Server-side action for signup
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;

  const { supabase, headers } = createSupabaseServerClient(request);

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (error) {
    return { error: error.message || "Failed to sign up", headers };
  }

  return redirect("/", { headers });
}

export default function Signup() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="page">
      <Nav />
      <div className="page-body" style={{ maxWidth: 480 }}>
        <div className="section">
          <h1 style={{ fontSize: 22, marginBottom: 6 }}>Create Account</h1>
          <p className="muted" style={{ marginBottom: 12 }}>
            Sign up to submit and review papers.
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
              <label className="label">Full Name</label>
              <input type="text" name="fullName" required className="input" />
            </div>
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
                Sign Up
              </button>
              <Link to="/auth/login" className="btn btn-ghost">
                Already have an account?
              </Link>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
