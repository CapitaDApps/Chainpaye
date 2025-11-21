import {User} from "../models/User";
import {ToronetService} from "./ToronetService";
import {Types} from "mongoose";
import {WalletService} from "./WalletService";

type CreateOrGetUserType = {
    whatsappNumber: string,
    firstName: string,
    lastName: string,
}

export  class  UserServices {

    private toronetService: ToronetService;
    private walletService: WalletService

    constructor() {
        this.toronetService = new ToronetService();
        this.walletService = new WalletService();
    }

    async createOrGetUser(data: CreateOrGetUserType) {
        const user = await  User.findOne({whatsappNumber: data.whatsappNumber})
        if(!user){
            // TODO: Create new user
            const user = await  User.create({
                whatsappNumber: data.whatsappNumber,
                firstName: data.firstName,
                lastName: data.lastName,
            })

            // TODO: Create key
            await this.walletService.addWallet(user._id as Types.ObjectId);

            // TODO: Create virtual wallet


            return user;
        }

        return user;
    }

    // TODO: Email verification for pin
}