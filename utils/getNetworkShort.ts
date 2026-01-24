import { NormalizedNetworkType } from "../commands/types";

export function getNetworkShortName(network: NormalizedNetworkType) {
  switch (network) {
    case "BNB Smart Chain":
      return "bsc";
    case "Base":
      return "base";
    case "Ethereum":
      return "eth";
    case "Polygon":
      return "poly";
    case "Solana":
      return "sol";
    case "Tron":
      return "trx";
    default:
      throw new Error("Invalid network type");
  }
}
