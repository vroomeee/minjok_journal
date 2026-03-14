import {
  Link,
  useLoaderData,
  Form,
  redirect,
  useActionData,
  useFetcher,
  useRevalidator,
  useRouteLoaderData,
} from "react-router";
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/$paperId";
import {
  createSupabaseServerClient,
  getUserAndProfile,
  getUserProfile,
} from "~/lib/supabase.server";
import {
  createSignedArticleUrls,
  removeArticleFiles,
} from "~/lib/article-files.server";
import {
  canAccessArticle,
  isArticleAuthor,
  shouldHideArticleIdentity,
} from "~/lib/article-access";
import { isReviewRole } from "~/lib/roles";
import { cleanupIssuesAndVolumes } from "~/lib/issues";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { UserLink } from "~/components/user-link";
import { AuthorList } from "~/components/author-list";

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "n/a";
  return dateFmt.format(new Date(dateStr));
}

type PaperComment = {
  id: string;
  author_id: string;
  body: string;
  created_at: string | null;
  author?: {
    id: string;
    email: string | null;
    full_name: string | null;
    role_type: string | null;
  } | null;
};

type ReviewRequirementState = {
  hasCurrentOriginal: boolean;
  hasCurrentBlind: boolean;
  hasCopyrightConsent: boolean;
  canSubmitForReview: boolean;
  canPublish: boolean;
};

