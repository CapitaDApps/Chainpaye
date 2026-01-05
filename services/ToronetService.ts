/**
 * Toronet API service for ChainPaye WhatsApp bot
 * This service handles all interactions with the Toronet blockchain API
 * including wallet creation, balance checks, and transaction processing
 */
import axios, { AxiosInstance, AxiosResponse } from "axios";
import cryptojs from "crypto-js";
import { nanoid } from "nanoid";
import {
  CoinType,
  CurrencyType,
  KycDataType,
} from "../types/toronetService.types";
import { User } from "../models/User";
import { redisClient } from "./redis";
import { Types } from "mongoose";
import { TransactionStatus } from "../models/Transaction";
import { TransactionService } from "./TransactionService";

export interface Bank {
  id: string; // Mapped from bankCode
  title: string; // Mapped from bankName
}

type BalanceResult = { result: boolean; balance: number; message: string };
type InitializeDepositReturn =
  | {
      result: boolean;
      transactionId: string;
      amount: string;
      bankName: string;
      accountNumber: string;
      accountName: string;
      instruction: string;
      refId: string;
      routingNO?: number;
    }
  | {
      result: boolean;
      transactionId: string;
      bankName: string;
      routingNO: string;
      accountNumber: number;
      accountName: string;
      refId: string;
      amount?: string;
      instruction?: string;
    };

//     {
//     "result": true,
//     "txid": "0xa01f1ef580D06f355479A2B7cB7450c67d825bb2_d553135bab996c7f",
//     "network": "bsc",
//     "address": "0xa01f1ef580D06f355479A2B7cB7450c67d825bb2",
//     "accountname": "CapitaDapps Bridge Limited Account ",
//     "newwallet": false,
//     "amount": 101.5,
//     "instruction": "Please deposit the amount shown into your same (Toronet) address on the indicated network (Use the direct blockchain address not the friendly TNS name). On completion, please return and click the Update or Confirm button to check and receive the credit onchain for your deposit. Expected token 100.0000000 usd (Value may change depending on when deposit is completed)."
// }
type CryptoInitReturn = {
  result: boolean;
  transactionId: string;
  network: string;
  address: string;
  amount: string;
  totalAmount: string;
  refId: string;
};

export class ToronetService {
  private axiosInstance: AxiosInstance;
  private adminPassword: string;
  private adminAddress: string;
  private baseUrl: string;
  currentVersion = 2;

  constructor() {
    const instance = axios.create({
      baseURL: "https://api.toronet.org",
      timeout: 300000,
    });
    this.axiosInstance = instance;
    this.baseUrl = "https://api.toronet.org";
    this.adminPassword = process.env.TORONET_ADMIN_PASSWORD || "";
    this.adminAddress = process.env.TORONET_ADMIN_ADDRESS || "";
  }

  private getEncryptionKey(currentVersion: number) {
    switch (currentVersion) {
      case 1:
        return process.env.ENCRYPTION_KEY_V1 || "";

      case 2:
        return process.env.ENCRYPTION_KEY_V2 || "";

      default:
        return process.env.ENCRYPTION_KEY_V2 || "";
    }
  }

  async createWallet(): Promise<{ walletAddress: string; password: string }> {
    const generatedPassword = this.generateRandomPassword();
    const encryptedPassword = this.encrypt(generatedPassword);
    console.log({ generatedPassword, encryptedPassword });
    const resp = await this.axiosInstance.post("/keystore", {
      op: "createkey",
      params: [{ name: "pwd", value: generatedPassword }],
    });

    return { walletAddress: resp.data.address, password: encryptedPassword };
  }

  async createVirtualWalletNGN(data: { address: string; fullName: string }) {
    const body = {
      op: "generatevirtualwallet",
      params: [
        {
          name: "address",
          value: data.address, //wallet address
        },
        {
          name: "payername",
          value: data.fullName, //name of the account holder
        },
        {
          name: "currency",
          value: "NGN", //current options are USD, EUR, NGN - default
        },
      ],
    };

    const resp = await this.axiosInstance.post("/payment/toro", body, {
      headers: {
        adminpwd: this.adminPassword,
        admin: this.adminAddress,
      },
    });

    return {
      result: resp.data.result,
      bankname: resp.data.bankname,
      network: resp.data.network,
      accountnumber: resp.data.accountnumber,
      accountname: resp.data.accountname,
      newwallet: resp.data.newwallet,
      lastcheck: resp.data.lastcheck,
    };
  }

