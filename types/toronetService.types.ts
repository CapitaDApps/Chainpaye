export type KycDataType = {
  bvn: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  phoneNumber: string;
  dob: string;
  address: string;
};

export type CurrencyType = "USD" | "NGN" | "EUR" | "GBP";
export type CoinType =
  | "USDCBASE"
  | "USDTBSC"
  | "USDCBSC"
  | "USDTPOLY"
  | "USDCPOLY"
  | "USDTTRX"
  | "USDCTRX"
  | "USDTSOL"
  | "USDCSOL"
  | "USDTETH"
  | "USDCETH";
