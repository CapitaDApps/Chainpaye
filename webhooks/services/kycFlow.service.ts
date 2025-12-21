import { User } from "../../models/User";
import { Wallet } from "../../models/Wallet";
import { redisClient } from "../../services/redis";
import { ToronetService } from "../../services/ToronetService";
import { UserService } from "../../services/UserService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { formatDate } from "../utils/formatDate";

export async function getKycFlowScreen(decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) {
  const { screen, data, version, action, flow_token } = decryptedBody;
  const userService = new UserService();
  const whatsappBusinessService = new WhatsAppBusinessService();
  const toronetService = new ToronetService();
  // handle health check request
  if (action === "ping") {
    return {
      data: {
        status: "active",
      },
    };
  }

  // handle error notification
  if (data?.error) {
    console.warn("Received client error:", data);
    return {
      data: {
        status: "Error",
        acknowledged: true,
      },
    };
  }

  // handle initial request when opening the flow
  if (action === "INIT") {
    return {
      screen: "KYC_INPUT",
      data: {},
    };
  }

  if (action === "data_exchange") {
    switch (screen) {
      case "KYC_INPUT":
        const userPhone = await redisClient.get(flow_token);

        if (!userPhone) {
          return {
            screen: "KYC_INPUT",
            data: {
              error_message: "Session expired. Restart flow a new message",
            },
          };
        }

        const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;
        const user = await User.findOne({ whatsappNumber: phone });
        if (!user)
          throw new Error(`user with phone number - [${phone}] not found`);
        const wallet = await Wallet.findOne({ userId: user.userId });

        if (!wallet)
          throw new Error(
            `wallet for user with phone number - [${phone}] not found`
          );

        new Promise(async () => {
          try {
            console.log(user.fullName);
            const firstName = user.fullName.split(" ")[0]?.trim()!;
            const lastName = user.fullName.split(" ")[1]?.trim()!;
            const result = await toronetService.performKYC({
              firstName,
              lastName,
              bvn: data.bvn,
              dob: formatDate(user.dob),
              phoneNumber: phone,
              address: wallet.publicKey,
            });
            await whatsappBusinessService.sendNormalMessage(
              result.message,
              phone
            );
          } catch (error) {
            console.log("Error in KYC process", error);
          }
        });
        return {
          screen: "KYC_PROCESSING",
          data: {},
        };
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
  );
}
