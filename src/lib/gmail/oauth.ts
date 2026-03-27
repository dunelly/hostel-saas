import { google } from "googleapis";

export function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`
  );
  return client;
}

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
