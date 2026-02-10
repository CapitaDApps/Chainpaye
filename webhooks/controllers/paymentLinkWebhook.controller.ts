import { Request, Response } from "express";
import { whatsappBusinessService } from "../../services";
import { logger } from "../../utils/logger";

type SupportedCurrency = "NGN" | "USD" | "GBP" | "EUR";

interface PaymentLinkSuccessWebhookPayload {
  paymentLinkId: string;
  transactionId: string;
  amount: string;
  currency: SupportedCurrency;
  senderName: string;
  senderPhone: string;
  paymentMethod: string;
  status: string;
  paidAt: string;
  name: string;
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
    const paymentLinkId =
      typeof payload.paymentLinkId === "string" ? payload.paymentLinkId.trim() : "";
    const transactionId =
      typeof payload.transactionId === "string" ? payload.transactionId.trim() : "";
    const amount =
      typeof payload.amount === "string" ? payload.amount.trim() : "";
    const currencyRaw =
      typeof payload.currency === "string" ? payload.currency.trim().toUpperCase() : "";
    const senderName =
      typeof payload.senderName === "string" ? payload.senderName.trim() : "";
    const senderPhone =
      typeof payload.senderPhone === "string" ? payload.senderPhone.trim() : "";
    const paymentMethod =
      typeof payload.paymentMethod === "string" ? payload.paymentMethod.trim() : "";
    const status = typeof payload.status === "string" ? payload.status.trim() : "";
    const paidAt = typeof payload.paidAt === "string" ? payload.paidAt.trim() : "";
    const recipientName = typeof payload.name === "string" ? payload.name.trim() : "";

    if (
      !paymentLinkId ||
      !transactionId ||
      !amount ||
      !senderName ||
      !senderPhone ||
      !paymentMethod ||
      !status ||
      !paidAt ||
      !recipientName ||
      !isSupportedCurrency(currencyRaw)
    ) {
      res.status(400).json({
        success: false,
        message:
          "Invalid payload. Required: paymentLinkId, transactionId, amount, currency, senderName, senderPhone, paymentMethod, status, paidAt, name.",
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
    const normalizedStatus = status.toLowerCase();
    const heading =
      normalizedStatus === "completed" ? "*Payment Received*" : "*Payment Update*";
    const message = [
      heading,
      "",
      `Hello ${recipientName},`,
      `Status: ${status}`,
      `Amount: ${amount} ${currencyRaw}`,
      `Payer: ${senderName}`,
      `Method: ${paymentMethod}`,
      `Payment Link ID: ${paymentLinkId}`,
      `Transaction ID: ${transactionId}`,
      `Paid at: ${paidDate.toISOString()}`,
    ].join("\n");

    await whatsappBusinessService.sendNormalMessage(message, recipientPhone);

    logger.info("Payment link success webhook processed", {
      paymentLinkId,
      transactionId,
      senderPhone: recipientPhone,
      amount,
      currency: currencyRaw,
      paymentMethod,
      status,
      recipientName,
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
