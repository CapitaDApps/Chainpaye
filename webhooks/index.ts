import axios from "axios";
import express, { Express } from "express";
import helmet from "helmet";
import { commandRouteHandler } from "../commands/route";
import "../config/init";
import { userService, whatsappBusinessService } from "../services";
import { redisClient } from "../services/redis";
import { userRateLimiter, verifyWebhookSignature } from "./middleware";
import { shouldGateEmailVerification } from "./emailVerificationGuard";
import flowRouter from "./route/route";
import { CustomReq } from "./types/request.type";

export { shouldGateEmailVerification };

export const app: Express = express();
app.use(express.static("public"));
// Apply helmet security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  express.json({
    // store the raw request body to use it for signature verification
    verify: (req, res, buf, encoding) => {
      (req as CustomReq).rawBody = buf?.toString(
        (encoding as BufferEncoding) || "utf8",
      );
    },
  }),
);

const {
  VERIFY_TOKEN,
  GRAPH_API_TOKEN,
  APP_SECRET,
  PRIVATE_KEY,
  PASSPHRASE = "",
  BUSINESS_PHONE_NUMBER_ID,
} = process.env;

const DEFAULT_STAGING_ALLOWED_WHATSAPP_NUMBERS = [
  "+2347035428475",
  "+2347016505681",
];

function normalizePhoneNumber(value: string): string {
  const digitsOnly = value.replace(/\D/g, "");
  return digitsOnly ? `+${digitsOnly}` : "";
}

function isStagingEnvironment(): boolean {
  const port = (process.env.PORT || "").trim();
  return port === "3001";
}

function getStagingAllowedWhatsappNumbers(): Set<string> {
  const envList = process.env.STAGING_ALLOWED_WHATSAPP_NUMBERS;
  const values = envList
    ? envList
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : DEFAULT_STAGING_ALLOWED_WHATSAPP_NUMBERS;

  return new Set(values.map((item) => normalizePhoneNumber(item)));
}

