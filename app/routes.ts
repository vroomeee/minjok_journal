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

  // Paper routes
  route("papers", "routes/papers.tsx"),
  route("papers/new", "routes/papers/new.tsx"),
  route("papers/:paperId", "routes/papers/$paperId.tsx"),
  route("papers/:paperId/new-version", "routes/papers/$paperId.new-version.tsx"),
  route("papers/:paperId/versions/:versionId", "routes/papers/$paperId.versions.$versionId.tsx"),

  // User routes
  route("my-papers", "routes/my-papers.tsx"),
  route("review", "routes/review.tsx"),
  route("profile/:userId", "routes/profile/$userId.tsx"),

  // Community routes
  route("qna", "routes/qna.tsx"),
  route("board", "routes/board.tsx"),
  route("board/new", "routes/board/new.tsx"),
  route("board/:postId", "routes/board/$postId.tsx"),
] satisfies RouteConfig;
