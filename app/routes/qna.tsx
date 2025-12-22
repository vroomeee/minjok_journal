import { Link, useLoaderData, Form } from "react-router";
import type { Route } from "./+types/qna";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { UserLink } from "~/components/user-link";

// Loader for Q&A list (titles only)
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";

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

  let query = supabase
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
    .order("created_at", { ascending: false });

  if (search) {
    query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
  }

  const { data: questions } = await query;

  return { questions: questions || [], user, profile, search };
}

// No list-level mutations; keep action for compatibility
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
    return { error: "Replies must be posted from the question page." };
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
  const { questions, user, profile, search } = useLoaderData<typeof loader>();

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

        <div className="section-compact" style={{ marginBottom: 12 }}>
          <Form method="get" className="row" style={{ gap: 8 }}>
            <input
              type="text"
              name="search"
              defaultValue={search}
              className="input"
              placeholder="Search questions"
              style={{ width: 240 }}
            />
            <button type="submit" className="btn btn-ghost">
              Search
            </button>
          </Form>
        </div>

        <div className="card-grid">
          {questions.map((question) => (
            <div key={question.id} className="section-compact">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <Link to={`/qna/${question.id}`} className="nav-link" style={{ padding: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{truncateTitle(question.title)}</h3>
                </Link>
                <div className="row" style={{ gap: 6 }}>
                  {question.author && <RoleBadge role={question.author.role_type} />}
                  <span className="muted" style={{ fontSize: 13 }}>
                    {new Date(question.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 13, margin: "4px 0" }}>
                Asked by <UserLink user={question.author} />
              </div>
            </div>
          ))}

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
