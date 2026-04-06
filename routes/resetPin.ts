import { Router, Request, Response } from "express";
import argon2 from "argon2";
import { User } from "../models/User";
import { consumeResetToken } from "../webhooks/services/resetPinFlow.service";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { token, pin } = req.body;

  if (!token || !pin) {
    return res.status(400).json({ message: "Token and PIN are required." });
  }

  if (!/^\d{4,6}$/.test(pin)) {
    return res.status(400).json({ message: "PIN must be 4–6 digits." });
  }

  const whatsappNumber = await consumeResetToken(token);

  if (!whatsappNumber) {
    return res
      .status(410)
      .json({ message: "This reset link has expired or is invalid." });
  }

  const phone = whatsappNumber.startsWith("+")
    ? whatsappNumber
    : `+${whatsappNumber}`;

  const hashedPin = await argon2.hash(pin);
  await User.updateOne({ whatsappNumber: phone }, { pin: hashedPin });

  return res.status(200).json({ message: "PIN reset successfully." });
});

export default router;
