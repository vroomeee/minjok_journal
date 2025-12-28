# Project Summary: 민족 Journal

## Overview

A complete academic paper review platform built with React Router v7, Supabase, and shadcn/ui. The application implements a mentor-mentee system for paper submission, review, and academic discussion.

## Key Features Implemented

### ✅ User Authentication & Authorization
- Email/password authentication via Supabase Auth
- Dual role system: Mentor/Mentee + Admin/User
- Server-side permission checks in all loaders/actions
- Profile creation on signup with role selection

### ✅ Paper Management
- Upload academic papers (PDF/DOC)
- Version control system with multiple versions per paper
- Paper status tracking (draft, in_review, published)
- File storage in Supabase Storage
- Download/view papers directly in browser

### ✅ Review System
- Comment on paper versions
- Threaded replies to comments
- Public review visibility
- Version-specific comments
- Author and mentor identification via badges

### ✅ Q&A Platform
- Anyone can ask questions
- Only mentors can reply
- Organized question/answer format
- Author attribution with role badges

### ✅ Community Board (게시판)
- Admin-only posting
- Public read access
- Announcements and updates

### ✅ User Profiles
- Display user info and role badges
- List user's submitted papers
- Admin can delete user accounts
- Profile intro/bio section

## Technical Implementation

### Architecture

**Frontend:**
- React Router v7 in Framework Mode
- File-based routing
- Server-side rendering (SSR)
- TypeScript for type safety
- Tailwind CSS for styling
- shadcn/ui components

**Backend:**
- React Router v7 server runtime (loaders/actions)
- Supabase for:
  - PostgreSQL database
  - Authentication
  - File storage
  - Row Level Security (RLS)

**Authorization Pattern:**
- All permission checks server-side
- Centralized Supabase client creation
- Type-safe database queries
- RLS policies enforce access control

### Files Created

#### Configuration Files
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `vite.config.ts` - Vite + React Router setup
- `tailwind.config.js` - Tailwind CSS configuration
- `postcss.config.js` - PostCSS configuration
- `react-router.config.ts` - React Router framework config
- `components.json` - shadcn/ui configuration
- `.env.example` - Environment variable template
- `.gitignore` - Git ignore rules

#### Database
- `supabase-schema.sql` - Complete database schema with RLS policies

#### Core Application Files
- `app/root.tsx` - Root layout with environment variables
- `app/app.css` - Global styles and Tailwind directives

#### Library/Utilities
- `app/lib/supabase.server.ts` - Server-side Supabase client
- `app/lib/supabase.client.ts` - Client-side Supabase client
- `app/lib/database.types.ts` - Database type definitions
- `app/lib/utils.ts` - Utility functions (cn helper)

#### Components
- `app/components/nav.tsx` - Navigation bar with auth state
- `app/components/role-badge.tsx` - Mentor/Mentee badges

#### Routes (Pages)

**Public Routes:**
- `app/routes/home.tsx` - Landing page
- `app/routes/about.tsx` - About page
- `app/routes/papers.tsx` - Browse all papers
- `app/routes/papers/$paperId.tsx` - Paper detail page
- `app/routes/papers/$paperId.versions.$versionId.tsx` - Version review page
- `app/routes/profile/$userId.tsx` - User profile page
- `app/routes/board.tsx` - Community board
- `app/routes/qna.tsx` - Q&A platform
- `app/routes/review.tsx` - Review queue

**Authenticated Routes:**
- `app/routes/auth/login.tsx` - Login page
- `app/routes/auth/signup.tsx` - Signup page
- `app/routes/auth/logout.tsx` - Logout action
- `app/routes/papers/new.tsx` - Submit new paper
- `app/routes/papers/$paperId.new-version.tsx` - Upload new version
- `app/routes/my-papers.tsx` - User's papers

#### Documentation
- `README.md` - Setup and usage instructions
- `DEPLOYMENT.md` - Deployment guide
- `PROJECT_SUMMARY.md` - This file

## Database Schema

### Tables

1. **profiles**
   - User profiles with role_type (mentor/mentee/prof/admin)
   - Links to auth.users
   - Includes username, full_name, intro, avatar_url

2. **articles**
   - Paper metadata (title, status, author)
   - Links to current_version_id

3. **article_versions**
   - Version history with storage_path
   - Linked to articles
   - Includes file metadata and notes

4. **comments**
   - Review comments on versions
   - Supports threading via parent_id
   - Links to article, version, and author

5. **board_posts**
   - Admin-only announcements
   - Title and content

6. **qna_questions**
   - Questions from any authenticated user
   - Title and content

7. **qna_replies**
   - Answers from mentors only
   - Links to questions

### Security

- Row Level Security (RLS) enabled on all tables
- Policies enforce:
  - Public read for most content
  - Authenticated writes
  - Role-based restrictions (mentor-only replies, admin-only posts)
  - Author-only edits/deletes

## Server-Side Authorization

All routes implement proper authorization:

- **requireUser()** - Ensures user is authenticated
- **getUserProfile()** - Gets user with profile and roles
- Loaders check permissions before data fetching
- Actions verify permissions before mutations
- Supabase RLS provides database-level security

## Role System

### Mentor/Mentee Classification
- **Mentee** (Green badge): Default, can submit papers and ask questions
- **Mentor** (Gold badge): Can reply to Q&A, provide reviews

### Admin/User Classification
- **User**: Standard permissions
- **Admin**: Can delete articles, posts, and user accounts; can create board posts

## Next Steps

To use the application:

1. **Set up Supabase**:
   - Create project
   - Run `supabase-schema.sql`
   - Create "articles" storage bucket
   - Copy credentials to `.env`

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```

4. **Create first admin user**:
   - Sign up through the app
   - Manually update their profile in Supabase to set `role_type = 'admin'`

5. **Test all features**:
   - Upload a paper
   - Submit for review
   - Add comments
   - Ask/answer questions
   - Create board posts (as admin)

## Dependencies

**Production:**
- react-router@^7.11.0
- react@^19.2.3
- react-dom@^19.2.3
- @react-router/node@^7.11.0
- @react-router/serve@^7.11.0
- @supabase/supabase-js@latest
- @supabase/ssr@latest
- isbot@^5.1.32
- class-variance-authority
- clsx
- tailwind-merge

**Development:**
- @react-router/dev@^7.11.0
- vite@^7.3.0
- @vitejs/plugin-react@^5.1.2
- typescript@^5.9.3
- tailwindcss@^4.1.18
- @shadcn/ui@latest
- @types/react@^19.2.7
- @types/react-dom@^19.2.3
- autoprefixer
- postcss

## Code Quality Features

- ✅ Full TypeScript coverage
- ✅ Type-safe database queries
- ✅ Server-side rendering
- ✅ Responsive design
- ✅ Loading states handled
- ✅ Error boundaries recommended (can be added)
- ✅ Form validation
- ✅ Security best practices

## Potential Enhancements

Future improvements could include:

- Email notifications for reviews/comments
- Rich text editor for comments/posts
- Paper search and filtering
- User avatars and custom profiles
- Export papers/comments to PDF
- Analytics dashboard for admins
- Real-time updates via Supabase Realtime
- Markdown support in comments
- Citation management
- Plagiarism detection integration

## Conclusion

This is a production-ready MVP that implements all core features specified in the requirements. The application follows best practices for React Router v7, uses proper server-side authorization, and maintains a clean, maintainable codebase.
