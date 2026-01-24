import { redisClient } from "../../services/redis";
import { User } from "../../models/User";

export const getPinScreen = async (decryptedBody: {
  screen: string;
  data: any;
  version: string;
  action: string;
  flow_token: string;
}) => {
  const { screen, data, version, action, flow_token } = decryptedBody;

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

  // Get user phone number from Redis using flow_token
  const userPhone = await redisClient.get(flow_token);

  // handle initial request when opening the flow
  if (action === "INIT") {
    return {
      screen: "SETUP_PIN",
      data: {},
    };
  }

  if (action === "data_exchange") {
    // handle the request based on the current screen
    switch (screen) {
      case "SETUP_PIN":
        if (!userPhone) {
          return {
            screen: "SETUP_PIN",
            data: {
              error_message: "Session expired. Restart flow a new message",
            },
          };
        }

        const { pin, confirm_pin } = data;
        console.log({ data });

        // Validate PIN input
        if (!pin || pin.length < 4 || pin.length > 6) {
          return {
            screen: "SETUP_PIN",
            data: {
              error_message: "PIN must be 4-6 digits long",
            },
          };
        }

        if (isNaN(Number(pin)) || isNaN(Number(confirm_pin))) {
          return {
            screen: "SETUP_PIN",
            data: {
              error_message: "Invalid number pin passed. Please numbers only",
            },
          };
        }

        if (+pin !== +confirm_pin) {
          return {
            screen: "SETUP_PIN",
            data: {
              error_message: "PINs do not match. Please try again.",
            },
          };
        }

        const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

        // Update user's PIN in the database
        try {
          await User.updateOne({ whatsappNumber: phone }, { pin });

          // return {
          //   screen: "SUCCESS",
          //   data: {
          //     message: "Your PIN has been successfully set up!",
          //   },
          // };
          return {
            screen: "SUCCESS",
            data: {
              extension_message_response: {
                params: {
                  flow_token: flow_token,
                  optional_param1: "Your PIN has been successfully set up!",
                },
              },
            },
          };
        } catch (error) {
          console.error("Error setting PIN:", error);
          return {
            screen: "SETUP_PIN",
            data: {
              error_message: "Failed to set PIN. Please try again.",
            },
          };
        }

      default:
        break;
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
  );
};
