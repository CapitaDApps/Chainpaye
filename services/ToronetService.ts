/**
 * Toronet API service for ChainPaye WhatsApp bot
 * This service handles all interactions with the Toronet blockchain API
 * including wallet creation, balance checks, and transaction processing
 */
import axios, {AxiosInstance} from "axios";
import cryptojs from "crypto-js"
import crypto from "crypto"
import {KycDataType} from "../types/toronetService.types";

export class ToronetService {
  // TODO: Implement Toronet blockchain API integration methods
    private axiosInstance: AxiosInstance;
    private encryptionKey: string;
    private adminPassword: string;
    private adminAddress: string;

    constructor() {
        const instance = axios.create({
            baseURL: 'https://toronet.org/api',
            timeout: 10000,
        });
        this.axiosInstance = instance;
        this.encryptionKey =
            process.env.ENCRYPTION_KEY || "default-key-change-in-production";
        this.adminPassword = process.env.ADMIN_PASSWORD || "";
        this.adminAddress = process.env.ADMIN_ADDRESS || "";
    }

    async createWallet(userId: string): Promise<{walletAddress: string, password: string}> {
        const generatedPassword = this.generateRandomPassword();
        const encryptedPassword = this.encrypt(generatedPassword);
        const resp = await  this.axiosInstance.post("/keystore", { "op":"createkey", "params":[{"name":"pwd", "value":generatedPassword}] })

        return {walletAddress: resp.data.address, password: encryptedPassword};
    }

    // TODO: Create Virtual NGN wallet
    async createVirtualWalletNGN(data: {
        address: string;
        fullName: string;
    }) {
        const body = {
            "op": "generatevirtualwallet",
            "params": [
                {
                    "name": "address",
                    "value": data.address //wallet address
                },
                {
                    "name": "payername",
                    "value": data.fullName //name of the account holder
                },
                {
                    "name": "currency",
                    "value": "NGN" //current options are USD, EUR, NGN - default
                }
            ]
        }

        const resp = await  this.axiosInstance.post("/payment/toro", body, {
            headers: {
                adminpwd: this.adminPassword,
                admin: this.adminAddress
            }
        })

        return {
            result: resp.data.result,
            bankname: resp.data.bankname,
            network: resp.data.network,
            accountnumber: resp.data.accountnumber,
            accountname: resp.data.accountname,
            newwallet: resp.data.newwallet,
            lastcheck: resp.data.lastcheck,
        }
    }

    // TODO: USD deposit - payment initialize
    async getWalletForUSDDeposit() {

    }

    // TODO: Implement NGN balance
    async getBalanceNGN(address: string) {
        const body = { "op":"getbalance", "params":[{"name":"addr", "value":address}] }
        const resp = await  this.axiosInstance.get("/currency/naira/")
    }

    // TODO: Implement USD balance
    async getBalanceUSD(address: string) {
        const body = { "op":"getbalance", "params":[{"name":"addr", "value":address}] }
        const resp = await  this.axiosInstance.get("/currency/dollar/")
    }

    // TODO: Implement Withdrawal NGN
    async withdrawNGN() {}

    // TODO: Implement withdrawal USD
    async withdrawUSD() {}

    // TODO: Transfer NGN from one user to another
    // TODO: Transfer USD from one user to another

    // TODO: KYC
    async performKYC(data: KycDataType) {
        const body = {
            "op": "check_kyc",
            "params": [
                {
                    "name": "currency",
                    "value": "NGN" //current options are NGN
                },
                {
                    "name": "bvn",
                    "value": data.bvn
                },
                {
                    "name": "firstName",
                    "value": data.firstName
                },
                {
                    "name": "lastName",
                    "value": data.lastName
                },
                {
                    "name": "middleName",
                    "value": data.middleName ? data.middleName : "",
                },
                {
                    "name": "phoneNumber",
                    "value": data.phoneNumber
                },
                {
                    "name": "dob",
                    "value": data.dob // DD-MMM-YYYY format is required
                },
                {
                    "name": "address",
                    "value": data.address
                }
            ]
        }

        const resp = await  this.axiosInstance.post("/payment/toro/", body)
    }

    private generateRandomPassword(): string {
        return crypto.randomUUID().toString();
    }

    private encrypt(data: string): string {
        return cryptojs.AES.encrypt(data, this.encryptionKey).toString()
    }

    private decrypt(data: string): string {
        return cryptojs.AES.decrypt(data, this.encryptionKey).toString()
    }

}
