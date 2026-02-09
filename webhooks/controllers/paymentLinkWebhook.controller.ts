import { Request, Response } from "express";
import { whatsappBusinessService } from "../../services";
import { logger } from "../../utils/logger";

type SupportedCurrency = "NGN" | "USD" | "GBP" | "EUR";

interface PaymentLinkSuccessWebhookPayload {
  amount: string;
  currency: SupportedCurrency;
  senderName: string;
  senderPhone: string;
  paidAt: string;
}

function isSupportedCurrency(value: string): value is SupportedCurrency {
  return value === "NGN" || value === "USD" || value === "GBP" || value === "EUR";
}

function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

export async function paymentLinkSuccessWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const payload = req.body as Partial<PaymentLinkSuccessWebhookPayload>;
    const amount =
      typeof payload.amount === "string" ? payload.amount.trim() : "";
    const currencyRaw =
      typeof payload.currency === "string" ? payload.currency.trim().toUpperCase() : "";
    const senderName =
      typeof payload.senderName === "string" ? payload.senderName.trim() : "";
    const senderPhone =
      typeof payload.senderPhone === "string" ? payload.senderPhone.trim() : "";
    const paidAt = typeof payload.paidAt === "string" ? payload.paidAt.trim() : "";

    if (!amount || !senderName || !senderPhone || !paidAt || !isSupportedCurrency(currencyRaw)) {
      res.status(400).json({
        success: false,
        message: "Invalid payload. Required: amount, currency, senderName, senderPhone, paidAt.",
      });
      return;
    }

    const paidDate = new Date(paidAt);
    if (Number.isNaN(paidDate.getTime())) {
      res.status(400).json({
        success: false,
        message: "Invalid paidAt value. Expected ISO date string.",
      });
      return;
    }

    const recipientPhone = normalizePhone(senderPhone);
    const message = [
      "*Payment Received*",
      "",
      `Amount: ${amount} ${currencyRaw}`,
      `Payer: ${senderName}`,
      `Paid at: ${paidDate.toISOString()}`,
    ].join("\n");

    await whatsappBusinessService.sendNormalMessage(message, recipientPhone);

    logger.info("Payment link success webhook processed", {
      senderPhone: recipientPhone,
      amount,
      currency: currencyRaw,
      paidAt: paidDate.toISOString(),
    });

    res.status(200).json({
      success: true,
      message: "Payment notification sent successfully.",
    });
  } catch (error) {
    logger.error("Failed to process payment link success webhook", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
}
