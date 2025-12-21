import {
  Link,
  useLoaderData,
  Form,
  redirect,
  useActionData,
  useNavigation,
  useRevalidator,
} from "react-router";
import type { Route } from "./+types/qna";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { useEffect, useRef } from "react";

// Server-side loader to fetch Q&A questions and replies
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);

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

  const { data: questions } = await supabase
    .from("qna_questions")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        username,
        full_name,
        role_type
      )
    `
    )
    .order("created_at", { ascending: false });

  const questionIds = questions?.map((q) => q.id) || [];
  let replies: any[] = [];
  if (questionIds.length > 0) {
    const { data: repliesData } = await supabase
      .from("qna_replies")
      .select(
        `
        *,
        author:profiles!author_id (
          id,
          username,
          full_name,
          role_type
        )
      `
      )
      .in("question_id", questionIds)
      .order("created_at", { ascending: true });

    replies = repliesData || [];
  }

  return { questions: questions || [], replies, user, profile };
}

// Server-side action - create reply, delete question or reply
export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  const { data: profile } = await supabase
    .from("profiles")
    .select("admin_type, role_type")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.admin_type === "admin";

  if (intent === "replyToQuestion") {
    if (!profile || profile.role_type !== "mentor") {
      return { error: "Only mentors can reply to questions" };
    }
    const questionId = formData.get("questionId") as string;
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
    const questionId = formData.get("questionId") as string;
    const { data: question } = await supabase
      .from("qna_questions")
      .select("author_id")
      .eq("id", questionId)
      .single();
    if (!question || (question.author_id !== user.id && !isAdmin)) {
      return { error: "Unauthorized to delete this question" };
    }
    const { error } = await supabase.from("qna_questions").delete().eq("id", questionId);
    if (error) return { error: "Failed to delete question" };
    return { success: true };
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
    const { error } = await supabase.from("qna_replies").delete().eq("id", replyId);
    if (error) return { error: "Failed to delete reply" };
    return { success: true };
  }

  return null;
}

export default function QnA() {
  const questionFormRef = useRef<HTMLFormElement>(null);
  const navigation = useNavigation();
  const revalidator = useRevalidator();

  const { questions, replies, user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  useEffect(() => {
    if (actionData?.success && navigation.state === "idle") {
      questionFormRef.current?.reset();
      revalidator.revalidate();
    }
  }, [actionData, navigation.state, revalidator]);

  const isMentor = profile?.role_type === "mentor";
  const isAdmin = profile?.admin_type === "admin";

  const truncateTitle = (title: string) =>
    title.length > 20 ? `${title.slice(0, 20)}...` : title;

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />
      <div className="page-body">
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Q&A</h1>
              <p className="muted" style={{ margin: 0 }}>
                Ask questions and get mentor feedback.
              </p>
            </div>
          </div>
        </div>

        {actionData?.error && (
          <div className="section-compact subtle">
            <p className="text-sm" style={{ color: "#f6b8bd" }}>
              {actionData.error}
            </p>
          </div>
        )}

        {user && (
          <div className="section">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 18, margin: 0 }}>Ask a Question</h2>
              <Link to="/qna/new" className="btn btn-accent">
                Go to Ask Page
              </Link>
            </div>
          </div>
        )}

        <div className="card-grid">
          {questions.map((question) => {
            const questionReplies = replies.filter((r) => r.question_id === question.id);

            return (
              <div key={question.id} className="section-compact">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{truncateTitle(question.title)}</h3>
                  <div className="row" style={{ gap: 6 }}>
                    {(user?.id === question.author_id || isAdmin) && (
                      <>
                        <Link to={`/qna/${question.id}/edit`} className="btn btn-ghost">
                          Edit
                        </Link>
                        <Form method="post">
                          <input type="hidden" name="intent" value="deleteQuestion" />
                          <input type="hidden" name="questionId" value={question.id} />
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
                      </>
                    )}
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 13, margin: "4px 0" }}>
                  Asked by {question.author?.username || question.author?.full_name} •{" "}
                  {new Date(question.created_at).toLocaleDateString()}
                </div>
                <p className="muted" style={{ marginTop: 6 }}>
                  {question.content}
                </p>

                {questionReplies.length > 0 && (
                  <div className="divider" />
                )}

                {questionReplies.length > 0 && (
                  <div className="list">
                    {questionReplies.map((reply) => (
                      <div key={reply.id} className="section-compact" style={{ background: "var(--surface-2)" }}>
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <div className="row" style={{ gap: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>
                              {reply.author?.username || reply.author?.full_name}
                            </span>
                            {reply.author && (
                              <RoleBadge role={reply.author.role_type} className="text-xs py-0 px-1" />
                            )}
                            <span className="meta">
                              {new Date(reply.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {(user?.id === reply.author_id || isAdmin) && (
                            <div className="row" style={{ gap: 6 }}>
                              <Link to={`/qna/reply/${reply.id}/edit`} className="btn btn-ghost">
                                Edit
                              </Link>
                              <Form method="post">
                                <input type="hidden" name="intent" value="deleteReply" />
                                <input type="hidden" name="replyId" value={reply.id} />
                                <button
                                  type="submit"
                                  className="btn btn-danger"
                                  onClick={(e) =>
                                    !confirm("Delete this reply?") && e.preventDefault()
                                  }
                                >
                                  Delete
                                </button>
                              </Form>
                            </div>
                          )}
                        </div>
                        <p className="muted" style={{ margin: 0 }}>
                          {reply.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {isMentor && (
                  <details style={{ marginTop: 10 }}>
                    <summary className="nav-link" style={{ padding: 0 }}>
                      Answer this question
                    </summary>
                    <Form method="post" style={{ marginTop: 8 }}>
                      <input type="hidden" name="intent" value="replyToQuestion" />
                      <input type="hidden" name="questionId" value={question.id} />
                      <textarea name="content" rows={3} required className="textarea" />
                      <button type="submit" className="btn btn-accent" style={{ marginTop: 6 }}>
                        Submit Answer
                      </button>
                    </Form>
                  </details>
                )}
              </div>
            );
          })}

          {questions.length === 0 && (
            <div className="section-compact">
              <p className="muted" style={{ margin: 0 }}>
                No questions yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
