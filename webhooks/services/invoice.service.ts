export const getInvoiceScreen = async (decryptedBody: {
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

  // handle initial request when opening the flow
  if (action === "INIT") {
    return {
      screen: "TRANSFER",
      data: {
        currency: [
          { id: "1", title: "USD" },
          { id: "2", title: "NGN" },
        ],
      },
    };
  }

  if (action === "data_exchange") {
    // handle the request based on the current screen
    console.log({ data });
    switch (screen) {
      case "INVOICE":
        // TODO: process flow input data
        return {
          screen: "PIN",
          data: {},
        };
      case "PIN":
        console.log({ data });
        return {
          screen: "COMPLETE",
          data: {
            paymentUrl: "",
          },
        };
      default:
        break;
    }
  }

  console.error("Unhandled request body:", decryptedBody);
  throw new Error(
    "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
  );
};
