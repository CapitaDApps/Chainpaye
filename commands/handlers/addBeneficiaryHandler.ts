import { User } from "../../models/User";
import { whatsappBusinessService } from "../../services";

export async function handleAddBeneficiary(from: string): Promise<void> {
  try {
    await whatsappBusinessService.sendAddBeneficiaryFlowById(from);
  } catch (error) {
    console.error("Error sending add beneficiary flow", error);
  }
}

export async function handleViewBeneficiaries(from: string): Promise<void> {
  try {
    const phone = from.startsWith("+") ? from : `+${from}`;
    const user = await User.findOne({ whatsappNumber: phone });

    if (!user) {
      await whatsappBusinessService.sendNormalMessage(
        "❌ Account not found. Type *menu* to get started.",
        from,
      );
      return;
    }

    const accounts = user.payoutAccounts ?? [];

    let message: string;

    if (accounts.length === 0) {
      message = "🏦 *Your Beneficiaries*\n\nYou have no saved beneficiaries yet.";
    } else {
      const lines = accounts.map((a, i) => {
        const country = a.country.charAt(0).toUpperCase() + a.country.slice(1);
        return `${i + 1}. *${a.bankName}*\n   ${a.accountName}\n   ${a.accountNumber}\n   ${country} · ${a.destination}`;
      });
      message = `🏦 *Your Beneficiaries*\n\n${lines.join("\n\n")}`;
    }

    await whatsappBusinessService.sendNormalMessage(message, from);

    // Send the Add Beneficiary flow as the CTA
    await whatsappBusinessService.sendAddBeneficiaryFlowById(from);
  } catch (error) {
    console.error("Error showing beneficiaries", error);
  }
}
