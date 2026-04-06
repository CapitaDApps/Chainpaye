import { Request, Response } from "express";
import { flowMiddleware } from "../middlewares";
import { getCryptoTopUpScreen } from "../services/cryptoTopUp.service";

export const cryptoTopupFlow = flowMiddleware(
  async (req: Request, res: Response) => {
    const { decryptedBody } = req.decryptedData!;

    // TODO: Uncomment this block and add your flow token validation logic.
    // If the flow token becomes invalid, return HTTP code 427 to disable the flow and show the message in `error_msg` to the user
    // Refer to the docs for details https://developers.facebook.com/docs/whatsapp/flows/reference/error-codes#endpoint_error_codes

    /*
    if (!isValidFlowToken(decryptedBody.flow_token)) {
      const error_response = {
        error_msg: `The message is no longer available`,
      };
      return res
        .status(427)
        .send(
          encryptResponse(error_response, aesKeyBuffer, initialVectorBuffer)
        );
    }
    */

    const screenResponse = await getCryptoTopUpScreen(decryptedBody);
    return screenResponse;
  }
);