  async initializeDeposit({
    receiverAddress,
    amount,
    currency,
    description,
  }: {
    receiverAddress: string;
    amount: string;
    description?: string;
    currency: CurrencyType;
  }): Promise<InitializeDepositReturn> {
    const refId = this.generateRandomReferenceId();
    const body = {
      op: "paymentinitialize",
      params: [
        {
          name: "address",
          value: receiverAddress,
        },
        {
          name: "token",
          value: currency,
        },
        {
          name: "currency",
          value: currency,
        },
        {
          name: "amount",
          value: amount,
        },
        {
          name: "success_url",
          value: "",
        },
        {
          name: "cancel_url",
          value: "",
        },
        {
          name: "paymenttype",
          value: "bank",
        },
        {
          name: "passthrough",
          value: "0",
        },
        {
          name: "commissionrate",
          value: "0.01",
        },
        {
          name: "exchange",
          value: "72",
        },
        {
          name: "reusewallet",
          value: "1",
        },
        {
          name: "description",
          value: description ? description : "",
        },
        {
          name: "reference",
          value: refId,
        },
      ],
    };

    const resp = await this.axiosInstance.post("/payment/toro/", body, {
      headers: {
        adminpwd: this.adminPassword,
        admin: this.adminAddress,
      },
    });

    const data = resp.data;
    console.log({ data });

    if (!data.result) {
      throw new Error(data.error);
    }

    if (currency == "NGN") {
      return {
        result: data.result,
        transactionId: data.txid,
        amount: data.amount,
        bankName: data.bankname,
        accountNumber: data.accountnumber,
        accountName: data.accountname,
        instruction: data.instruction,
        refId,
      };
    }

    return {
      result: data.result,
      transactionId: data.txid,
      bankName: "Chase Bank",
      routingNO: "021000021",
      accountNumber: 839128227,
      accountName: "ConnectWorld Inc",
      instruction: data.instruction,
      refId,
    };
  }

  async initCryptoDeposit({
    receiverAddress,
    amount,
    currency,
    description,
    password,
  }: {
    receiverAddress: string;
    amount: string;
    password: string;
    description?: string;
    currency: CoinType;
  }): Promise<CryptoInitReturn> {
    const refId = this.generateRandomReferenceId();
    console.log({ password, decryptedPassword: this.decrypt(password) });
    const body = {
      op: "paymentinitialize",
      params: [
        {
          name: "address",
          value: receiverAddress,
        },
        {
          name: "pwd",
          value: this.decrypt(password),
        },
        {
          name: "token",
          value: "USD",
        },
        {
          name: "currency",
          value: currency,
        },
        {
          name: "amount",
          value: amount,
        },
        {
          name: "success_url",
          value: "",
        },
        {
          name: "cancel_url",
          value: "",
        },
        {
          name: "paymenttype",
          value: "crypto",
        },
        {
          name: "passthrough",
          value: "0",
        },
        {
          name: "commissionrate",
          value: "0.01",
        },
        {
          name: "exchange",
          value: "72",
        },
        {
          name: "payername",
          value: "Jon Doe",
        },
        {
          name: "payeraddress",
          value: "null",
        },
        {
          name: "payercity",
          value: "null",
        },
        {
          name: "payerstate",
          value: "null",
        },
        {
          name: "payercountry",
          value: "null",
        },
        {
          name: "payerzipcode",
          value: "null",
        },
        {
          name: "payerphone",
          value: "null",
        },
        {
          name: "reusewallet",
          value: "1",
        },
        {
          name: "description",
          value: description ? description : "",
        },
        {
          name: "reference",
          value: refId,
        },
      ],
    };
    console.log(body.params);
    const resp = await this.axiosInstance.post("/payment/toro/", body, {
      headers: {
        adminpwd: this.adminPassword,
        admin: this.adminAddress,
      },
    });

    const data = resp.data;
    console.log({ data });

    if (!data.result) {
      throw new Error(data.error);
    }

    return {
      result: data.result,
      transactionId: data.txid,
      network: data.network,
      address: data.address,
      amount,
      totalAmount: data.amount,
      refId,
    };
  }

