import { Form, redirect, useActionData, useLoaderData, Link } from "react-router";
import type { Route } from "./+types/new";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return { user, profile };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;

  if (!title || !content) return { error: "Title and content are required" };

  const { error } = await supabase.from("qna_questions").insert({
    title,
    content,
    author_id: user.id,
  });

  if (error) return { error: "Failed to post question" };

  return redirect("/qna");
}

export default function NewQuestion() {
  const { user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />
      <div className="page-body" style={{ maxWidth: 800 }}>
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Ask a Question</h1>
              <p className="muted" style={{ margin: 0 }}>
                Share your question with mentors and peers.
              </p>
            </div>
            <Link to="/qna" className="btn btn-ghost">
              Back to Q&A
            </Link>
          </div>

          {actionData?.error && (
            <div className="section-compact subtle" style={{ marginBottom: 12 }}>
              <p className="text-sm" style={{ color: "#f6b8bd" }}>
                {actionData.error}
              </p>
            </div>
          )}

          <Form method="post" className="list">
            <div>
              <label className="label">Title</label>
              <input name="title" required className="input" placeholder="Summarize your question" />
            </div>
            <div>
              <label className="label">Details</label>
              <textarea
                name="content"
                rows={4}
                required
                className="textarea"
                placeholder="Add context, what you've tried, and what you need help with."
              />
            </div>
            <div className="row">
              <button type="submit" className="btn btn-accent">
                Post Question
              </button>
              <Link to="/qna" className="btn btn-ghost">
                Cancel
              </Link>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
