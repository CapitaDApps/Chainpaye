/**
 * Toronet API service for ChainPaye WhatsApp bot
 * This service handles all interactions with the Toronet blockchain API
 * including wallet creation, balance checks, and transaction processing
 */
import axios, { AxiosInstance, AxiosResponse } from "axios";
import cryptojs from "crypto-js";
import { nanoid } from "nanoid";
import { CurrencyType, KycDataType } from "../types/toronetService.types";

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

export class ToronetService {
  private axiosInstance: AxiosInstance;
  private encryptionKey: string;
  private adminPassword: string;
  private adminAddress: string;
  private baseUrl: string;

  constructor() {
    const instance = axios.create({
      baseURL: "https://api.toronet.org",
      timeout: 300000,
    });
    this.axiosInstance = instance;
    this.baseUrl = "https://api.toronet.org";
    this.encryptionKey =
      process.env.ENCRYPTION_KEY || "default-key-change-in-production";
    this.adminPassword = process.env.TORONET_ADMIN_PASSWORD || "";
    this.adminAddress = process.env.TORONET_ADMIN_ADDRESS || "";
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

  async updateVirtualWallet(virtualAccountNO: string) {
    const body = {
      op: "updatevirtualwallettransactions",
      params: [
        {
          name: "walletaddress",
          value: virtualAccountNO, //blockchain address
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

    return {
      result: data.result,
      status: data.status,
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
  async withdrawNGN() {}

  // TODO: Implement withdrawal USD
  async withdrawUSD() {}

  // TODO: KYC
  async performKYC(data: KycDataType) {
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
          value: data.phoneNumber,
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

    const resp = await this.axiosInstance.post("/payment/toro/", body);
  }

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
    return cryptojs.AES.encrypt(data, this.encryptionKey).toString();
  }

  private decrypt(data: string): string {
    const bytes = cryptojs.AES.decrypt(data, this.encryptionKey);
    return bytes.toString(cryptojs.enc.Utf8);
  }

  decryptPassword(password: string): string {
    return this.decrypt(password);
  }
}
