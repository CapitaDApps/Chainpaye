import { User } from "../../models/User";
import { Wallet } from "../../models/Wallet";
import { redisClient } from "../../services/redis";
import { ToronetService } from "../../services/ToronetService";
import { UserService } from "../../services/UserService";
import { WhatsAppBusinessService } from "../../services/WhatsAppBusinessService";

interface AllowedMethod {
  id: string;
  title: string;
}

const currencies = [
  { cur: "USD", card: true, transfer: true },
  { cur: "EUR", card: true, transfer: false },
  { cur: "GBP", card: true, transfer: false },
  { cur: "EGP", card: true, transfer: false },
  { cur: "KSH", card: true, transfer: false },
  { cur: "ZAR", card: true, transfer: false },
];

const allowedMethodCard: AllowedMethod = { id: "card", title: "Card Payment" };
const allowedMethodTransfer: AllowedMethod = {
  id: "transfer",
  title: "Bank Transfer",
};

export async function getGenerateLinkScreen(decryptedBody: {
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
      screen: "CREATE_LINK_DETAILS",
      data: {},
    };
  }

  if (action === "data_exchange") {
    const userPhone = await redisClient.get(flow_token);

    if (!userPhone) {
      return {
        screen: "CREATE_LINK_DETAILS",
        error_message: "Session expired. Restart flow a new message",
      };
    }
    const phone = userPhone.startsWith("+") ? userPhone : `+${userPhone}`;

    switch (screen) {
      case "CREATE_LINK_DETAILS": {
        const { currency, title, description, amount } = data;
        const selectedCurrency = currencies.filter(
          (curr) => curr.cur == currency
        )[0];
        console.log({ selectedCurrency });

        const methods = [];
        if (selectedCurrency?.card) {
          methods.push(allowedMethodCard);
        }
        if (selectedCurrency?.transfer) {
          methods.push(allowedMethodTransfer);
        }
        return {
          screen: "SELECT_METHOD",
          data: {
            title,
            description,
            currency,
            amount,
            allowed_methods: methods,
          },
        };
      }

      case "PIN": {
        const { currency, amount, pin, title, description, methods } = data;
        console.log({ pinData: data });

        const user = await User.findOne({ whatsappNumber: phone }).select(
          "+pin"
        );
        if (!user)
          throw new Error(`User with phone number - [${phone}] not found`);

        const wallet = await Wallet.findOne({ userId: user.userId }).select(
          "+password"
        );

        if (!wallet)
          throw new Error(`Wallet for user with phone - [${phone}] not found`);

        const isValidPin = await user.comparePin(pin);

        if (!isValidPin) {
          return {
            screen: "PIN",
            data: {
              error_message: "Incorrect pin",
            },
          };
        }

        if (isNaN(Number(amount))) {
          return {
            screen: "PIN",
            data: {
              error_message: "Invalid amount specified",
            },
          };
        }

        return {
          screen: "PROCESSING",
          data: {},
        };
      }
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
  );
}
