import dotenv from "dotenv";
import express, { Express } from "express";
import { UserService } from "../services/UserService";
import { WhatsAppBusinessService } from "../services/WhatsAppBusinessService";
import flowRouter from "./route/route";
import { CustomReq } from "./types/request.type";

dotenv.config();
export const app: Express = express();

const userService = new UserService();
const whatsappBusinessService = new WhatsAppBusinessService();

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

app.post("/webhook", async (req, res) => {
  console.log("Incoming webhook message:", JSON.stringify(req.body, null, 2));

  // const ipDetails = await getIpData(req.ip);
  // console.log({ ip: req.ip?.split(":") });

  // const ipDetails = await getIpData("8.8.8.8");

  // if (!ipDetails) throw new Error("Couldn't detect user's location");

  // console.log({ ipDetails });
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const contact = req.body.entry[0].changes[0].value.contacts?.[0];
  if (contact) {
    const { profile, wa_id } = contact;
    if (profile.name && wa_id) {
      await userService.createOrGetUser({
        whatsappNumber: `+${wa_id}`,
        fullName: `${profile.name}`,
        countryCode: "NG",
      });
    }
  }

  if (message && message.type == "text") {
    const messageBody = message.text.body;
    const messageList = messageBody.split(":");
    if (messageBody === "/setup pin") {
      whatsappBusinessService
        .sendPinFlowTempMessage(message.from)
        .catch((err) => console.log(err));
    } else if (!messageBody.includes("hello")) {
      const command = messageList[0].trim();
      const text = messageList[1]?.trim();
      console.log({ text });
      whatsappBusinessService
        .handleCommandText(command, text, message.from)
        .catch((err) => console.log("handleCommandText", err));
    } else {
      whatsappBusinessService
        .sendTemplateIntroMessage(message.from)
        .catch((err: Error) => console.log(err));
    }
  }

  if (message && message.type == "button") {
    // "button": {
    //               "payload": "Transfer to contacts",
    //               "text": "Transfer to contacts"
    //             }

    const { payload } = message.button;
    whatsappBusinessService
      .handleButtonPayload(payload, message.from)
      .catch((err) => console.log("Error from handleButtonPayload", err));
  }

  res.sendStatus(200);
});

app.use("/flow", flowRouter);
