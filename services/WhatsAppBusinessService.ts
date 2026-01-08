/**
 * WhatsApp Business API service for ChainPaye WhatsApp bot
 * This service handles all interactions with the WhatsApp Business API
 * including message sending, webhook handling, and template management
 */

import axios from "axios";
import { toronetService, userService, walletService } from ".";
import { redisClient } from "./redis";
import { v4 as uuidv4 } from "uuid";
import { User } from "../models/User";
import { Wallet } from "../models/Wallet";
import { CONSTANTS } from "../config/constants";
import { NormalizedNetworkType } from "../commands/types";

type ButtonPayloadType =
  | "My Account"
  | "Withdraw to Bank"
  | "Copy Account NO"
  | "Invoice a Client";

export class WhatsAppBusinessService {
  private GRAPH_API_TOKEN: string;
  private business_phone_number_id: string;

  constructor() {
    this.GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN || "";
    this.business_phone_number_id = process.env.BUSINESS_PHONE_NUMBER_ID || "";
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

  async sendImageMessageById(phoneNumber: string, imageId: string) {
    const data = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneNumber,
      type: "image",
      image: {
        id: imageId,
      },
    };
    const url = `https://graph.facebook.com/v24.0/${this.business_phone_number_id}/messages`;
    await axios.post(url, data, {
      headers: {
        Authorization: `Bearer ${this.GRAPH_API_TOKEN}`,
      },
    });
  }

