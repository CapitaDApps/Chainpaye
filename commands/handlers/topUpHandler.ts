import { toronetService, userService, whatsappBusinessService } from "../../services";

export async function handleTopUp(from: string) {
  try {
    const phone = from.startsWith("+") ? from : `+${from}`;
    const { user, wallet } = await userService.getUserToroWallet(phone);

    if (!user) {
      await whatsappBusinessService.sendTemplateIntroMessage(from);
      return;
    }

    // For Nigerian users, show bank deposit information
    if (user.country === "NG") {
      

      let accountnumber: string | null = null;

      const [vw] = await Promise.all([
        toronetService.getVirtualWalletByAddress(wallet.publicKey),
        toronetService.updateVirtualWallet(wallet.publicKey),
      ]);

      if (vw.result) {
      let  message = `

*FUND YOUR ACCOUNT*

To top up your NGN balance, transfer to:

Bank: FCMB
Account Name: ${vw.accountname}
(NGN Deposits Only)

👇Copy the account number below👇`;
        accountnumber = vw.accountnumber;
              await whatsappBusinessService.sendNormalMessage(message, from);

      }

      
      if (accountnumber) {
        let message = `⚡ Confirm Deposit 
        1. Transfer NGN 🇳🇬 to the account above.
        2. Tap "Deposit Completed" below.
        3. Enter the amount to confirm.`
        await whatsappBusinessService.sendNormalMessage(accountnumber, from);
        await whatsappBusinessService.sendNormalMessage(message, from);
      }

      // Also send the top-up flow for crypto deposits
      await whatsappBusinessService.sendTopUpFlowById(from);
    } else {
      // For non-Nigerian users, just send the top-up flow
      await whatsappBusinessService.sendTopUpFlowById(from);
    }
  } catch (error) {
    console.log("Error handling deposit/top-up", error);
    // Fallback to sending the top-up flow
    try {
      await whatsappBusinessService.sendTopUpFlowById(from);
    } catch (fallbackError) {
      console.log("Error sending fallback top-up flow", fallbackError);
    }
  }
}
