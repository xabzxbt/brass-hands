/**
 * Format a token amount for display
 * @param amount - The amount to format (number or string)
 * @returns Formatted string representation
 */
export function formatTokenAmount(amount: number | string): string {
  // FIX: Handle null/undefined
  if (amount === null || amount === undefined) return "0";
  
  const num = typeof amount === "string" ? parseFloat(amount) : amount;

  // FIX: More robust NaN and edge case handling
  if (!Number.isFinite(num) || num === 0) return "0";
  
  // FIX: Handle negative numbers
  if (num < 0) return "0";

  if (num >= 1) {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (num < 0.0001) {
    const factor = Math.pow(10, 6);
    const truncated = Math.floor(num * factor) / factor;
    // FIX: Handle edge case where truncated becomes 0
    if (truncated === 0) return "<0.000001";
    return truncated.toFixed(6).replace(/\.?0+$/, "");
  }

  return num.toFixed(4).replace(/\.?0+$/, "");
}

/**
 * Format a USD value for display
 * @param amount - The USD amount to format
 * @returns Formatted currency string
 */
export function formatUSD(amount: number): string {
  // FIX: Handle null/undefined/NaN
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return "$0.00";
  }
  
  // FIX: Handle negative numbers
  if (amount < 0) return "-" + formatUSD(Math.abs(amount));
  
  if (amount === 0) return "$0.00";
  
  if (amount > 0 && amount < 0.01) {
    // FIX: More precise display for small values
    if (amount < 0.0001) {
      return "<$0.0001";
    }
    return "$" + amount.toFixed(4);
  }
  
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/**
 * Format a large number with abbreviations (K, M, B)
 * @param num - The number to format
 * @returns Formatted string with abbreviation
 */
export function formatCompactNumber(num: number): string {
  if (!Number.isFinite(num)) return "0";
  
  const absNum = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  
  if (absNum >= 1e9) {
    return sign + (absNum / 1e9).toFixed(2) + "B";
  }
  if (absNum >= 1e6) {
    return sign + (absNum / 1e6).toFixed(2) + "M";
  }
  if (absNum >= 1e3) {
    return sign + (absNum / 1e3).toFixed(2) + "K";
  }
  
  return sign + absNum.toFixed(2);
}

/**
 * Truncate an address for display
 * @param address - The full address
 * @param startChars - Number of characters to show at start (default: 6)
 * @param endChars - Number of characters to show at end (default: 4)
 * @returns Truncated address string
 */
export function truncateAddress(
  address: string, 
  startChars: number = 6, 
  endChars: number = 4
): string {
  if (!address) return "";
  if (address.length <= startChars + endChars) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format a percentage for display
 * @param value - The percentage value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string
 */
export function formatPercent(value: number, decimals: number = 2): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(decimals)}%`;
}
