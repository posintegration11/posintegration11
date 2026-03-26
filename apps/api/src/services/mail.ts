import nodemailer from "nodemailer";
import { getEnv } from "../config/env.js";

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  const env = getEnv();
  const subject = "Verify your restaurant account";
  const text = `Welcome! Verify your email to activate your POS account:\n\n${verifyUrl}\n\nIf you did not sign up, ignore this email.`;
  const html = `<p>Welcome!</p><p><a href="${verifyUrl}">Verify your email</a> to activate your POS account.</p><p>If you did not sign up, ignore this email.</p>`;

  if (!env.SMTP_HOST) {
    console.warn(
      "[mail:no-smtp] SMTP_HOST is not set — no email was sent. " +
        "Set SMTP_HOST (+ SMTP_USER/SMTP_PASS) on your host (e.g. Render env) or check logs for the link below.\n" +
        `To: ${to}\nSubject: ${subject}\nLink: ${verifyUrl}`,
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
}

export async function sendDemoRequestNotification(
  adminEmails: string[],
  body: { email: string; name?: string | null; restaurantName?: string | null; message?: string | null }
): Promise<void> {
  if (adminEmails.length === 0) return;
  const env = getEnv();
  const subject = "New demo request";
  const text = [
    `Email: ${body.email}`,
    body.name ? `Name: ${body.name}` : "",
    body.restaurantName ? `Restaurant: ${body.restaurantName}` : "",
    body.message ? `Message: ${body.message}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (!env.SMTP_HOST) {
    console.warn(`[mail:no-smtp] Demo notification not emailed. Admins: ${adminEmails.join(", ")}\n${text}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: adminEmails.join(", "),
    subject,
    text,
  });
}
