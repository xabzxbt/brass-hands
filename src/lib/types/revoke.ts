import type { ChainId } from './index';

// Covalent API chain names mapping
export const COVALENT_CHAIN_NAMES: Record<ChainId, string> = {
	1: 'eth-mainnet',
	10: 'optimism-mainnet',
	56: 'bsc-mainnet',
	137: 'matic-mainnet',
	8453: 'base-mainnet',
	42161: 'arbitrum-mainnet'
} as const;

export type RiskLevel = 'LOW RISK' | 'CONSIDER REVOKING' | 'HIGH RISK';

export interface Spender {
	spenderAddress: `0x${string}`;
	spenderAddressLabel: string | null;
	allowance: string; // "UNLIMITED" or numeric string
	allowanceRaw: bigint;
	isUnlimited: boolean;
	valueAtRiskQuote: number;
	prettyValueAtRiskQuote: string;
	riskFactor: RiskLevel;
	blockHeight: number;
	blockSignedAt: string;
	txHash: string;
}

export interface TokenApproval {
	tokenAddress: `0x${string}`;
	tokenAddressLabel: string | null;
	tickerSymbol: string;
	contractDecimals: number;
	logoUrl: string | null;
	quoteRate: number;
	balance: bigint;
	balanceQuote: number;
	prettyBalanceQuote: string;
	valueAtRisk: bigint;
	valueAtRiskQuote: number;
	prettyValueAtRiskQuote: string;
	spenders: Spender[];
}

export interface NftApproval {
	contractAddress: `0x${string}`;
	contractName: string | null;
	logoUrl: string | null;
	isApprovedForAll: boolean;
	spenderAddress: `0x${string}`;
	spenderAddressLabel: string | null;
	tokenIds?: string[];
}

export interface ApprovalsResponse {
	address: string;
	chainId: ChainId;
	chainName: string;
	quoteCurrency: string;
	updatedAt: string;
	tokenApprovals: TokenApproval[];
	nftApprovals: NftApproval[];
	totalValueAtRiskQuote: number;
}

export interface RevokeItem {
	id: string; // unique identifier for UI
	type: 'ERC20' | 'NFT';
	chainId: ChainId;
	tokenAddress: `0x${string}`;
	tokenSymbol: string;
	tokenName: string | null;
	tokenLogoUrl: string | null;
	spenderAddress: `0x${string}`;
	spenderLabel: string | null;
	allowance: string;
	allowanceRaw: bigint;
	isUnlimited: boolean;
	valueAtRiskQuote: number;
	riskFactor: RiskLevel;
	selected: boolean;
}

export interface RevokeFilter {
	showUnlimited: boolean;
	showHighRisk: boolean;
	showLowValue: boolean;
	minValueAtRisk: number;
	selectedChains: ChainId[];
}

export type RevokeStatus =
	| 'IDLE'
	| 'SCANNING'
	| 'REVOKING'
	| 'COMPLETED'
	| 'FAILED';

export interface RevokeBatchResult {
	success: boolean;
	txHashes: `0x${string}`[];
	revokedCount: number;
	failedCount: number;
	errors: string[];
}
