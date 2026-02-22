import { useEffect, useState } from "react";
import { Link, type LoaderFunctionArgs, redirect, useLoaderData, useNavigate } from "react-router";
import { type EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { createSupabaseBrowserClient } from "~/lib/supabase.client";
import { buildAuthFeedback, type AuthFeedbackCode } from "~/lib/auth-feedback";

type ConfirmLoaderData = {
  next?: string;
  code?: AuthFeedbackCode;
  error?: string;
  hint?: string;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const requestUrl = new URL(request.url);
  const token_hash =
    requestUrl.searchParams.get("token_hash") ||
    requestUrl.searchParams.get("token") ||
    requestUrl.searchParams.get("code");
  const type = (requestUrl.searchParams.get("type") as EmailOtpType | null) || "signup";
  const _next = requestUrl.searchParams.get("next");
  const next = _next?.startsWith("/") ? _next : "/";

  const { supabase, headers } = createSupabaseServerClient(request);

  async function resolveTarget() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (next) return next;
    if (user?.id) return `/profile/${user.id}`;
    return "/";
  }

  // If Supabase already created a session (e.g., after hitting the verify endpoint),
  // just continue to the requested page.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    const target = await resolveTarget();
    return redirect(target, { headers });
  }

  // Otherwise, try to verify using the token we were given.
  if (token_hash) {
    // First try the standard verifyOtp flow
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      const target = await resolveTarget();
      return redirect(target, { headers });
    }

    // If that fails (e.g., PKCE tokens), try exchanging for a session
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(token_hash);
    if (!exchangeError) {
      const target = await resolveTarget();
      return redirect(target, { headers });
    }

    const feedback = buildAuthFeedback("confirm", exchangeError ?? error);

    return Response.json(
      { next, ...feedback },
      { status: 400, headers }
    );
  }

  // No token on the server; let the client try to use hash tokens from the URL.
  return Response.json({ next });
}

export default function ConfirmPage() {
  const data = useLoaderData<typeof loader>() as ConfirmLoaderData | null;
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "error">(data?.error ? "error" : "loading");
  const [message, setMessage] = useState<string | null>(data?.error ?? null);
  const [hint, setHint] = useState<string | null>(data?.hint ?? null);
  const [code, setCode] = useState<AuthFeedbackCode | undefined>(data?.code);

  useEffect(() => {
    let active = true;
    async function handleHash() {
      if (data?.error) return;
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const access_token = hashParams.get("access_token");
      const refresh_token = hashParams.get("refresh_token");
      const error = hashParams.get("error_description") || hashParams.get("error");

      if (error) {
        const feedback = buildAuthFeedback("confirm", error);
        if (!active) return;
        setStatus("error");
        setCode(feedback.code);
        setMessage(feedback.error);
        setHint(feedback.hint ?? null);
        return;
      }

      if (access_token && refresh_token) {
        const supabase = createSupabaseBrowserClient();
        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (sessionError) {
          const feedback = buildAuthFeedback("confirm", sessionError);
          if (!active) return;
          setStatus("error");
          setCode(feedback.code);
          setMessage(feedback.error);
          setHint(feedback.hint ?? null);
          return;
        }

        // After setting session, fetch user to build profile redirect if no explicit next.
        const { data: userData } = await supabase.auth.getUser();
        const target =
          data?.next ||
          (userData?.user?.id ? `/profile/${userData.user.id}` : "/");

        if (!active) return;
        navigate(target, { replace: true });
      } else {
        setStatus("error");
        setCode("expired_or_invalid_link");
        setMessage("This confirmation link is missing required token data.");
        setHint("Request a new confirmation email and use the newest link.");
      }
    }

    void handleHash();
    return () => {
      active = false;
    };
  }, [data?.next, data?.error, navigate]);

  return (
    <div className="page">
      <div className="page-body" style={{ maxWidth: 520 }}>
        <div className="section">
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Confirming your account...</h1>
          {status === "loading" && (
            <p className="muted">Finalizing confirmation. Please wait a moment.</p>
          )}
          {status === "error" && (
            <>
              <p className="muted" style={{ color: "#f6b8bd" }}>
                {message || "Confirmation link is invalid or expired."}
              </p>
              {hint && (
                <p className="muted" style={{ marginTop: 8 }}>
                  {hint}
                </p>
              )}
              {(code === "expired_or_invalid_link" || code === "email_not_confirmed" || code === "unknown") && (
                <div className="row" style={{ marginTop: 10 }}>
                  <Link to="/auth/resend" className="btn btn-ghost">
                    Resend confirmation email
                  </Link>
                  <Link to="/auth/login" className="btn btn-ghost">
                    Back to login
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

