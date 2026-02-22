export type AuthFeedbackCode =
  | "email_not_confirmed"
  | "invalid_credentials"
  | "account_not_found"
  | "account_exists"
  | "already_confirmed"
  | "rate_limited"
  | "expired_or_invalid_link"
  | "weak_password"
  | "unknown";

export type AuthFeedbackContext =
  | "login"
  | "signup"
  | "resend"
  | "forgot_password"
  | "reset_password"
  | "confirm";

export type AuthFeedback = {
  code: AuthFeedbackCode;
  error: string;
  hint?: string;
};

function includesAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

function getErrorMessage(errorLike: unknown) {
  if (typeof errorLike === "string") return errorLike;
  if (
    errorLike &&
    typeof errorLike === "object" &&
    "message" in errorLike &&
    typeof (errorLike as { message?: unknown }).message === "string"
  ) {
    return (errorLike as { message: string }).message;
  }
  return "";
}

function fallbackFeedback(context: AuthFeedbackContext): AuthFeedback {
  switch (context) {
    case "login":
      return {
        code: "unknown",
        error: "Could not sign you in right now.",
        hint: "Double-check your email and password, then try again in a moment.",
      };
    case "signup":
      return {
        code: "unknown",
        error: "Could not create your account right now.",
        hint: "Please try again shortly. If it keeps happening, try a different email.",
      };
    case "resend":
      return {
        code: "unknown",
        error: "Could not resend the confirmation email.",
        hint: "Wait a minute and try again. Check that the email address is correct.",
      };
    case "forgot_password":
      return {
        code: "unknown",
        error: "Could not send a password reset email.",
        hint: "Wait a minute and try again, then check spam/promotions folders.",
      };
    case "reset_password":
      return {
        code: "unknown",
        error: "Could not reset your password.",
        hint: "Try a stronger password and submit again.",
      };
    case "confirm":
      return {
        code: "unknown",
        error: "Confirmation link is invalid or expired.",
        hint: "Request a new confirmation email and open the newest link.",
      };
    default:
      return {
        code: "unknown",
        error: "Authentication request failed.",
      };
  }
}

export function buildAuthFeedback(
  context: AuthFeedbackContext,
  errorLike: unknown
): AuthFeedback {
  const message = getErrorMessage(errorLike).toLowerCase();
  const fallback = fallbackFeedback(context);

  if (!message) return fallback;

  if (includesAny(message, ["already confirmed", "already verified"])) {
    return {
      code: "already_confirmed",
      error: "This email is already confirmed.",
      hint: "Go back to login and sign in with your password.",
    };
  }

  if (
    includesAny(message, [
      "email not confirmed",
      "email not verified",
      "confirm your email",
      "verify your email",
    ])
  ) {
    return {
      code: "email_not_confirmed",
      error: "Your email is not confirmed yet.",
      hint: "Open the confirmation email from signup, or request a new confirmation link.",
    };
  }

  if (
    includesAny(message, [
      "invalid login credentials",
      "invalid email or password",
      "invalid credentials",
      "authentication failed",
    ])
  ) {
    return {
      code: "invalid_credentials",
      error: "Email or password is incorrect.",
      hint: "Try again carefully, or use password reset if you cannot remember your password.",
    };
  }

  if (includesAny(message, ["already registered", "user already registered", "already exists"])) {
    return {
      code: "account_exists",
      error: "An account with this email already exists.",
      hint: "Sign in, or resend the confirmation email if you have not confirmed yet.",
    };
  }

  if (
    includesAny(message, [
      "too many requests",
      "over_email_send_rate_limit",
      "rate limit",
      "for security purposes",
    ])
  ) {
    return {
      code: "rate_limited",
      error: "Too many attempts in a short time.",
      hint: "Wait a minute and try again.",
    };
  }

  if (
    includesAny(message, [
      "expired",
      "invalid token",
      "token has expired",
      "token not found",
      "otp expired",
      "link is invalid",
      "bad_code_verifier",
    ])
  ) {
    return {
      code: "expired_or_invalid_link",
      error: "This link is invalid or has expired.",
      hint: "Request a fresh email and use the newest link.",
    };
  }

  if (
    includesAny(message, [
      "password should be",
      "password is too weak",
      "weak password",
      "password must",
    ])
  ) {
    return {
      code: "weak_password",
      error: "That password is too weak.",
      hint: "Use at least 8 characters with a mix of letters, numbers, and symbols.",
    };
  }

  return fallback;
}
