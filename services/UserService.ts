import { IUser, User } from "../models/User";
import { ToronetService } from "./ToronetService";
import mongoose, { Types } from "mongoose";
import { WalletService } from "./WalletService";
import { CurrencyType } from "../types/toronetService.types";
import { Wallet } from "../models/Wallet";
import { WhatsAppBusinessService } from "./WhatsAppBusinessService";
import { nanoid } from "nanoid";

type CreateUserType = {
  whatsappNumber: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  pin: string;
  dob: string;
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

  async getUser(phoneNumber: string, includePin = false) {
    phoneNumber = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    const user = await User.findOne({ whatsappNumber: phoneNumber }).select(
      `${includePin ? "+pin" : ""}`
    );
    return user;
  }

  async getUserToroWallet(phoneNumber: string) {
    const user = await this.getUser(phoneNumber);
    if (!user)
      throw new Error(`User with phone number - ${phoneNumber} not found`);

    const userId = user.userId;

    const wallet = await Wallet.findOne({ userId });

    if (!wallet)
      throw new Error(`Wallet for user - ${phoneNumber} was not found`);

    return wallet;
  }

  async createUser(data: CreateUserType) {
    const user = await User.findOne({ whatsappNumber: data.whatsappNumber });

    if (!user) {
      const userId = this.generateUserId();
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await User.create(
            [
              {
                whatsappNumber: data.whatsappNumber,
                firstName: data.firstName,
                lastName: data.lastName,
                country: data.countryCode,
                pin: data.pin,
                userId,
                dob: data.dob,
              },
            ],
            { session }
          );

          await this.walletService.addWallet(
            { userId, fullName: `${data.firstName} ${data.lastName}` },
            session
          );
        });
      } catch (error) {
        console.log("Error creating user", error);
        throw error;
      } finally {
        await session.endSession();
      }
    }
  }

  private generateUserId(): string {
    return nanoid();
  }

  // TODO: Email verification for pin
}
