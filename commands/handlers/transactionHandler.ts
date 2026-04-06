import { TransactionType } from "../../models/Transaction";
import { walletService, whatsappBusinessService } from "../../services";

export async function handleTransactionHistory(from: string) {
  try {
    const transactions = await walletService.getUserRecentTransactions(from);

    if (transactions.length === 0) {
      await whatsappBusinessService.sendNormalMessage(
        "You don't have any transactions yet.",
        from
      );
    } else {
      let statusMessage = "*Your Recent Transactions:*\n\n";

      transactions.forEach((tx, index) => {
        const txType =
          tx.type === TransactionType.DEPOSIT
            ? "Deposit"
            : tx.type === TransactionType.TRANSFER
            ? "Transfer"
            : tx.type === TransactionType.WITHDRAWAL
            ? "Withdrawal"
            : tx.type === TransactionType.CONVERSION
            ? "Conversion"
            : tx.type;

        const txStatus =
          tx.status === "completed"
            ? "✅ Completed"
            : tx.status === "pending"
            ? "⏳ Pending"
            : tx.status === "failed"
            ? "❌ Failed"
            : tx.status;

        // Truncate transaction ID for display
        const txIdDisplay = tx.toronetTransactionId
          ? `${tx.toronetTransactionId.substring(0, 8)}...`
          : "N/A";

        // Format date
        const date = new Date(tx.createdAt).toLocaleDateString();
        const time = new Date(tx.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        // Add entry type information (DEBIT/CREDIT)
        const entryType = tx.entryType ? `(${tx.entryType})` : "";

        statusMessage += `${index + 1}. *${txType}* ${entryType} - ${
          tx.amount
        } ${tx.currency}\n`;
        statusMessage += `   Status: ${txStatus}\n`;
        statusMessage += `   Date: ${date} at ${time}\n`;
        statusMessage += `   ID: ${txIdDisplay}\n\n`;
      });

      await whatsappBusinessService.sendNormalMessage(statusMessage, from);
    }
  } catch (error) {
    console.error("Error fetching transactions:", error);
    await whatsappBusinessService.sendNormalMessage(
      "Sorry, I couldn't retrieve your transaction history. Please try again later.",
      from
    );
  }
}
