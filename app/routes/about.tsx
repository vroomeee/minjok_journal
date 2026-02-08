import { useRouteLoaderData } from "react-router";
import { Nav } from "~/components/nav";

export default function About() {
  const rootData = useRouteLoaderData("root") as
    | { user?: { id: string; email?: string }; profile?: { role_type: "mentor" | "mentee" | "admin" | "prof"; email: string | null } }
    | null;
  const user = rootData?.user;
  const profile = rootData?.profile;

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />
      <div className="page-body">
        <div className="section">
          <h1 style={{ fontSize: 24, margin: 0 }}>Minjok Journal</h1>
          <p className="muted" style={{ margin: "4px 0 24px 0" }}>
            Official Academic Journal of Korean Minjok Leadership Academy
          </p>

          <section className="section-compact" style={{ borderRadius: 8 }}>
            <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>
              What is Minjok Journal?
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              Minjok Journal is a peer-reviewed academic journal that publishes
              research papers written by high school students. Our mission is to
              bridge the gap between student research and professional academic
              standards by providing a platform for students to publish, review,
              and present their work.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
