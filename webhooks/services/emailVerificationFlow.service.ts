import axios from "axios";
import { User } from "../../models/User";
import { redisClient } from "../../services/redis";
import { sendEmailVerificationOtp } from "../../services/EmailService";
import { logger } from "../../utils/logger";

// ============================================================
// EMAIL VERIFICATION FLOW SERVICE
// Handles email verification for KYC-verified users
// Flow: EMAIL_INPUT → PIN_CONFIRM → OTP_INPUT → SUCCESS
// ============================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const emailVerificationFlowScreen = async (decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) => {
  const { screen, data, action, flow_token, version } = decryptedBody;

  // Handle health check
  if (action === "ping") {
    return {
      data: {
        status: "active",
      },
    };
  }

  // Handle error notification
  if (action === "error") {
    logger.warn("Email verification flow received error action", { data });
    return {
      data: {
        status: "Error",
        acknowledged: true,
      },
    };
  }

  // Handle initial screen
  if (action === "INIT") {
    return {
      screen: "EMAIL_INPUT",
      data: {
        error_message: "",
        has_error: false,
      },
    };
  }

  if (action === "data_exchange") {
    switch (screen) {
      // --------------------------------------------------------
      // EMAIL_INPUT → PIN_CONFIRM
      // Validate email format
      // --------------------------------------------------------
      case "EMAIL_INPUT": {
        const email: string = (data.email || "").trim();

        if (!EMAIL_REGEX.test(email)) {
          return {
            screen: "EMAIL_INPUT",
            data: {
              error_message: "Please enter a valid email address.",
              has_error: true,
            },
          };
        }

        return {
          screen: "PIN_CONFIRM",
          data: {
            email,
            error_message: "",
            has_error: false,
          },
        };
      }

      // --------------------------------------------------------
      // PIN_CONFIRM → OTP_INPUT
      // Verify PIN, generate OTP, send email
      // --------------------------------------------------------
      case "PIN_CONFIRM": {
        const pin: string = data.pin || "";
        const email: string = (data.email || "").trim();

        // Get user phone from Redis
        const userPhone = await redisClient.get(flow_token);
        if (!userPhone) {
          return {
            screen: "EMAIL_INPUT",
            data: {
              error_message: "Session expired. Please restart the verification.",
              has_error: true,
            },
          };
        }

        const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

        // Fetch user with PIN field
        const user = await User.findOne({ whatsappNumber: phone }).select("+pin");
        if (!user) {
          return {
            screen: "EMAIL_INPUT",
            data: {
              error_message: "User not found. Please restart the verification.",
              has_error: true,
            },
          };
        }

        // Verify PIN
        const pinMatch = await user.comparePin(pin);
        if (!pinMatch) {
          return {
            screen: "PIN_CONFIRM",
            data: {
              email,
              error_message: "Incorrect PIN. Please try again.",
              has_error: true,
            },
          };
        }

        // Generate OTP
        const otp = generateOtp();
        const otpKey = `otp:${flow_token}`;

        // Send OTP email first — if it fails, don't store in Redis
        try {
          await sendEmailVerificationOtp(email, otp);
        } catch (err) {
          logger.error("Failed to send email verification OTP", { err, email });
          return {
            screen: "PIN_CONFIRM",
            data: {
              email,
              error_message: "Failed to send OTP. Please try again.",
              has_error: true,
            },
          };
        }

        // Store OTP in Redis with 600s TTL
        await redisClient.set(otpKey, otp, "EX", 600);

        return {
          screen: "OTP_INPUT",
          data: {
            email,
            error_message: "",
            has_error: false,
          },
        };
      }

      // --------------------------------------------------------
      // OTP_INPUT → SUCCESS
      // Verify OTP, update user, call Linkio API
      // --------------------------------------------------------
      case "OTP_INPUT": {
        const submittedOtp: string = (data.otp || "").trim();
        const email: string = (data.email || "").trim();
        const otpKey = `otp:${flow_token}`;

        // Fetch OTP from Redis
        const storedOtp = await redisClient.get(otpKey);

        if (!storedOtp) {
          return {
            screen: "OTP_INPUT",
            data: {
              email,
              error_message: "OTP has expired. Please restart the verification.",
              has_error: true,
            },
          };
        }

        if (submittedOtp !== storedOtp) {
          return {
            screen: "OTP_INPUT",
            data: {
              email,
              error_message: "Incorrect OTP. Please try again.",
              has_error: true,
            },
          };
        }

        // OTP matched — delete from Redis
        await redisClient.del(otpKey);

        // Get user phone from Redis
        const userPhone = await redisClient.get(flow_token);
        const phone = userPhone
          ? userPhone.startsWith("+")
            ? userPhone
            : `+${userPhone}`
          : null;

        try {
          // Fetch user BEFORE updating so we have firstName, lastName, country
          const user = await User.findOne({ whatsappNumber: phone });

          // Update user: save email and mark emailVerified
          await User.updateOne(
            { whatsappNumber: phone },
            { email, emailVerified: true },
          );

          // Call Linkio onboarding API (non-blocking on failure)
          if (user) {
            try {
              const secKey = process.env.LINKIO_SEC_KEY;
              const linkioUrl = "https://api.linkio.world/transactions/v2/direct_ramp/onboarding";

              logger.info("Calling Linkio onboarding API", {
                email,
                firstName: user.firstName,
                lastName: user.lastName,
                country: user.country,
              });

              const response = await axios.post(linkioUrl, null, {
                headers: { "ngnc-sec-key": secKey },
                params: {
                  email,
                  last_name: user.lastName || "",
                  first_name: user.firstName || "",
                  country: user.country || "",
                },
              });

              logger.info("Linkio API response", { data: response.data });

              const responseData = response.data as {
                status: string;
                data?: { customer_id?: string };
              };

              if (responseData?.status === "Success" && responseData?.data?.customer_id) {
                await User.updateOne(
                  { whatsappNumber: phone },
                  { linkioCustomerId: responseData.data.customer_id },
                );
                logger.info("Linkio customer ID saved", {
                  customerId: responseData.data.customer_id,
                });
              } else {
                logger.warn("Linkio response did not contain customer_id", { responseData });
              }
            } catch (linkioErr: any) {
              logger.error("Linkio API call failed — continuing", {
                message: linkioErr?.message,
                response: linkioErr?.response?.data,
              });
            }
          } else {
            logger.warn("User not found for Linkio call", { phone });
          }
        } catch (dbErr) {
          logger.error("DB update failed after OTP verification — continuing", { dbErr });
        }

        return {
          version,
          screen: "SUCCESS",
          data: {},
        };
      }

      default:
        logger.warn("Unhandled screen in email verification flow", { screen });
        return {
          screen: "EMAIL_INPUT",
          data: {
            error_message: "An unexpected error occurred. Please try again.",
            has_error: true,
          },
        };
    }
  }

  logger.error("Unhandled action in email verification flow", { action });
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above.",
  );
};
