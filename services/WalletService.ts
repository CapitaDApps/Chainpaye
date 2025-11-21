import {Types} from "mongoose";
import {Wallet} from "../models/Wallet";
import {ToronetService} from "./ToronetService";


export class WalletService {
    private toronetService: ToronetService;

    constructor() {
        this.toronetService = new ToronetService();
    }

    async addWallet(user: Types.ObjectId): Promise<void> {

        const wallet = await Wallet.findOne({user})

        if (!wallet) {
            const toronetWallet = await  this.toronetService.createWallet((user._id as Types.ObjectId).toString());
            await  Wallet.create({
                user,
                publicKey: toronetWallet.walletAddress,
                password: toronetWallet.password,
            })

            this.toronetService.createVirtualWalletNGN();
        }

    }
}