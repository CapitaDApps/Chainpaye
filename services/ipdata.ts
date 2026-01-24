"use server";

import axios from "axios";
import { loadEnv } from "../config/env";

// Load environment variables
loadEnv(false);

const ipdata_api_key = process.env.IPDATA_API_KEY;

if (!ipdata_api_key) throw new Error("IPDATA_API_KEY must be set");

export async function getIpData(ip: string | undefined) {
  if (!ip) return "";
  const url = `https://api.ipdata.co/${ip}?api-key=${ipdata_api_key}`;
  const resp = await axios.get(url);

  const data = resp.data;

  return {
    countryName: data.country_name,
    countryCode: data.country_code,
  };
}
