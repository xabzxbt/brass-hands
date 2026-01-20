/**
 * Approval Scan Service
 * Uses Covalent GoldRush API to fetch token and NFT approvals
 */

import type { ChainId } from '$lib/types';
import type { 
	ApprovalsResponse, 
	TokenApproval, 
	NftApproval, 
	Spender,
	RiskLevel 
} from '$lib/types/revoke';
import { COVALENT_CHAIN_NAMES } from '$lib/types/revoke';

const COVALENT_API_KEY = import.meta.env.VITE_COVALENT_API_KEY || '';
const COVALENT_BASE_URL = 'https://api.covalenthq.com/v1';

// Rate limiting helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface CovalentSpender {
	block_height: number;
	tx_offset: number;
	log_offset: number;
	block_signed_at: string;
	tx_hash: string;
	spender_address: string;
	spender_address_label: string | null;
	allowance: string;
	allowance_quote: number | null;
	pretty_allowance_quote: string | null;
	value_at_risk: string;
	value_at_risk_quote: number;
	pretty_value_at_risk_quote: string;
	risk_factor: string;
}

interface CovalentTokenApproval {
	token_address: string;
	token_address_label: string | null;
	ticker_symbol: string;
	contract_decimals: number;
	logo_url: string | null;
	quote_rate: number;
	balance: string;
	balance_quote: number;
	pretty_balance_quote: string;
	value_at_risk: string;
	value_at_risk_quote: number;
	pretty_value_at_risk_quote: string;
	spenders: CovalentSpender[];
}

interface CovalentNftApproval {
	contract_address: string;
	contract_name: string | null;
	logo_url: string | null;
	contract_ticker_symbol: string | null;
	spenders: {
		spender_address: string;
		spender_address_label: string | null;
		allowance: string;
		token_balances: Array<{
			token_id: string;
		}> | null;
	}[];
}

interface CovalentApprovalsResponse {
	data: {
		address: string;
		updated_at: string;
		quote_currency: string;
		chain_id: number;
		chain_name: string;
		items: CovalentTokenApproval[];
	};
	error: boolean;
	error_message: string | null;
	error_code: number | null;
}

interface CovalentNftApprovalsResponse {
	data: {
		address: string;
		updated_at: string;
		chain_id: number;
		chain_name: string;
		items: CovalentNftApproval[];
	};
	error: boolean;
	error_message: string | null;
	error_code: number | null;
}

/**
 * Fetch token approvals for a wallet address on a specific chain
 */
export async function getTokenApprovals(
	walletAddress: `0x${string}`,
	chainId: ChainId
): Promise<TokenApproval[]> {
	const chainName = COVALENT_CHAIN_NAMES[chainId];
	
	if (!chainName) {
		console.warn(`⚠️ No Covalent chain name mapping for chain ID: ${chainId}`);
		return [];
	}

	// Use query parameter for authentication as it's more reliable with Covalent
	// Ensure address is lowercase for consistent API matching
	const addr = walletAddress.toLowerCase();
	const url = `${COVALENT_BASE_URL}/${chainName}/approvals/${addr}/?key=${COVALENT_API_KEY}`;

	try {
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`❌ Covalent API error (${response.status}):`, errorText);
			throw new Error(`Covalent API error: ${response.status} ${response.statusText}`);
		}

		const data: CovalentApprovalsResponse = await response.json();

		if (data.error) {
			throw new Error(data.error_message || 'Unknown Covalent API error');
		}

		const items = data.data?.items || [];
		return items.map(item => transformTokenApproval(item));
	} catch (error) {
		throw error;
	}
}

/**
 * Fetch NFT approvals for a wallet address on a specific chain
 */
export async function getNftApprovals(
	walletAddress: `0x${string}`,
	chainId: ChainId
): Promise<NftApproval[]> {
	const chainName = COVALENT_CHAIN_NAMES[chainId];
	
	if (!chainName) {
		return [];
	}

	// Use query parameter for authentication
	const addr = walletAddress.toLowerCase();
	const url = `${COVALENT_BASE_URL}/${chainName}/nft/approvals/${addr}/?key=${COVALENT_API_KEY}`;

	try {
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			// Silent fail for NFTs as they are secondary
			return [];
		}

		const data: CovalentNftApprovalsResponse = await response.json();

		if (data.error) {
			return [];
		}

		const items = data.data?.items || [];
		const nftApprovals: NftApproval[] = [];
		
		for (const item of items) {
			for (const spender of item.spenders) {
				nftApprovals.push({
					contractAddress: item.contract_address as `0x${string}`,
					contractName: item.contract_name,
					logoUrl: item.logo_url,
					isApprovedForAll: spender.allowance === 'UNLIMITED',
					spenderAddress: spender.spender_address as `0x${string}`,
					spenderAddressLabel: spender.spender_address_label,
					tokenIds: spender.token_balances?.map(t => t.token_id)
				});
			}
		}

		console.log(`✅ Found ${nftApprovals.length} NFT approvals on ${chainName}`);
		return nftApprovals;
	} catch (error) {
		// Silent fail for NFTs
		return [];
	}
}

