import dotenv from "dotenv";
import express, { Express } from "express";
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

dotenv.config();
export const app: Express = express();

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

// Route for GET requests
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

app.get("/", (req, res) => {
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

app.post("/webhook", async (req, res) => {
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

          if (!user) {
            await replyingMessage(message.id);
            // send welcome mesage
            await whatsappBusinessService.sendTemplateIntroMessage(
              message.from
            );
          } else {
            // send other messages
            if (message.type == "text") {
              await replyingMessage(message.id);
              if (message.text.body.toLowerCase().includes("balance")) {
                const userWallet = await userService.getUserToroWallet(
                  message.from
                );
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
              } else if (message.text.body.startsWith("/status")) {
                const msgList = message.text.body.split(" ");
                const txId = msgList[1];
                console.log({ msgList, txId });
                if (!txId)
                  return await whatsappBusinessService.sendNormalMessage(
                    "Please pass the transaction id in the required format. status: transactionid",
                    message.from
                  );
                const txStatusData = await walletService.checkTransactionStatus(
                  txId
                );

                await whatsappBusinessService.sendNormalMessage(
                  `${txStatusData.message}`,
                  message.from
                );
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

            if (
              message.type !== "button" ||
              message.text.body ||
              message.type == "interactive"
            ) {
              await whatsappBusinessService.sendTemplateInteractiveMessage(
                "menumessage",
                message.from,
                "en"
              );
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  }

  if (message && message.type == "text") {
    // else if (!messageBody.includes("hello")) {
    //   const command = messageList[0].trim();
    //   const text = messageList[1]?.trim();
    //   console.log({ text });
    //   whatsappBusinessService
    //     .handleCommandText(command, text, message.from)
    //     .catch((err) => console.log("handleCommandText", err));
    // }
  }

  res.sendStatus(200);
});

app.use("/flow", flowRouter);
