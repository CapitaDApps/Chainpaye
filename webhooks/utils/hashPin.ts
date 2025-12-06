import bycrypt from "bcryptjs";

export async function hashPin(pin: string) {
  const salt = await bycrypt.genSalt(12);
  const hash = await bycrypt.hash(pin, salt);

  return hash;
}