  async recordTransaction(transactionId: string, currency: CurrencyType) {
    const url = `/payment/toro/`;

    const body = {
      op: "recordfiattransaction",
      params: [
        {
          name: "currency",
          value: currency, //current options are USD, EUR, NGN - defaut
        },
        {
          name: "txid",
          value: transactionId,
        },
        //paymenttype is required if you are recording an asynchronous transactions such as bank transfer (or ach), wire transfer.
        {
          name: "paymenttype",
          value: "bank", //options are card, bank, wire.
        },
      ],
    };

    const resp = await this.axiosInstance.post(url, body, {
      headers: {
        adminpwd: this.adminPassword,
        admin: this.adminAddress,
      },
    });
    const data = resp.data;
    console.log({ recordTransactionData: data });
    return {
      result: data.result,
      transactionHash: data.transactionHash,
    };
  }

  async recordCryptoTransaction(transactionId: string, currency: CoinType) {
    const body = {
      op: "recordpayment",
      params: [
        {
          name: "currency",
          value: currency, //current options are USD, EUR, NGN - defaut
        },
        {
          name: "txid",
          value: transactionId,
        },
        {
          name: "checkouttype",
          value: "paymentintent",
        },
        {
          name: "paymenttype",
          value: "crypto", //options are card, bank or ach, wire. if omitted the lowest fee is default
        },
        {
          name: "reusewallet",
          value: "1", //default or ommitted is set as 0, 1 ureuses virtual wallets
        },
      ],
    };

    const resp = await this.axiosInstance.post("/payment/toro/", body, {
      headers: {
        adminpwd: this.adminPassword,
        admin: this.adminAddress,
      },
    });
    const data = resp.data;
    console.log({ recordCryptoTransactionData: data });
    return {
      result: data.result,
      transactionHash: data.transactionHash,
    };
  }

  async getVirtualWalletByAddress(publicKey: string): Promise<{
    result: boolean;
    bankname: string;
    network: string;
    accountnumber: string;
    address: string;
    accountname: string;
    newwallet: boolean;
    lastcheck: string;
  }> {
    const body = {
      op: "getvirtualwalletbyaddress",
      params: [
        {
          name: "address",
          value: publicKey, //blockchain address
        },
      ],
    };

    const resp = await this.axiosInstance.post("/payment", body, {
      headers: {
        adminpwd: this.adminPassword,
        admin: this.adminAddress,
      },
    });

    const data = resp.data;
    return data;
  }

  async updateVirtualWallet(publicKey: string) {
    const virtualWalletData = await redisClient.getOrSetCache(
      publicKey,
      async () => {
        const data = await this.getVirtualWalletByAddress(publicKey);
        return data;
      }
    );

    const body = {
      op: "updatevirtualwallettransactions",
      params: [
        {
          name: "walletaddress",
          value: virtualWalletData.accountnumber, //blockchain address
        },
      ],
    };

    const resp = await this.axiosInstance.post("/payment", body, {
      headers: {
        adminpwd: this.adminPassword,
        admin: this.adminAddress,
      },
    });
    const data = resp.data;
    console.log({ updateVirtualWalletData: data });

    return {
      result: data.result,
      transactionHash: data.transactionHash,
    };
  }

  async getTransactionStatus(txId: string) {
    const body = {
      op: "getfiattransactions_txid",
      params: [
        {
          name: "txid",
          value: txId,
        },
      ],
    };

    const resp = await this.axiosInstance.post("/payment/toro/", body, {
      headers: {
        adminpwd: this.adminPassword,
        admin: this.adminAddress,
      },
    });
    const data = resp.data;
    console.log({ getTransactionStatusData: data });
    const txData = data.data || [];
    return {
      result: data.result,
      status: data.status,
      data: txData,
    };
  }

  async getBalanceNGN(address: string): Promise<BalanceResult> {
    const body = this.formBalanceBody(address);
    // const resp = await  this.axiosInstance.get("/currency/naira/")
    // const resp = await fetch(`${this.baseUrl}/currency/naira/`, {
    //   method: "GET",
    //   body: JSON.stringify(body),
    // });

    const resp = await axios({
      method: "GET",
      url: `${this.baseUrl}/currency/naira/`,
      data: body,
    });

    const data = resp.data;

    return {
      result: data.result,
      balance: Number(data.balance),
      message: data.message,
    };
  }

