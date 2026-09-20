import { getMeta, setMeta } from "../db/localDb";

const OFFICE_ADDRESS_KEY = "officeAddress";
const PETROL_RATE_KEY = "petrolRatePerKm";

export const DEFAULT_PETROL_RATE = 5;

export async function getOfficeAddress(): Promise<string> {
  const v = await getMeta(OFFICE_ADDRESS_KEY);
  return v ? String(v) : "";
}

export async function setOfficeAddress(address: string): Promise<void> {
  await setMeta(OFFICE_ADDRESS_KEY, address);
}

export async function getPetrolRate(): Promise<number> {
  const v = await getMeta(PETROL_RATE_KEY);
  return v ? Number(v) : DEFAULT_PETROL_RATE;
}

export async function setPetrolRate(rate: number): Promise<void> {
  await setMeta(PETROL_RATE_KEY, rate);
}
