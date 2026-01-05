export type TriggerPhrase = string | RegExp;

interface CommandConfig {
  triggers: TriggerPhrase[]; // Array of strings and regex patterns
  description: string;
}

const COMMANDS: Record<string, CommandConfig> = {
  withdraw: {
    triggers: [
      "/banktransfer",
      "bank transfer",
      "withdraw",
      "send to bank",
      "transfer to bank",
      "cash out",
    ],
    description: "Transfer from your chainpaye wallet to bank accounts",
  },
  transfer: {
    triggers: [
      "/sendmoney",
      "send money",
      "transfer",
      "send to user",
      "pay user",
    ],
    description: "Transfer money to another chainpaye user",
  },
  myAccount: {
    triggers: [
      "/myaccount",
      "my account",
      "check my account",
      "account details",
      "my details",
      "profile",
      "my profile",
      "balance",
      "check balance",
      "my balance",
      "show balance",
      "what is my balance",
      "how much do i have",
      "account balance",
      "wallet balance",
      "get balance",
      "view balance",
    ],
    description: "View your account details and balance",
  },
  convert: {
    triggers: [
      "/convert",
      "convert",
      "currency",
      "exchange",
      "convert currency",
    ],
    description: "Convert between fiat currencies",
  },

  deposit: {
    triggers: [
      "/deposit",
      "deposit",
      "top up",
      "add money",
      "fund wallet",
      "add funds",
    ],
    description: "Top up your chainpaye wallet",
  },
  transactionHistory: {
    triggers: [
      "/transactionhistory",
      "history",
      "transactions",
      "transaction history",
      "my transactions",
      "past transactions",
      "view history",
    ],
    description: "View your past transactions",
  },
  offramp: {
    triggers: [
      "/offramp",
      "off ramp",
      "offramp",
      "sell crypto",
      "crypto to cash",
      "crypto to fiat",
      "convert crypto",
      "cash out crypto",
      "sell crypto for cash",
      "convert to fiat",
      "withdraw crypto",
      "crypto withdrawal",
    ],
    description:
      "Offramp crypto to fiat and receive it in your chainpaye wallet",
  },
};

export { COMMANDS };
