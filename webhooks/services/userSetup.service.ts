import { redisClient } from "../../services/redis";
import { UserService } from "../../services/UserService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";

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
      screen: "PERSONAL_INFO",
      data: {},
    };
  }

  if (action === "data_exchange") {
    // handle the request based on the current screen
    switch (screen) {
      case "SECURITY_INFO":
        try {
          console.log({ data });

          //       data: {
          //   first_name: 'Knowledge',
          //   last_name: 'Okhakumhe',
          //   dob: '2025-12-09',
          //   country: 'NG',
          //   pin: '12314',
          //   confirm_pin: '124124'
          // }

          //   Get user phone number from Redis using flow_token
          const userPhone = await redisClient.get(flow_token);
          // const userPhone = "+2348110236998";
          if (!userPhone) {
            return {
              screen: "SECURITY_INFO",
              data: {
                error_message: "Session expired",
              },
            };
          }
          const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

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
            countryCode: data.country,
            fullName: `${data.first_name} ${data.last_name}`,
            whatsappNumber: phone,
            pin,
            dob: data.dob,
          });

          await redisClient.set(
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
