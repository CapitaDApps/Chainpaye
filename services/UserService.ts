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
  fullName: string; // Full name for wallet creation
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

  async getUserById(userId: string, includePin = false) {
    const user = await User.findOne({ userId }).select(
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
                fullName: data.fullName, // Store full name for wallet creation
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

  /**
   * Update user profile information during onboarding
   * Used to save fullName and DOB after user creation
   */
  async updateUserProfile(
    phoneNumber: string,
    data: { fullName: string; dob: string },
  ) {
    phoneNumber = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    const user = await User.findOneAndUpdate(
      { whatsappNumber: phoneNumber },
      {
        fullName: data.fullName,
        dob: data.dob,
      },
      { new: true },
    );
    return user;
  }

  /**
   * Update user with verified KYC information
   * Called after successful BVN verification to save verified first/last names
   */
  async updateUserKycInfo(
    phoneNumber: string,
    data: { firstName: string; lastName: string },
  ) {
    phoneNumber = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    const user = await User.findOneAndUpdate(
      { whatsappNumber: phoneNumber },
      {
        firstName: data.firstName,
        lastName: data.lastName,
        isVerified: true, // Mark as verified when KYC info is saved
      },
      { new: true },
    );
    return user;
  }

  /**
   * Mark user as verified after successful KYC (BVN verification)
   */
  async markUserVerified(phoneNumber: string) {
    phoneNumber = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    const user = await User.findOneAndUpdate(
      { whatsappNumber: phoneNumber },
      { isVerified: true },
      { new: true },
    );
    return user;
  }

  private generateUserId(): string {
    return nanoid();
  }

  // TODO: Email verification for pin
}
