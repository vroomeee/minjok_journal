import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

// Server-side loader to get user info
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return { user, profile };
}

export default function Home() {
  const { user, profile } = useLoaderData<typeof loader>();

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />
      <div className="page-body">
        <div className="hero">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h1 style={{ fontSize: 30, margin: 0 }}>Minjok Journal</h1>
            <p className="muted" style={{ margin: 0 }}>
              Academic Paper Review Platform for Mentors and Mentees
            </p>
            <div className="row" style={{ gap: 10 }}>
              <Link to="/papers" className="btn btn-accent">
                Browse Papers
              </Link>
            </div>
          </div>
        </div>

        <div className="tile-grid">
          <div className="tile">
            <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Upload & Review</h3>
            <p className="muted" style={{ margin: 0 }}>
              Submit academic papers with version control and receive detailed
              reviews.
            </p>
          </div>
          <div className="tile">
            <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Q&A System</h3>
            <p className="muted" style={{ margin: 0 }}>
              Ask questions and get expert answers from mentors.
            </p>
          </div>
          <div className="tile">
            <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Community Board</h3>
            <p className="muted" style={{ margin: 0 }}>
              Stay updated with announcements and discussions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
