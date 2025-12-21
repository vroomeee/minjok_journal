import { useLoaderData } from "react-router";
import type { Route } from "./+types/about";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

// Server-side loader to get user info
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
    <div className="min-h-screen bg-gray-50">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-6">
            About 민족 Journal
          </h1>

          <div className="prose max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                What is 민족 Journal?
              </h2>
              <p className="text-gray-700">
                민족 Journal is an academic paper review platform designed to
                connect mentors and mentees in a collaborative learning
                environment. Our platform enables students and researchers to
                submit their academic work for review, receive expert feedback,
                and engage in meaningful discussions.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                Key Features
              </h2>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>
                  <strong>Paper Submission & Version Control:</strong> Upload
                  academic papers with support for multiple versions, making it
                  easy to track revisions and improvements over time.
                </li>
                <li>
                  <strong>Review System:</strong> Receive detailed feedback and
                  reviews from mentors and peers on your submitted work.
                </li>
                <li>
                  <strong>Q&A Platform:</strong> Ask questions and get expert
                  answers from experienced mentors in your field.
                </li>
                <li>
                  <strong>Community Board:</strong> Stay updated with
                  announcements, news, and important information.
                </li>
                <li>
                  <strong>Role-Based System:</strong> Clear distinction between
                  mentors and mentees, with specialized features for each role.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                Roles
              </h2>
              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    <span className="px-2 py-1 rounded text-xs bg-green-500 text-green-900 mr-2">
                      Mentee
                    </span>
                    Mentees
                  </h3>
                  <p className="text-gray-700 ml-16">
                    Students and researchers who submit papers for review, ask
                    questions, and seek guidance from mentors.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    <span className="px-2 py-1 rounded text-xs bg-yellow-500 text-yellow-900 mr-2">
                      Mentor
                    </span>
                    Mentors
                  </h3>
                  <p className="text-gray-700 ml-16">
                    Experienced academics and researchers who provide reviews,
                    answer questions, and guide mentees in their academic
                    journey.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                Get Started
              </h2>
              <p className="text-gray-700">
                Ready to join? Create an account to start submitting papers,
                engaging with the community, and advancing your academic work.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
