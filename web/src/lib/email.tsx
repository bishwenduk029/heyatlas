import { Resend } from "resend";

import env from "@/env";
import { APP_NAME, RESEND_EMAIL_FROM } from "@/lib/config/constants";
const resend = new Resend(env.RESEND_API_KEY);

const DEFAULT_SENDER_NAME = APP_NAME;

export async function sendEmail(
  email: string,
  subject: string,
  html: string,
) {
  const { error } = await resend.emails.send({
    from: `${DEFAULT_SENDER_NAME} <${RESEND_EMAIL_FROM}>`,
    to: email,
    subject,
    html,
  });

  if (error) {
    throw error;
  }
}
