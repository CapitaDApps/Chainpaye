import { whatsappBusinessService } from "../../services";

export async function handleAddBeneficiary(from: string): Promise<void> {
  try {
    await whatsappBusinessService.sendAddBeneficiaryFlowById(from);
  } catch (error) {
    console.error("Error sending add beneficiary flow", error);
  }
}
