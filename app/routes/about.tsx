import { useLoaderData, Link } from "react-router";
import type { Route } from "./+types/about";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

export default function About() {
  const { user, profile } = useLoaderData<typeof loader>();

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />
      <div className="page-body">
        <div className="section">
          <div
            className="row"
            style={{ justifyContent: "space-between", marginBottom: 12 }}
          >
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>About Minjok Journal</h1>
              <p className="muted" style={{ margin: 0 }}>
                Academic paper review platform for mentors and mentees.
              </p>
            </div>
            <Link to="/auth/signup" className="btn btn-accent">
              Get Started
            </Link>
          </div>

          <div className="list">
            <section className="section-compact" style={{ borderRadius: 8 }}>
              <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>
                What is Minjok Journal?
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                Minjok Journal connects mentors and mentees to submit academic
                work, receive expert feedback, and collaborate on research
                through structured reviews and discussions.
              </p>
            </section>

            <section className="section-compact" style={{ borderRadius: 8 }}>
              <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>Key Features</h2>
              <ul
                className="muted"
                style={{ margin: 0, paddingLeft: 16, lineHeight: 1.6 }}
              >
                <li>
                  Paper submission with version control and tracked revisions.
                </li>
                <li>Structured reviews from mentors and peers.</li>
                <li>Q&A platform for domain-specific questions.</li>
                <li>Community board for announcements and updates.</li>
                <li>Role-based system distinguishing mentors and mentees.</li>
              </ul>
            </section>

            <section className="section-compact" style={{ borderRadius: 8 }}>
              <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>Roles</h2>
              <div className="list" style={{ gap: 8 }}>
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <RoleBadge role="mentee" />
                    <h3 style={{ margin: 0, fontSize: 14 }}>Mentees</h3>
                  </div>
                  <p className="muted" style={{ margin: "4px 0 0 0" }}>
                    Submit papers, ask questions, and seek feedback from
                    mentors.
                  </p>
                </div>
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <RoleBadge role="mentor" />
                    <h3 style={{ margin: 0, fontSize: 14 }}>Mentors</h3>
                  </div>
                  <p className="muted" style={{ margin: "4px 0 0 0" }}>
                    Provide reviews, answer questions, and guide mentees through
                    research.
                  </p>
                </div>
              </div>
            </section>

            <section className="section-compact" style={{ borderRadius: 8 }}>
              <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>Get Started</h2>
              <p className="muted" style={{ margin: 0 }}>
                Create an account to submit papers, join discussions, and
                collaborate with mentors.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
