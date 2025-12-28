import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useFetcher,
  useRevalidator,
} from "react-router";
import type { Route } from "./+types/$questionId";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { UserLink } from "~/components/user-link";
import { useEffect, useRef } from "react";

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { questionId } = params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  const { data: question, error } = await supabase
    .from("qna_questions")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        email,
        full_name,
        role_type
      )
    `
    )
    .eq("id", questionId)
    .single();

  if (error || !question) {
    throw new Response("Question not found", { status: 404 });
  }

  const { data: replies } = await supabase
    .from("qna_replies")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        email,
        full_name,
        role_type
      )
    `
    )
    .eq("question_id", questionId)
    .order("created_at", { ascending: true });

  return { user, profile, question, replies: replies || [] };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { questionId } = params;

  const formData = await request.formData();
  const intent = formData.get("intent");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_type")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role_type === "admin";

  if (intent === "replyToQuestion") {
    if (!profile || (profile.role_type !== "mentor" && !isAdmin)) {
      return { error: "Only mentors or admins can reply" };
    }
    const content = formData.get("content") as string;
    if (!content) return { error: "Reply content is required" };
    const { error } = await supabase.from("qna_replies").insert({
      question_id: questionId,
      author_id: user.id,
      content,
    });
    if (error) return { error: "Failed to post reply" };
    return { success: true };
  }

  if (intent === "deleteQuestion") {
    const { data: question } = await supabase
      .from("qna_questions")
      .select("author_id")
      .eq("id", questionId)
      .single();
    if (!question || (question.author_id !== user.id && !isAdmin)) {
      return { error: "Unauthorized to delete this question" };
    }
    const { error } = await supabase
      .from("qna_questions")
      .delete()
      .eq("id", questionId);
    if (error) return { error: "Failed to delete question" };
    return redirect("/qna");
  }

  if (intent === "deleteReply") {
    const replyId = formData.get("replyId") as string;
    const { data: reply } = await supabase
      .from("qna_replies")
      .select("author_id")
      .eq("id", replyId)
      .single();
    if (!reply || (reply.author_id !== user.id && !isAdmin)) {
      return { error: "Unauthorized to delete this reply" };
    }
    const { error } = await supabase
      .from("qna_replies")
      .delete()
      .eq("id", replyId);
    if (error) return { error: "Failed to delete reply" };
    return { success: true };
  }

  if (intent === "editReply") {
    const replyId = formData.get("replyId") as string;
    const content = formData.get("content") as string;
    if (!replyId) return { error: "Reply not found" };
    if (!content) return { error: "Reply content is required" };

    const { data: reply } = await supabase
      .from("qna_replies")
      .select("author_id")
      .eq("id", replyId)
      .single();
    if (!reply || (reply.author_id !== user.id && !isAdmin)) {
      return { error: "Unauthorized to edit this reply" };
    }

    const { error } = await supabase
      .from("qna_replies")
      .update({ content })
      .eq("id", replyId);
    if (error) return { error: "Failed to update reply" };
    return { success: true };
  }

  return null;
}