/**
 * Fetch all approvals across multiple chains
 */
export async function getAllApprovals(
	walletAddress: `0x${string}`,
	chainIds: ChainId[]
): Promise<ApprovalsResponse[]> {
	const results: ApprovalsResponse[] = [];

	for (let i = 0; i < chainIds.length; i++) {
		const chainId = chainIds[i];
		
		// Rate limiting - wait between requests
		if (i > 0) {
			await delay(300);
		}

		try {
			const [tokenApprovals, nftApprovals] = await Promise.all([
				getTokenApprovals(walletAddress, chainId),
				getNftApprovals(walletAddress, chainId).catch(() => [] as NftApproval[])
			]);

			const totalValueAtRisk = tokenApprovals.reduce(
				(sum, t) => sum + t.valueAtRiskQuote, 
				0
			);

			results.push({
				address: walletAddress,
				chainId,
				chainName: COVALENT_CHAIN_NAMES[chainId],
				quoteCurrency: 'USD',
				updatedAt: new Date().toISOString(),
				tokenApprovals,
				nftApprovals,
				totalValueAtRiskQuote: totalValueAtRisk
			});
		} catch (error) {
			console.error(`Failed to fetch approvals for chain ${chainId}:`, error);
			// Continue with other chains even if one fails
			results.push({
				address: walletAddress,
				chainId,
				chainName: COVALENT_CHAIN_NAMES[chainId],
				quoteCurrency: 'USD',
				updatedAt: new Date().toISOString(),
				tokenApprovals: [],
				nftApprovals: [],
				totalValueAtRiskQuote: 0
			});
		}
	}

	return results;
}

/**
 * Transform Covalent API response to our internal format
 */
function transformTokenApproval(item: CovalentTokenApproval): TokenApproval {
	return {
		tokenAddress: item.token_address as `0x${string}`,
		tokenAddressLabel: item.token_address_label,
		tickerSymbol: item.ticker_symbol || 'UNKNOWN',
		contractDecimals: item.contract_decimals,
		logoUrl: item.logo_url,
		quoteRate: item.quote_rate || 0,
		balance: BigInt(item.balance || '0'),
		balanceQuote: item.balance_quote || 0,
		prettyBalanceQuote: item.pretty_balance_quote || '$0.00',
		valueAtRisk: BigInt(item.value_at_risk || '0'),
		valueAtRiskQuote: item.value_at_risk_quote || 0,
		prettyValueAtRiskQuote: item.pretty_value_at_risk_quote || '$0.00',
		spenders: item.spenders.map(s => transformSpender(s))
	};
}

function transformSpender(spender: CovalentSpender): Spender {
	const isUnlimited = spender.allowance === 'UNLIMITED' || 
		spender.allowance === '115792089237316195423570985008687907853269984665640564039457584007913129639935';
	
	let allowanceRaw: bigint;
	try {
		allowanceRaw = isUnlimited 
			? BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935')
			: BigInt(spender.allowance || '0');
	} catch {
		allowanceRaw = 0n;
	}

	return {
		spenderAddress: spender.spender_address as `0x${string}`,
		spenderAddressLabel: spender.spender_address_label,
		allowance: isUnlimited ? 'UNLIMITED' : spender.allowance,
		allowanceRaw,
		isUnlimited,
		valueAtRiskQuote: spender.value_at_risk_quote || 0,
		prettyValueAtRiskQuote: spender.pretty_value_at_risk_quote || '$0.00',
		riskFactor: normalizeRiskFactor(spender.risk_factor),
		blockHeight: spender.block_height,
		blockSignedAt: spender.block_signed_at,
		txHash: spender.tx_hash
	};
}

function normalizeRiskFactor(riskFactor: string): RiskLevel {
	const normalized = riskFactor?.toUpperCase() || '';
	
	if (normalized.includes('HIGH')) return 'HIGH RISK';
	if (normalized.includes('CONSIDER') || normalized.includes('MEDIUM')) return 'CONSIDER REVOKING';
	return 'LOW RISK';
}

/**
 * Get total value at risk across all chains
 */
export function calculateTotalValueAtRisk(responses: ApprovalsResponse[]): number {
	return responses.reduce((sum, r) => sum + r.totalValueAtRiskQuote, 0);
}

/**
 * Filter approvals by risk level
 */
export function filterByRisk(
	approvals: TokenApproval[], 
	minRisk: RiskLevel
): TokenApproval[] {
	const riskOrder: Record<RiskLevel, number> = {
		'LOW RISK': 0,
		'CONSIDER REVOKING': 1,
		'HIGH RISK': 2
	};

	const minRiskLevel = riskOrder[minRisk];

	return approvals.filter(approval => 
		approval.spenders.some(s => riskOrder[s.riskFactor] >= minRiskLevel)
	);
}

/**
 * Get only unlimited approvals
 */
export function getUnlimitedApprovals(approvals: TokenApproval[]): TokenApproval[] {
	return approvals.filter(approval => 
		approval.spenders.some(s => s.isUnlimited)
	);
}