  async getBalanceUSD(address: string): Promise<BalanceResult> {
    const body = this.formBalanceBody(address);
    // const resp = await  this.axiosInstance.get("/currency/dollar/")
    // const resp = await fetch(`${this.baseUrl}/currency/dollar/`, {
    //   method: "GET",
    //   body: JSON.stringify(body),
    // });

    // const data: any = await resp.json();
    const resp = await axios({
      method: "GET",
      url: `${this.baseUrl}/currency/dollar/`,
      data: body,
    });

    const data = resp.data;

    return {
      result: data.result,
      balance: Number(data.balance),
      message: data.message,
    };
  }

  async transferTORO(
    from: string,
    to: string,
    amount: string,
    password: string
  ) {
    const body = this.formTransferBody(from, to, amount, password);

    const resp = await this.axiosInstance.post("/token/toro/cl", body);

    return {
      to,
      result: resp.data.result,
      transactionHash: resp.data.transaction,
      message: resp.data.message,
    };
  }

  async transferNGN(
    from: string,
    to: string,
    amount: string,
    password: string
  ) {
    const body = this.formTransferBody(from, to, amount, password);

    const resp = await this.axiosInstance.post("/currency/naira/cl", body);

    console.log(resp.data.message);

    return {
      to,
      result: resp.data.result,
      transactionHash: resp.data.transaction,
      message: resp.data.message,
    };
  }

  async transferUSD(
    from: string,
    to: string,
    amount: string,
    password: string
  ) {
    const body = this.formTransferBody(from, to, amount, password);

    const resp = await this.axiosInstance.post("/currency/dollar/cl", body);

    return {
      to,
      result: resp.data.result,
      transactionHash: resp.data.transaction,
      message: resp.data.message,
    };
  }

  async buyToro({
    address,
    amount,
    currency,
    password,
  }: {
    address: string;
    password: string;
    amount: string;
    currency: CurrencyType;
  }) {
    const decryptedPassword = this.decrypt(password);
    const body = this.formBuyToroBody(address, decryptedPassword, amount);

    const nairaEndpoint = "/currency/naira/cl";
    const dollarEndpoint = "/currency/dollar/cl";
    let resp: AxiosResponse<any, any, {}>;
    switch (currency) {
      case "USD":
        resp = await this.axiosInstance.post(dollarEndpoint, body);
        return resp.data.result;
      case "NGN":
        resp = await this.axiosInstance.post(nairaEndpoint, body);
        return resp.data.result;
      default:
        throw new Error("Unknown currency " + currency);
    }
  }

  // TODO: Implement Withdrawal NGN
  async withdrawNGN(data: {
    userAddress: string;
    password: string;
    amount: string;
    bankName: string;
    routingNo: string;
    accoountNo: string;
    accountName: string;
    phoneNumber: string;
  }) {
    const decryptedPassword = this.decrypt(data.password);
    const body = {
      op: "recordfiatwithdrawal",
      params: [
        {
          name: "addr",
          value: data.userAddress,
        },
        {
          name: "pwd",
          value: decryptedPassword,
        },
        {
          name: "currency",
          value: "NGN",
        },
        {
          name: "token",
          value: "NGN",
        },
        {
          name: "payername",
          value: "Zab Alabs",
        },
        {
          name: "payeremail",
          value: "email@gmail.com",
        },
        {
          name: "payeraddress",
          value: "10 Peachtree Rd",
        },
        {
          name: "payercity",
          value: "Pear St",
        },
        {
          name: "payerstate",
          value: "DE",
        },
        {
          name: "payercountry",
          value: "US",
        },
        {
          name: "payerzipcode",
          value: "19801",
        },
        {
          name: "payerphone",
          value: "6313003000",
        },
        {
          name: "description",
          value: "ToroNGN Exchange",
        },
        {
          name: "amount",
          value: data.amount,
        },
        {
          name: "accounttype",
          value: "bank",
        },
        {
          name: "bankname",
          value: data.bankName,
        },
        {
          name: "routingno",
          value: data.routingNo,
        },
        {
          name: "accountno",
          value: data.accoountNo,
        },
        {
          name: "expirydate",
          value: "optional",
        },
        {
          name: "accountname",
          value: data.accountName,
        },
        {
          name: "recipientstate",
          value: "Lagos",
        },
        {
          name: "recipientzip",
          value: "11776",
        },
        {
          name: "recipientphone",
          value: data.phoneNumber,
        },
      ],
    };

    const result = await this.axiosInstance.post("/payment/toro/", body, {
      headers: {
        adminpwd: this.adminPassword,
        admin: this.adminAddress,
      },
    });

    const withdrawResp = result.data;

    console.log({ withdrawResp });

    if (withdrawResp.result) {
      return {
        success: true,
        message: "Withdrawal successful",
      };
    }

    return {
      success: false,
      message:
        withdrawResp.error ||
        withdrawResp.message ||
        "Withdrawal was not successful. Please try again.",
    };
  }

