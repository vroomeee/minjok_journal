import { Link, useSearchParams } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { buildAuthFeedback } from "~/lib/auth-feedback";

export default function AuthError() {
  const [searchParams] = useSearchParams();
  const queryError = searchParams?.get("error") || "";
  const feedback = buildAuthFeedback("confirm", queryError);

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Sorry, something went wrong.</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">{feedback.error}</p>
              {feedback.hint && <p className="mt-2 text-sm text-slate-600">{feedback.hint}</p>}
              <div className="mt-4 flex gap-2">
                <Link to="/auth/resend" className="btn btn-ghost">
                  Resend confirmation email
                </Link>
                <Link to="/auth/login" className="btn btn-ghost">
                  Back to login
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
