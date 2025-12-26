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
  const userPhone = await redisClient.get(flow_token);
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
            return {
              screen: "SECURITY_INFO",
              data: {
                error_message: "You must be 18 and above to use chainpaye",
              },
            };
          }

          await userService.createUser({
            firstName: data.first_name.trim(),
            lastName: data.last_name.trim(),
            whatsappNumber: phone,
            pin,
            dob: data.dob,
          });

          if (data.bvn) {
            toronetService
              .performKYC({
                firstName: data.first_name.trim(),
                lastName: data.last_name.trim(),
                bvn: data.bvn,
                dob: formatDate(data.dob),
                address: "",
                phoneNumber: phone,
              })
              .then((result) => {
                whatsappBusinessService.sendNormalMessage(
                  result.message,
                  phone
                );
              })
              .catch((err) =>
                console.log(`Error performing kyc for user - [${phone}]`)
              );
          }

          redisClient.set(
            `${flow_token}_accountCreation`,
            JSON.stringify({
              fullName: `${data.first_name} ${data.last_name}`,
            }),
            "EX",
            3600
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
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
  );
};