  private processBanks(rawList: any[]): Bank[] {
    const uniqueBanks = new Map<string, Bank>();

    rawList.forEach((item) => {
      const id = item.bankCode;
      const title = item.bankName;

      if (id.split("\r\n").length == 1 || title.split("\r\n").length == 1) {
        if (!uniqueBanks.has(id)) {
          // Add to map if it doesn't exist
          uniqueBanks.set(id, {
            id: id,
            title: title,
          });
        }
      } else {
        console.log({ id, title });
      }
    });

    // 2. Convert Map values back to an array and sort
    return Array.from(uniqueBanks.values()).sort((a, b) => {
      return a.title.localeCompare(b.title, "en", { sensitivity: "base" });
    });
  }

  async getBankListNGN(): Promise<Bank[]> {
    const body = {
      op: "getbanklist_ngn",
      params: [],
    };

    const bankList = await redisClient.getOrSetCache(
      "bankList_ngn",
      async () => {
        const result = await this.axiosInstance.post("/payment/toro/", body);
        const data = result.data;

        const bankList = data.data;
        const cleanBankList = this.processBanks(bankList);
        return cleanBankList;
      }
    );

    return bankList;
  }

  async getBankListUSD(): Promise<Bank[]> {
    const body = {
      op: "getbanklist_usd",
      params: [],
    };

    const bankList = await redisClient.getOrSetCache(
      "bankList_usd",
      async () => {
        const result = await this.axiosInstance.post("/payment/toro/", body);
        const data = result.data;

        const bankList = data.data;
        const cleanBankList = this.processBanks(bankList);
        return cleanBankList;
      }
    );

    return bankList;
  }

  async resolveBankAccountName(
    accountNumber: string,
    bankCode: string
  ): Promise<string> {
    const accountName = await redisClient.getOrSetCache(
      accountNumber,
      async () => {
        const body = {
          op: "verifybankaccountname_ngn",
          params: [
            {
              name: "destinationInstitutionCode",
              value: bankCode, //destinationInstitutionCode
            },
            {
              name: "accountNumber",
              value: accountNumber,
            },
          ],
        };

        const result = await this.axiosInstance.post("/payment/toro/", body, {
          headers: {
            adminpwd: this.adminPassword,
            admin: this.adminAddress,
          },
        });

        const data = result.data;
        return data.data.accountName;
      }
    );
    return accountName;
  }

  // TODO: Implement withdrawal USD
  async withdrawUSD() {}

