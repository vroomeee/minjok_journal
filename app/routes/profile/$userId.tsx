import { useLoaderData, Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/$userId";
import { createSupabaseServerClient, getUserProfile } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { Link } from "react-router";

// Server-side loader to fetch user profile and their papers
export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { userId } = params;

  // Get current user (optional)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let currentUserProfile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    currentUserProfile = data;
  }

  // Fetch profile of the page owner
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    throw new Response("Profile not found", { status: 404 });
  }

  // Fetch papers authored by this user
  const { data: papers } = await supabase
    .from("articles")
    .select("*")
    .eq("author_id", userId)
    .order("created_at", { ascending: false });

  return {
    profile,
    papers: papers || [],
    user,
    currentUserProfile,
  };
}

// Server-side action to delete user (admin only)
export async function action({ request, params }: Route.ActionArgs) {
  const { userId } = params;
  const { user, profile } = await getUserProfile(request);

  // Check if user is admin
  if (profile.admin_type !== "admin") {
    throw new Response("Unauthorized: Admin access required", { status: 403 });
  }

  const { supabase } = createSupabaseServerClient(request);

  // Delete user from auth.users (cascades to profiles and related data)
  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) {
    return { error: "Failed to delete user account" };
  }

  return redirect("/");
}

export default function Profile() {
  const { profile, papers, user, currentUserProfile } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const isOwnProfile = user?.id === profile.id;
  const isAdmin = currentUserProfile?.admin_type === "admin";

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav user={user || undefined} profile={currentUserProfile || undefined} />

      <div className="container mx-auto px-4 py-8">
        {actionData?.error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{actionData.error}</p>
          </div>
        )}

        {/* Profile header */}
        <div className="bg-white rounded-lg shadow p-8 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {profile.full_name || profile.username}
              </h1>
              {profile.username && profile.full_name && (
                <p className="text-gray-600 mb-4">@{profile.username}</p>
              )}

              <div className="flex items-center space-x-3 mb-4">
                <RoleBadge role={profile.role_type} />
                {profile.admin_type === "admin" && (
                  <span className="px-2 py-1 rounded text-xs font-semibold bg-red-500 text-white">
                    Admin
                  </span>
                )}
              </div>

              {profile.intro && (
                <p className="text-gray-700 max-w-2xl">{profile.intro}</p>
              )}
            </div>

            {isAdmin && !isOwnProfile && (
              <Form method="post">
                <button
                  type="submit"
                  onClick={(e) =>
                    !confirm(
                      "Are you sure you want to delete this user account? This action cannot be undone."
                    ) && e.preventDefault()
                  }
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Delete User
                </button>
              </Form>
            )}
          </div>
        </div>

        {/* User's papers */}
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            {isOwnProfile ? "My Papers" : "Papers"}
          </h2>

          {papers.length === 0 ? (
            <p className="text-gray-500">No papers submitted yet.</p>
          ) : (
            <div className="grid gap-4">
              {papers.map((paper) => (
                <div
                  key={paper.id}
                  className="border rounded-lg p-4 hover:border-blue-500 transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <Link
                        to={`/papers/${paper.id}`}
                        className="text-lg font-semibold text-gray-900 hover:text-blue-600"
                      >
                        {paper.title}
                      </Link>
                      <p className="text-sm text-gray-500 mt-1">
                        {new Date(paper.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        paper.status === "published"
                          ? "bg-green-100 text-green-800"
                          : paper.status === "in_review"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {paper.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
