# 민족 Journal

An academic paper review platform built with React Router v7, Supabase, and shadcn/ui. This platform connects mentors and mentees in a collaborative learning environment for academic paper submission, review, and discussion.

## Features

- **User Roles**: Dual classification system (Mentor/Mentee + Admin/User)
- **Paper Management**: Upload academic papers with version control
- **Review System**: Comment and provide feedback on paper versions
- **Q&A Platform**: Ask questions (anyone) and get answers (mentors only)
- **Community Board**: Admin-only announcements and posts
- **Profile System**: User profiles with role badges and paper listings

## Tech Stack

- **Frontend Framework**: React Router v7 (Framework Mode)
- **UI Library**: shadcn/ui + Tailwind CSS
- **Backend**: Supabase (Auth + Postgres + Storage)
- **TypeScript**: Full type safety
- **Server Runtime**: React Router v7 loaders/actions pattern

## Project Structure

```
MinjokJournal/
├── app/
│   ├── routes/              # File-based routing
│   │   ├── home.tsx         # Home page
│   │   ├── papers.tsx       # Papers list
│   │   ├── papers/
│   │   │   ├── new.tsx      # Submit new paper
│   │   │   ├── $paperId.tsx # Paper detail
│   │   │   └── $paperId.versions.$versionId.tsx # Version review
│   │   ├── auth/
│   │   │   ├── login.tsx    # Login page
│   │   │   ├── signup.tsx   # Signup page
│   │   │   └── logout.tsx   # Logout action
│   │   ├── profile/
│   │   │   └── $userId.tsx  # User profile
│   │   ├── qna.tsx          # Q&A page
│   │   ├── board.tsx        # Community board
│   │   ├── review.tsx       # Review queue
│   │   ├── my-papers.tsx    # User's papers
│   │   └── about.tsx        # About page
│   ├── components/          # Reusable components
│   │   ├── nav.tsx          # Navigation bar
│   │   ├── role-badge.tsx   # Role display badges
│   │   └── ui/              # shadcn/ui components
│   ├── lib/
│   │   ├── supabase.server.ts  # Server-side Supabase client
│   │   ├── supabase.client.ts  # Client-side Supabase client
│   │   ├── database.types.ts   # Database type definitions
│   │   └── utils.ts            # Utility functions
│   ├── root.tsx             # Root layout
│   └── app.css              # Global styles
├── supabase-schema.sql      # Database schema
├── vite.config.ts           # Vite configuration
├── tailwind.config.js       # Tailwind configuration
├── react-router.config.ts   # React Router configuration
└── package.json             # Dependencies
```

## Setup Instructions

### 1. Prerequisites

- Node.js 20.19+ (or 22.12+)
- npm or pnpm
- A Supabase account and project

### 2. Clone and Install Dependencies

```bash
cd MinjokJournal
npm install
```

### 3. Supabase Setup

#### Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be fully initialized

#### Set Up Database Schema

1. Open your Supabase project dashboard
2. Go to the SQL Editor
3. Copy the contents of `supabase-schema.sql`
4. Paste and execute the SQL in the SQL Editor

This will create:
- `profiles` table with user roles
- `articles` table for papers
- `article_versions` table for version control
- `comments` table for reviews
- `board_posts` table for announcements
- `qna_questions` and `qna_replies` tables for Q&A
- Row Level Security (RLS) policies
- Necessary indexes and triggers

#### Set Up Storage Bucket

1. Go to Storage in your Supabase dashboard
2. Create a new bucket named `articles`
3. Set it to public (or configure policies as needed)

#### Get Your Supabase Credentials

1. Go to Project Settings > API
2. Copy your Project URL and anon/public key

### 4. Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```env
SUPABASE_URL=your-project-url
SUPABASE_ANON_KEY=your-anon-key
```

### 5. Run the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### 6. Build for Production

```bash
npm run build
npm start
```

## User Roles & Permissions

### Mentor vs Mentee

- **Mentee** (Green badge): Default role, can submit papers, ask questions, comment
- **Mentor** (Gold badge): Can do everything mentees can, plus answer Q&A questions

### Admin vs User

- **User**: Default permission level
- **Admin**: Can delete articles, create board posts, delete user accounts

## Key Routes

- `/` - Home page
- `/papers` - Browse all papers
- `/papers/:id` - View paper details and versions
- `/papers/:id/versions/:versionId` - View and review a specific version
- `/papers/new` - Submit a new paper
- `/my-papers` - View your submitted papers
- `/review` - Papers currently in review
- `/qna` - Ask and answer questions
- `/board` - Community announcements (게시판)
- `/profile/:userId` - User profile
- `/about` - About the platform
- `/auth/login` - Sign in
- `/auth/signup` - Create account

## Server-Side Features

All permission checks are enforced server-side using React Router v7's loader/action pattern:

- **Loaders**: Fetch data on the server before rendering
- **Actions**: Handle form submissions and mutations on the server
- **Authorization**: Check user roles and permissions in loaders/actions
- **Supabase Integration**: Centralized in `lib/supabase.server.ts`

## Database Schema Overview

### Core Tables

- **profiles**: User information and roles
- **articles**: Paper metadata
- **article_versions**: File versions with storage paths
- **comments**: Reviews and discussions
- **board_posts**: Admin announcements
- **qna_questions** & **qna_replies**: Q&A system

### Row Level Security

All tables have RLS enabled with appropriate policies:
- Public read access for most content
- Authenticated write access
- Role-based restrictions (e.g., mentor-only replies, admin-only posts)

## Development Notes

- This project uses React Router v7 in **framework mode** with file-based routing
- Server-side rendering (SSR) is enabled
- Supabase clients are created in a centralized location (`lib/supabase.server.ts` and `lib/supabase.client.ts`)
- All environment variables are passed to the client through the root loader
- TypeScript is used throughout for type safety

## Contributing

1. Make sure your code follows the existing patterns
2. Test authentication flows
3. Verify server-side authorization checks
4. Ensure responsive design with Tailwind CSS

## License

ISC
