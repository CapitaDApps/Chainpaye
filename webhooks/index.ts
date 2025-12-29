import dotenv from "dotenv";
import express, { Express } from "express";
import helmet from "helmet";
import { UserService } from "../services/UserService";
import { WhatsAppBusinessService } from "../services/WhatsAppBusinessService";
import flowRouter from "./route/route";
import { CustomReq } from "./types/request.type";
import axios from "axios";
import { User } from "../models/User";
import { redisClient } from "../services/redis";
import { ToronetService } from "../services/ToronetService";
import { IWallet } from "../models/Wallet";
import { WalletService } from "../services/WalletService";
import { TransactionType } from "../models/Transaction";
import {
  userRateLimiter,
  strictRateLimiter,
  verifyWebhookSignature,
} from "./middleware";

dotenv.config();
export const app: Express = express();

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
  })
);

const userService = new UserService();
const whatsappBusinessService = new WhatsAppBusinessService();
const toronetService = new ToronetService();
const walletService = new WalletService();

app.use(
  express.json({
    // store the raw request body to use it for signature verification
    verify: (req, res, buf, encoding) => {
      (req as CustomReq).rawBody = buf?.toString(
        (encoding as BufferEncoding) || "utf8"
      );
    },
  })
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

  // const ipDetails = await getIpData(req.ip);
  // console.log({ ip: req.ip?.split(":") });

  // const ipDetails = await getIpData("8.8.8.8");

  // if (!ipDetails) throw new Error("Couldn't detect user's location");

  // console.log({ ipDetails });
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const contact = req.body.entry[0].changes[0].value.contacts?.[0];

  if (message) {
    await readMessage(message.id);
    try {
      // mark incoming message as read

      if (contact) {
        const { profile, wa_id } = contact;

        if (wa_id) {
          const user = await userService.getUser(`+${wa_id}`);

          if (!user || !user.firstName || !user.lastName || !user.isVerified) {
            await replyingMessage(message.id);
            // send welcome mesage
            await whatsappBusinessService.sendTemplateIntroMessage(
              message.from
            );
          } else {
            // send other messages
            if (message.type == "text" && message.text.body) {
              await replyingMessage(message.id);
              if (user.country == "NG" && !user.isVerified) {
                await whatsappBusinessService.sendTemplateIntroMessage(
                  message.from
                );
                res.sendStatus(200);
                return;
              }
              if (
                message.text.body.toLowerCase().includes("balance") ||
                message.text.body == "/balance"
              ) {
                const userWallet = await userService.getUserToroWallet(
                  message.from
                );
                // Only update virtual wallet for Nigerian users
                if (user.country === "NG") {
                  await toronetService.updateVirtualWallet(
                    userWallet.publicKey
                  );
                }
                const [NGNBal, USDBal] = await Promise.all([
                  toronetService.getBalanceNGN(userWallet.publicKey),
                  toronetService.getBalanceUSD(userWallet.publicKey),
                ]);
                await whatsappBusinessService.sendNormalMessage(
                  `*Your balance:* 
*USD:* ${USDBal.balance}
*NGN:* ${NGNBal.balance}
                  `,
                  message.from
                );
              } else if (message.text.body.startsWith("/transactionHistory")) {
                try {
                  const transactions =
                    await walletService.getUserRecentTransactions(user.userId);

                  if (transactions.length === 0) {
                    await whatsappBusinessService.sendNormalMessage(
                      "You don't have any transactions yet.",
                      message.from
                    );
                  } else {
                    let statusMessage = "*Your Recent Transactions:*\n\n";

                    transactions.forEach((tx, index) => {
                      const txType =
                        tx.type === TransactionType.DEPOSIT
                          ? "Deposit"
                          : tx.type === TransactionType.TRANSFER
                          ? "Transfer"
                          : tx.type === TransactionType.WITHDRAWAL
                          ? "Withdrawal"
                          : tx.type;

                      const txStatus =
                        tx.status === "completed"
                          ? "✅ Completed"
                          : tx.status === "pending"
                          ? "⏳ Pending"
                          : tx.status === "failed"
                          ? "❌ Failed"
                          : tx.status;

                      // Truncate transaction ID for display
                      const txIdDisplay = tx.toronetTransactionId
                        ? `${tx.toronetTransactionId.substring(0, 8)}...`
                        : "N/A";

                      // Format date
                      const date = new Date(tx.createdAt).toLocaleDateString();
                      const time = new Date(tx.createdAt).toLocaleTimeString(
                        [],
                        { hour: "2-digit", minute: "2-digit" }
                      );

                      statusMessage += `${index + 1}. *${txType}* - ${
                        tx.amount
                      } ${tx.currency}\n`;
                      statusMessage += `   Status: ${txStatus}\n`;
                      statusMessage += `   Date: ${date} at ${time}\n`;
                      statusMessage += `   ID: ${txIdDisplay}\n\n`;
                    });

                    await whatsappBusinessService.sendNormalMessage(
                      statusMessage,
                      message.from
                    );
                  }
                } catch (error) {
                  console.error("Error fetching transactions:", error);
                  await whatsappBusinessService.sendNormalMessage(
                    "Sorry, I couldn't retrieve your transaction history. Please try again later.",
                    message.from
                  );
                }
              } else if (message.text.body === "/convert") {
                const convertFlowId = "773377672429898";
                const convertFlowScreen = "CONVERT_ENTRY";

                await whatsappBusinessService.sendFlowById(
                  message.from,
                  convertFlowId,
                  convertFlowScreen,
                  {
                    header: "Convert",
                    body: "Convert naira to dollar and vice versa",
                    cta: "Convert",
                  }
                );
              } else {
                if (message.text.body) {
                  await whatsappBusinessService.sendTemplateInteractiveMessage(
                    "menumessage",
                    message.from,
                    "en"
                  );
                }
              }
            }

            if (message.type == "button") {
              await replyingMessage(message.id);
              const { payload } = message.button;
              await whatsappBusinessService.handleButtonPayload(
                payload,
                message.from
              );
            }

            if (message.type == "interactive") {
              const interactive = message.interactive;
              const interactiveType = interactive.type;
              if (interactiveType == "nfm_reply") {
                const responseJson = JSON.parse(
                  interactive.nfm_reply.response_json
                );
                console.log({ responseJson });

                if (responseJson.type == "new-account") {
                  await replyingMessage(message.id);
                  const userAccount = await redisClient.get(
                    `${responseJson.flow_token}_accountCreation`
                  );
                  let account: any;
                  if (userAccount) {
                    account = JSON.parse(userAccount);
                  }
                  await whatsappBusinessService.sendNormalMessage(
                    `Hello *${
                      account.fullName || profile.name
                    }*, welcome to Chainpaye.`,
                    message.from
                  );
                  await whatsappBusinessService.sendTemplateInteractiveMessage(
                    "menumessage",
                    message.from,
                    "en"
                  );
                }

                if (responseJson.type == "processing_started") {
                  await replyingMessage(message.id);
                  await whatsappBusinessService.sendNormalMessage(
                    `Payment link generation feature in development...`,
                    message.from
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