export default function QnaDetail() {
  const { user, profile, question, replies } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const replyFetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const replyFormRef = useRef<HTMLFormElement>(null);
  const editReplyFormsRef = useRef<HTMLFormElement[]>([]);
  const handledReplySuccess = useRef(false);
  const rowsForBody = (body: string) =>
    Math.min(14, Math.max(3, Math.ceil((body?.length || 0) / 60)));

  const isMentor = profile?.role_type === "mentor";
  const isAdmin = profile?.role_type === "admin";

  useEffect(() => {
    if (replyFetcher.state === "submitting") {
      handledReplySuccess.current = false;
    }
    if (
      !handledReplySuccess.current &&
      replyFetcher.data?.success &&
      replyFetcher.state === "idle"
    ) {
      replyFormRef.current?.reset();
      editReplyFormsRef.current.forEach((f) => f?.reset());
      revalidator.revalidate();
      handledReplySuccess.current = true;
    }
  }, [replyFetcher.state, replyFetcher.data, revalidator]);

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />
      <div className="page-body">
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>{question.title}</h1>
              <div className="row" style={{ gap: 8, marginTop: 4 }}>
                <span className="muted">
                  Asked by <UserLink user={question.author} />
                </span>
                {question.author && (
                  <RoleBadge role={question.author.role_type} />
                )}
                <span className="muted">
                  {new Date(question.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {user?.id === question.author_id && (
                <Link to={`/qna/${question.id}/edit`} className="btn btn-ghost">
                  Edit
                </Link>
              )}
              {(user?.id === question.author_id || isAdmin) && (
                <Form method="post">
                  <input type="hidden" name="intent" value="deleteQuestion" />
                  <button
                    type="submit"
                    className="btn btn-danger"
                    onClick={(e) =>
                      !confirm("Delete this question?") && e.preventDefault()
                    }
                  >
                    Delete
                  </button>
                </Form>
              )}
            </div>
          </div>
          <p
            className="muted"
            style={{ marginTop: 10, whiteSpace: "pre-wrap" }}
          >
            {question.content}
          </p>
        </div>

        {actionData?.error && (
          <div className="section-compact subtle">
            <p className="text-sm" style={{ color: "#f6b8bd" }}>
              {actionData.error}
            </p>
          </div>
        )}

        <div className="section">
          <h2 style={{ fontSize: 18, marginBottom: 10 }}>Replies</h2>

          {(isMentor || isAdmin) && (
            <replyFetcher.Form
              method="post"
              className="list"
              style={{ marginBottom: 12 }}
              ref={replyFormRef}
              onSubmit={(e) => {
                handledReplySuccess.current = false;
              }}
            >
              <input type="hidden" name="intent" value="replyToQuestion" />
              <textarea
                name="content"
                rows={3}
                required
                className="textarea"
                placeholder="Answer this question..."
              />
              <button
                type="submit"
                className="btn btn-accent"
                style={{ marginTop: 8 }}
                disabled={replyFetcher.state === "submitting"}
              >
                {replyFetcher.state === "submitting"
                  ? "Posting..."
                  : "Post Reply"}
              </button>
            </replyFetcher.Form>
          )}

          <div className="card-grid">
            {replies.map((reply) => (
              <div key={reply.id} className="section-compact">
                <div
                  className="row"
                  style={{ justifyContent: "space-between" }}
                >
                  <div className="row" style={{ gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      <UserLink user={reply.author} />
                    </span>
                    {reply.author && (
                      <RoleBadge
                        role={reply.author.role_type}
                        className="text-xs py-0 px-1"
                      />
                    )}
                    <span className="meta">
                      {new Date(reply.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {(user?.id === reply.author_id || isAdmin) && (
                    <div className="row" style={{ gap: 6 }}>
                      <Link
                        to={`/qna/reply/${reply.id}/edit`}
                        className="btn btn-ghost"
                      >
                        Edit
                      </Link>
                      <replyFetcher.Form
                        method="post"
                        ref={(form) => {
                          if (
                            form &&
                            !editReplyFormsRef.current.includes(form)
                          ) {
                            editReplyFormsRef.current.push(form);
                          }
                        }}
                      >
                        <input
                          type="hidden"
                          name="intent"
                          value="deleteReply"
                        />
                        <input type="hidden" name="replyId" value={reply.id} />
                        <button
                          type="submit"
                          className="btn btn-danger"
                          onClick={(e) =>
                            !confirm("Delete this reply?") && e.preventDefault()
                          }
                          disabled={replyFetcher.state === "submitting"}
                        >
                          Delete
                        </button>
                      </replyFetcher.Form>
                    </div>
                  )}
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  {reply.content}
                </p>
                {(user?.id === reply.author_id || isAdmin) && (
                  <details style={{ marginTop: 6 }}>
                    <summary className="nav-link" style={{ padding: 0 }}>
                      Edit reply
                    </summary>
                    <replyFetcher.Form
                      method="post"
                      className="list"
                      style={{ marginTop: 6 }}
                      ref={(form) => {
                        if (form && !editReplyFormsRef.current.includes(form)) {
                          editReplyFormsRef.current.push(form);
                        }
                      }}
                    >
                      <input type="hidden" name="intent" value="editReply" />
                      <input type="hidden" name="replyId" value={reply.id} />
                      <textarea
                        name="content"
                        defaultValue={reply.content}
                        rows={rowsForBody(reply.content)}
                        required
                        className="textarea"
                        style={{ width: "100%" }}
                      />
                      <button
                        type="submit"
                        className="btn btn-accent"
                        style={{ marginTop: 4 }}
                        disabled={replyFetcher.state === "submitting"}
                      >
                        {replyFetcher.state === "submitting"
                          ? "Saving..."
                          : "Save"}
                      </button>
                    </replyFetcher.Form>
                  </details>
                )}
              </div>
            ))}

            {replies.length === 0 && (
              <p className="muted" style={{ margin: 0 }}>
                No replies yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