  async performKYC(data: KycDataType) {
    const phone = data.phoneNumber.startsWith("+")
      ? data.phoneNumber.replace("+", "")
      : data.phoneNumber;
    const body = {
      op: "check_kyc",
      params: [
        {
          name: "currency",
          value: "NGN", //current options are NGN
        },
        {
          name: "bvn",
          value: data.bvn,
        },
        {
          name: "firstName",
          value: data.firstName,
        },
        {
          name: "lastName",
          value: data.lastName,
        },
        {
          name: "middleName",
          value: data.middleName ? data.middleName : "",
        },
        {
          name: "phoneNumber",
          value: phone,
        },
        {
          name: "dob",
          value: data.dob, // DD-MMM-YYYY format is required
        },
        {
          name: "address",
          value: data.address,
        },
      ],
    };

    const user = await User.findOne({ whatsappNumber: `+${phone}` });

    if (!user)
      throw new Error(`user with phone number - [+${phone}] not found`);

    if (user.isVerified) {
      return {
        success: true,
        message: "You've been verified",
      };
    }

    const resp = await this.axiosInstance.post("/payment/toro/", body, {
      headers: {
        admin: this.adminAddress,
        adminpwd: this.adminPassword,
      },
    });
    const result = resp.data;
    console.log({ result });
    const resultData = result.data;
    if (typeof resultData == "string") {
      const kycResult = JSON.parse(resultData);
      if (kycResult.data == null) {
        return {
          success: false,
          message: kycResult.description,
        };
      }
    }
    const passed = resultData.passed;
    if (!passed) {
      if (resultData.firstName == "N" && !resultData.passed) {
        return {
          success: false,
          message: "Registered first name does not match BVN information",
        };
      }
      if (resultData.lastName == "N" && !resultData.passed) {
        return {
          success: false,
          message: "Registered last name does not match BVN information",
        };
      }
      if (resultData.dob == "N" && !resultData.passed) {
        return {
          success: false,
          message: "Registered date of birth does not match BVN information",
        };
      }
      if (resultData.bvn == "N" && !resultData.passed) {
        return {
          success: false,
          message: "could not verify bvn",
        };
      }
      return {
        success: false,
        message: "KYC process failed. Please try again.",
      };
    }
    user.markVerified().then(() => user.save());

    return {
      success: true,
      message: "You've been successfully verified",
    };
  }

