import {
  useLoaderData,
  Form,
  redirect,
  useActionData,
  useFetcher,
  useRevalidator,
  useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/$paperId.versions.$versionId";
import {
  createSupabaseServerClient,
  requireUser,
  getUserProfile,
  getUserAndProfile,
} from "~/lib/supabase.server";
import {
  ARTICLE_FILE_ACCEPT,
  getOptionalFormFile,
  validateArticleUpload,
} from "~/lib/article-files";
import {
  ARTICLE_FILE_SERVICE_ERROR,
  buildBlindArticlePath,
  buildOriginalArticlePath,
  isArticleFileServiceConfigured,
  removeArticleFiles,
  tryCreateSignedArticleUrl,
  tryCreateSignedArticleUrls,
  uploadArticleFile,
} from "~/lib/article-files.server";
import {
  canAccessArticle,
  isArticleAuthor,
  shouldHideArticleIdentity,
} from "~/lib/article-access";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { useEffect, useRef } from "react";
import { UserLink } from "~/components/user-link";
import { cleanupIssuesAndVolumes } from "~/lib/issues";

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDate(dateStr: string | null) {
  if (!dateStr) return "n/a";
  return dateFmt.format(new Date(dateStr));
}

type VersionComment = {
  id: string;
  parent_id: string | null;
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

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { user, profile } = await getUserAndProfile(request);
  const { paperId, versionId } = params;

  const { data: paper } = await supabase
    .from("articles")
    .select(
      `
        id,
        title,
        author_id,
        status,
        copyright_file_name,
        copyright_storage_path,
        authors:article_authors(
          profile_id,
          profile:profiles!article_authors_profile_id_fkey(
            id,
            full_name,
            email,
            role_type
          )
        )
      `,
    )
    .eq("id", paperId)
    .single();

  if (!paper) {
    throw new Response("Paper not found", { status: 404 });
  }

  if (!canAccessArticle(paper, user?.id, profile?.role_type)) {
    throw new Response("Unauthorized", { status: 403 });
  }

  const { data: version, error: versionError } = await supabase
    .from("article_versions")
    .select("*")
    .eq("id", versionId)
    .eq("article_id", paperId)
    .single();

  if (versionError || !version) {
    throw new Response("Version not found", { status: 404 });
  }

  const isBlindReviewContext = shouldHideArticleIdentity(
    profile?.role_type,
    paper.status,
  );
  const isArticleFileServiceReady = isArticleFileServiceConfigured();
  const selectedPath = isBlindReviewContext
    ? version.blind_storage_path
    : version.storage_path;
  const selectedFileName = isBlindReviewContext
    ? version.blind_file_name
    : version.file_name;
  const activeFileLabel = isBlindReviewContext
    ? "Blinded Review File"
    : "Original File";
  const isBlindFileMissing =
    isBlindReviewContext && !version.blind_storage_path;

  let fileViewUrl: string | null = null;
  let fileDownloadUrl: string | null = null;
  if (selectedPath && selectedFileName) {
    const urls = await tryCreateSignedArticleUrls(selectedPath, selectedFileName);
    fileViewUrl = urls?.viewUrl || null;
    fileDownloadUrl = urls?.downloadUrl || null;
  }

  const copyrightDownloadUrl =
    paper.copyright_storage_path && paper.copyright_file_name
      ? await tryCreateSignedArticleUrl(paper.copyright_storage_path, {
          download: paper.copyright_file_name,
        })
      : null;

  const { data: comments } = await supabase
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
    .eq("version_id", versionId)
    .is("parent_id", null)
    .order("created_at", { ascending: true });

  const commentIds = comments?.map((c) => c.id) || [];
  let replies: VersionComment[] = [];
  if (commentIds.length > 0) {
    const { data: repliesData } = await supabase
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
      .in("parent_id", commentIds)
      .order("created_at", { ascending: true });

    replies = repliesData || [];
  }

  const { data: versionList } = await supabase
    .from("article_versions")
    .select("id")
    .eq("article_id", paperId);

  const formattedVersion = {
    id: version.id,
    version_number: version.version_number,
    notes: isBlindReviewContext ? null : version.notes,
    formattedDate: formatDate(version.created_at),
    hasBlindFile: Boolean(version.blind_storage_path),
  };
  const formattedComments = (comments || []).map((c) => ({
    ...c,
    author: isBlindReviewContext ? null : c.author,
    formattedDate: formatDate(c.created_at),
  }));
  const formattedReplies = replies.map((r) => ({
    ...r,
    author: isBlindReviewContext ? null : r.author,
    formattedDate: formatDate(r.created_at),
  }));

  return {
    paper: {
      ...paper,
      author_id: isBlindReviewContext ? null : paper.author_id,
      authors: isBlindReviewContext ? [] : paper.authors,
    },
    version: formattedVersion,
    fileViewUrl,
    fileDownloadUrl,
    activeFileLabel,
    activeFileName: selectedFileName,
    isBlindFileMissing,
    comments: formattedComments,
    replies: formattedReplies,
    totalVersions: versionList?.length || 0,
    copyrightDownloadUrl,
    copyrightFileName: paper.copyright_file_name,
    articleFileAccessError: isArticleFileServiceReady
      ? null
      : ARTICLE_FILE_SERVICE_ERROR,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { paperId, versionId } = params;

  const formData = await request.formData();
  const intent = (formData.get("intent") as string) || "addComment";

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_type")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role_type === "admin";

  const { data: paper } = await supabase
    .from("articles")
    .select(
      "author_id, status, current_version_id, copyright_storage_path, authors:article_authors(profile_id)",
    )
    .eq("id", paperId)
    .single();
  const isAuthor = isArticleAuthor(paper, user.id);
  const isPrimaryAuthor = paper?.author_id === user.id;

  if (!paper || !canAccessArticle(paper, user.id, profile?.role_type)) {
    return { error: "Unauthorized" };
  }

  if (intent === "deleteVersion") {
    if (!paper || (!isPrimaryAuthor && !isAdmin)) {
      return { error: "Unauthorized to delete this version" };
    }

    const { data: versions } = await supabase
      .from("article_versions")
      .select(
        "id, version_number, created_at, storage_path, blind_storage_path",
      )
      .eq("article_id", paperId)
      .order("version_number", { ascending: false });

    if (!versions || versions.length === 0) {
      return { error: "No versions found for this paper" };
    }
    const targetVersion = versions.find((v) => v.id === versionId);
    if (!targetVersion) return { error: "Version not found" };

    const canDeleteFinalVersion =
      isAdmin || (isPrimaryAuthor && paper.status !== "published");
    if (versions.length === 1 && !canDeleteFinalVersion) {
      return {
        error:
          "Only admins or the primary author of an unpublished paper can delete the final version",
      };
    }

    const targetPaths = [
      targetVersion.storage_path,
      targetVersion.blind_storage_path,
    ];
    const allPaths = versions.flatMap((v) => [
      v.storage_path,
      v.blind_storage_path,
    ]);

    if (versions.length === 1) {
      const { data: issueRows } = await supabase
        .from("issue_articles")
        .select("issue_id")
        .eq("article_id", paperId);
      const affectedIssues = Array.from(
        new Set(
          issueRows?.map((row) => row.issue_id).filter(Boolean) ?? [],
        ),
      );

      const { error: deleteArticleError } = await supabase
        .from("articles")
        .delete()
        .eq("id", paperId);
      if (deleteArticleError) {
        return { error: "Failed to delete paper" };
      }

      await cleanupIssuesAndVolumes(supabase, affectedIssues);

      try {
        await removeArticleFiles([...allPaths, paper.copyright_storage_path]);
      } catch (error) {
        console.error("Failed to remove deleted article files:", error);
      }

      return redirect("/papers");
    }

    const fallbackVersion = versions.find((v) => v.id !== versionId);
    if (!fallbackVersion) {
      return { error: "Could not determine fallback version" };
    }

    if (paper.current_version_id === versionId) {
      const { error: updateArticleError } = await supabase
        .from("articles")
        .update({ current_version_id: fallbackVersion.id })
        .eq("id", paperId);
      if (updateArticleError) {
        return { error: "Failed to update paper to fallback version" };
      }
    }

    const { error: deleteVersionError } = await supabase
      .from("article_versions")
      .delete()
      .eq("id", versionId);
    if (deleteVersionError) return { error: "Failed to delete version" };

    try {
      await removeArticleFiles(targetPaths);
    } catch (error) {
      console.error("Failed to remove deleted version files:", error);
    }

    return redirect(`/papers/${paperId}`);
  }

  if (intent === "replaceOriginalFile" || intent === "replaceBlindFile") {
    if (!isAdmin) {
      return { error: "Only admins can replace files for an existing version" };
    }

    const fieldName =
      intent === "replaceBlindFile"
        ? "replacementBlindFile"
        : "replacementOriginalFile";
    const replacementFile = getOptionalFormFile(formData, fieldName);
    const label =
      intent === "replaceBlindFile"
        ? "Replacement blinded file"
        : "Replacement original file";
    const validationError = validateArticleUpload(replacementFile, label);
    if (validationError) {
      return { error: validationError };
    }

    const { data: targetVersion, error: targetVersionError } = await supabase
      .from("article_versions")
      .select(
        "id, article_id, version_number, storage_path, blind_storage_path",
      )
      .eq("id", versionId)
      .eq("article_id", paperId)
      .single();

    if (targetVersionError || !targetVersion) {
      return { error: "Version not found" };
    }

    const replacementPath =
      intent === "replaceBlindFile"
        ? buildBlindArticlePath(
            targetVersion.article_id,
            targetVersion.version_number,
            replacementFile!.name,
          )
        : buildOriginalArticlePath(
            targetVersion.article_id,
            targetVersion.version_number,
            replacementFile!.name,
          );

    try {
      await uploadArticleFile(replacementPath, replacementFile!);
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Failed to replace version file",
      };
    }

    const updatePayload =
      intent === "replaceBlindFile"
        ? {
            blind_storage_path: replacementPath,
            blind_file_name: replacementFile!.name,
            blind_file_size: replacementFile!.size,
          }
        : {
            storage_path: replacementPath,
            file_name: replacementFile!.name,
            file_size: replacementFile!.size,
          };

    const { error: updateVersionError } = await supabase
      .from("article_versions")
      .update(updatePayload)
      .eq("id", versionId)
      .eq("article_id", paperId);

    if (updateVersionError) {
      try {
        await removeArticleFiles([replacementPath]);
      } catch {
        // Best-effort cleanup.
      }
      return {
        error: `Failed to update version metadata: ${updateVersionError.message}`,
      };
    }

    const originalPath =
      intent === "replaceBlindFile"
        ? targetVersion.blind_storage_path
        : targetVersion.storage_path;
    if (originalPath && originalPath !== replacementPath) {
      try {
        await removeArticleFiles([originalPath]);
      } catch {
        // Keep new metadata even if old storage cleanup fails.
      }
    }

    return redirect(`/papers/${paperId}/versions/${versionId}`);
  }

  if (intent === "updateNotes" || intent === "deleteNotes") {
    if (!paper || (!isAuthor && !isAdmin)) {
      return { error: "Unauthorized to edit notes" };
    }

    const notesValue =
      intent === "deleteNotes"
        ? null
        : (formData.get("notes") as string | null) || null;

    const { error: updateError } = await supabase
      .from("article_versions")
      .update({ notes: notesValue })
      .eq("id", versionId)
      .eq("article_id", paperId);

    if (updateError) return { error: "Failed to update version notes" };

    return redirect(`/papers/${paperId}/versions/${versionId}`);
  }

  const body = formData.get("body") as string;
  const parentId = (formData.get("parentId") as string | null) || null;

  if (intent === "deleteComment" || intent === "editComment") {
    const commentId = formData.get("commentId") as string;
    if (!commentId) return { error: "Comment not found" };

    const { data: comment } = await supabase
      .from("comments")
      .select("author_id")
      .eq("id", commentId)
      .single();
    if (!comment) return { error: "Comment not found" };

    const { user: actingUser, profile: actingProfile } =
      await getUserProfile(request);
    const actingIsAdmin = actingProfile.role_type === "admin";
    if (comment.author_id !== actingUser.id && !actingIsAdmin) {
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

    const newBody = formData.get("body") as string;
    if (!newBody) return { error: "Comment body is required" };

    const { error } = await supabase
      .from("comments")
      .update({ body: newBody })
      .eq("id", commentId);
    if (error) return { error: "Failed to update comment" };
    return { success: true };
  }

  if (!body) return { error: "Comment body is required" };

  const { error } = await supabase.from("comments").insert({
    article_id: paperId,
    version_id: versionId,
    author_id: user.id,
    body,
    parent_id: parentId,
    comment_type: "article",
  });

  if (error) return { error: "Failed to post comment" };

  return { success: true };
}

export default function VersionReview() {
  const formRef = useRef<HTMLFormElement>(null);
  const {
    paper,
    version,
    fileViewUrl,
    fileDownloadUrl,
    activeFileLabel,
    activeFileName,
    isBlindFileMissing,
    comments,
    replies,
    totalVersions,
    copyrightDownloadUrl,
    copyrightFileName,
    articleFileAccessError,
  } = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData("root") as
    | { user?: { id: string }; profile?: { role_type?: string | null } }
    | null;
  const user = rootData?.user;
  const profile = rootData?.profile;
  const actionData = useActionData<typeof action>();
  const commentFetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const commentFormsRef = useRef<HTMLFormElement[]>([]);
  const editCommentFormsRef = useRef<HTMLFormElement[]>([]);
  const handledCommentSuccess = useRef(false);
  const rowsForBody = (body: string) =>
    Math.min(14, Math.max(3, Math.ceil((body?.length || 0) / 60)));

  useEffect(() => {
    if (commentFetcher.state === "submitting") {
      handledCommentSuccess.current = false;
    }
    if (
      !handledCommentSuccess.current &&
      commentFetcher.state === "idle" &&
      commentFetcher.data?.success
    ) {
      commentFormsRef.current.forEach((f) => f?.reset());
      editCommentFormsRef.current.forEach((f) => f?.reset());
      revalidator.revalidate();
      handledCommentSuccess.current = true;
    }
  }, [commentFetcher.state, commentFetcher.data, revalidator]);

  const isAdmin = profile?.role_type === "admin";
  const isAuthor = isArticleAuthor(paper, user?.id);
  const isPrimaryAuthor = paper?.author_id === user?.id;
  const canEditNotes = isAdmin || isAuthor;
  const hideReviewerIdentity = shouldHideArticleIdentity(
    profile?.role_type,
    paper?.status,
  );
  const canDeleteVersion =
    isAdmin ||
    (isPrimaryAuthor &&
      (totalVersions > 1 || paper?.status !== "published"));
  const deleteWarning =
    totalVersions === 1
      ? "WARNING: this is the only version of the paper. If you delete this, the paper and copyright consent will be deleted as well."
      : "Delete this version?";
  const truncatedNotes =
    version.notes && version.notes.length > 200
      ? `${version.notes.slice(0, 200)}...`
      : version.notes;

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
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h2 style={{ fontSize: 22, margin: 0 }}>
                {paper?.title} - Version {version.version_number}
              </h2>
              <p className="muted" style={{ margin: "4px 0" }}>
                Uploaded: {version.formattedDate}
              </p>
            </div>
            {canDeleteVersion && (
              <Form
                method="post"
                className="row"
                onSubmit={(e) => {
                  if (!confirm(deleteWarning)) e.preventDefault();
                }}
              >
                <input type="hidden" name="intent" value="deleteVersion" />
                <button type="submit" className="btn btn-danger">
                  Delete Version
                </button>
              </Form>
            )}
          </div>

          <div
            className="row"
            style={{ gap: 12, flexWrap: "wrap", marginTop: 6 }}
          >
            <span className="meta">
              {activeFileLabel}: {activeFileName || "Missing"}
            </span>
            {version.notes && (
              <span className="muted" style={{ fontStyle: "italic" }}>
                Notes: {truncatedNotes}
              </span>
            )}
          </div>
          {isBlindFileMissing && (
            <p className="muted" style={{ marginTop: 8 }}>
              A blinded file has not been uploaded for this version yet.
            </p>
          )}

          {canEditNotes && (
            <div className="section-compact" style={{ marginTop: 10 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>Version Notes</h4>
              <Form method="post" className="list">
                <input type="hidden" name="intent" value="updateNotes" />
                <textarea
                  name="notes"
                  defaultValue={version.notes || ""}
                  rows={3}
                  className="textarea"
                  placeholder="Add context about the changes in this version..."
                />
                <button type="submit" className="btn btn-accent">
                  Save Notes
                </button>
              </Form>
              {version.notes && (
                <Form
                  method="post"
                  style={{ marginTop: 8 }}
                  onSubmit={(e) =>
                    !confirm("Remove the notes for this version?") &&
                    e.preventDefault()
                  }
                >
                  <input type="hidden" name="intent" value="deleteNotes" />
                  <button type="submit" className="btn btn-ghost">
                    Delete Notes
                  </button>
                </Form>
              )}
            </div>
          )}

          {isAdmin && (
            <div className="section-compact" style={{ marginTop: 10 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>
                Admin File Replacement
              </h4>
              <p className="muted text-sm" style={{ margin: "0 0 8px" }}>
                Replace the original file, or add/replace the blinded review
                file, without creating a new version.
              </p>
              <div className="card-grid">
                <Form
                  method="post"
                  encType="multipart/form-data"
                  className="list"
                  onSubmit={(e) => {
                    if (
                      !confirm(
                        "Replace the original file for this version in storage?"
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="intent" value="replaceOriginalFile" />
                  <input
                    type="file"
                    name="replacementOriginalFile"
                    accept={ARTICLE_FILE_ACCEPT}
                    required
                    className="input"
                  />
                  <button type="submit" className="btn btn-warn">
                    Replace Original File
                  </button>
                </Form>

                <Form
                  method="post"
                  encType="multipart/form-data"
                  className="list"
                  onSubmit={(e) => {
                    if (
                      !confirm(
                        "Replace the blinded review file for this version in storage?"
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="intent" value="replaceBlindFile" />
                  <input
                    type="file"
                    name="replacementBlindFile"
                    accept={ARTICLE_FILE_ACCEPT}
                    required
                    className="input"
                  />
                  <button type="submit" className="btn btn-warn">
                    {version.hasBlindFile
                      ? "Replace Blinded File"
                      : "Add Blinded File"}
                  </button>
                </Form>
              </div>
            </div>
          )}

          <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            {fileDownloadUrl && (
              <a
                href={fileDownloadUrl}
                className="btn btn-accent"
                target="_blank"
                rel="noopener noreferrer"
              >
                Download / View {activeFileLabel}
              </a>
            )}
            {copyrightDownloadUrl && copyrightFileName && (
              <a
                href={copyrightDownloadUrl}
                className="btn btn-ghost"
                target="_blank"
                rel="noopener noreferrer"
              >
                Copyright Consent
              </a>
            )}
          </div>
          {articleFileAccessError && (
            <p className="muted" style={{ marginTop: 10 }}>
              {articleFileAccessError}
            </p>
          )}

          {fileViewUrl &&
            activeFileName?.toLowerCase().endsWith(".pdf") && (
              <div style={{ marginTop: 12 }}>
                <iframe
                  src={fileViewUrl}
                  className="w-full"
                  style={{
                    height: 520,
                    border: `1px solid var(--border)`,
                    borderRadius: 6,
                  }}
                  title="PDF Viewer"
                />
              </div>
            )}
        </div>

        <div className="section">
          <h3 style={{ fontSize: 18, marginBottom: 10 }}>Reviews & Comments</h3>

          {user ? (
            <commentFetcher.Form
              method="post"
              ref={(form) => {
                if (form && !commentFormsRef.current.includes(form)) {
                  commentFormsRef.current.push(form);
                }
                formRef.current = form || null;
              }}
              className="list"
              style={{ marginBottom: 12 }}
              onSubmit={() => {
                handledCommentSuccess.current = false;
              }}
            >
              <input type="hidden" name="intent" value="addComment" />
              <textarea
                name="body"
                rows={3}
                required
                className="textarea"
                placeholder="Write your review or comment..."
              />
              <button
                type="submit"
                className="btn btn-accent"
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

          <div className="card-grid">
            {comments.map((comment) => {
              const commentReplies = replies.filter(
                (r) => r.parent_id === comment.id
              );

              return (
                <div
                  key={comment.id}
                  className="section-compact"
                  style={{ borderRadius: 6 }}
                >
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      {hideReviewerIdentity ? (
                        "Anonymous reviewer"
                      ) : (
                        <UserLink user={comment.author} />
                      )}
                    </span>
                    {!hideReviewerIdentity && comment.author && (
                      <RoleBadge
                        role={comment.author.role_type}
                        className="text-xs py-0 px-1"
                      />
                    )}
                    <span className="meta">{comment.formattedDate}</span>
                    {(user?.id === comment.author_id || isAdmin) && (
                      <div className="row" style={{ gap: 6 }}>
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
                  <p className="muted" style={{ marginTop: 4 }}>
                    {comment.body}
                  </p>

                  {commentReplies.length > 0 && (
                    <div className="card-grid" style={{ marginTop: 8 }}>
                      {commentReplies.map((reply) => (
                        <div
                          key={reply.id}
                          className="section-compact"
                          style={{ background: "var(--surface-2)" }}
                        >
                          <div className="row" style={{ gap: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>
                              {hideReviewerIdentity ? (
                                "Anonymous reply"
                              ) : (
                                <UserLink user={reply.author} />
                              )}
                            </span>
                            {!hideReviewerIdentity && reply.author && (
                              <RoleBadge
                                role={reply.author.role_type}
                                className="text-xs py-0 px-1"
                              />
                            )}
                            <span className="meta">{reply.formattedDate}</span>
                          </div>
                          <p className="muted" style={{ marginTop: 4 }}>
                            {reply.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {user && (
                    <details style={{ marginTop: 8 }}>
                      <summary className="nav-link" style={{ padding: 0 }}>
                        Reply
                      </summary>
                      <commentFetcher.Form
                        method="post"
                        style={{ marginTop: 6 }}
                        ref={(form) => {
                          if (form && !commentFormsRef.current.includes(form)) {
                            commentFormsRef.current.push(form);
                          }
                        }}
                        onSubmit={() => {
                          handledCommentSuccess.current = false;
                        }}
                      >
                        <input type="hidden" name="intent" value="addComment" />
                        <input
                          type="hidden"
                          name="parentId"
                          value={comment.id}
                        />
                        <textarea
                          name="body"
                          rows={2}
                          required
                          className="textarea"
                          placeholder="Write a reply..."
                        />
                        <button
                          type="submit"
                          className="btn btn-accent"
                          style={{ marginTop: 6 }}
                          disabled={commentFetcher.state === "submitting"}
                        >
                          {commentFetcher.state === "submitting"
                            ? "Posting..."
                            : "Reply"}
                        </button>
                      </commentFetcher.Form>
                    </details>
                  )}
                </div>
              );
            })}

            {comments.length === 0 && (
              <p className="muted">No comments yet. Be the first to review!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
