import { Request, Response } from "express";
import { flowMiddleware } from "../middlewares";
import { getResetPinScreen } from "../services/resetPinFlow.service";

export const resetPinFlow = flowMiddleware(
  async (req: Request, res: Response) => {
    const { decryptedBody } = req.decryptedData!;

    // Flow token validation
    // If the flow token becomes invalid, return HTTP code 427 to disable the flow
    /*
    if (!isValidFlowToken(decryptedBody.flow_token)) {
      const error_response = {
        error_msg: `The message is no longer available`,
      }
      return res
        .status(427)
        .send(
          encryptResponse(error_response, aesKeyBuffer, initialVectorBuffer)
        );
    }
    */

    const screenResponse = await getResetPinScreen(decryptedBody);
    return screenResponse;
  },
);