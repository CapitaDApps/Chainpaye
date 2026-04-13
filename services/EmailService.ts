import nodemailer from "nodemailer";
import { logger } from "../utils/logger";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendResetPinEmail(
  toEmail: string,
  resetToken: string,
): Promise<void> {
  const resetUrl = `https://app.chainpaye.com/reset-pin?token=${resetToken}`;

  const mailOptions = {
    from: `"ChainPaye" <${process.env.SMTP_FROM}>`,
    to: toEmail,
    subject: "Reset Your ChainPaye PIN",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Reset Your PIN</h2>
        <p>You requested a PIN reset for your ChainPaye account.</p>
        <p>Click the button below to reset your PIN. This link expires in <strong>15 minutes</strong>.</p>
        <a href="${resetUrl}"
           style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;margin:16px 0;">
          Reset PIN
        </a>
        <p style="color:#666;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
        <p style="color:#666;font-size:13px;">Link: ${resetUrl}</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info("Reset PIN email sent", { to: toEmail });
  } catch (error) {
    logger.error("Failed to send reset PIN email", { error, to: toEmail });
    throw error;
  }
}

export async function sendEmailVerificationOtp(
  toEmail: string,
  otp: string,
): Promise<void> {
  const mailOptions = {
    from: `"ChainPaye" <${process.env.SMTP_FROM}>`,
    to: toEmail,
    subject: "Your ChainPaye Email Verification Code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">Email Verification</h2>
        <p>Use the code below to verify your email address on ChainPaye.</p>
        <div style="text-align:center;margin:24px 0;">
          <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#4f46e5;">${otp}</span>
        </div>
        <p>This code expires in <strong>10 minutes</strong>.</p>
        <p style="color:#666;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info("Email verification OTP sent", { to: toEmail });
  } catch (error) {
    logger.error("Failed to send email verification OTP", { error, to: toEmail });
    throw error;
  }
}
