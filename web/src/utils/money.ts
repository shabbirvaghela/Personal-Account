export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

export function formatRupees(paise: number): string {
  return `₹${fromPaise(paise).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}