  async convertToAndFro({
    from,
    to,
    amount,
    password,
    address,
    user, // Add userId parameter for recording transactions
  }: {
    from: CurrencyType;
    to: CurrencyType;
    amount: string;
    password: string;
    address: string;
    user: Types.ObjectId; // Optional userId for recording transactions
  }) {
    if (from === to) throw new Error("You cannot convert to the same currency");
    // Buy to TORO
    const buyBody = {
      op: "buytoro",
      params: [
        { name: "client", value: address },
        { name: "clientpwd", value: this.decrypt(password) },
        { name: "val", value: amount },
      ],
    };

    function getSellBody(amount: string, decryptedPassword: string) {
      return {
        op: "selltoro",
        params: [
          { name: "client", value: address },
          { name: "clientpwd", value: decryptedPassword },
          { name: "val", value: amount },
        ],
      };
    }

    const calBuyBody = {
      op: "calculatebuyresult",
      params: [
        {
          name: "client",
          value: address,
        },
        { name: "val", value: amount },
      ],
    };

    function getCalcSellBody(amount: string) {
      return {
        op: "calculatesellresult",
        params: [
          {
            name: "client",
            value: address,
          },
          { name: "val", value: amount },
        ],
      };
    }

    let toroReceivedAmount: string;
    let buyTxHash: string;
    let sellTxHash: string;
    let convertedAmount: string;

    switch (from) {
      case "NGN": {
        const [calcResp, buyResp] = await Promise.all([
          axios({
            url: `${this.baseUrl}/currency/naira/cl`,
            data: calBuyBody,
            method: "GET",
          }),
          this.axiosInstance.post("/currency/naira/cl", buyBody),
        ]);

        const calcData = calcResp.data;
        const receivingToro = calcData.amount;
        const buyRespData = buyResp.data;
        if (buyRespData.result) {
          toroReceivedAmount = receivingToro;
          buyTxHash = buyRespData.transaction;
        } else {
          throw new Error(buyRespData.error);
        }
        break;
      }
      case "USD": {
        const [calcResp, buyResp] = await Promise.all([
          axios({
            url: `${this.baseUrl}/currency/dollar/cl`,
            data: calBuyBody,
            method: "GET",
          }),
          this.axiosInstance.post("/currency/dollar/cl", buyBody),
        ]);

        const calcData = calcResp.data;
        const receivingToro = calcData.amount;
        const buyRespData = buyResp.data;
        if (buyRespData.result) {
          toroReceivedAmount = receivingToro;
          buyTxHash = buyRespData.transaction;
        } else {
          throw new Error(buyRespData.error);
        }
        break;
      }
      default:
        throw new Error(`Invalid currency passed - ${from}`);
    }

    // SELL TORO from relative endpoint
    switch (to) {
      case "NGN": {
        if (!toroReceivedAmount) throw new Error("Error converting to ngn");
        const body = getSellBody(toroReceivedAmount, this.decrypt(password));

        const [calcResp, sellResp] = await Promise.all([
          axios({
            url: `${this.baseUrl}/currency/naira/cl`,
            data: getCalcSellBody(toroReceivedAmount),
            method: "GET",
          }),
          this.axiosInstance.post("/currency/naira/cl", body),
        ]);

        const sellData = sellResp.data;
        const calcRespData = calcResp.data;

        if (sellData.result) {
          sellTxHash = sellData.transaction;
          convertedAmount = calcRespData.amount;

          // Record conversion transaction if userId is provided
          const transaction = await TransactionService.recordConversion({
            refId: `CONV_${Date.now()}`,
            toronetTxId: `${buyTxHash}_${sellTxHash}`,
            status: TransactionStatus.COMPLETED as any,
            fromUser: user,
            fromCurrency: from,
            toCurrency: to,
            fromAmount: parseFloat(amount),
            toAmount: parseFloat(convertedAmount),
          });

          // Return transaction in the result
          return {
            success: true,
            fromAmount: amount,
            fromCurrency: from,
            toAmount: convertedAmount,
            toCurrency: to,
            transactionHashes: {
              buy: buyTxHash,
              sell: sellTxHash,
            },
            transaction,
          };
        } else {
          throw new Error(sellData.error);
        }
      }
      case "USD": {
        if (!toroReceivedAmount) throw new Error("Error converting to usd");

        const body = getSellBody(toroReceivedAmount, this.decrypt(password));

        const [calcResp, sellResp] = await Promise.all([
          axios({
            url: `${this.baseUrl}/currency/dollar/cl`,
            data: getCalcSellBody(toroReceivedAmount),
            method: "GET",
          }),
          this.axiosInstance.post("/currency/dollar/cl", body),
        ]);

        const calcRespData = calcResp.data;
        const sellData = sellResp.data;
        convertedAmount = calcRespData.amount;

        if (sellData.result) {
          sellTxHash = sellData.transaction;

          const transaction = await TransactionService.recordConversion({
            refId: `CONV_${Date.now()}`,
            toronetTxId: `${buyTxHash}_${sellTxHash}`,
            status: TransactionStatus.COMPLETED,
            fromUser: user,
            fromCurrency: from,
            toCurrency: to,
            fromAmount: parseFloat(amount),
            toAmount: parseFloat(convertedAmount),
          });

          return {
            success: true,
            fromAmount: amount,
            fromCurrency: from,
            toAmount: convertedAmount,
            toCurrency: to,
            transactionHashes: {
              buy: buyTxHash,
              sell: sellTxHash,
            },
            transaction,
          };
        } else {
          throw new Error(sellData.error);
        }
      }
      default:
        throw new Error(`Invalid target currency passed - ${to}`);
    }
  }

