import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("about", "routes/about.tsx"),

  // Auth routes
  route("auth/login", "routes/auth/login.tsx"),
  route("auth/signup", "routes/auth/signup.tsx"),
  route("auth/logout", "routes/auth/logout.tsx"),
  route("auth/forgot-password", "routes/auth/forgot-password.tsx"),
  route("auth/reset-password", "routes/auth/reset-password.tsx"),
  route("auth/confirm", "routes/auth/confirm.tsx"),
  route("auth/error", "routes/auth/error.tsx"),
  route("auth/resend", "routes/auth/resend.tsx"),

  // Paper routes
  route("papers", "routes/papers.tsx"),
  route("papers/new", "routes/papers/new.tsx"),
  route("papers/:paperId", "routes/papers/$paperId.tsx"),
  route("papers/:paperId/publish", "routes/papers/$paperId.publish.tsx"),
  route(
    "papers/:paperId/new-version",
    "routes/papers/$paperId.new-version.tsx"
  ),
  route(
    "papers/:paperId/versions/:versionId",
    "routes/papers/$paperId.versions.$versionId.tsx"
  ),

  // User routes
  route("my-papers", "routes/my-papers.tsx"),
  route("review", "routes/review.tsx"),
  route("profile/:userId", "routes/profile/$userId.tsx"),

  // Community routes
  route("qna", "routes/qna.tsx"),
  route("qna/new", "routes/qna/new.tsx"),
  route("board", "routes/board.tsx"),
  route("board/new", "routes/board/new.tsx"),
  route("board/:postId", "routes/board/$postId.tsx"),
  route("board/:postId/edit", "routes/board/$postId.edit.tsx"),
] satisfies RouteConfig;
