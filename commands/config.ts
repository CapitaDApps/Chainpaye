export type TriggerPhrase = string | RegExp;

interface CommandConfig {
  triggers: TriggerPhrase[]; // Array of strings and regex patterns
  description: string;
  priority?: number; // Higher priority commands are checked first (default: 0)
}

const COMMANDS: Record<string, CommandConfig> = {
  // ============================================================
  // MENU / GREETINGS / NAVIGATION
  // Triggers that should show the main menu or welcome message
  // ============================================================
  menu: {
    triggers: [
      // Slash commands
      "/menu",
      "/start",
      "/home",
      "/main",

      // Greetings - formal
      "hello",
      "hi",
      "hey",
      "greetings",
      "good morning",
      "good afternoon",
      "good evening",
      "good day",

      // Greetings - casual
      "yo",
      "sup",
      "whats up",
      "what's up",
      "wassup",
      "howdy",
      "hiya",
      "heya",
      "hola",

      // Navigation
      "menu",
      "main menu",
      "home",
      "start",
      "go back",
      "back",
      "return",
      "go home",
      "show menu",
      "open menu",

      // Questions about capabilities
      "what can you do",
      "what do you do",
      "how does this work",
      "how do i use this",
      "options",
      "show options",
      "available options",
      "what are my options",
      "commands",
      "show commands",
      "list commands",
    ],
    description: "Show the main menu and available options",
    priority: 10, // High priority to catch greetings first
  },

  // ============================================================
  // ACCOUNT / BALANCE QUERIES
  // User wants to check their account info or balance
  // ============================================================
  myAccount: {
    triggers: [
      // Slash commands
      "/myaccount",
      "/account",
      "/balance",
      "/profile",
      "/bal",

      // Account info
      "my account",
      "check my account",
      "account details",
      "my details",
      "account info",
      "my info",
      "my information",
      "acct",
      "acct info",
      "acct details",

      // Profile
      "profile",
      "my profile",
      "view profile",
      "show profile",
      "user profile",

      // Balance queries - formal
      "balance",
      "check balance",
      "my balance",
      "show balance",
      "view balance",
      "get balance",
      "account balance",
      "wallet balance",
      "current balance",

      // Balance queries - natural language
      "what is my balance",
      "what's my balance",
      "whats my balance",
      "how much do i have",
      "how much is in my wallet",
      "how much is in my account",
      "how much money do i have",
      "what do i have",
      "show me my balance",
      "tell me my balance",
      "check my balance",

      // Abbreviations & typos
      "bal",
      "my bal",
      "check bal",
      "blance",
      "balence",
      "balanc",
    ],
    description: "View your account details and balance",
    priority: 5,
  },

  // ============================================================
  // WALLET / CRYPTO WALLETS
  // User wants to view their crypto wallet addresses and balances
  // ============================================================
  wallets: {
    triggers: [
      // Slash commands
      "/wallet",
      "/wallets",
      "/addresses",
      "/cryptowallet",

      // Wallet queries
      "wallet",
      "wallets",
      "my wallet",
      "my wallets",
      "show wallet",
      "show wallets",
      "view wallet",
      "view wallets",
      "wallet address",
      "wallet addresses",
      "my wallet address",
      "my wallet addresses",

      // Crypto wallet
      "crypto wallet",
      "crypto wallets",
      "my crypto wallet",
      "my crypto wallets",
      "show crypto wallet",
      "view crypto wallet",

      // Deposit address
      "deposit address",
      "deposit addresses",
      "my deposit address",
      "where do i deposit",
      "where can i deposit",
      "how do i deposit crypto",

      // Natural language
      "show me my wallet",
      "show me my wallets",
      "what is my wallet address",
      "what are my wallet addresses",
      "where do i send crypto",
      "where can i send crypto",
    ],
    description: "View your crypto wallet addresses and balances",
    priority: 6,
  },

  // ============================================================
  // TRANSACTION HISTORY
  // User wants to view past transactions
  // ============================================================
  transactionHistory: {
    triggers: [
      // Slash commands
      "/transactionhistory",
      "/transactions",
      "/history",
      "/txn",
      "/txns",

      // Transaction queries
      "transactions",
      "transaction history",
      "my transactions",
      "past transactions",
      "recent transactions",
      "view transactions",
      "show transactions",
      "all transactions",
      "transaction list",

      // History queries
      "history",
      "view history",
      "show history",
      "my history",
      "payment history",
      "transaction record",
      "transaction records",

      // Recent activity
      "recent activity",
      "activity",
      "my activity",
      "recent payments",
      "past payments",
      "my payments",

      // Abbreviations & variations
      "txn",
      "txns",
      "tx history",
      "txn history",
      "trx",
      "trxs",
      "transactionz",

      // Natural language
      "what have i sent",
      "what did i pay",
      "show me my transactions",
      "list my transactions",
      "previous transactions",
    ],
    description: "View your past transactions",
    priority: 4,
  },

  // ============================================================
  // WITHDRAW / BANK TRANSFER
  // Transfer from wallet to bank account
  // ============================================================
  withdraw: {
    triggers: [
      // Slash commands
      "/banktransfer",
      "/withdraw",
      "/cashout",

      // Bank transfer
      "bank transfer",
      "transfer to bank",
      "send to bank",
      "send to my bank",
      "transfer to my bank",
      "bank withdrawal",
      "withdraw to bank",

      // Withdrawal
      "withdraw",
      "withdrawal",
      "make withdrawal",
      "make a withdrawal",
      "withdraw money",
      "withdraw funds",

      // Cash out
      "cash out",
      "cashout",
      "cash-out",
      "get cash",
      "get my money",
      "take out money",

      // Natural language
      "send money to my bank",
      "transfer money to bank",
      "move money to bank",
      "i want to withdraw",
      "i need to withdraw",
      "withdraw to my account",
      "payout",
      "pay out",
    ],
    description: "Transfer from your chainpaye wallet to bank accounts",
    priority: 3,
  },

  // ============================================================
  // TRANSFER / SEND MONEY TO USER
  // Transfer to another ChainPaye user
  // ============================================================
  transfer: {
    triggers: [
      // Slash commands
      "/sendmoney",
      "/send",
      "/transfer",
      "/pay",

      // Send money
      "send money",
      "send funds",
      "send cash",
      "send payment",

      // Transfer to user
      "transfer",
      "transfer money",
      "transfer funds",
      "send to user",
      "transfer to user",
      "pay user",

      // Pay someone
      "pay",
      "pay someone",
      "make payment",
      "make a payment",
      "send to friend",
      "pay friend",
      "pay a friend",

      // Natural language
      "i want to send money",
      "i want to pay",
      "i need to send",
      "send to someone",
      "transfer to someone",
      "give money",
      "send to",
    ],
    description: "Transfer money to another chainpaye user",
    priority: 3,
  },

  // ============================================================
  // DEPOSIT / TOP UP
  // Add funds to wallet
  // ============================================================
  deposit: {
    triggers: [
      // Slash commands
      "/deposit",
      "/topup",
      "/fund",
      "/add",

      // Deposit
      "deposit",
      "make deposit",
      "make a deposit",
      "deposit money",
      "deposit funds",

      // Top up
      "top up",
      "topup",
      "top-up",
      "top up wallet",
      "topup wallet",

      // Fund wallet
      "fund wallet",
      "fund my wallet",
      "add funds",
      "add money",
      "add cash",
      "load wallet",
      "load money",
      "load funds",
      "recharge",
      "recharge wallet",

      // Natural language
      "i want to deposit",
      "i want to add money",
      "i need to top up",
      "put money in wallet",
      "add to wallet",
      "fund my account",
      "add to my account",
      "credit my wallet",
      "credit my account",
    ],
    description: "Top up your chainpaye wallet",
    priority: 3,
  },

  // ============================================================
  // PAYMENT LINKS
  // Create links to receive payments
  // ============================================================
  paymentLink: {
    triggers: [
      // Slash commands
      "/paymentlink",
      "/paymentlinks",
      "/createlink",
      "/getpaid",

      // Payment link phrases
      "payment link",
      "payment links",
      "create payment link",
      "generate payment link",
      "create link",
      "generate link",
      "request payment",
      "get paid",
      "invoice link",
      "send payment link",
      "collect payment",

      // Natural language
      "i want a payment link",
      "i want to create a payment link",
      "help me create a payment link",
      "how do i create a payment link",
      "create a link for payment",
    ],
    description: "Create a payment link to receive payments",
    priority: 4,
  },

  // ============================================================
  // CURRENCY CONVERSION
  // Convert between fiat currencies
  // ============================================================
  convert: {
    triggers: [
      // Slash commands
      "/convert",
      "/exchange",
      "/currency",
      "/fx",

      // Convert
      "convert",
      "convert currency",
      "convert money",
      "currency conversion",
      "money conversion",

      // Exchange
      "exchange",
      "exchange currency",
      "exchange money",
      "currency exchange",
      "foreign exchange",
      "fx",
      "forex",

      // Specific conversions
      "usd to ngn",
      "ngn to usd",
      "dollar to naira",
      "naira to dollar",
      "eur to ngn",
      "gbp to ngn",
      "pound to naira",
      "euro to naira",
      "eur to usd",
      "usd to eur",
      "gbp to usd",
      "usd to gbp",
      "eur to gbp",
      "gbp to eur",
      "eur to dollar",
      "dollar to eur",
      "gbp to dollar",
      "dollar to gbp",
      "pound to dollar",
      "dollar to pound",
      "euro to dollar",
      "dollar to euro",
      "naira to euro",
      "naira to pound",
      "ngn to eur",
      "ngn to gbp",
      "eur to naira",
      "gbp to naira",

      // Natural language
      "i want to convert",
      "change currency",
      "swap currency",
      "convert my money",
      "exchange rate",
      "what is the rate",
      "how much is dollar",
      "how much is usd",
    ],
    description: "Convert between fiat currencies",
    priority: 3,
  },

  // ============================================================
  // SPEND CRYPTO / CRYPTO TO FIAT
  // Convert crypto to fiat currency
  // ============================================================
  offramp: {
    triggers: [
      // Slash commands
      "/spendcrypto",
      "/spend",
      "/sellcrypto",
      "/cryptosell",

      // Spend crypto terms
      "spend crypto",
      "spend my crypto",
      "spend cryptocurrency",
      "crypto spend",
      "use crypto",
      "use my crypto",

      // Sell crypto
      "sell crypto",
      "sell my crypto",
      "sell cryptocurrency",
      "sell coin",
      "sell coins",
      "sell token",
      "sell tokens",
      "sell usdc",
      "sell usdt",
      "sell stablecoin",
      "sell stablecoins",

      // Crypto to fiat conversion
      "crypto to cash",
      "crypto to fiat",
      "crypto to naira",
      "crypto to ngn",
      "crypto to usd",
      "convert crypto",
      "convert crypto to cash",
      "convert crypto to fiat",
      "convert to fiat",
      "stablecoin to cash",
      "stablecoin to fiat",

      // Cash out crypto
      "cash out crypto",
      "cashout crypto",
      "crypto cash out",
      "crypto cashout",
      "withdraw crypto",
      "crypto withdrawal",
      "crypto payout",

      // Natural language
      "sell crypto for cash",
      "i want to sell crypto",
      "i want to sell my crypto",
      "i want to spend crypto",
      "i want to spend my crypto",
      "convert my crypto",
      "turn crypto to cash",
      "change crypto to cash",
      "liquidate crypto",
    ],
    description:
      "Spend your crypto and receive fiat in your chainpaye wallet",
    priority: 4,
  },

  // ============================================================
  // SUPPORT / HELP
  // Get help or contact support
  // ============================================================
  support: {
    triggers: [
      // Slash commands
      "/support",
      "/help",
      "/contact",
      "/helpdesk",

      // Support
      "support",
      "customer support",
      "contact support",
      "get support",
      "need support",
      "i need support",

      // Help desk
      "helpdesk",
      "help desk",

      // Contact
      "contact",
      "contact us",
      "reach out",
      "get in touch",
      "speak to someone",
      "talk to someone",
      "speak to agent",
      "talk to agent",
      "human",
      "agent",
      "live chat",
      "live support",

      // Help - specific issues
      "help",
      "help me",
      "i need help",
      "need help",
      "having issues",
      "having problems",
      "having trouble",
      "something is wrong",
      "not working",
      "issue",
      "problem",
      "complaint",
      "complain",

      // Questions
      "question",
      "i have a question",
      "can you help",
      "can you help me",
      "how can i",
      "how do i",
      "assist",
      "assistance",
      "need assistance",
      "faq",
      "faqs",
    ],
    description: "Get support contact information",
    priority: 2,
  },

  // ============================================================
  // KYC / VERIFICATION
  // User wants to complete identity verification (BVN for Nigeria)
  // ============================================================
  kyc: {
    triggers: [
      // Slash commands
      "/kyc",
      "/verify",
      "/verification",
      "/bvn",

      // KYC terms
      "kyc",
      "complete kyc",
      "start kyc",
      "do kyc",
      "kyc verification",

      // Verification terms
      "verify",
      "verify me",
      "verify account",
      "verify my account",
      "verification",
      "complete verification",
      "start verification",
      "identity verification",
      "get verified",

      // BVN specific
      "bvn",
      "enter bvn",
      "add bvn",
      "submit bvn",
      "bvn verification",
      "bank verification",
      "bank verification number",

      // Natural language
      "i want to verify",
      "how do i verify",
      "unlock features",
      "unlock all features",
      "enable withdrawals",
      "enable bank withdrawal",
    ],
    description: "Complete KYC/BVN verification to unlock all features",
    priority: 5,
  },

  // ============================================================
  // SIGNUP (for existing users who try to signup again)
  // ============================================================
  signup: {
    triggers: [
      // Signup attempts
      "signup",
      "sign up",
      "register",
      "create account",
      "new account",
      "join",
      "get started",
      "start account",
      "open account",
    ],
    description: "Handle signup attempts from existing users",
    priority: 8,
  },

  // ============================================================
  // REFERRAL SYSTEM
  // View referral dashboard, earnings, and leaderboard
  // ============================================================
  referral: {
    triggers: [
      // Slash commands
      "/referral",
      "/referrals",
      "/refer",
      "/earnings",
      "/dashboard",

      // Referral terms
      "referral",
      "referrals",
      "my referral",
      "my referrals",
      "referral code",
      "my referral code",
      "referral link",
      "my referral link",
      "refer",
      "refer friend",
      "refer a friend",

      // Dashboard
      "dashboard",
      "referral dashboard",
      "my dashboard",
      "show dashboard",
      "view dashboard",

      // Earnings
      "earnings",
      "my earnings",
      "referral earnings",
      "how much have i earned",
      "how much did i earn",
      "check earnings",
      "view earnings",
      "show earnings",

      // Leaderboard
      "leaderboard",
      "top earners",
      "rankings",
      "my rank",
      "my ranking",

      // Natural language
      "how do i refer",
      "how can i refer",
      "invite friends",
      "earn rewards",
      "earn money",
      "make money",
      "passive income",
    ],
    description: "View your referral dashboard and earnings",
    priority: 4,
  },
};

export { COMMANDS };
