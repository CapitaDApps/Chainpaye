import { User } from "../models/User";
import { ToronetService } from "./ToronetService";
import { Types } from "mongoose";
import { WalletService } from "./WalletService";
import { CurrencyType } from "../types/toronetService.types";
import { Wallet } from "../models/Wallet";
import { WhatsAppBusinessService } from "./WhatsAppBusinessService";

type CreateOrGetUserType = {
  whatsappNumber: string;
  fullName: string;
  countryCode: string;
};

export class UserService {
  private toronetService: ToronetService;
  private walletService: WalletService;
  private whatsappBusinessService: WhatsAppBusinessService;

  constructor() {
    this.toronetService = new ToronetService();
    this.walletService = new WalletService();
    this.whatsappBusinessService = new WhatsAppBusinessService();
  }

  async createOrGetUser(data: CreateOrGetUserType) {
    const user = await User.findOne({ whatsappNumber: data.whatsappNumber });
    if (!user) {
      // send welcome message
      this.whatsappBusinessService.sendNormalMessage(
        `Hello *${data.fullName}*, welcome to Chainpaye.`,
        data.whatsappNumber
      );
      const user = await User.create({
        whatsappNumber: data.whatsappNumber,
        fullName: data.fullName,
        country: data.countryCode,
      });
      await this.walletService.addWallet(user);
      return user;
    }

    return user;
  }

  // TODO: Convert all incoming funds to TORO for easy transfer

  async transferWithinWhatsapp({
    fromId,
    toPhoneNumber,
    amount,
    currency,
  }: {
    fromId: Types.ObjectId;
    toPhoneNumber: string;
    amount: number;
    currency: CurrencyType;
  }) {
    const from = await User.findById(fromId);
    const to = await User.findOne({ phoneNumber: toPhoneNumber });

    if (!from)
      throw new Error(`User with id-[${fromId.toString()}] not found.`);
    if (!to)
      throw new Error(`User with phone number - [${toPhoneNumber}] not found.`);

    const toWallet = await Wallet.findOne({ user: to._id });
    if (!toWallet)
      throw new Error(
        `User with phone number - [${toPhoneNumber}] has no wallet.`
      );
    const toAddress = toWallet.publicKey;
    // this.toronetService
  }

  // TODO: Email verification for pin
}
