import axios from "axios";
import express, { Express } from "express";
import helmet from "helmet";
import { commandRouteHandler } from "../commands/route";
import "../config/init";
import { userService, whatsappBusinessService } from "../services";
import { redisClient } from "../services/redis";
import { userRateLimiter, verifyWebhookSignature } from "./middleware";
import flowRouter from "./route/route";
import { CustomReq } from "./types/request.type";

export const app: Express = express();
app.use(express.static("public"));
// Apply helmet security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
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
  console.log("Incoming webhook message:", JSON.stringify(req.body, null, 2));

  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const contact = req.body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];

  if (message) {
    await readMessage(message.id);
    try {
      // mark incoming message as read

      if (contact) {
        const { profile, wa_id } = contact;

        if (wa_id) {
          const user = await userService.getUser(`+${wa_id}`);

          // Check if user needs to complete registration (no profile info)
          // User is valid if they have fullName (new flow) OR firstName+lastName (legacy flow)
          const isRegistered =
            user && (user.fullName || (user.firstName && user.lastName));

          if (!isRegistered) {
            await replyingMessage(message.id);
            // New user or incomplete profile - send registration flow
            whatsappBusinessService.sendIntroMessageByFlowId(message.from);
          } else {
            // User has completed registration
            // Handle text messages
            if (message.type == "text" && message.text.body) {
              await replyingMessage(message.id);

              // Nigerian user without KYC - prompt for verification but still allow basic access
              // They can still use the app, but some features may be limited
              const phone = message.from.startsWith("+")
                ? message.from
                : `+${message.from}`;
              await commandRouteHandler(phone, message.text.body);
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
