0. Stack and non-negotiables

React Router v7 (explicitly v7; use the v7 data APIs/actions/loaders patterns as appropriate).

UI: shadcn/ui + Tailwind.

Backend: Supabase (Auth + Postgres + Storage).

Server-side execution model: treat React Router’s server runtime as the “server side” (loaders/actions/server routes). Put privileged operations there.

Supabase access pattern: use the shadcn-provided server.ts as the place to create/configure Supabase clients (server/client as appropriate) and as the canonical integration point. Do not scatter Supabase client creation across files.

EXTREMELY IMPORTANT shadcn commands (must be used)

Install the shadcn Supabase integration for React Router:

npx shadcn@latest add @supabase/supabase-client-react-router

Install email/password auth integration:

npx shadcn@latest add @supabase/password-based-auth-react-router

1. Use MCP context

You are allowed and expected to use the Context MCP Server to fetch any missing details, patterns, or reference implementations for:

React Router v7 server runtime patterns (loaders/actions)

shadcn Supabase integration specifics

best practices for auth/session handling with RRv7 + Supabase

2. User system & roles

Every account has two independent classifications:

A) Mentor / Mentee

Every user is either mentor or mentee.

Display on:

Profile page

Anywhere usernames appear (papers list, comments, Q&A)

Styling requirement (simple MVP):

Mentors: username or user-id badge in gold

Mentees: username or user-id badge in green

B) Admin / User

Every user is either admin or user.

Admin permissions:

Can delete articles

Can create board posts (게시판) (admins only)

Can delete user accounts (from profile page)

3. Articles + version control (MVP)

Articles are uploaded as files (PDF/etc) to Supabase Storage.

Keep Postgres complexity minimal:

Postgres stores only:

Article metadata (title, author_id, status)

Versions with storage path references

Comments (including which version they belong to)

Version control requirements:

An article can have multiple versions.

Older versions remain viewable/downloadable.

“Current version” is easily identified.

Provide a simple, intuitive UI similar to “GitHub-like”, but simpler.

4. Comments & reviews

Logged-in users can comment on article versions.

Comments are tied to:

article_id

version_id

author_id

timestamps

body text

Q&A rule

Any logged-in user can ask questions.

Only mentors can reply (as comments under the question thread).

5. Required routes/pages (React Router v7)

Implement at least these routes:

/ Home

What the site is

Featured/best papers

/papers All Papers

List all papers

Filter/sort minimal

/papers/:paperId Paper detail

Metadata, current version, versions list

/papers/:paperId/versions/:versionId Version + review page

Show the version file (link/embedded)

Show review comments for that version

Add comment UI

/review Paper review queue

“In review” list

Click-through to version review page

/my-papers My papers

Auth required

List papers authored by current user

/board 게시판

Read posts public

Create post: admin-only

/qna Q&A

Auth required to ask

Only mentors can reply

/profile/:userId Profile

Intro text

Role badges (mentor/mentee + admin/user)

List authored papers

Admin-only: delete this user account

/auth/login and /auth/signup Login/Signup

Supabase email + password auth (using shadcn integration)

/about About

Simple intro page

Additional routes

You are allowed to add any routes you think are necessary for a clean MVP (e.g., /papers/new, /papers/:paperId/settings, etc.). Prefer minimal additions.

6. Authorization & server-side enforcement

All permission checks must be enforced server-side (React Router v7 server runtime):

Only admins can delete articles

Only admins can create board posts

Only mentors can reply in Q&A

Users can only edit/upload new versions for their own papers (unless admin)

7. Supabase schema (minimal SQL)

Provide a minimal SQL schema to create required tables and relations in Supabase Postgres.
Use the Supabase SQL Editor approach (so no manual Table Editor work is required).
Keep it small and readable.

Must include:

profiles table (user_id FK to auth.users)

roles (mentor/mentee and admin/user)

articles

article_versions (storage path)

comments

board_posts

qna_questions (or reuse a generic posts + type, but keep minimal)

8. Deliverables

Generate:

Recommended file structure

Minimal SQL schema

React Router v7 routes with loaders/actions

Supabase integration usage via shadcn server.ts (single place for client creation/config)

Storage upload + access flow (server-side)

Key UI components using shadcn/ui

Brief in-code comments explaining permission checks and data flow

Priorities:

MVP completeness and correctness

Minimal Postgres complexity

Server-side permission enforcement

Clean RRv7 routing/data APIs usage