// Route for GET requests (webhook verification - no rate limiting needed)
app.get("/webhook", (req, res) => {
  const {
    "hub.mode": mode,
    "hub.challenge": challenge,
    "hub.verify_token": token,
  } = req.query;

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK VERIFIED");
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// Health check endpoint with rate limiting
app.get("/", userRateLimiter, (req, res) => {
  res.status(200).json({ server: "active" });
});

async function readMessage(messageId: string) {
  await axios({
    method: "POST",
    url: `https://graph.facebook.com/v24.0/${BUSINESS_PHONE_NUMBER_ID}/messages`,
    headers: {
      Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    },
    data: {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    },
  });
}

async function replyingMessage(messageId: string) {
  await axios({
    method: "POST",
    url: `https://graph.facebook.com/v24.0/${BUSINESS_PHONE_NUMBER_ID}/messages`,
    headers: {
      Authorization: `Bearer ${GRAPH_API_TOKEN}`,
    },
    data: {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: {
        type: "text",
      },
    },
  });
}

app.post("/webhook", verifyWebhookSignature, async (req, res) => {
  // console.log("Incoming webhook message:", JSON.stringify(req.body, null, 2));

  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const contact = req.body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];

  if (message) {
    await readMessage(message.id);
    try {
      if (isStagingEnvironment()) {
        const allowedNumbers = getStagingAllowedWhatsappNumbers();
        const incomingNumber = normalizePhoneNumber(
          contact?.wa_id || message.from || "",
        );

        if (!allowedNumbers.has(incomingNumber)) {
          await replyingMessage(message.id);
          await whatsappBusinessService.sendNormalMessage(
            "Access restricted: this Chainpaye number is currently for approved staging testers only. Your number is not yet authorized.\n\nPlease contact support for access, or message our main Chainpaye number: +1 (318) 394-7303.",
            message.from,
          );
          return res.sendStatus(200);
        }
      }

      // mark incoming message as read

      if (contact) {
        const { profile, wa_id } = contact;

        if (wa_id) {
          const user = await userService.getUser(`+${wa_id}`);

          // Check if user needs to complete registration (no profile info)
          // User is valid if they have fullName (new flow) OR firstName+lastName (legacy flow)
          const isRegistered =
            user && (user.fullName || (user.firstName && user.lastName));

          console.log({
            isRegistered,
            user,
          });

          if (!isRegistered) {
            await replyingMessage(message.id);
            
            // Check if this is a "start [referral_code]" command
            if (message.type === "text" && message.text.body) {
              const messageText = message.text.body.trim();
              const startMatch = messageText.match(/^start\s+([A-Z0-9]+)$/i);
              
              if (startMatch) {
                // Process the start command first and wait for it to complete
                const phone = message.from.startsWith("+")
                  ? message.from
                  : `+${message.from}`;
                
                console.log("DEBUG: Processing start command for new user:", phone);
                await commandRouteHandler(phone, messageText);
                
                console.log("DEBUG: Start command processed, waiting 1 second before sending flow");
                // Wait a moment to ensure Redis storage completes
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                console.log("DEBUG: Sending registration flow");
                // Then send registration flow
                whatsappBusinessService.sendIntroMessageByFlowId(message.from);
                return res.sendStatus(200);
              }
            }
            
            // New user or incomplete profile - send registration flow
            whatsappBusinessService.sendIntroMessageByFlowId(message.from);
          } else {
            console.log({
              message,
              contact,
            });

            // Guard: email verification gate
            // Must run before any command routing for KYC-verified users
            const phone = message.from.startsWith("+")
              ? message.from
              : `+${message.from}`;

            if (user && shouldGateEmailVerification(user)) {
              await whatsappBusinessService.sendEmailVerificationFlowById(phone);
              return res.sendStatus(200);
            }

            // User has completed registration
            // Handle text messages
            if (message.type == "text" && message.text.body) {
              await replyingMessage(message.id);

              // Check if user has pending image payment (sent image without caption)
              const pendingImagePayment = await redisClient.get(`image_payment_pending:${phone}`);
              
              if (pendingImagePayment) {
                // User previously sent an image without caption, now they're providing the amount
                const { ImagePaymentService } = await import("../services/ImagePaymentService");
                const imagePaymentService = new ImagePaymentService();
                
                const bankDetails = JSON.parse(pendingImagePayment);
                const caption = message.text.body;
                
                // Try to parse amount from their message
                const amount = imagePaymentService.parseAmountFromCaption(caption);
                
                if (amount) {
                  // Clear the pending payment
                  await redisClient.del(`image_payment_pending:${phone}`);
                  
                  // Combine bank details with amount and launch flow
                  const result = {
                    ...bankDetails,
                    amount,
                  };
                  
                  await whatsappBusinessService.sendImagePaymentConfirmFlow(phone, result);
                } else {
                  // Amount not found, ask again
                  await whatsappBusinessService.sendNormalMessage(
                    "❌ Could not find an amount in your message.\n\n" +
                    "💬 Please reply with the amount you want to send.\n" +
                    "Example: *send 5000* or just *5000*",
                    message.from,
                  );
                }
              } else {
                // Normal text message - route to command handler
                // Nigerian user without KYC - prompt for verification but still allow basic access
                // They can still use the app, but some features may be limited
                await commandRouteHandler(phone, message.text.body);
              }
            }

            // Handle image messages with a caption (image payment feature)
            if (message.type === "image" && message.image) {
              await replyingMessage(message.id);
              const caption: string = message.image.caption || "";
              const mediaId: string = message.image.id;

              if (caption.trim()) {
                // Lazy import to avoid circular deps
                const { ImagePaymentService } = await import("../services/ImagePaymentService");
                const imagePaymentService = new ImagePaymentService();

                await whatsappBusinessService.sendNormalMessage(
                  "🔍 Scanning your image for payment details...",
                  message.from,
                );

                const result = await imagePaymentService.processPaymentImage(mediaId, caption);

                if ("error" in result) {
                  await whatsappBusinessService.sendNormalMessage(
                    `❌ ${result.error}`,
                    message.from,
                  );
                } else {
                  await whatsappBusinessService.sendImagePaymentConfirmFlow(phone, result);
                }
              } else {
                // No caption - extract bank details and wait for amount
                const { ImagePaymentService } = await import("../services/ImagePaymentService");
                const imagePaymentService = new ImagePaymentService();

                await whatsappBusinessService.sendNormalMessage(
                  "🔍 Scanning your image for payment details...",
                  message.from,
                );

                // Extract bank details without amount
                const extractResult = await imagePaymentService.extractBankDetailsFromImage(mediaId);

                if ("error" in extractResult) {
                  await whatsappBusinessService.sendNormalMessage(
                    `❌ ${extractResult.error}`,
                    message.from,
                  );
                } else {
                  // Store bank details in Redis temporarily (30 minutes)
                  await redisClient.set(
                    `image_payment_pending:${phone}`,
                    JSON.stringify(extractResult),
                    "EX",
                    1800
                  );

                  await whatsappBusinessService.sendNormalMessage(
                    `✅ *Bank Details Detected*\n\n` +
                    `🏦 *Bank:* ${extractResult.bankName}\n` +
                    `🔢 *Account:* ${extractResult.accountNumber}\n` +
                    `👤 *Name:* ${extractResult.accountName}\n\n` +
                    `💬 *Reply with the amount you want to send*\n` +
                    `Example: *send 5000* or just *5000*`,
                    message.from,
                  );
                }
              }
            }

            if (message.type == "button") {
              await replyingMessage(message.id);
              const { payload } = message.button;
              await whatsappBusinessService.handleButtonPayload(
                payload,
                message.from,
              );
            }

            if (message.type == "interactive") {
              const interactive = message.interactive;
              const interactiveType = interactive.type;
              if (interactiveType == "list_reply") {
                await replyingMessage(message.id);
                const selectedMenuId = interactive.list_reply?.id;
                const phone = message.from.startsWith("+")
                  ? message.from
                  : `+${message.from}`;

                const commandByMenuId: Record<string, string> = {
                  other_menu_ngn_deposit: "deposit ngn",
                  other_menu_USD_deposit: "deposit usd",
                  other_menu_spend_crypto: "spend crypto",
                  other_menu_wallets: "wallets",
                  other_menu_withdraw: "withdraw",
                  other_menu_referral: "referral",
                  other_menu_payment_link: "payment link",
                  other_menu_transaction_history: "transaction history",
                  other_menu_support: "support",
                  other_menu_reset_pin: "reset pin",
                };

                const selectedCommand = selectedMenuId
                  ? commandByMenuId[selectedMenuId]
                  : undefined;

                if (selectedCommand) {
                  await commandRouteHandler(phone, selectedCommand);
                } else {
                  await whatsappBusinessService.sendNormalMessage(
                    "Invalid menu selection. Type menu to continue.",
                    message.from,
                  );
                }
              }

              if (interactiveType == "nfm_reply") {
                const responseJson = JSON.parse(
                  interactive.nfm_reply.response_json,
                );
                console.log({ responseJson });

                // Handle new account registration completion
                if (responseJson.type == "new-account") {
                  await replyingMessage(message.id);
                  const userAccount = await redisClient.get(
                    `${responseJson.flow_token}_accountCreation`,
                  );
                  let account: any;
                  if (userAccount) {
                    account = JSON.parse(userAccount);
                  }

                  // Send welcome message
                  await whatsappBusinessService.sendNormalMessage(
                    `Hello *${
                      account?.fullName || profile.name
                    }*, welcome to Chainpaye! 🎉`,
                    message.from,
                  );

                  // If Nigerian user, prompt for KYC
                  if (account?.needsKyc) {
                    // await whatsappBusinessService.sendNormalMessage(
                    //   "To unlock all features (including bank withdrawals), please complete your BVN verification. Type 'verify' or 'kyc' to start.",
                    //   message.from,
                    // );
                    await whatsappBusinessService.sendKycFlowById(message.from);
                  }

                  // await whatsappBusinessService.sendMenuMessageMyFlowId(
                  //   message.from,
                  // );
                }

                // Handle KYC verification completion
                if (responseJson.type == "kyc-complete") {
                  await replyingMessage(message.id);
                  await whatsappBusinessService.sendNormalMessage(
                    "Your account has been fully verified! 🎉 You now have access to all Chainpaye features.",
                    message.from,
                  );
                  await whatsappBusinessService.sendMenuMessageMyFlowId(
                    message.from,
                  );
                }

                // Handle email verification completion
                if (responseJson.type === "email-verification-complete") {
                  await replyingMessage(message.id);
                  // Confirmation message and menu are sent by the flow service via setImmediate
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  }
  res.sendStatus(200);
});

// Apply rate limiting to flow routes (user-facing endpoints)
app.use("/flow", userRateLimiter, flowRouter);

// Transaction API routes
import transactionRoutes from "../routes/transactionRoutes";
app.use("/api/transactions", transactionRoutes);

// Reset PIN page
app.get("/reset-pin", (req, res) => {
  res.sendFile("reset-pin.html", { root: "public" });
});

// Reset PIN route
import resetPinRoute from "../routes/resetPin";
app.use("/api/reset-pin", resetPinRoute);

// Admin API routes
import adminWithdrawalRoutes from "../routes/adminWithdrawal";
import adminUserRoutes from "../routes/adminUser";
import { getOverview } from "../controllers/adminOverviewController";
import { getLeaderboard } from "../controllers/adminLeaderboardController";
import { getOfframpTransactions } from "../controllers/adminOfframpController";
import { getAdminTransactionHistory, getTransactionDetails } from "../controllers/transactionController";
import { adminLogin, adminLogout, requireAdminAuth } from "../controllers/adminAuthController";
import { Router as TxRouter } from "express";

// Public auth endpoints
app.post("/api/admin/login", adminLogin);
app.post("/api/admin/logout", requireAdminAuth, adminLogout);

// All admin routes below require auth
app.use("/api/admin/referral-withdrawals", requireAdminAuth, adminWithdrawalRoutes);
app.use("/api/admin/users", requireAdminAuth, adminUserRoutes);
app.get("/api/admin/overview", requireAdminAuth, getOverview);
app.get("/api/admin/leaderboard", requireAdminAuth, getLeaderboard);
app.get("/api/admin/offramp", requireAdminAuth, getOfframpTransactions);

const adminTxRouter = TxRouter();
adminTxRouter.get("/", getAdminTransactionHistory);
adminTxRouter.get("/:referenceId", getTransactionDetails);
app.use("/api/admin/transactions", requireAdminAuth, adminTxRouter);
