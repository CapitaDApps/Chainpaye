/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

export const getNextScreen = async (decryptedBody: {
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
    switch (screen) {
      case "TRANSFER":
        // TODO: process flow input data
        console.info({ transFerData: data });
        return {
          screen: "TRANSFER",
          data,
        };
      // send success response to complete and close the flow
      // return {
      //   screen: "SUCCESS",
      //   data: {
      //     extension_message_response: {
      //       params: {
      //         flow_token,
      //       },
      //     },
      //   },
      // };
      case "SETUP_PIN":
        console.log({ data });
        return {
          screen: "SETUP_PIN",
          data,
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