  async simulateConversion({
    from,
    to,
    amount,
    address,
  }: {
    from: CurrencyType;
    to: CurrencyType;
    amount: string;
    address: string;
  }) {
    if (from === to) throw new Error("You cannot convert to the same currency");

    const calBuyBody = {
      op: "calculatebuyresult",
      params: [
        {
          name: "client",
          value: address,
        },
        { name: "val", value: amount },
      ],
    };

    const calSellBody = (toroAmount: string) => ({
      op: "calculatesellresult",
      params: [
        {
          name: "client",
          value: address,
        },
        { name: "val", value: toroAmount },
      ],
    });

    let toroReceivedAmount: string;

    // Calculate how much TORO will be received from the source currency
    switch (from) {
      case "NGN": {
        const calcResp = await axios({
          url: `${this.baseUrl}/currency/naira/cl`,
          data: calBuyBody,
          method: "GET",
        });
        const calcData = calcResp.data;
        if (calcData.result) {
          toroReceivedAmount = calcData.amount;
        } else {
          throw new Error(
            calcData.error || "Error calculating NGN to TORO conversion"
          );
        }
        break;
      }
      case "USD": {
        const calcResp = await axios({
          url: `${this.baseUrl}/currency/dollar/cl`,
          data: calBuyBody,
          method: "GET",
        });
        const calcData = calcResp.data;
        if (calcData.result) {
          toroReceivedAmount = calcData.amount;
        } else {
          throw new Error(
            calcData.error || "Error calculating USD to TORO conversion"
          );
        }
        break;
      }
      default:
        throw new Error(`Invalid source currency passed - ${from}`);
    }

    // Calculate how much target currency will be received from TORO
    let finalAmount: string;
    switch (to) {
      case "NGN": {
        if (!toroReceivedAmount)
          throw new Error("Error calculating TORO to NGN conversion");
        const calcResp = await axios({
          url: `${this.baseUrl}/currency/naira/cl`,
          data: calSellBody(toroReceivedAmount),
          method: "GET",
        });
        const calcData = calcResp.data;
        if (calcData.result) {
          finalAmount = calcData.amount;
        } else {
          throw new Error(
            calcData.error || "Error calculating TORO to NGN conversion"
          );
        }
        break;
      }
      case "USD": {
        if (!toroReceivedAmount)
          throw new Error("Error calculating TORO to USD conversion");
        const calcResp = await axios({
          url: `${this.baseUrl}/currency/dollar/cl`,
          data: calSellBody(toroReceivedAmount),
          method: "GET",
        });
        const calcData = calcResp.data;
        if (calcData.result) {
          finalAmount = calcData.amount;
        } else {
          throw new Error(
            calcData.error || "Error calculating TORO to USD conversion"
          );
        }
        break;
      }
      default:
        throw new Error(`Invalid target currency passed - ${to}`);
    }

    return {
      success: true,
      fromAmount: amount,
      fromCurrency: from,
      toAmount: finalAmount,
      toCurrency: to,
      toroAmount: toroReceivedAmount,
    };
  }

  async getNairaToDollarExchangeRate() {
    const resp = await axios({
      method: "GET",
      url: `${this.baseUrl}/currency/naira`,
      data: { op: "getexchangerate", params: [] },
    });
    const data = resp.data;
    console.log({ conversionData: data });

    if (data.result) {
      const toroNairaRatio = parseFloat(data.exchangerate);
      const nairaToroRatio = 1 / toroNairaRatio;

      return nairaToroRatio;
    }

    throw new Error("Error fetching dollar to naria exhchange rate");
  }

  async getDollarToNairaExchangeRate() {}

  private formBuyToroBody(address: string, password: string, amount: string) {
    return {
      op: "buytoro",
      params: [
        { name: "client", value: address },
        { name: "clientpwd", value: password },
        { name: "val", value: amount },
      ],
    };
  }

  private formBalanceBody(address: string) {
    return { op: "getbalance", params: [{ name: "addr", value: address }] };
  }

  private formTransferBody(
    from: string,
    to: string,
    amount: string,
    password: string
  ) {
    const decryptedPassword = this.decrypt(password);
    console.log({ decryptedPassword });
    return {
      op: "transfer",
      params: [
        { name: "client", value: from },
        { name: "clientpwd", value: decryptedPassword },
        { name: "to", value: to },
        { name: "val", value: amount },
      ],
    };
  }

  private generateRandomPassword(): string {
    return nanoid(10);
  }

  private generateRandomReferenceId(): string {
    return nanoid();
  }

  private encrypt(data: string): string {
    const version = `v${this.currentVersion}`;
    const encryptionKey = this.getEncryptionKey(this.currentVersion);
    if (!encryptionKey) throw new Error("Encryption key is not set");

    return `${version}:${cryptojs.AES.encrypt(data, encryptionKey).toString()}`;
  }

  private decrypt(data: string): string {
    const versionList = data.split(":");
    const version = versionList[0];
    let versionNumber = 1;
    if (version && versionList.length > 1) {
      versionNumber = Number(version.split("")[1]!);
      if (isNaN(versionNumber))
        throw new Error("Invalid encryption version number");
    }
    const encryptionKey = this.getEncryptionKey(versionNumber);
    if (!encryptionKey) throw new Error("Encryption key is not set");

    const bytes = cryptojs.AES.decrypt(data, encryptionKey);
    return bytes.toString(cryptojs.enc.Utf8);
  }

  decryptPassword(password: string): string {
    return this.decrypt(password);
  }
  encryptPassword(password: string): string {
    return this.encrypt(password);
  }
}
