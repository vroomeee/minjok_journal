# Permissions (Minjok Journal)

This document summarizes permissions as implemented in two places:
1. Supabase Row Level Security (RLS) policies from `supabase-schema.sql`.
2. App-level checks in server loaders/actions under `app/routes`.

When these two differ, the **database (RLS) wins** unless a service-role client is used.

## Roles
User roles are stored in `profiles.role_type` and used by the app:
- `mentee`
- `mentor`
- `prof`
- `admin`

## Database RLS (current in `supabase-schema.sql`)
These policies are the source of truth for what a logged-in user can do in the database.

| Resource | Read (SELECT) | Create (INSERT) | Update | Delete |
| --- | --- | --- | --- | --- |
| `profiles` | anyone | user can insert own profile | user can update own profile | not defined |
| `articles` | anyone | authenticated author (author_id = auth.uid) | author only | author or admin |
| `article_versions` | anyone | author of parent article | no policy | no policy |
| `comments` | anyone | authenticated author | author only | author only |
| `board_posts` | anyone | admin only | admin only | admin only |
| `qna_questions` | anyone | authenticated author | author only | author only |
| `qna_replies` | anyone | mentor only | author only | author only |
| storage buckets | policies commented out | policies commented out | policies commented out | policies commented out |

Notes:
- `issues`, `volumes`, `issue_articles`, `volume_issues`, and `article_authors` are **not defined** in `supabase-schema.sql`, but are used throughout the app.
- Storage policies for `articles` are commented out, and no `covers` bucket is defined in schema.

## App-Level Permissions (routes)
These are enforced in server loaders/actions. If RLS is stricter, RLS will block the action.

### Profiles
- Edit profile: only the profile owner (`app/routes/profile/$userId.edit.tsx`).
- Admin panel (role changes): admin only (`app/routes/admin.tsx`).

### Papers (articles)
- Create new paper: any authenticated user (`app/routes/papers/new.tsx`).
- Edit title/description: author or admin (`app/routes/papers/$paperId.edit.tsx`).
- Delete paper: author or admin (`app/routes/papers/$paperId.tsx`).
- Submit for review: author only, `draft -> in_review` (`app/routes/papers/$paperId.tsx`).
- Publish: admin only, `in_review -> published` (`app/routes/papers/$paperId.publish.tsx`).
- Unpublish: author or admin, `published|in_review -> draft` (`app/routes/papers/$paperId.tsx`).
- Upload new version: author only (`app/routes/papers/$paperId.new-version.tsx`).
- Delete version: author or admin (`app/routes/papers/$paperId.versions.$versionId.tsx`).
- Edit/delete version notes: author or admin (`app/routes/papers/$paperId.versions.$versionId.tsx`).
- Paper comments (published only): any authenticated user can create.
- Edit/delete paper comments: comment author or admin (`app/routes/papers/$paperId.tsx`).

### Review Queue
- View review queue: mentor, prof, or admin (`app/routes/review.tsx`).

### Board
- Create board post: admin only (`app/routes/board/new.tsx`).
- Edit/delete board post: author or admin (`app/routes/board/$postId.edit.tsx`, `app/routes/board/$postId.tsx`).
- Board comments: any authenticated user can create.
- Edit/delete board comments: comment author or admin (`app/routes/board/$postId.tsx`).

### Q&A
- Ask question: any authenticated user (`app/routes/qna/new.tsx`).
- Edit/delete question: author or admin (`app/routes/qna/$questionId.tsx`, `app/routes/qna/$questionId.edit.tsx`).
- Reply: mentor or admin only (`app/routes/qna/$questionId.tsx`).
- Edit/delete reply: reply author or admin (`app/routes/qna/$questionId.tsx`, `app/routes/qna/reply/$replyId.edit.tsx`).

### Issues & Volumes
- Create/delete issues: admin only (`app/routes/issues.tsx`).
- Create/delete volumes: admin only (`app/routes/volumes.tsx`).
- View issue: non-admins see only `released` issues (`app/routes/issues.$issueId.tsx`).
- View volume: non-admins see only `released` volumes (`app/routes/volumes.$volumeId.tsx`).

## Known Gaps (App vs RLS)
These are places where the app expects behavior that RLS does not currently allow.

1. Admin profile edits are blocked by RLS  
   App allows admins to update any profile role. RLS only allows users to update themselves.

2. Admin updates to articles are blocked by RLS  
   App allows admins to update titles/status. RLS only allows authors to update.

3. Version notes + version deletes may be blocked  
   RLS has no `UPDATE` or `DELETE` policy on `article_versions`.

4. Admin comment moderation is blocked by RLS  
   App allows admins to edit/delete comments. RLS only allows comment authors.

5. Q&A replies by admins are blocked by RLS  
   App allows admins to reply and edit/delete. RLS only allows mentors to insert and authors to update/delete.

6. Issues/Volumes tables and policies are missing in `supabase-schema.sql`  
   The app relies on these tables and expects admin-only management with public read for released content.

7. Storage policies are missing  
   The app uploads to `articles` and `covers` buckets; without policies, these operations will fail for normal users.

## Summary
Treat this doc as the “expected” permission model. If something fails in production, verify the RLS policies first, then align app checks if needed.