  async uploadImageToWhatapp(base64String: string): Promise<string> {
    const cleanBase64 = base64String.replace(/^data:image\/\w+;base64,/, "");

    // 2. CONVERT TO BUFFER
    const imageBuffer = Buffer.from(cleanBase64, "base64");

    // 3. CREATE BLOB FROM BUFFER
    const blob = new Blob([imageBuffer], { type: "image/png" });

    // 4. PREPARE FORM DATA FOR UPLOAD
    const form = new FormData();
    form.append("file", blob, "receipt.png");
    form.append("type", "image/png");
    form.append("messaging_product", "whatsapp");

    const url = `https://graph.facebook.com/v24.0/${this.business_phone_number_id}/media`;
    const resp = await axios({
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${this.GRAPH_API_TOKEN}`,
      },
      data: form,
    });
    const data = resp.data;
    return data.id;
  }

  async sendTemplateIntroMessage(to: string) {
    const flowToken = uuidv4();
    await redisClient.set(flowToken, to, "EX", CONSTANTS.CACHE_24HRS); // Store flow_token for 1 hour

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
                    link: "https://chainpaye-public.s3.us-east-1.amazonaws.com/chainpaye-img.jpg",
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
    await redisClient.set(flowToken, to, "EX", CONSTANTS.CACHE_24HRS); // Store flow_token for 1 hour
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

  async sendIntroMessageByFlowId(to: string) {
    const introFlowId = "4356747454606025";
    const introInitScreedId = "PERSONAL_INFO";
    const link =
      "https://chainpaye-public.s3.us-east-1.amazonaws.com/chainpaye-img.jpg";

    // "💸 Send and Receive USD, GBP, EUR, and settle in your local currency - all with our AI Agent on WhatsApp!\n💰 Pay or get paid in USD, GBP, EUR within seconds with our payment link!\n🔥 Off-ramp your crypto assets without conversion to stablecoin and get credited under 50 seconds of asset sent confirmation!\n📲 No app downloads, just KYC and banking with blockchain speed!",

    await this.sendImageFlowById(to, introFlowId, introInitScreedId, {
      link,
      body: `Chainpaye💳 allows

- Send & Receive money in 🇺🇸 USD, 🇪🇺 EUR, 🇬🇧 GBP 💸
  ———————————————————
- Generate payment links in 🇺🇸 USD, 🇪🇺 EUR, 🇬🇧 GBP, 🇳🇬NGN🔗-get paid faster 🤑
  ———————————————————
- Off-ramp crypto to fiat 🔄️ in under 50 seconds ⏱️
  All within WhatsApp 📱 - simple & secure!`,
      cta: "Sign Up",
    });
  }

  async sendMenuMessageMyFlowId(to: string) {
    // const topUpFlowId = "1513776869736922";
    // const topupScreenInitId = "TOPUP_WALLET";
    await this.sendNormalMessage(
      `Hi, it’s Chainpaye 💳🏦! What’s good? 😊

What can I do for you?

🏦 /banktransfer — Transfer from chainpaye wallet to bank accounts

💱 /convert — Convert between fiat currencies

💰 /deposit — Top up your Chainpaye wallet

👤 /myaccount — View account details and balance

🪙 /offramp — Crypto to fiat directly to your wallet

💸 /sendmoney — Instant transfer to other chainpaye users

📜 /transactionhistory — View your past transactions`,
      to
    );
  }

  async sendTopUpFlowById(to: string) {
    const topUpFlowId = "1513776869736922";
    const topUpScreenInitId = "TOPUP_WALLET";
    await this.sendTextOnlyFlowById(to, topUpFlowId, topUpScreenInitId, {
      header: "Top up Wallet",
      body: "Top up your Chainpaye wallet in seconds and start sending or receiving money globally.",
      cta: "Start Top-up",
    });
  }

  async sendTransferFlowById(to: string) {
    const transferFlowId = "1882173995991922";
    const transferScreenInitId = "TRANSFER";
    await this.sendTextOnlyFlowById(to, transferFlowId, transferScreenInitId, {
      header: "Transfer Money",
      body: "Send money to friends and family globally with ease and speed.",
      cta: "Start Transfer",
    });
  }

  async sendWithdrawalFlowById(to: string) {
    const withdrawFlowId = "1654062222645036";
    const screenId = "WITHDRAWAL_CURRENCY";
    await this.sendTextOnlyFlowById(to, withdrawFlowId, screenId, {
      header: "Withdraw to Bank",
      body: "Withdraw your funds to your bank account.",
      cta: "Start Withdrawal",
    });
  }

  async sendConvertFiatFlowById(to: string) {
    const convertFlowId = "773377672429898";
    const convertFlowScreen = "CONVERT_ENTRY";
    await this.sendTextOnlyFlowById(to, convertFlowId, convertFlowScreen, {
      header: "Convert Fiat",
      body: "Convert your local currency to USD or NGN seamlessly.",
      cta: "Start Conversion",
    });
  }

  async sendOfframpInstructions(to: string) {
    const message = `🪙 *Sell Crypto for Fiat*

To sell your crypto and receive fiat in your Chainpaye wallet, please specify:

*Supported Cryptocurrencies:*
• USDC - BNB Smart Chain, Solana, Ethereum, Polygon, Tron, Base
• USDT - BNB Smart Chain, Solana, Ethereum, Polygon, Tron

*How to specify what to sell:*
Just send a message with the token and network. Here are some examples:
• "usdc solana" or "usdc on solana"
• "usdt ethereum" or "usdt on ethereum"
• "usdc bsc" or "usdt bsc"

*Supported Networks:*
• BNB Smart Chain (BSC)
• Solana (SOL)
• Ethereum (ETH)
• Polygon (POLY)
• Tron (TRX)
• Base

What would you like to sell?`;

    await this.sendNormalMessage(message, to);
  }

  async sendCryptoDepositAddress(
    to: string,
    token: string,
    network: NormalizedNetworkType,
    address: string
  ) {
    // Message 1: Send the deposit address
    // await this.sendNormalMessage(
    //   `📥 *Deposit Address*\n\nSend your ${token.toUpperCase()} on ${network.toUpperCase()} to:\n\n\`${address}\`\n\n⚠️ Only send ${token.toUpperCase()} on ${network.toUpperCase()} network.`,
    //   to
    // );

    await this.sendNormalMessage(address, to);

    // Message 2: Instructions and start the flow
    // await this.sendNormalMessage(
    //   `1. Copy the address above\n2. Send your ${token.toUpperCase()} to the address\n3. Once sent, click below to complete the offramp process`,
    //   to
    // );

    // Start the flow
    const cryptoTopUpFlowId = "1672205394189200";
    const cryptoTopUpScreenId = "OFFRAMP_INPUT";
    await this.sendTextOnlyFlowById(
      to,
      cryptoTopUpFlowId,
      cryptoTopUpScreenId,
      {
        header: "Complete Off ramp",
        body: `Copy address above 👆\n\n Send your ${token.toUpperCase()} on ${network.toUpperCase()} \n\n⚠️ Only send ${token.toUpperCase()} on ${network.toUpperCase()} network.
     
     `,
        cta: "Complete Off ramp",
      }
    );
    await redisClient.set(
      `OFFRAMP_${to}`,
      JSON.stringify({ asset: token, network }),
      "EX"
    );
  }

  async sendMyAccountInfo(to: string) {
    const phone = to.startsWith("+") ? to : `+${to}`;
    const { user, wallet } = await userService.getUserToroWallet(phone);
    const [usdBalance, ngnBalance] = await Promise.all([
      toronetService.getBalanceUSD(wallet.publicKey),
      toronetService.getBalanceNGN(wallet.publicKey),
    ]);

    // if (user.country === "NG") {
    //   // update wallet for indirect transfers

    // }

    // message should contain the user's account, number, name and balances
    let message = `👋 Hello, ${user.firstName || user.lastName}

Account No: ${user.whatsappNumber.replace("+", "")}

Available Balances:
🇳🇬 NGN: ₦ ${ngnBalance.balance.toFixed(2)}
🇺🇸 USD: $${usdBalance.balance.toFixed(2)}`;

    let accountnumber: string | null = null;

    if (user.country === "NG") {
      const [vw] = await Promise.all([
        toronetService.getVirtualWalletByAddress(wallet.publicKey),
        toronetService.updateVirtualWallet(wallet.publicKey),
      ]);

      if (vw.result) {
        message += `\n\n
*📥 FUND YOUR ACCOUNT*

To top up your NGN balance, transfer to:

Bank: FCMB
Account Name: ${vw.accountname}
(⚠️ NGN Deposits Only)

Copy the account number below 👇
      `;
        accountnumber = vw.accountnumber;
      }
    }

    await this.sendNormalMessage(message, to);
    if (accountnumber) {
      await this.sendNormalMessage(accountnumber, to);
    }
  }

  private async sendImageFlowById(
    to: string,
    flowId: string,
    screenId: string,
    data: {
      link: string;
      body: string;
      cta: string;
    }
  ) {
    const flowToken = uuidv4();
    await redisClient.set(flowToken, to, "EX", CONSTANTS.CACHE_24HRS);
    const body = {
      messaging_product: "whatsapp",
      to,
      recipient_type: "individual",
      type: "interactive",
      interactive: {
        type: "flow",
        header: {
          type: "image",
          image: {
            link: data.link,
          },
        },
        body: {
          text: data.body,
        },

        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_action: "navigate",
            flow_token: flowToken,
            flow_id: flowId,
            flow_cta: data.cta,
            flow_action_payload: {
              screen: screenId,
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

  private async sendTextOnlyFlowById(
    to: string,
    flowId: string,
    screenId: string,
    data: {
      header?: string;
      body: string;
      cta: string;
    }
  ) {
    const flowToken = uuidv4();
    await redisClient.set(flowToken, to, "EX", CONSTANTS.CACHE_24HRS);
    const body = {
      messaging_product: "whatsapp",
      to,
      recipient_type: "individual",
      type: "interactive",
      interactive: {
        type: "flow",
        ...(data.header && {
          header: {
            type: "text",
            text: data.header,
          },
        }),
        body: {
          text: data.body,
        },

        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_action: "navigate",
            flow_token: flowToken,
            flow_id: flowId,
            flow_cta: data.cta,
            flow_action_payload: {
              screen: screenId,
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
      console.log(
        "error sending text only flow",
        (error as { response: any }).response.data
      );
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
          await walletService.ngnBalance(wallet.publicKey),
          await walletService.usdBalance(wallet.publicKey),
        ]);

        const params = [
          {
            type: "text",
            text: `${user.firstName} ${user.lastName}`,
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
        if (!user || !user.firstName || !user.lastName) {
          await this.sendTemplateIntroMessage(to);
          return;
        }

        const withdrawFlowId = "1654062222645036";
        const screenId = "WITHDRAWAL_CURRENCY";
        this.sendTextOnlyFlowById(to, withdrawFlowId, screenId, {
          header: "Withdraw to Bank",
          body: "Withdraw your funds to your bank account.",
          cta: "Start Withdrawal",
        });
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
}
