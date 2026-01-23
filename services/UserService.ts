import argon2 from "argon2";
import mongoose from "mongoose";
import { nanoid } from "nanoid";
import { walletService } from ".";
import { User } from "../models/User";
import { Wallet } from "../models/Wallet";
import { getCountryCodeFromPhoneNumber } from "../utils/countryCodeMapping";

type CreateUserType = {
  whatsappNumber: string;
  pin: string;
};

type UpdateUserAfterBvnVerified = {
  pin: string;
  firstName: string;
  lastName: string;
  dob: string;
};

export class UserService {
  async getUser(phoneNumber: string, includePin = false) {
    phoneNumber = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    const user = await User.findOne({ whatsappNumber: phoneNumber }).select(
      `${includePin ? "+pin" : ""}`,
    );
    return user;
  }

  async getUserToroWallet(
    phoneNumber: string,
    includePassword = false,
    includePin = false,
  ) {
    const user = await this.getUser(phoneNumber, includePin);
    if (!user)
      throw new Error(`User with phone number - ${phoneNumber} not found`);

    const userId = user.userId;

    const wallet = await Wallet.findOne({ userId }).select(
      `${includePassword ? "+password" : ""}`,
    );

    if (!wallet)
      throw new Error(`Wallet for user - ${phoneNumber} was not found`);

    return { wallet, user };
  }

  async createUser(data: CreateUserType) {
    const user = await User.findOne({ whatsappNumber: data.whatsappNumber });

    if (!user) {
      const userId = this.generateUserId();

      // Extract country from phone number if not provided
      const extractedCountry = getCountryCodeFromPhoneNumber(
        data.whatsappNumber,
      );

      if (!extractedCountry) {
        throw new Error(
          `Could not determine country for phone number: ${data.whatsappNumber}`,
        );
      }

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const pin = await argon2.hash(data.pin);
          await User.create(
            [
              {
                whatsappNumber: data.whatsappNumber,

                country: extractedCountry,
                pin,
                userId,
              },
            ],
            { session },
          );

          await walletService.addWallet(
            {
              userId,
              country: extractedCountry,
            },
            session,
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

  async updateUserAferBvnVerified(
    phoneNumber: string,
    data: UpdateUserAfterBvnVerified,
  ) {
    const pin = await argon2.hash(data.pin);
    const u = await User.findOneAndUpdate(
      { whatsappNumber: phoneNumber },
      { ...data, pin },
    );
    return u;
  }

  private generateUserId(): string {
    return nanoid();
  }

  // TODO: Email verification for pin
}
