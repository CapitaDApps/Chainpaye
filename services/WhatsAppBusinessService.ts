/**
 * WhatsApp Business API service for ChainPaye WhatsApp bot
 * This service handles all interactions with the WhatsApp Business API
 * including message sending, webhook handling, and template management
 */

import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { dexPayService, toronetService, userService } from ".";
import { NormalizedNetworkType } from "../commands/types";
import { CONSTANTS } from "../config/constants";
import { WHATSAPP_CONFIG } from "../config/whatsapp";
import { User } from "../models/User";
import { redisClient } from "./redis";

type ButtonPayloadType =
  | "My Account"
  | "Withdraw to Bank"
  | "Copy Account NO"
  | "Invoice a Client";

type ListRow = {
  id: string;
  title: string;
  description?: string;
};

type ListSection = {
  title: string;
  rows: ListRow[];
};

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
    templateLang: string,
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
    bodyParameters?: any[],
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
    const introFlowId = WHATSAPP_CONFIG.FLOW_IDS.INTRO;
    const introInitScreedId = "PERSONAL_INFO";
    const link =
      "https://chainpaye-public.s3.us-east-1.amazonaws.com/chainpaye-img.jpg";

    // "💸 Send and Receive USD, GBP, EUR, and settle in your local currency - all with our AI Agent on WhatsApp!\n💰 Pay or get paid in USD, GBP, EUR within seconds with our payment link!\n🔥 Off-ramp your crypto assets without conversion to stablecoin and get credited under 50 seconds of asset sent confirmation!\n📲 No app downloads, just KYC and banking with blockchain speed!",

    await this.sendImageFlowById(to, introFlowId, introInitScreedId, {
      link,
      body: `Welcome to Chainpaye! 🚀

We make managing money as easy as sending a text. Here's what you can do:

💸 **Global Transfers**: Send & receive USD, EUR, and GBP instantly.
🔗 **Get Paid Fast**: Create payment links in seconds.
🔄 **Crypto to Cash**: Convert crypto to fiat in under 50 seconds.

No complex apps, just secure & fast payments right here! ✨`,
      cta: "Sign Up",
    });
  }

  async sendMenuMessageMyFlowId(to: string) {
    // const topUpFlowId = "1513776869736922";
    // const topupScreenInitId = "TOPUP_WALLET";
    await this.sendNormalMessage(
      `Hi, it’s Chainpaye 💳🏦! What’s good? 😊

What can I do for you?

💰 Deposit — Top up instantly!

💳 Offramp — Spend crypto anywhere.
 
🌍 Send — Pay friends in a flash using Whatsapp NO.

🏦 Withdraw — Cash out to your bank.`,
      to,
    );

    await this.sendListMessage(
      to,
      "Other menu",
      "Select an action to continue.",
      // "Powered by Chainpaye",
      "View Menu",
      [
        {
          title: "Other menu",
          rows: [
            {
              id: "other_menu_payment_link",
              title: "Payment link",
              description: "Create and share a payment link",
            },
            {
              id: "other_menu_transaction_history",
              title: "Transaction history",
              description: "View your recent transactions",
            },
            {
              id: "other_menu_support",
              title: "Support",
              description: "Contact Chainpaye support",
            },
          ],
        },
      ],
    );
  }

  async sendTopUpFlowById(to: string) {
    const topUpFlowId = WHATSAPP_CONFIG.FLOW_IDS.TOPUP;
    const topUpScreenInitId = "TOPUP_WALLET";
    await this.sendTextOnlyFlowById(to, topUpFlowId, topUpScreenInitId, {
      header: "Top up Wallet",
      body: "Top up your Chainpaye wallet in seconds and start sending or receiving money globally.",
      cta: "Start Top-up",
    });
  }

  async sendTransferFlowById(to: string) {
    const phone = to.startsWith("+") ? to : `+${to}`;
    const user = await userService.getUser(phone);

    if (!user || !user.isVerified) {
      await this.sendNormalMessage(
        "You need to complete KYC verification to transfer funds. Please complete the verification process below.",
        to,
      );
      await this.sendKycFlowById(to);
      return;
    }

    const transferFlowId = WHATSAPP_CONFIG.FLOW_IDS.TRANSFER;
    const transferScreenInitId = "TRANSFER";
    await this.sendTextOnlyFlowById(to, transferFlowId, transferScreenInitId, {
      header: "Transfer Money",
      body: "Send money to friends and family globally with ease and speed.",
      cta: "Start Transfer",
    });
  }

  async sendWithdrawalFlowById(to: string) {
    const phone = to.startsWith("+") ? to : `+${to}`;
    const user = await userService.getUser(phone);

    if (!user || !user.isVerified) {
      await this.sendNormalMessage(
        "You need to complete KYC verification to withdraw funds. Please complete the verification process below.",
        to,
      );
      await this.sendKycFlowById(to);
      return;
    }

    const withdrawFlowId = WHATSAPP_CONFIG.FLOW_IDS.WITHDRAWAL;
    const screenId = "WITHDRAWAL_CURRENCY";
    await this.sendTextOnlyFlowById(to, withdrawFlowId, screenId, {
      header: "Withdraw to Bank",
      body: "Withdraw your funds to your bank account.",
      cta: "Start Withdrawal",
    });
  }

  async sendConvertFiatFlowById(to: string) {
    const phone = to.startsWith("+") ? to : `+${to}`;
    const user = await userService.getUser(phone);

    if (!user || !user.isVerified) {
      await this.sendNormalMessage(
        "You need to complete KYC verification to convert funds. Please complete the verification process below.",
        to,
      );
      await this.sendKycFlowById(to);
      return;
    }

    const convertFlowId = WHATSAPP_CONFIG.FLOW_IDS.CONVERT;
    const convertFlowScreen = "CONVERT_ENTRY";
    await this.sendTextOnlyFlowWithDataById(
      to,
      convertFlowId,
      convertFlowScreen,
      {
        header: "Convert Fiat",
        body: "Convert between NGN, USD, EUR, and GBP seamlessly.",
        cta: "Start Conversion",
      },
      {
        currencies: [
          { id: "USD", title: "USD" },
          { id: "NGN", title: "NGN" },
          { id: "EUR", title: "EUR" },
          { id: "GBP", title: "GBP" },
        ],
      },
    );
  }

  async sendPaymentLinkFlowById(to: string) {
    const paymentLinkFlowId = WHATSAPP_CONFIG.FLOW_IDS.PAYMENT_LINK;
    const paymentLinkScreenId = "CREATE_LINK_DETAILS";

    if (!paymentLinkFlowId) {
      throw new Error(
        "Missing WhatsApp payment link flow ID. Set WHATSAPP_PAYMENT_LINK_FLOW_ID (or staging equivalent).",
      );
    }

    await this.sendTextOnlyFlowWithDataById(
      to,
      paymentLinkFlowId,
      paymentLinkScreenId,
      {
        header: "Create Payment Link",
        body: "Generate a secure payment link and share it with your customer to get paid faster.",
        cta: "Create Link",
      },
      {
        currencies: [
          { id: "NGN", title: "NGN" },
          { id: "USD", title: "USD" },
          { id: "GBP", title: "GBP" },
          { id: "EUR", title: "EUR" },
        ],
      },
    );
  }

  /**
   * Send KYC verification flow to Nigerian users
   * This allows them to complete BVN verification
   */
  async sendKycFlowById(to: string) {
    // TODO: Replace with actual KYC flow ID after uploading to Meta Business Suite
    const kycFlowId = WHATSAPP_CONFIG.FLOW_IDS.KYC;
    const kycScreenId = "COUNTRY_SELECT";
    await this.sendTextOnlyFlowById(to, kycFlowId, kycScreenId, {
      header: "Verify Your Identity",
      body: "Complete your BVN verification to unlock all Chainpaye features including bank withdrawals.",
      cta: "Start Verification",
    });
  }

  async sendOfframpInstructions(to: string) {
    const message = `🪙 Sell Crypto for Fiat

1. Supported Tokens:
💲 USDC
💲 USDT

2. Supported Networks:
🌐 BNB Smart Chain (BSC), Solana, Ethereum, Polygon, Tron, Base

To proceed, reply with Token and Network 
Eg: USDC BASE

What would you like to sell?`;

    await this.sendNormalMessage(message, to);
  }

  async sendCryptoDepositAddress(
    to: string,
    token: string,
    network: NormalizedNetworkType,
    address: string,
  ) {
    // Message 1: Send the deposit address
    // await this.sendNormalMessage(address, to);

    // Fetch banks for the offramp flow
    let banks: { id: string; title: string }[] = [
      { id: "000014", title: "Access Bank" },
      { id: "000013", title: "GTBank" },
      { id: "000015", title: "Zenith Bank" },
      { id: "999992", title: "Opay" },
      { id: "090267", title: "Kuda Bank" },
    ];

    try {
      const dexPayBanks = await dexPayService.getBanks();
      if (dexPayBanks && dexPayBanks.length > 0) {
        banks = dexPayBanks.map((b) => ({ id: b.code, title: b.name }));
      }
      console.log("DEBUG: Fetched banks for offramp:", banks.length);
    } catch (error) {
      console.error("DEBUG: Error fetching banks, using fallback:", error);
    }

    // Start the flow with banks data
    const cryptoTopUpFlowId = WHATSAPP_CONFIG.FLOW_IDS.OFFRAMP;
    const cryptoTopUpScreenId = "OFFRAMP_DETAILS";

    await this.sendTextOnlyFlowWithDataById(
      to,
      cryptoTopUpFlowId,
      cryptoTopUpScreenId,
      {
        body: `Spend stablecoin like 💸 
     `,
        cta: "Complete Off ramp",
      },
      {
        banks: banks,
      },
    );

    await redisClient.set(
      `OFFRAMP_${to}`,
      JSON.stringify({ asset: token, network }),
      "EX",
    );
  }

  async sendMyAccountInfo(to: string) {
    const phone = to.startsWith("+") ? to : `+${to}`;
    const { user, wallet } = await userService.getUserToroWallet(phone);

    console.log("[sendMyAccountInfo] User data:", {
      phone,
      userId: user?.userId,
      firstName: user?.firstName,
      lastName: user?.lastName,
      fullName: user?.fullName,
      isVerified: user?.isVerified,
      walletPublicKey: wallet?.publicKey,
    });

    const [usdBalance, ngnBalance, eurBalance, gbpBalance] = await Promise.all([
      toronetService.getBalanceUSD(wallet.publicKey),
      toronetService.getBalanceNGN(wallet.publicKey),
      toronetService.getBalanceEUR(wallet.publicKey),
      toronetService.getBalanceGBP(wallet.publicKey),
    ]);

    const displayName = user.isVerified
      ? `${user.firstName} ${user.lastName}`
      : user.fullName ||
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        "User";

    console.log("[sendMyAccountInfo] Display name calculation:", {
      isVerified: user.isVerified,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      calculatedDisplayName: displayName,
    });

    let message = `Hello ${displayName},

Account No: ${user.whatsappNumber.replace("+", "")}

Available Balances:
NGN: NGN ${ngnBalance.balance.toFixed(2)}
USD: USD ${usdBalance.balance.toFixed(2)}
EUR: EUR ${eurBalance.balance.toFixed(2)}
GBP: GBP ${gbpBalance.balance.toFixed(2)}`;

    let accountnumber: string | null = null;

    if (user.country === "NG") {
      const [vw] = await Promise.all([
        toronetService.getVirtualWalletByAddress(wallet.publicKey),
        toronetService.updateVirtualWallet(wallet.publicKey),
      ]);

      if (vw.result) {
        message += `\n\n
*FUND YOUR ACCOUNT*

To top up your NGN balance, transfer to:

Bank: FCMB
Account Name: ${vw.accountname}
(NGN Deposits Only)

Copy the account number below
      `;
        accountnumber = vw.accountnumber;
      }
    }

    await this.sendNormalMessage(message, to);
    if (accountnumber) {
      await this.sendNormalMessage(accountnumber, to);
    }
  }
  async sendSupportMessage(to: string) {
    const message = `🆘 *Need Help?*

For support, please DM our team:

*📞 Brain:* +2348106535142
*📞 Ben:* +2348130348865

Our team is ready to assist you!`;

    await this.sendNormalMessage(message, to);
  }

  private async sendListMessage(
    to: string,
    headerText: string,
    bodyText: string,
    // footerText: string,
    buttonText: string,
    sections: ListSection[],
  ) {
    const body = {
      messaging_product: "whatsapp",
      to,
      recipient_type: "individual",
      type: "interactive",
      interactive: {
        type: "list",
        header: {
          type: "text",
          text: headerText,
        },
        body: {
          text: bodyText,
        },
        // footer: {
        //   text: footerText,
        // },
        action: {
          button: buttonText,
          sections,
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
        "error sending list message",
        (error as { response?: { data?: unknown } }).response?.data || error,
      );
      throw error;
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
    },
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
    },
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
        (error as { response: any }).response.data,
      );
      throw error;
    }
  }

  /**
   * Send a flow with initial screen data
   * Use this when you need to pass dynamic data to the first screen
   */
  private async sendTextOnlyFlowWithDataById(
    to: string,
    flowId: string,
    screenId: string,
    displayData: {
      header?: string;
      body: string;
      cta: string;
    },
    screenData: Record<string, any>,
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
        ...(displayData.header && {
          header: {
            type: "text",
            text: displayData.header,
          },
        }),
        body: {
          text: displayData.body,
        },

        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_action: "navigate",
            flow_token: flowToken,
            flow_id: flowId,
            flow_cta: displayData.cta,
            flow_action_payload: {
              screen: screenId,
              data: screenData,
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
        "error sending flow with data",
        (error as { response: any }).response.data,
      );
      throw error;
    }
  }

  async handleButtonPayload(payload: ButtonPayloadType, to: string) {
    switch (payload) {
      case "My Account": {
        await this.sendMyAccountInfo(to);
        break;
      }

      case "Withdraw to Bank": {
        const phone = to.startsWith("+") ? to : `+${to}`;
        const user = await User.findOne({ whatsappNumber: phone });
        if (!user || !user.firstName || !user.lastName) {
          await this.sendTemplateIntroMessage(to);
          return;
        }

        const withdrawFlowId = WHATSAPP_CONFIG.FLOW_IDS.WITHDRAWAL_BUTTON;
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
