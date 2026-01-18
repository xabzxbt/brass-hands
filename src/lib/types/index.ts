export type ChainId = 1 | 10 | 56 | 137 | 8453 | 42161;

export interface Token {
  address: `0x${string}`;
  chainId: ChainId;
  name: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;

  balance: bigint;
  balanceFormatted: string;
  priceUsd: number;
  valueUsd: number;

  isTaxToken: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  isLiquid?: boolean;
}

export type ExecutionStrategy =
  | 'SMART_BATCH'
  | 'STANDARD_BATCH'
  | 'LEGACY';

export type BatchStatus =
  | 'IDLE'
  | 'SCANNING'
  | 'ANALYZING'
  | 'APPROVING'
  | 'SWAPPING'
  | 'COMPLETED'
  | 'SETTLED'
  | 'FAILED';

export interface SwapQuote {
  inAmount: bigint;
  outAmount: bigint;
  priceImpact: number;
  networkCostUsd: number;
  routeId: string;
  isLiquid?: boolean;
  routeDescription?: string;
  spender?: `0x${string}`;
}

export interface QuoteResponse extends SwapQuote {
	to: `0x${string}`;
	data: `0x${string}`;
	value: bigint;

	tokenIn: `0x${string}`;
	tokenOut: `0x${string}`;
	amountIn: bigint;
	amountOut: bigint;
	minAmountOut: bigint;
	slippagePercent: number;
}

export interface TokenFilter {
  minValueUsd: number;
  maxValueUsd: number;
  excludeTaxTokens: boolean;
  allowedRiskLevels: Array<Token['riskLevel']>;
}

export interface HoldingsResponse {
  address: string;
  chainId: ChainId;
  tokens: Token[];
  totalValueUsd: number;
  scannedAt: number;
}

export interface TokenSelection {
  token: Token;
  selected: boolean;
}

export interface AllowanceCheckResult {
	needsApproval: boolean;
	currentAllowance: bigint;
	requiredAmount: bigint;
	token: Token;
}
