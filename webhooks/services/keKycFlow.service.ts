import { redisClient } from "../../services/redis";
import { DojahService } from "../../services/DojahService";
import { UserService } from "../../services/UserService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { handleKYCCompletion } from "../controllers/referral.controller";

// ============================================================
// KENYA KYC FLOW SERVICE
// Handles National ID verification for Kenyan users
// Flow: ID_INPUT → VERIFICATION_COMPLETE
// ============================================================

export const keKycFlowScreen = async (decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) => {
  const { screen, data, action, flow_token } = decryptedBody;
  console.log("DEBUG: keKycFlowScreen called", { screen, action, flow_token, data });

  const userService = new UserService();
  const dojahService = new DojahService();
  const whatsappBusinessService = new WhatsAppBusinessService();

  if (action === "ping") {
    return { data: { status: "active" } };
  }

  if (data?.error) {
    console.warn("Received client error:", data);
    return { data: { status: "Error", acknowledged: true } };
  }

  const userPhone = await redisClient.get(flow_token);
  console.log("DEBUG: Redis get userPhone:", userPhone);

  if (!userPhone) {
    return {
      screen: "ID_INPUT",
      data: { error_message: "Session expired. Please restart the verification.", has_error: true },
    };
  }

  const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

  if (action === "INIT") {
    const user = await userService.getUser(phone);

    if (!user) {
      return {
        screen: "ID_INPUT",
        data: { error_message: "Please create an account first before verifying.", has_error: true },
      };
    }

    if (user.isVerified) {
      return {
        screen: "VERIFICATION_COMPLETE",
        data: { already_verified: true, verified: false, first_name: user.firstName || "" },
      };
    }

    return {
      screen: "ID_INPUT",
      data: { error_message: "", has_error: false },
    };
  }

  if (action === "data_exchange") {
    switch (screen) {
      case "ID_INPUT":
        console.log("DEBUG: Case ID_INPUT");
        try {
          const idNumber = data.id_number?.trim();
          const firstName = data.first_name?.trim();
          const lastName = data.last_name?.trim();
          const dob = data.dob;

          if (!idNumber || !firstName || !lastName || !dob) {
            return {
              screen: "ID_INPUT",
              data: { error_message: "Please fill in all required fields.", has_error: true },
            };
          }

          // Age validation — must be 18+
          const birthYear = Number(dob.split("-")[0]);
          if (new Date().getFullYear() - birthYear < 18) {
            return {
              screen: "ID_INPUT",
              data: { error_message: "You must be 18 and above to use Chainpaye.", has_error: true },
            };
          }

          const user = await userService.getUser(phone);
          if (!user) {
            return {
              screen: "ID_INPUT",
              data: { error_message: "User not found. Please create an account first.", has_error: true },
            };
          }

          console.log("DEBUG: Performing Kenyan ID verification");

          const kycResult = await dojahService.verifyKenyanID({
            id: idNumber,
            firstName,
            lastName,
            dob,
          });

          console.log("DEBUG: KE KYC Result", kycResult);

          if (!kycResult.success) {
            return {
              screen: "ID_INPUT",
              data: { error_message: kycResult.message || "ID verification failed. Please check your details.", has_error: true },
            };
          }

          // Mark user verified and save names + DOB
          await userService.updateUserKycInfo(phone, { firstName, lastName });
          await userService.updateUserProfile(phone, { dob });
          await userService.markUserVerified(phone);
          console.log("DEBUG: Kenyan user marked as verified:", firstName, lastName, dob);

          // Generate referral code
          try {
            await handleKYCCompletion(user.userId);
          } catch (err) {
            console.error("DEBUG: Error generating referral code:", err);
          }

          // Send success WhatsApp message
          try {
            await whatsappBusinessService.sendNormalMessage(
              `🎉 *KYC Verification Successful!*\n\nCongratulations ${firstName}! Your identity has been verified.\n\nYou now have full access to all Chainpaye features including:\n✅ Bank withdrawals\n✅ Higher transaction limits\n✅ Full account access\n✅ Referral rewards program\n\nType *referral* to get your referral code and start earning!`,
              phone,
            );
          } catch (err) {
            console.error("DEBUG: Error sending KYC success message:", err);
          }

          await redisClient.set(
            `${flow_token}_kycComplete`,
            JSON.stringify({ fullName: `${firstName} ${lastName}`, verified: true }),
            "EX",
            3600,
          );

          return {
            screen: "VERIFICATION_COMPLETE",
            data: { first_name: firstName, verified: true, already_verified: false },
          };
        } catch (error) {
          console.error("Error in ID_INPUT screen:", error);
          return {
            screen: "ID_INPUT",
            data: { error_message: "Verification failed. Please try again.", has_error: true },
          };
        }

      default:
        console.warn("Unhandled screen:", screen);
        return;
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error("Unhandled endpoint request.");
};