// Server-side loader to fetch paper details
export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { user, profile } = await getUserAndProfile(request);
  const { paperId } = params;

  // Fetch paper with author and versions
  const { data: paper, error } = await supabase
    .from("articles")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        email,
        full_name,
        role_type
      ),
      authors:article_authors (
        profile_id,
        profile:profiles!article_authors_profile_id_fkey (
          id,
          email,
          full_name,
          role_type
        )
      ),
      versions:article_versions!article_versions_article_id_fkey (
        id,
        version_number,
        created_at,
        file_name,
        file_size,
        storage_path,
        blind_file_name,
        blind_file_size,
        blind_storage_path,
        notes
      )
    `,
    )
    .eq("id", paperId)
    .single();

  if (error || !paper) {
    console.error("Error fetching paper:", error);
    console.error("Paper ID:", paperId);
    throw new Response("Paper not found", { status: 404 });
  }

  if (!canAccessArticle(paper, user?.id, profile?.role_type)) {
    throw new Response("Unauthorized", { status: 403 });
  }

  // Sort versions by version number descending
  paper.versions?.sort((a, b) => b.version_number - a.version_number);

  const activeVersionId =
    paper.current_version_id || paper.versions?.[0]?.id || null;

  let comments: PaperComment[] = [];
  if (activeVersionId) {
    const { data: commentsData } = await supabase
      .from("comments")
      .select(
        `
        *,
        author:profiles!author_id (
          id,
          email,
          full_name,
          role_type
        )
      `,
      )
      .eq("article_id", paperId)
      .eq("version_id", activeVersionId)
      .eq("comment_type", "article")
      .is("parent_id", null)
      .order("created_at", { ascending: true });

    comments = commentsData || [];
  }

  const currentVersion =
    paper.versions?.find((v) => v.id === paper.current_version_id) ||
    paper.versions?.[0] ||
    null;
  const publishedVersion = paper.status === "published" ? currentVersion : null;
  const hideArticleIdentity = shouldHideArticleIdentity(
    profile?.role_type,
    paper.status,
  );

  let publishedFileViewUrl: string | null = null;
  let publishedFileDownloadUrl: string | null = null;
  if (paper.status === "published" && publishedVersion?.storage_path) {
    const urls = await createSignedArticleUrls(
      publishedVersion.storage_path,
      publishedVersion.file_name,
    );
    publishedFileViewUrl = urls.viewUrl;
    publishedFileDownloadUrl = urls.downloadUrl;
  }

  const reviewRequirements: ReviewRequirementState = {
    hasCurrentOriginal: Boolean(currentVersion?.storage_path),
    hasCurrentBlind: Boolean(currentVersion?.blind_storage_path),
    hasCopyrightConsent: Boolean(paper.copyright_storage_path),
    canSubmitForReview: Boolean(
      currentVersion?.storage_path &&
        currentVersion?.blind_storage_path &&
        paper.copyright_storage_path,
    ),
    canPublish: Boolean(paper.copyright_storage_path),
  };

  const formattedPaper = {
    ...paper,
    author: hideArticleIdentity ? null : paper.author,
    author_id: hideArticleIdentity ? null : paper.author_id,
    authors: hideArticleIdentity ? [] : paper.authors,
    formattedDate: formatDate(paper.created_at),
    versions: paper.versions?.map((v) => ({
      id: v.id,
      version_number: v.version_number,
      created_at: v.created_at,
      file_name: hideArticleIdentity
        ? v.blind_storage_path
          ? "Blinded review file available"
          : "Blinded review file missing"
        : v.file_name,
      notes: hideArticleIdentity ? null : v.notes,
      formattedDate: formatDate(v.created_at),
    })),
  };
  const formattedComments = comments.map((c) => ({
    ...c,
    formattedDate: formatDate(c.created_at),
  }));

  return {
    paper: formattedPaper,
    comments: formattedComments,
    activeVersionId,
    publishedVersion,
    publishedFileViewUrl,
    publishedFileDownloadUrl,
    reviewRequirements,
  };
}

// Server-side action to delete paper or change status
export async function action({ request, params }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { paperId } = params;

  const formData = await request.formData();
  const intent = formData.get("intent");

  const getAccess = async () => {
    const { user, profile } = await getUserProfile(request);
    const { data: paper } = await supabase
      .from("articles")
      .select(
        `
        author_id,
        status,
        current_version_id,
        copyright_storage_path,
        authors:article_authors(profile_id),
        current_version:article_versions!current_version_id(
          id,
          storage_path,
          blind_storage_path
        )
      `,
      )
      .eq("id", paperId)
      .single();
    const isAuthor = isArticleAuthor(paper, user.id);
    const isPrimaryAuthor = paper?.author_id === user.id;
    const isAdmin = profile.role_type === "admin";
    return { user, profile, paper, isAuthor, isPrimaryAuthor, isAdmin };
  };

  if (intent === "delete") {
    const { paper, isPrimaryAuthor, isAdmin } = await getAccess();

    const canDeletePaper =
      !!paper && (isAdmin || (isPrimaryAuthor && paper.status !== "published"));

    if (!canDeletePaper) {
      throw new Response("Unauthorized", { status: 403 });
    }

    const { data: issueRows } = await supabase
      .from("issue_articles")
      .select("issue_id")
      .eq("article_id", paperId);
    const affectedIssues = Array.from(
      new Set(
        issueRows?.map((row) => row.issue_id).filter(Boolean) ?? [],
      ),
    );

    const { data: versionPaths } = await supabase
      .from("article_versions")
      .select("storage_path, blind_storage_path")
      .eq("article_id", paperId);
    const pathsToRemove = [
      ...(versionPaths || []).flatMap(
        (v: {
          storage_path: string | null;
          blind_storage_path?: string | null;
        }) => [v.storage_path, v.blind_storage_path],
      ),
      paper?.copyright_storage_path || null,
    ];
    const { error } = await supabase.from("articles").delete().eq("id", paperId);

    if (error) {
      return { error: "Failed to delete paper" };
    }

    await cleanupIssuesAndVolumes(supabase, affectedIssues);

    try {
      await removeArticleFiles(pathsToRemove);
    } catch (storageError) {
      console.error("Failed to remove deleted paper files:", storageError);
    }

    return redirect("/papers");
  }

  if (intent === "updateStatus") {
    const newStatus = formData.get("status") as string;

    const { paper, isPrimaryAuthor, isAdmin } = await getAccess();

    if (!paper || (!isPrimaryAuthor && !isAdmin)) {
      throw new Response("Unauthorized", { status: 403 });
    }

    // Validate allowed status transitions
    const allowed =
      (paper.status === "draft" &&
        newStatus === "in_review" &&
        isPrimaryAuthor) ||
      (paper.status === "in_review" &&
        newStatus === "published" &&
        isAdmin);

    if (!allowed) {
      return { error: "Invalid status transition" };
    }

    if (newStatus === "in_review") {
      if (!paper.current_version?.storage_path) {
        return { error: "The current version is missing the original file." };
      }
      if (!paper.current_version?.blind_storage_path) {
        return { error: "Upload a blinded review file before submitting for review." };
      }
      if (!paper.copyright_storage_path) {
        return {
          error:
            "Upload the article's copyright consent before submitting for review.",
        };
      }
    }

    if (newStatus === "published" && !paper.copyright_storage_path) {
      return {
        error:
          "Copyright consent must be uploaded before this paper can be published.",
      };
    }

    const { error } = await supabase
      .from("articles")
      .update({ status: newStatus })
      .eq("id", paperId);

    if (error) {
      return { error: "Failed to update status" };
    }

    return { success: true };
  }

  if (intent === "unpublish") {
    const { paper, isAdmin } = await getAccess();

    if (!paper || !isAdmin) {
      throw new Response("Unauthorized", { status: 403 });
    }

    if (paper.status !== "published" && paper.status !== "in_review") {
      return { error: "Only published or in-review papers can be unpublished" };
    }

    const { data: issueRows } = await supabase
      .from("issue_articles")
      .select("issue_id")
      .eq("article_id", paperId);
    const affectedIssues = Array.from(
      new Set(
        issueRows?.map((row) => row.issue_id).filter(Boolean) ?? [],
      ),
    );

    // Remove from issue_articles (unpublished papers shouldn't be in issues)
    await supabase.from("issue_articles").delete().eq("article_id", paperId);
    await cleanupIssuesAndVolumes(supabase, affectedIssues);

    const { error } = await supabase
      .from("articles")
      .update({ status: "draft" })
      .eq("id", paperId);

    if (error) {
      return { error: "Failed to unpublish paper" };
    }

    return redirect(`/papers/${paperId}`);
  }

  if (intent === "updateTitle") {
    const { paper, isPrimaryAuthor, isAdmin } = await getAccess();
    const newTitle = formData.get("title") as string;
    if (!newTitle) {
      return { error: "Title is required" };
    }

    if (!paper || (!isPrimaryAuthor && !isAdmin)) {
      throw new Response("Unauthorized", { status: 403 });
    }

    const { error } = await supabase
      .from("articles")
      .update({ title: newTitle })
      .eq("id", paperId);

    if (error) {
      return { error: "Failed to update title" };
    }

    return redirect(`/papers/${paperId}`);
  }

  if (intent === "comment") {
    const { user } = await getUserProfile(request);
    const { data: paper } = await supabase
      .from("articles")
      .select(
        `status, current_version_id,
         versions:article_versions!article_versions_article_id_fkey (id, version_number)`,
      )
      .eq("id", paperId)
      .single();

    if (!paper) {
      throw new Response("Paper not found", { status: 404 });
    }

    if (paper.status !== "published") {
      return { error: "Comments are only allowed on published papers" };
    }

    const targetVersionId =
      paper.current_version_id || paper.versions?.[0]?.id || null;
    if (!targetVersionId) {
      return { error: "No version available to attach the comment" };
    }

    const body = formData.get("body") as string;
    if (!body) {
      return { error: "Comment body is required" };
    }

    const { error } = await supabase.from("comments").insert({
      article_id: paperId,
      version_id: targetVersionId,
      author_id: user.id,
      body,
      parent_id: null,
      comment_type: "article",
    });

    if (error) {
      return { error: "Failed to post comment: " + (error.message ?? "unknown error") };
    }

    return { success: true };
  }

  if (intent === "editComment" || intent === "deleteComment") {
    const commentId = formData.get("commentId") as string;
    if (!commentId) return { error: "Comment not found" };

    const { data: comment } = await supabase
      .from("comments")
      .select("author_id")
      .eq("id", commentId)
      .single();
    if (!comment) return { error: "Comment not found" };

    const { user, profile } = await getUserProfile(request);
    const isAdmin = profile.role_type === "admin";
    if (comment.author_id !== user.id && !isAdmin) {
      return { error: "Unauthorized" };
    }

    if (intent === "deleteComment") {
      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId);
      if (error) return { error: "Failed to delete comment" };
      return { success: true };
    }

    const body = formData.get("body") as string;
    if (!body) return { error: "Comment body is required" };

    const { error } = await supabase
      .from("comments")
      .update({ body })
      .eq("id", commentId);
    if (error)
      return { error: "Failed to update comment: " + (error.message ?? "unknown error") };
    return { success: true };
  }

  return null;
}

export default function PaperDetail() {
  const {
    paper,
    comments,
    activeVersionId,
    publishedVersion,
    publishedFileViewUrl,
    publishedFileDownloadUrl,
    reviewRequirements,
  } = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData("root") as {
    user?: { id: string };
    profile?: { role_type?: string | null };
  } | null;
  const user = rootData?.user;
  const profile = rootData?.profile;
  const actionData = useActionData<typeof action>();
  const commentFetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const commentFormsRef = useRef<HTMLFormElement[]>([]);
  const editCommentFormsRef = useRef<HTMLFormElement[]>([]);
  const handledCommentSuccess = useRef(false);
  useEffect(() => {
    if (commentFetcher.state === "submitting") {
      handledCommentSuccess.current = false;
    }
    if (
      !handledCommentSuccess.current &&
      commentFetcher.state === "idle" &&
      commentFetcher.data?.success
    ) {
      commentFormsRef.current.forEach((form) => form?.reset());
      editCommentFormsRef.current.forEach((form) => form?.reset());
      revalidator.revalidate();
      handledCommentSuccess.current = true;
    }
  }, [commentFetcher.state, commentFetcher.data, revalidator]);

  const [showVersions, setShowVersions] = useState(
    paper.status !== "published",
  );

  const isAuthor = isArticleAuthor(paper, user?.id);
  const isPrimaryAuthor = paper.author_id === user?.id;
  const isAdmin = profile?.role_type === "admin";
  const isReviewer = isReviewRole(profile?.role_type);
  const canManagePaper = isPrimaryAuthor || isAdmin;
  const canUnpublish = isAdmin;
  const canDelete = isAdmin || (isPrimaryAuthor && paper.status !== "published");
  const canPublish = isAdmin;
  const canUploadNewVersion = isAuthor && paper.status !== "published";
  const canSubmitForReview = isPrimaryAuthor && paper.status === "draft";
  const showReadinessChecklist =
    paper.status !== "published" && (isAuthor || isAdmin || isReviewer);
  const hideArticleIdentity = shouldHideArticleIdentity(
    profile?.role_type,
    paper.status,
  );
  const showComments = paper.status === "published" && !!activeVersionId;
  const truncateNotes = (notes?: string | null) =>
    notes && notes.length > 200 ? `${notes.slice(0, 200)}...` : notes;
  const rowsForBody = (body: string) =>
    Math.min(14, Math.max(3, Math.ceil((body?.length || 0) / 60)));
  const readinessItems = [
    {
      label: "Current version original file",
      ready: reviewRequirements.hasCurrentOriginal,
    },
    {
      label: "Current version blinded file",
      ready: reviewRequirements.hasCurrentBlind,
    },
    {
      label: "Article copyright consent",
      ready: reviewRequirements.hasCopyrightConsent,
    },
  ];

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="page-body">
        {actionData?.error && (
          <div className="section-compact subtle">
            <p className="text-sm" style={{ color: "#f6b8bd" }}>
              {actionData.error}
            </p>
          </div>
        )}

        <div className="section">
          <div
            className="row"
            style={{ justifyContent: "space-between", marginBottom: 8 }}
          >
            <div className="row" style={{ gap: 10 }}>
              <h1 style={{ fontSize: 26 }}>{paper.title}</h1>
              {canManagePaper && (
                <Link to={`/papers/${paper.id}/edit`} className="btn">
                  Edit Paper
                </Link>
              )}
            </div>
            <span className="pill">
              {paper.status === "published"
                ? "Published"
                : paper.status === "in_review"
                  ? "In Review"
                  : "Draft"}
            </span>
          </div>

          <div
            className="row"
            style={{ flexWrap: "wrap", gap: 12, marginBottom: 8 }}
          >
            {hideArticleIdentity ? (
              <span className="meta">Blinded submission</span>
            ) : (
              <AuthorList authors={paper.authors} showBadges />
            )}
            <span className="meta">{paper.formattedDate}</span>
          </div>
          {paper.description && (
            <p className="muted" style={{ marginBottom: 12 }}>
              {paper.description}
            </p>
          )}

          {(isAuthor || isAdmin) && (
            <div className="row-wrap" style={{ marginTop: 4 }}>
              {canSubmitForReview && (
                reviewRequirements.canSubmitForReview ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="updateStatus" />
                    <input type="hidden" name="status" value="in_review" />
                    <button type="submit" className="btn btn-warn">
                      Submit for Review
                    </button>
                  </Form>
                ) : (
                  <button type="button" className="btn btn-warn" disabled>
                    Submit for Review
                  </button>
                )
              )}
              {isAuthor && canUploadNewVersion && (
                <Link
                  to={`/papers/${paper.id}/new-version`}
                  className="btn btn-ghost"
                >
                  Upload New Version
                </Link>
              )}
              {canPublish &&
                paper.status === "in_review" &&
                (reviewRequirements.canPublish ? (
                  <Link
                    to={`/papers/${paper.id}/publish`}
                    className="btn btn-accent"
                  >
                    Publish
                  </Link>
                ) : (
                  <button type="button" className="btn btn-accent" disabled>
                    Publish
                  </button>
                ))}
              {canUnpublish && paper.status === "published" && (
                <Form method="post">
                  <input type="hidden" name="intent" value="unpublish" />
                  <button type="submit" className="btn btn-warn">
                    Unpublish
                  </button>
                </Form>
              )}
              {canDelete && (
                <Form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <button
                    type="submit"
                    onClick={(e) =>
                      !confirm("Are you sure you want to delete this paper?") &&
                      e.preventDefault()
                    }
                    className="btn btn-danger"
                  >
                    Delete Paper
                  </button>
                </Form>
              )}
            </div>
          )}
        </div>

        {showReadinessChecklist && (
          <div className="section">
            <h2 style={{ fontSize: 18, marginBottom: 10 }}>
              Review / Publish Requirements
            </h2>
            <div className="card-grid">
              {readinessItems.map((item) => (
                <div key={item.label} className="section-compact">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span>{item.label}</span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {item.ready ? "Ready" : "Missing"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {!reviewRequirements.canSubmitForReview && paper.status === "draft" && (
              <p className="muted" style={{ marginTop: 10 }}>
                Upload the missing files before submitting this paper for review.
              </p>
            )}
            {!reviewRequirements.canPublish && paper.status === "in_review" && (
              <p className="muted" style={{ marginTop: 10 }}>
                Publish is blocked until the article&apos;s copyright consent is uploaded.
              </p>
            )}
          </div>
        )}

        <div className="section">
          <div
            className="row"
            style={{ justifyContent: "space-between", marginBottom: 12 }}
          >
            <h2 style={{ fontSize: 18 }}>Versions</h2>
            {paper.status === "published" && (
              <button
                type="button"
                onClick={() => setShowVersions((prev) => !prev)}
                className="btn btn-ghost"
              >
                {showVersions ? "Hide Past Versions" : "View Past Versions"}
              </button>
            )}
          </div>

          {(showVersions || paper.status !== "published") && (
            <>
              {paper.versions && paper.versions.length > 0 ? (
                <div className="card-grid">
                  {paper.versions.map((version) => (
                    <div
                      key={version.id}
                      className="section-compact"
                      style={{
                        background: "var(--surface-2)",
                        border: `1px solid var(--border)`,
                        borderRadius: "6px",
                      }}
                    >
                      <div
                        className="row"
                        style={{ justifyContent: "space-between" }}
                      >
                        <div>
                          <div className="row" style={{ gap: 6 }}>
                            <h3 style={{ fontSize: 15, margin: 0 }}>
                              Version {version.version_number}
                            </h3>
                            {paper.current_version_id === version.id &&
                              paper.status === "published" && (
                                <span
                                  className="pill"
                                  style={{ background: "#103c2d" }}
                                >
                                  Published
                                </span>
                              )}
                          </div>
                          <p className="meta" style={{ margin: "2px 0" }}>
                            {version.formattedDate}
                          </p>
                          <p className="muted" style={{ margin: "2px 0" }}>
                            {version.file_name}
                          </p>
                          {!hideArticleIdentity && version.notes && (
                            <p className="muted" style={{ margin: "4px 0" }}>
                              {truncateNotes(version.notes)}
                            </p>
                          )}
                        </div>
                        <Link
                          to={`/papers/${paper.id}/versions/${version.id}`}
                          className="btn btn-ghost"
                        >
                          View & Review
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No versions uploaded yet.</p>
              )}
            </>
          )}
        </div>

        {paper.status === "published" && publishedVersion && (
          <div className="section">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontSize: 18 }}>Published Version</h2>
                <p className="muted">
                  {publishedVersion.file_name} (v
                  {publishedVersion.version_number})
                </p>
              </div>
              {publishedFileDownloadUrl && (
                <a
                  href={publishedFileDownloadUrl}
                  className="btn btn-ghost"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download
                </a>
              )}
            </div>
            {publishedFileViewUrl &&
              publishedVersion.file_name.toLowerCase().endsWith(".pdf") && (
                <div style={{ marginTop: 12 }}>
                  <iframe
                    src={publishedFileViewUrl}
                    className="w-full"
                    style={{
                      height: 520,
                      border: `1px solid var(--border)`,
                      borderRadius: 6,
                    }}
                    title="Published File"
                  />
                </div>
              )}
          </div>
        )}

        {showComments && (
          <div className="section">
            <h2 style={{ fontSize: 18, marginBottom: 10 }}>Paper Comments</h2>
            {user ? (
              <commentFetcher.Form
                method="post"
                style={{ marginBottom: 12 }}
                ref={(form) => {
                  if (form && !commentFormsRef.current.includes(form)) {
                    commentFormsRef.current.push(form);
                  }
                }}
                onSubmit={() => {
                  handledCommentSuccess.current = false;
                }}
                data-comment-form
              >
                <input type="hidden" name="intent" value="comment" />
                <textarea
                  name="body"
                  rows={3}
                  required
                  className="textarea"
                  placeholder="Share feedback or peer review for this published paper..."
                />
                <button
                  type="submit"
                  className="btn btn-accent"
                  style={{ marginTop: 8 }}
                  disabled={commentFetcher.state === "submitting"}
                >
                  {commentFetcher.state === "submitting"
                    ? "Posting..."
                    : "Post Comment"}
                </button>
              </commentFetcher.Form>
            ) : (
              <p className="muted" style={{ marginBottom: 12 }}>
                Please log in to leave a comment.
              </p>
            )}
            {commentFetcher.data?.error && (
              <div
                className="section-compact subtle"
                style={{ marginTop: 8 }}
              >
                <p className="text-sm" style={{ color: "#f6b8bd", margin: 0 }}>
                  {commentFetcher.data.error}
                </p>
              </div>
            )}

            <div className="card-grid">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="section-compact"
                  style={{ borderRadius: 6 }}
                >
                  <div
                    className="row"
                    style={{ gap: 8, marginBottom: 4, flexWrap: "wrap" }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      <UserLink user={comment.author} />
                    </span>
                    {comment.author && (
                      <RoleBadge
                        role={comment.author.role_type}
                        className="text-xs py-0 px-1"
                      />
                    )}
                    <span className="meta">{comment.formattedDate}</span>
                    {(user?.id === comment.author_id ||
                      profile?.role_type === "admin") && (
                      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                        <commentFetcher.Form method="post">
                          <input
                            type="hidden"
                            name="intent"
                            value="deleteComment"
                          />
                          <input
                            type="hidden"
                            name="commentId"
                            value={comment.id}
                          />
                          <button
                            type="submit"
                            className="btn btn-ghost"
                            onClick={(e) =>
                              !confirm("Delete this comment?") &&
                              e.preventDefault()
                            }
                          >
                            Delete
                          </button>
                        </commentFetcher.Form>
                        <details>
                          <summary className="nav-link" style={{ padding: 0 }}>
                            Edit
                          </summary>
                          <commentFetcher.Form
                            method="post"
                            className="list"
                            style={{ marginTop: 6 }}
                            ref={(form) => {
                              if (
                                form &&
                                !editCommentFormsRef.current.includes(form)
                              ) {
                                editCommentFormsRef.current.push(form);
                              }
                            }}
                          >
                            <input
                              type="hidden"
                              name="intent"
                              value="editComment"
                            />
                            <input
                              type="hidden"
                              name="commentId"
                              value={comment.id}
                            />
                            <textarea
                              name="body"
                              defaultValue={comment.body}
                              rows={rowsForBody(comment.body)}
                              required
                              className="textarea"
                              style={{ width: "100%" }}
                            />
                            <button
                              type="submit"
                              className="btn btn-accent"
                              style={{ marginTop: 4 }}
                              disabled={commentFetcher.state === "submitting"}
                            >
                              {commentFetcher.state === "submitting"
                                ? "Saving..."
                                : "Save"}
                            </button>
                          </commentFetcher.Form>
                        </details>
                      </div>
                    )}
                  </div>
                  <p className="muted" style={{ margin: 0 }}>
                    {comment.body}
                  </p>
                </div>
              ))}

              {comments.length === 0 && (
                <p className="muted">
                  No comments yet. Share your thoughts on this paper.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
