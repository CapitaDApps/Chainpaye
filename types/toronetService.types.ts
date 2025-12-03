export type KycDataType = {
    bvn: string,
    firstName: string,
    lastName: string,
    middleName?: string,
    phoneNumber: string,
    dob: string,
    address: string
}

export type CurrencyType = "USD" | "NGN"