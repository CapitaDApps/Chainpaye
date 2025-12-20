/**
 * WhatsApp Business API service for ChainPaye WhatsApp bot
 * This service handles all interactions with the WhatsApp Business API
 * including message sending, webhook handling, and template management
 */

import axios from "axios";
import { WalletService } from "./WalletService";
import { redisClient } from "./redis";
import { v4 as uuidv4 } from "uuid";
import { User } from "../models/User";
import { Wallet } from "../models/Wallet";

type ButtonPayloadType =
  | "My Account"
  | "Withdraw to Bank"
  | "Copy Account NO"
  | "Invoice a Client";
type CommandTextType =
  | "transfer-usd"
  | "transfer-ngn"
  | "deposit"
  | "deposit-usd"
  | "deposit-ngn"
  | "status"
  | "setup pin";

export class WhatsAppBusinessService {
  private GRAPH_API_TOKEN: string;
  private business_phone_number_id: string;
  private walletService: WalletService;

  constructor() {
    this.GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN || "";
    this.business_phone_number_id = process.env.BUSINESS_PHONE_NUMBER_ID || "";
    this.walletService = new WalletService();
  }

  async sendNormalMessage(message: string, to: string) {
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v24.0/${this.business_phone_number_id}/messages`,
      headers: {
        Authorization: `Bearer ${this.GRAPH_API_TOKEN}`,
      },
      data: {
        messaging_product: "whatsapp",
        to,
        text: { body: message },
      },
    });
  }

  async sendVideoContent(to: string, videoUrl: string, caption?: string) {
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v24.0/${this.business_phone_number_id}/messages`,
      headers: {
        Authorization: `Bearer ${this.GRAPH_API_TOKEN}`,
      },
      data: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "video",
        video: {
          link: videoUrl,
          ...(caption && { caption }),
        },
      },
    });
  }

  async sendTemplateIntroMessage(to: string) {
    const flowToken = uuidv4();
    await redisClient.set(flowToken, to, "EX", 3600); // Store flow_token for 1 hour

    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v24.0/${this.business_phone_number_id}/messages`,
      headers: {
        Authorization: `Bearer ${this.GRAPH_API_TOKEN}`,
      },
      data: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: "intromessage",
          language: {
            code: "en_US",
          },
          components: [
            {
              type: "header",
              parameters: [
                {
                  type: "image",
                  image: {
                    link: "https://moccasin-bright-skunk-108.mypinata.cloud/ipfs/bafkreic632v26b4htt7cfwkhsleivo6q3lljlnhadgb6uikrkw6yabppyu",
                  },
                },
              ],
            },

            {
              type: "button",
              sub_type: "flow",
              index: "0",
              parameters: [
                {
                  type: "action",
                  action: {
                    flow_token: flowToken,
                  },
                },
              ],
            },
          ],
        },
      },
    });
  }

  async sendPinFlowTempMessage(to: string) {
    const flowToken = uuidv4();
    await redisClient.set(flowToken, to, "EX", 3600); // Store flow_token for 1 hour
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v24.0/${this.business_phone_number_id}/messages`,
      headers: {
        Authorization: `Bearer ${this.GRAPH_API_TOKEN}`,
      },
      data: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: "appointment",
          language: {
            code: "en",
          },
          components: [
            {
              type: "button",
              sub_type: "flow",
              index: "0",
              parameters: [
                {
                  type: "action",
                  action: {
                    flow_token: flowToken,
                  },
                },
              ],
            },
          ],
        },
      },
    });
  }

  async sendTemplateTextMessage(
    templateName: string,
    to: string,
    templateLang: string
  ) {
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v24.0/${this.business_phone_number_id}/messages`,
      headers: {
        Authorization: `Bearer ${this.GRAPH_API_TOKEN}`,
      },
      data: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: templateName,
          language: {
            code: templateLang,
          },
        },
      },
    });
  }

  async sendTemplateInteractiveMessage(
    templateName: string,
    to: string,
    templateLang: string,
    bodyParameters?: any[]
  ) {
    const flowToken = uuidv4();
    await redisClient.set(flowToken, to, "EX", 3600); // Store flow_token for 1 hour
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v24.0/${this.business_phone_number_id}/messages`,
      headers: {
        Authorization: `Bearer ${this.GRAPH_API_TOKEN}`,
      },
      data: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "template",
        template: {
          name: templateName,
          language: {
            code: templateLang,
          },
          components: [
            {
              type: "header",
              parameters: [],
            },

            {
              type: "body",
              parameters: bodyParameters || [],
            },
            {
              type: "footer",
              parameters: [],
            },
            {
              type: "button",
              sub_type: "flow",
              index: "0",
              parameters: [
                {
                  type: "action",
                  action: {
                    flow_token: flowToken,
                  },
                },
              ],
            },
          ],
        },
      },
    });
  }

  async sendFlowById(to: string, flowId: string, screenId: string, data?: any) {
    const flowToken = uuidv4();
    await redisClient.set(flowToken, to, "EX", 3600); // Store flow_token for 1 hour
    const body = {
      messaging_product: "whatsapp",
      to,
      recipient_type: "individual",
      type: "interactive",
      interactive: {
        type: "flow",
        header: {
          type: "text",
          text: "Withdraw",
        },
        body: {
          text: "Open flow to complete withdrawal",
        },

        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_action: "navigate",
            flow_token: flowToken,
            flow_id: flowId,
            flow_cta: "Withdraw",
            flow_action_payload: {
              screen: "WITHDRAWAL_CURRENCY",
            },
          },
        },
      },
    };
    try {
      await axios({
        method: "POST",
        url: `https://graph.facebook.com/v24.0/${this.business_phone_number_id}/messages`,
        headers: {
          Authorization: `Bearer ${this.GRAPH_API_TOKEN}`,
        },
        data: body,
      });
    } catch (error) {
      console.log("error sending withdraw flow", error);
      throw error;
    }
  }

  async handleButtonPayload(payload: ButtonPayloadType, to: string) {
    switch (payload) {
      case "My Account": {
        const phone = to.startsWith("+") ? to : `+${to}`;
        const user = await User.findOne({ whatsappNumber: phone });
        if (!user) {
          await this.sendTemplateIntroMessage(to);
          return;
        }
        const wallet = await Wallet.findOne({ userId: user.userId });
        if (!wallet) {
          throw new Error(`Wallet for user - [${to}] not found`);
        }

        const [ngnBalance, usdBalance] = await Promise.all([
          await this.walletService.ngnBalance(wallet.publicKey),
          await this.walletService.usdBalance(wallet.publicKey),
        ]);

        const params = [
          {
            type: "text",
            text: `${user.fullName}`,
          },
          {
            type: "text",
            text: `${user.whatsappNumber.replace("+", "")}`,
          },
          {
            type: "text",
            text: `${ngnBalance.balance.toLocaleString()}`,
          },
          {
            type: "text",
            text: `${usdBalance.balance.toLocaleString()}`,
          },
        ];

        await this.sendTemplateInteractiveMessage(
          "receivepayments",
          to,
          "en",
          params
        );
        break;
      }

      case "Withdraw to Bank": {
        const phone = to.startsWith("+") ? to : `+${to}`;
        const user = await User.findOne({ whatsappNumber: phone });
        if (!user) {
          await this.sendTemplateIntroMessage(to);
          return;
        }
        if (!user.isVerified) {
          await this.sendTemplateInteractiveMessage("completekyce", to, "en");
          return;
        }
        // send withdraw flow
        const withdrawFlowId = "775551478878542";
        const initScreen = "WITHDRAWAL_CURRENCY";
        this.sendFlowById(to, withdrawFlowId, initScreen);
        break;
      }

      case "Copy Account NO": {
        const phone = to.startsWith("+") ? to : `+${to}`;
        const user = await User.findOne({ whatsappNumber: phone });
        if (!user) {
          await this.sendTemplateIntroMessage(to);
          return;
        }
        await this.sendNormalMessage(`${to}`, to);
        break;
      }

      case "Invoice a Client":
        await this.sendNormalMessage(`Feature in development...`, to);

      default:
        // invalid payload
        break;
    }
  }

  async handleCommandText(
    command: CommandTextType,
    text: string | undefined,
    to: string
  ) {
    text = text ? text : "";
    const [amount, to_phone_number] = text.split(",");

    switch (command) {
      case "status":
        const txId = text.trim();
        if (!txId)
          return await this.sendNormalMessage(
            "Please pass the transaction id in the required format. status: transactionid",
            to
          );
        const txStatusData = await this.walletService.checkTransactionStatus(
          txId
        );

        await this.sendNormalMessage(
          `*THIS IS A TEST FEATURE*
          
${txStatusData.message}
          `,
          to
        );
        break;
      default:
        break;
    }
  }
}
