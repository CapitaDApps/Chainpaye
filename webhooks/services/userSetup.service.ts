import { Wallet } from "../../models/Wallet";
import { redisClient } from "../../services/redis";
import { ToronetService } from "../../services/ToronetService";
import { UserService } from "../../services/UserService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";
import { getCountryCodeFromPhoneNumber } from "../../utils/countryCodeMapping";
import { formatDate } from "../utils/formatDate";

const countries = [
  { id: "NG", title: "Nigeria" },
  { id: "US", title: "United States" },
  { id: "GB", title: "United Kingdom" },
  { id: "CA", title: "Canada" },
  { id: "GH", title: "Ghana" },
  { id: "KE", title: "Kenya" },
  { id: "ZA", title: "South Africa" },
];

export const userSetupScreen = async (decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) => {
  const { screen, data, version, action, flow_token } = decryptedBody;
  console.log("DEBUG: userSetupScreen called", {
    screen,
    action,
    flow_token,
    data,
  });
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

  //   Get user phone number from Redis using flow_token
  // const userPhone = "+2348110236998";
  const userPhone = await redisClient.get(flow_token);
  console.log("DEBUG: Redis get userPhone:", userPhone);
  const phone = userPhone?.startsWith("+") ? userPhone : `+${userPhone}`;
  // handle initial request when opening the flow
  if (action === "INIT") {
    return {
      screen: "PERSONAL_INFO",
      data: {
        is_ng: getCountryCodeFromPhoneNumber(phone) === "NG",
      },
    };
  }

  if (action === "data_exchange") {
    // handle the request based on the current screen
    switch (screen) {
      case "SECURITY_INFO":
        console.log("DEBUG: Case SECURITY_INFO");
        try {
          if (!userPhone) {
            return {
              screen: "SECURITY_INFO",
              data: {
                error_message: "Session expired. Restart flow a new message",
              },
            };
          }
          // validate pin
          const pin = data.pin.trim();
          const confirm_pin = data.confirm_pin.trim();

          // Validate PIN input
          if (!pin || pin.length < 4 || pin.length > 6) {
            console.log("DEBUG: PIN validation failed (length)");
            return {
              screen: "SECURITY_INFO",
              data: {
                error_message: "PIN must be 4-6 digits long",
              },
            };
          }

          if (isNaN(Number(pin)) || isNaN(Number(confirm_pin))) {
            return {
              screen: "SECURITY_INFO",
              data: {
                error_message: "Invalid number pin passed. Please numbers only",
              },
            };
          }

          if (pin !== confirm_pin) {
            console.log("DEBUG: PIN mismatch");
            return {
              screen: "SECURITY_INFO",
              data: {
                error_message: "PINs do not match. Please try again.",
              },
            };
          }

          const currentYear = new Date().getFullYear();
          const yr = Number(data.dob.split("-")[0]);
          if (currentYear - yr < 18) {
            console.log("DEBUG: Age validation failed", { currentYear, yr });
            return {
              screen: "SECURITY_INFO",
              data: {
                error_message: "You must be 18 and above to use chainpaye",
              },
            };
          }

          const userCountry = getCountryCodeFromPhoneNumber(phone);
          console.log("DEBUG: userCountry", userCountry);

          if (userCountry == "NG") {
            if (!data.bvn) {
              return {
                screen: "SECURITY_INFO",
                data: {
                  error_message: "Please enter your bvn",
                },
              };
            }
          }

          console.log("DEBUG: checking userService.getUser");
          const user = await userService.getUser(phone);
          console.log("DEBUG: user found?", !!user);

          if (!user) {
            await userService.createUser({
              whatsappNumber: phone,
              pin: data.pin,
            });
          }

          const { wallet: userToroWallet } =
            await userService.getUserToroWallet(phone);

          if (data.bvn) {
            console.log("DEBUG: Performing KYC with BVN");
            const kycResult = await toronetService.performKYC({
              firstName: data.first_name.trim(),
              lastName: data.last_name.trim(),
              bvn: data.bvn,
              dob: formatDate(data.dob),
              address: userToroWallet.publicKey,
              phoneNumber: phone,
            });

            console.log("DEBUG: KYC Result", kycResult);
            if (!kycResult.success) {
              console.warn("DEBUG: KYC Failed");
              return {
                screen: "SECURITY_INFO",
                data: {
                  error_message: kycResult.message,
                },
              };
            }

            if (kycResult.success) {
              // update user
              userService
                .updateUserAferBvnVerified(phone, {
                  firstName: data.first_name,
                  lastName: data.last_name,
                  pin: data.pin,
                  dob: formatDate(data.dob),
                })
                .then(async (user) => {
                  if (!user) {
                    throw new Error(
                      `user with phone number - [${phone}] does not exist`,
                    );
                  }
                  // create virtual wallet
                  const userId = user.userId;
                  const wallet = await Wallet.findOne({ userId });
                  if (!wallet)
                    throw new Error(
                      `User with phone number - [${phone}] does not have a wallet`,
                    );
                  await toronetService.createVirtualWalletNGN({
                    address: wallet.publicKey,
                    fullName: `${data.first_name} ${data.last_name}`,
                  });
                });
            }
          }

          redisClient.set(
            `${flow_token}_accountCreation`,
            JSON.stringify({
              fullName: `${data.first_name} ${data.last_name}`,
            }),
            "EX",
            3600,
          );

          return {
            screen: "SUCCESSFUL",
            data: {},
          };
        } catch (error) {
          console.log("Error sending user creation request", error);
          throw error;
        }

      default:
        return;
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above.",
  );
};
