export function formatTokenAmount(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;

  if (isNaN(num) || num === 0) return "0";

  if (num > 1) {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (num < 0.0001) {
    const factor = Math.pow(10, 6);
    const truncated = Math.floor(num * factor) / factor;
    return truncated.toFixed(6).replace(/\.?0+$/, "");
  }

  return num.toFixed(4).replace(/\.?0+$/, "");
}

export function formatUSD(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount > 0 && amount < 0.01) {
    return "$" + amount.toFixed(4);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}
