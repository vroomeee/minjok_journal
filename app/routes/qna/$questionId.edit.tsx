import React from "react";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  Link,
} from "react-router";
import type { Route } from "./+types/$questionId.edit";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

const panelStyle: React.CSSProperties = {
  background: "var(--surface)",
  color: "var(--text)",
  border: `1px solid var(--border)`,
  borderRadius: 10,
  boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 600,
  color: "var(--muted)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: `1px solid var(--border)`,
  background: "var(--surface-2)",
  color: "var(--text)",
};

const buttonPrimary: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "var(--accent)",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};

const buttonGhost: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: `1px solid var(--border)`,
  background: "var(--surface-2)",
  color: "var(--text)",
  fontWeight: 600,
  cursor: "pointer",
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { questionId } = params;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role_type === "admin";

  const { data: question, error } = await supabase
    .from("qna_questions")
    .select("*")
    .eq("id", questionId)
    .single();

  if (error || !question) {
    throw new Response("Question not found", { status: 404 });
  }

  if (question.author_id !== user.id && !isAdmin) {
    throw new Response("Unauthorized", { status: 403 });
  }

  return { question, user, profile };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { questionId } = params;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_type")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role_type === "admin";

  const { data: question } = await supabase
    .from("qna_questions")
    .select("author_id")
    .eq("id", questionId)
    .single();

  if (!question || (question.author_id !== user.id && !isAdmin)) {
    return { error: "Unauthorized" };
  }

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;

  if (!title || !content) {
    return { error: "Title and content are required" };
  }

  const { error } = await supabase
    .from("qna_questions")
    .update({ title, content })
    .eq("id", questionId);

  if (error) {
    return { error: "Failed to update question" };
  }

  return redirect("/qna");
}

export default function EditQnaQuestion() {
  const { question, user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="page" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <Nav user={user} profile={profile || undefined} />

      <div className="page-body" style={{ maxWidth: 960, margin: "0 auto", paddingTop: 24 }}>
        <div className="row" style={{ marginBottom: 12, gap: 10, alignItems: "center" }}>
          <Link to="/qna" className="btn btn-ghost">
            ← Back to Q&A
          </Link>
          <span className="muted text-sm">Edit question</span>
        </div>

        <div style={{ ...panelStyle, padding: 24 }}>
          <h1 style={{ margin: "0 0 12px", fontSize: 20 }}>Edit question</h1>

          {actionData?.error && (
            <div
              style={{
                background: "rgba(255,67,86,0.1)",
                border: "1px solid rgba(255,67,86,0.3)",
                color: "#ff4356",
                padding: 12,
                borderRadius: 8,
                marginBottom: 12,
              }}
            >
              {actionData.error}
            </div>
          )}

          <Form method="post" className="column" style={{ gap: 14 }}>
            <div>
              <label htmlFor="title" style={labelStyle}>
                Title
              </label>
              <input
                type="text"
                id="title"
                name="title"
                defaultValue={question.title}
                required
                style={inputStyle}
              />
            </div>

            <div>
              <label htmlFor="content" style={labelStyle}>
                Content
              </label>
              <textarea
                id="content"
                name="content"
                rows={8}
                defaultValue={question.content}
                required
                style={{ ...inputStyle, minHeight: 180, resize: "vertical" }}
              />
            </div>

            <div className="row" style={{ gap: 10, justifyContent: "flex-end" }}>
              <Link to="/qna" style={buttonGhost}>
                Cancel
              </Link>
              <button type="submit" style={buttonPrimary}>
                Save changes
              </button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}
