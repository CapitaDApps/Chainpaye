/**
 * WhatsApp Business API service for ChainPaye WhatsApp bot
 * This service handles all interactions with the WhatsApp Business API
 * including message sending, webhook handling, and template management
 */

import axios from "axios";
import { WalletService } from "./WalletService";

type ButtonPayloadType = "Receive Payment";
type CommandTextType =
  | "transfer-usd"
  | "transfer-ngn"
  | "deposit"
  | "deposit-usd"
  | "deposit-ngn"
  | "status";

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

  async sendTemplateIntroMessage(to: string) {
    // https://moccasin-bright-skunk-108.mypinata.cloud/ipfs/bafkreic632v26b4htt7cfwkhsleivo6q3lljlnhadgb6u
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
          name: "seasonal_promotion_text_only",
          language: {
            code: "en",
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
              type: "body",
              parameters: [],
            },
            {
              type: "button",
              sub_type: "flow",
              index: "0",
              parameters: [],
            },
            {
              type: "button",
              sub_type: "quick_reply",
              index: "1",
              parameters: [],
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
          components: [
            {
              type: "header",
              parameters: [],
            },

            {
              type: "body",
              parameters: [],
            },
            {
              type: "footer",
              parameters: [],
            },
            {
              type: "button",
              sub_type: "flow",
              index: "0",
              parameters: [],
            },
            {
              type: "button",
              sub_type: "quick_reply",
              index: "1",
              parameters: [],
            },
            {
              type: "button",
              sub_type: "quick_reply",
              index: "2",
              parameters: [],
            },
          ],
        },
      },
    });
  }

  async handleButtonPayload(payload: ButtonPayloadType, to: string) {
    switch (payload) {
      case "Receive Payment":
        // set up transfet to contacts
        await this.sendTemplateInteractiveMessage("receivepayments", to, "en");
        break;
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
      case "transfer-usd":
        if (!amount || !to_phone_number)
          return await this.sendNormalMessage(
            "Parameters not correctly passed",
            to
          );
        if (isNaN(Number(amount)))
          return await this.sendNormalMessage(
            "Invalid transfer amount passed",
            to
          );
        const resp = await this.walletService.transfer(
          to,
          to_phone_number.trim(),
          Number(amount),
          "USD"
        );
        if (resp?.success) {
          return this.sendNormalMessage(resp.message, to);
        }
        this.sendNormalMessage(
          resp?.message || "transfer failed. Pls try again",
          to
        );
        if (resp?.type == "no user data") {
          this.sendNormalMessage(
            `${to} is trying to send you ${amount}USD on chainpaye, create an account to receive this funds`,
            resp.data!
          );
        }
        break;

      case "transfer-ngn":
        if (!amount || !to_phone_number)
          return await this.sendNormalMessage(
            "Parameters not correctly passed",
            to
          );
        if (isNaN(Number(amount)))
          return await this.sendNormalMessage(
            "Invalid transfer amount passed",
            to
          );
        const respNgn = await this.walletService.transfer(
          to,
          to_phone_number.trim(),
          Number(amount),
          "NGN"
        );
        if (respNgn?.success) {
          return this.sendNormalMessage(respNgn.message, to);
        }
        this.sendNormalMessage(
          respNgn?.message || "transfer failed. Pls try again",
          to
        );
        if (respNgn?.type == "no user data") {
          this.sendNormalMessage(
            `${to} is trying to send you ${amount}USD on chainpaye, create an account to receive this funds`,
            respNgn.data!
          );
        }
        break;

      case "deposit":
        await this.sendNormalMessage(
          `*THIS IS A TEST FEATURE*

  To make a deposit, send your deposit message in this format:

*deposit-usd: amount*
*deposit-ngn: amount*
            `,
          to
        );
        break;

      case "deposit-usd":
        const depositAmount = text.trim();
        console.log({ depositAmount });
        if (!depositAmount)
          return await this.sendNormalMessage(
            "Parameters not correctly passed",
            to
          );
        if (isNaN(Number(depositAmount)))
          return await this.sendNormalMessage(
            "Invalid deposit amount passed",
            to
          );
        const data = await this.walletService.deposit(to, depositAmount, "USD");

        await this.sendNormalMessage(
          `*THIS IS A TEST FEATURE*
          
Make deposit to the specified account.

amount: *${data.amount}*
account name: *${data.accountName}*
bank name: *${data.bankName}*
account number: *${data.accountNumber}*
routing number: *${data.routingNO}*

transactionId: *${data.transactionId}*


**You can check the status of the transaction by sending this message: status: transactionId**
          
          `,
          to
        );
        await this.sendNormalMessage(data.transactionId, to);
        break;

      case "deposit-ngn":
        const depositAmountNGN = text.trim();

        if (!depositAmountNGN)
          return await this.sendNormalMessage(
            "Parameters not correctly passed",
            to
          );
        if (isNaN(Number(depositAmountNGN)))
          return await this.sendNormalMessage(
            "Invalid deposit amount passed",
            to
          );
        const dataNgn = await this.walletService.deposit(
          to,
          depositAmountNGN,
          "NGN"
        );

        await this.sendNormalMessage(
          `*THIS IS A TEST FEATURE*
          
Make deposit to the specified account details.

amount: *${dataNgn.amount}*
account name: *${dataNgn.accountName}*
bank name: *${dataNgn.bankName}*
account number: *${dataNgn.accountNumber}* 

transactionId: *${dataNgn.transactionId}*


**You can check the status of the transaction by sending this message: status: transactionId**
        `,
          to
        );
        await this.sendNormalMessage(dataNgn.transactionId, to);
        break;

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
