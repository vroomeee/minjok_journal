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

  // Get current user (optional)
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

  // Fetch all questions with authors
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

  // Fetch all replies
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

// Server-side action - create question or reply, delete question or reply
export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  // Check if user is admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("admin_type, role_type")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.admin_type === "admin";

  if (intent === "askQuestion") {
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;

    if (!title || !content) {
      return { error: "Title and content are required" };
    }

    const { error } = await supabase.from("qna_questions").insert({
      title,
      content,
      author_id: user.id,
    });

    if (error) {
      return { error: "Failed to post question" };
    }

    return { success: true };
  }

  if (intent === "replyToQuestion") {
    // Check if user is a mentor
    if (!profile || profile.role_type !== "mentor") {
      return { error: "Only mentors can reply to questions" };
    }

    const questionId = formData.get("questionId") as string;
    const content = formData.get("content") as string;

    if (!content) {
      return { error: "Reply content is required" };
    }

    const { error } = await supabase.from("qna_replies").insert({
      question_id: questionId,
      author_id: user.id,
      content,
    });

    if (error) {
      return { error: "Failed to post reply" };
    }

    return { success: true };
  }

  if (intent === "deleteQuestion") {
    const questionId = formData.get("questionId") as string;

    // Get question to check ownership
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

    if (error) {
      return { error: "Failed to delete question" };
    }

    return { success: true };
  }

  if (intent === "deleteReply") {
    const replyId = formData.get("replyId") as string;

    // Get reply to check ownership
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

    if (error) {
      return { error: "Failed to delete reply" };
    }

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

  // Reset form and revalidate data when action succeeds
  useEffect(() => {
    if (actionData?.success && navigation.state === "idle") {
      // reset Ask Question form
      questionFormRef.current?.reset();

      // reset all Answer forms
      Object.values(answerFormRefs.current).forEach((form) => form?.reset());

      revalidator.revalidate();
    }
  }, [actionData, navigation.state, revalidator]);

  const answerFormRefs = useRef<Record<string, HTMLFormElement | null>>({});

  const isMentor = profile?.role_type === "mentor";
  const isAdmin = profile?.admin_type === "admin";
  const truncateTitle = (title: string) =>
    title.length > 20 ? `${title.slice(0, 20)}...` : title;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Q&A</h1>
        </div>

        {actionData?.error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{actionData.error}</p>
          </div>
        )}

        {/* Ask question form */}
        {user && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Ask a Question
            </h2>
            <Form method="post" className="space-y-4" ref={questionFormRef}>
              <input type="hidden" name="intent" value="askQuestion" />
              <div>
                <input
                  type="text"
                  name="title"
                  placeholder="Question title"
                  required
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                />
              </div>
              <div>
                <textarea
                  name="content"
                  rows={3}
                  placeholder="Describe your question..."
                  required
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Post Question
              </button>
            </Form>
          </div>
        )}

        {/* Questions list */}
        <div className="space-y-6">
          {questions.map((question) => {
            const questionReplies = replies.filter(
              (r) => r.question_id === question.id
            );

            return (
              <details
                key={question.id}
                className="bg-white rounded-lg shadow p-6"
              >
                <summary className="text-xl cursor-pointer list-none pr-6 py-1 flex justify-between items-center hover:bg-gray-50">
                  <span className="font-medium text-gray-900">
                    {truncateTitle(question.title)}
                  </span>
                  <span className="text-sm text-gray-500">
                    {new Date(question.created_at).toLocaleDateString()}
                  </span>
                </summary>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <span className="text-xs text-gray-600">
                        Asked by{" "}
                        {question.author?.username || question.author?.full_name}
                      </span>
                      {question.author && (
                        <RoleBadge role={question.author.role_type} />
                      )}
                      <span className="text-xs text-gray-500">
                        {new Date(question.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {(user?.id === question.author_id || isAdmin) && (
                      <div className="flex gap-2">
                        <Link
                          to={`/qna/${question.id}/edit`}
                          className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          수정
                        </Link>
                        <Form method="post" className="inline">
                          <input type="hidden" name="intent" value="deleteQuestion" />
                          <input type="hidden" name="questionId" value={question.id} />
                          <button
                            type="submit"
                            onClick={(e) =>
                              !confirm("정말 삭제하시겠습니까?") && e.preventDefault()
                            }
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            삭제
                          </button>
                        </Form>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mb-2">
                    {question.content}
                  </p>

                  {/* Replies */}
                  {questionReplies.length > 0 && (
                    <div className="border-t pt-4 space-y-4">
                      <h4 className="font-semibold text-gray-900">Answers:</h4>
                      {questionReplies.map((reply) => (
                        <div
                          key={reply.id}
                          className="pl-4 border-l-2 border-blue-500"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-sm text-gray-900">
                                {reply.author?.username ||
                                  reply.author?.full_name}
                              </span>
                              {reply.author && (
                                <RoleBadge role={reply.author.role_type} />
                              )}
                              <span className="text-xs text-gray-500">
                                {new Date(reply.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            {(user?.id === reply.author_id || isAdmin) && (
                              <div className="flex gap-2">
                                <Link
                                  to={`/qna/reply/${reply.id}/edit`}
                                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                  수정
                                </Link>
                                <Form method="post" className="inline">
                                  <input type="hidden" name="intent" value="deleteReply" />
                                  <input type="hidden" name="replyId" value={reply.id} />
                                  <button
                                    type="submit"
                                    onClick={(e) =>
                                      !confirm("정말 삭제하시겠습니까?") && e.preventDefault()
                                    }
                                    className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                  >
                                    삭제
                                  </button>
                                </Form>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-gray-700">
                            {reply.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply form (mentors only) */}
                  {isMentor && (
                    <details className="mt-4">
                      <summary className="text-sm text-blue-600 cursor-pointer hover:text-blue-700 font-medium">
                        Answer this question
                      </summary>
                      <Form
                        method="post"
                        className="mt-3"
                        ref={(el) => {
                          answerFormRefs.current[question.id] = el;
                        }}
                      >
                        <input
                          type="hidden"
                          name="intent"
                          value="replyToQuestion"
                        />
                        <input
                          type="hidden"
                          name="questionId"
                          value={question.id}
                        />
                        <textarea
                          name="content"
                          rows={3}
                          required
                          placeholder="Write your answer..."
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border"
                        />
                        <button
                          type="submit"
                          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                        >
                          Submit Answer
                        </button>
                      </Form>
                    </details>
                  )}
                </div>
              </details>
            );
          })}

          {questions.length === 0 && (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-500">No questions yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
