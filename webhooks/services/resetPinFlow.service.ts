import crypto from "crypto";
import { User } from "../../models/User";
import { redisClient } from "../../services/redis";
import { sendResetPinEmail } from "../../services/EmailService";
import { logger } from "../../utils/logger";

const RESET_TOKEN_TTL = 900; // 15 minutes in seconds
const RESET_TOKEN_PREFIX = "RESET_PIN_TOKEN:";

export async function generateAndSendResetLink(
  whatsappNumber: string,
  email: string,
): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  await redisClient.set(
    `${RESET_TOKEN_PREFIX}${token}`,
    whatsappNumber,
    "EX",
    RESET_TOKEN_TTL,
  );
  await sendResetPinEmail(email, token);
}

export async function getResetPinScreen(decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) {
  const { screen, data, version, action, flow_token } = decryptedBody;

  if (action === "ping") {
    return { data: { status: "active" } };
  }

  if (data?.error) {
    logger.warn("Reset PIN flow client error", { data });
    return { data: { status: "Error", acknowledged: true } };
  }

  const userPhone = await redisClient.get(flow_token);

  if (action === "INIT") {
    return { screen: "COLLECT_EMAIL", data: { has_error: false, error_message: "" } };
  }

  if (action === "data_exchange") {
    switch (screen) {
      case "COLLECT_EMAIL": {
        if (!userPhone) {
          return {
            screen: "COLLECT_EMAIL",
            data: { error_message: "Session expired. Please try again." },
          };
        }

        const { email } = data;

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return {
            screen: "COLLECT_EMAIL",
            data: { error_message: "Please enter a valid email address.", has_error: true },
          };
        }

        const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

        try {
          // Save email to user profile
          await User.updateOne({ whatsappNumber: phone }, { email: email.toLowerCase().trim() });

          // Generate token and send reset email
          await generateAndSendResetLink(phone, email);

          return {
            screen: "SUCCESS",
            data: {
              message: `A reset link has been sent to ${email}. It expires in 15 minutes.`,
            },
          };
        } catch (error) {
          logger.error("Error in reset PIN flow (COLLECT_EMAIL)", { error });
          return {
            screen: "COLLECT_EMAIL",
            data: { error_message: "Something went wrong. Please try again.", has_error: true },
          };
        }
      }

      default:
        break;
    }
  }

  throw new Error("Unhandled reset PIN flow request.");
}

export async function validateResetToken(
  token: string,
): Promise<string | null> {
  return redisClient.get(`${RESET_TOKEN_PREFIX}${token}`);
}

export async function consumeResetToken(token: string): Promise<string | null> {
  const phone = await validateResetToken(token);
  if (phone) {
    await redisClient.del(`${RESET_TOKEN_PREFIX}${token}`);
  }
  return phone;
}
