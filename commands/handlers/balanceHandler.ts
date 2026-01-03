import {
  toronetService,
  userService,
  whatsappBusinessService,
} from "../../services";

export async function handleBalance(from: string) {
  try {
    const userWallet = await userService.getUserToroWallet(from);
    const user = (await userService.getUser(from))!;
    // Only update virtual wallet for Nigerian users
    if (user.country === "NG") {
      await toronetService.updateVirtualWallet(userWallet.publicKey); // update wallet for indirect transfers
    }
    const [NGNBal, USDBal] = await Promise.all([
      toronetService.getBalanceNGN(userWallet.publicKey),
      toronetService.getBalanceUSD(userWallet.publicKey),
    ]);
    await whatsappBusinessService.sendNormalMessage(
      `*Your balance:* 
*USD:* ${USDBal.balance}
*NGN:* ${NGNBal.balance}
                  `,
      from
    );
  } catch (error) {
    console.log("Error fetching balance", error);
  }
}
