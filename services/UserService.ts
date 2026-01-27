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
  fullName: string;
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
    // console.log("User", user);
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

                country: extractedCountry,
                pin,
                userId,
                fullName: data.fullName,
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
   * Update user profile information (name, DOB) without PIN change
   * Used during registration to save profile after user creation
   */
  async updateUserProfile(
    phoneNumber: string, // parameter name was mismatched in previous attempt
    data: { fullName?: string; dob?: string },
  ) {
    phoneNumber = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    const updates: any = {};
    if (data.fullName) updates.fullName = data.fullName;
    if (data.dob) updates.dob = data.dob;

    const user = await User.findOneAndUpdate(
      { whatsappNumber: phoneNumber },
      updates,
      { new: true },
    );
    return user;
  }

  /**
   * Update user KYC info (first name, last name) after successful BVN verification
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
