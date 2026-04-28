/**
 * ImagePaymentService
 *
 * Downloads a WhatsApp media image, sends it to OpenAI Vision to extract
 * bank payment details (account number, bank name), then resolves the
 * account name via Toronet before triggering a confirmation flow.
 */

import axios from "axios";
import OpenAI from "openai";
import { ToronetService } from "./ToronetService";

export interface ExtractedPaymentDetails {
  accountNumber: string;
  bankName: string;
  accountName: string; // resolved via Toronet
  bankCode: string;
  amount: string; // from caption
}

export class ImagePaymentService {
  private openai: OpenAI;
  private toronetService: ToronetService;
  private GRAPH_API_TOKEN: string;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.toronetService = new ToronetService();
    this.GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN || "";
  }

  /**
   * Download a WhatsApp media file and return it as a base64 data URL.
   */
  private async downloadWhatsAppMedia(mediaId: string): Promise<string> {
    // Step 1: get the media URL from Graph API
    const metaResp = await axios.get(
      `https://graph.facebook.com/v24.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${this.GRAPH_API_TOKEN}` } },
    );
    const mediaUrl: string = metaResp.data.url;

    // Step 2: download the binary
    const imageResp = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${this.GRAPH_API_TOKEN}` },
    });

    const mimeType: string =
      imageResp.headers["content-type"] || "image/jpeg";
    const base64 = Buffer.from(imageResp.data).toString("base64");
    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * Use OpenAI Vision to extract bank payment details from the image.
   * Returns raw extracted fields (no account name yet).
   */
  private async extractDetailsFromImage(base64DataUrl: string): Promise<{
    accountNumber: string | null;
    bankName: string | null;
  }> {
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a payment detail extractor. Look at this image and extract Nigerian bank payment details.
Return ONLY a valid JSON object with these exact keys:
{
  "accountNumber": "10-digit account number or null if not found",
  "bankName": "full bank name or null if not found"
}
Do not include any explanation, markdown, or extra text. Just the JSON.`,
            },
            {
              type: "image_url",
              image_url: { url: base64DataUrl, detail: "high" },
            },
          ],
        },
      ],
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content?.trim() || "{}";

    // Strip markdown code fences if present
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

    try {
      const parsed = JSON.parse(cleaned);
      return {
        accountNumber: parsed.accountNumber || null,
        bankName: parsed.bankName || null,
      };
    } catch {
      console.error("Failed to parse OpenAI response:", content);
      return { accountNumber: null, bankName: null };
    }
  }

  /**
   * Parse the amount from the message caption.
   * Accepts formats like: "send 5000", "5000", "pay 2500.50"
   */
  parseAmountFromCaption(caption: string): string | null {
    const match = caption.match(/[\d,]+(?:\.\d{1,2})?/);
    if (!match) return null;
    return match[0].replace(/,/g, "");
  }

  /**
   * Extract bank details from image without amount (for when user sends image without caption)
   * Returns bank details that can be stored temporarily until user provides amount
   */
  async extractBankDetailsFromImage(
    mediaId: string,
  ): Promise<Omit<ExtractedPaymentDetails, "amount"> | { error: string }> {
    // 1. Download image
    let base64DataUrl: string;
    try {
      base64DataUrl = await this.downloadWhatsAppMedia(mediaId);
    } catch (err) {
      console.error("Error downloading WhatsApp media:", err);
      return { error: "Could not download the image. Please try again." };
    }

    // 2. Extract details via OpenAI Vision
    const extracted = await this.extractDetailsFromImage(base64DataUrl);

    if (!extracted.accountNumber) {
      return { error: "Could not detect an account number in the image. Please check the image is clear and try again." };
    }
    if (!extracted.bankName) {
      return { error: "Could not detect a bank name in the image. Please check the image is clear and try again." };
    }

    // 3. Find the bank code from Toronet bank list
    const banks = await this.toronetService.getBankListNGN();
    const matchedBank = banks.find((b) =>
      b.title.toLowerCase().includes(extracted.bankName!.toLowerCase()) ||
      extracted.bankName!.toLowerCase().includes(b.title.toLowerCase()),
    );

    if (!matchedBank) {
      return {
        error: `Detected bank "${extracted.bankName}" is not supported. Please use the manual withdrawal option.`,
      };
    }

    // 4. Resolve account name via Toronet
    let accountName: string;
    try {
      accountName = await this.toronetService.resolveBankAccountNameNGN(
        extracted.accountNumber,
        matchedBank.id,
      );
    } catch (err) {
      console.error("Error resolving account name:", err);
      return {
        error: `Could not verify account number ${extracted.accountNumber} at ${matchedBank.title}. Please check the details and try again.`,
      };
    }

    if (!accountName) {
      return {
        error: `Account number ${extracted.accountNumber} not found at ${matchedBank.title}.`,
      };
    }

    return {
      accountNumber: extracted.accountNumber,
      bankName: matchedBank.title,
      bankCode: matchedBank.id,
      accountName,
    };
  }

  /**
   * Main entry point.
   * Downloads the image, extracts details via Vision, resolves account name,
   * and returns the full ExtractedPaymentDetails ready for the confirmation flow.
   */
  async processPaymentImage(
    mediaId: string,
    caption: string,
  ): Promise<ExtractedPaymentDetails | { error: string }> {
    // 1. Parse amount from caption
    const amount = this.parseAmountFromCaption(caption);
    if (!amount) {
      return { error: "Could not find an amount in your caption. Try: \"send 5000\"" };
    }

    // 2. Download image
    let base64DataUrl: string;
    try {
      base64DataUrl = await this.downloadWhatsAppMedia(mediaId);
    } catch (err) {
      console.error("Error downloading WhatsApp media:", err);
      return { error: "Could not download the image. Please try again." };
    }

    // 3. Extract details via OpenAI Vision
    const extracted = await this.extractDetailsFromImage(base64DataUrl);

    if (!extracted.accountNumber) {
      return { error: "Could not detect an account number in the image. Please check the image is clear and try again." };
    }
    if (!extracted.bankName) {
      return { error: "Could not detect a bank name in the image. Please check the image is clear and try again." };
    }

    // 4. Find the bank code from Toronet bank list
    const banks = await this.toronetService.getBankListNGN();
    const matchedBank = banks.find((b) =>
      b.title.toLowerCase().includes(extracted.bankName!.toLowerCase()) ||
      extracted.bankName!.toLowerCase().includes(b.title.toLowerCase()),
    );

    if (!matchedBank) {
      return {
        error: `Detected bank "${extracted.bankName}" is not supported. Please use the manual withdrawal option.`,
      };
    }

    // 5. Resolve account name via Toronet
    let accountName: string;
    try {
      accountName = await this.toronetService.resolveBankAccountNameNGN(
        extracted.accountNumber,
        matchedBank.id,
      );
    } catch (err) {
      console.error("Error resolving account name:", err);
      return {
        error: `Could not verify account number ${extracted.accountNumber} at ${matchedBank.title}. Please check the details and try again.`,
      };
    }

    if (!accountName) {
      return {
        error: `Account number ${extracted.accountNumber} not found at ${matchedBank.title}.`,
      };
    }

    return {
      accountNumber: extracted.accountNumber,
      bankName: matchedBank.title,
      bankCode: matchedBank.id,
      accountName,
      amount,
    };
  }
}
