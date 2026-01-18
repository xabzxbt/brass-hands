import type { Token, ChainId, SwapQuote, QuoteResponse } from '$lib/types';
import { RELAY_API_KEY, TOKEN_ADDRESSES, type TargetToken } from '$lib/config/constants';

const RELAY_API_BASE = 'https://api.relay.link';

// Native token addresses that Relay understands
const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';
const ETH_PLACEHOLDER = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'.toLowerCase();

export interface QuoteRequest {
	tokenIn: Token;
	tokenOut: `0x${string}`;
	amountIn: bigint;
	chainId: ChainId;
	recipient: `0x${string}`;
}

// Convert our internal token address to Relay-compatible address
function toRelayAddress(address: string): string {
	if (!address) return NATIVE_TOKEN_ADDRESS;
	const addr = address.toLowerCase();
	if (addr === ETH_PLACEHOLDER || addr === NATIVE_TOKEN_ADDRESS) {
		return NATIVE_TOKEN_ADDRESS;
	}
	return addr;
}

// Check if this is a native token (ETH)
function isNativeToken(address: string): boolean {
	const addr = address.toLowerCase();
	return addr === ETH_PLACEHOLDER || addr === NATIVE_TOKEN_ADDRESS || addr === '';
}

export async function getQuote(request: QuoteRequest): Promise<QuoteResponse> {
	const realQuote = await fetchRelayQuote(request);
	return realQuote || { ...createEmptyQuote(request), isLiquid: false };
}

export async function getMultiInputQuote(requests: QuoteRequest[]): Promise<QuoteResponse | null> {
	if (!requests.length) return null;
	const { chainId, recipient, tokenOut } = requests[0];
	
	try {
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (RELAY_API_KEY) headers['x-api-key'] = RELAY_API_KEY;

		const totalAmount = requests.reduce((sum, r) => sum + r.amountIn, 0n);

		const payload = {
			user: recipient.toLowerCase(),
			recipient: recipient.toLowerCase(),
			destinationChainId: Number(chainId),
			destinationCurrency: toRelayAddress(tokenOut),
			origins: requests.map(r => ({
				chainId: Number(chainId),
				currency: toRelayAddress(r.tokenIn.address),
				user: recipient.toLowerCase(),
				amount: r.amountIn.toString()
			})),
			tradeType: 'EXACT_INPUT',
			referrer: 'brass-hands',
			usePermit: false
		};

		console.log('🔄 Multi-Input Quote Request:', JSON.stringify(payload, null, 2));

		const response = await fetch(`${RELAY_API_BASE}/execute/swap/multi-input`, {
			method: 'POST',
			headers,
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			const errorBody = await response.json().catch(() => ({}));
			console.error('❌ Relay Multi-Input Quote Error:', response.status, errorBody, 'Payload:', JSON.stringify(payload));
			return { 
				...createEmptyQuote(requests[0]), 
				isLiquid: false, 
				routeDescription: errorBody?.message || `Multi-input failed (${response.status})`,
				inAmount: totalAmount
			};
		}

		const data: RelayResponse = await response.json();
		console.log('✅ Multi-Input Quote Response:', JSON.stringify(data, null, 2));

		// Extract transaction data from steps
		const txData = extractTransactionFromSteps(data.steps);
		if (!txData) {
			console.warn('⚠️ No transaction data found in multi-input response');
			return null;
		}

		const amountOut = BigInt(data.details?.currencyOut?.amount || '0');
		const priceImpact = parseFloat(data.details?.totalImpact?.percent || data.details?.swapImpact?.percent || '0');
		const gasEstimate = parseFloat(data.fees?.gas?.amountUsd || '0');

		return {
			inAmount: totalAmount,
			outAmount: amountOut,
			priceImpact,
			networkCostUsd: gasEstimate,
			routeId: data.steps?.[0]?.requestId || `relay-multi-${Date.now()}`,
			isLiquid: true,
			routeDescription: 'Relay Multi-Input',
			spender: txData.to,
			to: txData.to,
			data: txData.data,
			value: txData.value,
			tokenIn: requests[0].tokenIn.address,
			tokenOut,
			amountIn: requests[0].amountIn,
			amountOut,
			minAmountOut: amountOut,
			slippagePercent: 0.5
		};
	} catch (e) {
		console.error('❌ Relay Multi-Input Quote Failed:', e);
		return null;
	}
}

interface RelayStepItem {
	status?: string;
	data?: {
		from?: string;
		to?: `0x${string}`;
		data?: `0x${string}`;
		value?: string;
		chainId?: number;
		maxFeePerGas?: string;
		maxPriorityFeePerGas?: string;
		gas?: number;
	};
	spender?: `0x${string}`;
	check?: {
		endpoint?: string;
		method?: string;
	};
}

interface RelayStep {
	id: string;
	action?: string;
	description?: string;
	kind?: 'transaction' | 'signature';
	requestId?: string;
	items?: RelayStepItem[];
}

interface RelayResponse {
	steps: RelayStep[];
	requestId?: string;
	fees?: {
		gas?: {
			amount?: string;
			amountFormatted?: string;
			amountUsd?: string;
		};
		relayer?: {
			amountUsd?: string;
		};
	};
	details?: {
		currencyIn?: {
			amount?: string;
			amountUsd?: string;
		};
		currencyOut?: {
			amount?: string;
			amountUsd?: string;
		};
		totalImpact?: {
			percent?: string;
			usd?: string;
		};
		swapImpact?: {
			percent?: string;
		};
		operation?: string;
		timeEstimate?: number;
	};
}

// Extract transaction data from Relay steps
function extractTransactionFromSteps(steps: RelayStep[]): { to: `0x${string}`; data: `0x${string}`; value: bigint } | null {
	if (!steps || steps.length === 0) return null;

	// Look for a transaction step (deposit, swap, etc.)
	for (const step of steps) {
		if (step.kind === 'transaction' && step.items && step.items.length > 0) {
			const item = step.items[0];
			if (item.data && item.data.to && item.data.data) {
				return {
					to: item.data.to,
					data: item.data.data,
					value: BigInt(item.data.value || '0')
				};
			}
		}
	}

	// Fallback: look in any step that has transaction data
	for (const step of steps) {
		if (step.items && step.items.length > 0) {
			for (const item of step.items) {
				if (item.data && item.data.to && item.data.data) {
					return {
						to: item.data.to,
						data: item.data.data,
						value: BigInt(item.data.value || '0')
					};
				}
			}
		}
	}

	return null;
}

export const RELAY_ERROR_CODES = {
	AMOUNT_TOO_LOW: 'AMOUNT_TOO_LOW',
	INSUFFICIENT_LIQUIDITY: 'INSUFFICIENT_LIQUIDITY',
	NO_SWAP_ROUTES_FOUND: 'NO_SWAP_ROUTES_FOUND',
	SWAP_IMPACT_TOO_HIGH: 'SWAP_IMPACT_TOO_HIGH',
	UNSUPPORTED_CURRENCY: 'UNSUPPORTED_CURRENCY',
};

export const getRelayErrorMessage = (errorCode: string, fallbackMessage?: string) => {
	const messages: Record<string, string> = {
		[RELAY_ERROR_CODES.AMOUNT_TOO_LOW]: 'Amount is too low for this swap.',
		[RELAY_ERROR_CODES.INSUFFICIENT_LIQUIDITY]: 'Not enough liquidity available.',
		[RELAY_ERROR_CODES.NO_SWAP_ROUTES_FOUND]: 'No route found for this swap.',
		[RELAY_ERROR_CODES.SWAP_IMPACT_TOO_HIGH]: 'Price impact is too high.',
		[RELAY_ERROR_CODES.UNSUPPORTED_CURRENCY]: 'This token is not supported.',
	};
	return messages[errorCode] || fallbackMessage || (errorCode ? `Error: ${errorCode}` : 'No route found');
};

async function fetchRelayQuote(request: QuoteRequest): Promise<QuoteResponse | null> {
	try {
		const { tokenIn, tokenOut, amountIn, chainId, recipient } = request;
		if (amountIn <= 0n) return null;

		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (RELAY_API_KEY) headers['x-api-key'] = RELAY_API_KEY;

		// Check if we're swapping native token (ETH)
		const originCurrency = toRelayAddress(tokenIn.address);
		const destinationCurrency = toRelayAddress(tokenOut);

		const payload: Record<string, any> = {
			user: recipient.toLowerCase(),
			recipient: recipient.toLowerCase(),
			originChainId: Number(chainId),
			destinationChainId: Number(chainId),
			originCurrency,
			destinationCurrency,
			amount: amountIn.toString(),
			tradeType: 'EXACT_INPUT',
			referrer: 'brass-hands',
			usePermit: false
		};

		console.log('🔄 Quote Request:', JSON.stringify(payload, null, 2));

		const response = await fetch(`${RELAY_API_BASE}/quote`, {
			method: 'POST',
			headers,
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			if (response.status === 429) throw new Error('429');
			const errorData = await response.json().catch(() => ({}));
			const errorCode = errorData?.code || '';
			const message = getRelayErrorMessage(errorCode, errorData?.message);
			console.warn('⚠️ Relay Quote Error:', response.status, errorCode, message);
			return { ...createEmptyQuote(request), isLiquid: false, routeDescription: message };
		}

		const data: RelayResponse = await response.json();
		console.log('✅ Quote Response:', JSON.stringify(data, null, 2));

		// Extract transaction data from steps
		const txData = extractTransactionFromSteps(data.steps);
		if (!txData) {
			console.warn('⚠️ No transaction data in quote response');
			return { ...createEmptyQuote(request), isLiquid: false, routeDescription: 'No executable route' };
		}

		// Find approval step if exists
		const approvalStep = data.steps.find(s => s.id === 'approval');
		let spender = txData.to;
		
		if (approvalStep && approvalStep.items && approvalStep.items.length > 0) {
			const approvalItem = approvalStep.items[0];
			if (approvalItem.data?.to) {
				spender = approvalItem.data.to;
			}
		}

		const amountOut = BigInt(data.details?.currencyOut?.amount || '0');
		const priceImpact = parseFloat(data.details?.totalImpact?.percent || data.details?.swapImpact?.percent || '0');
		const gasEstimate = parseFloat(data.fees?.gas?.amountUsd || '0');

		// Determine route description
		let routeDescription = 'Relay';
		if (data.details?.operation) {
			routeDescription = data.details.operation.charAt(0).toUpperCase() + data.details.operation.slice(1);
		}

		return {
			inAmount: amountIn,
			outAmount: amountOut,
			priceImpact: Math.abs(priceImpact),
			networkCostUsd: gasEstimate,
			routeId: data.steps?.[0]?.requestId || `relay-${Date.now()}`,
			isLiquid: true,
			routeDescription,
			spender,
			to: txData.to,
			data: txData.data,
			value: txData.value,
			tokenIn: tokenIn.address,
			tokenOut,
			amountIn,
			amountOut,
			minAmountOut: amountOut,
			slippagePercent: 0.5
		};
	} catch (error) {
		if (error instanceof Error && error.message === '429') throw error;
		console.error('❌ Quote fetch failed:', error);
		return { 
			...createEmptyQuote(request), 
			isLiquid: false, 
			routeDescription: error instanceof Error ? error.message : 'Connection failed' 
		};
	}
}

function createEmptyQuote(request: QuoteRequest): QuoteResponse {
	const { tokenIn, tokenOut, amountIn } = request;

	return {
		inAmount: amountIn,
		outAmount: 0n,
		priceImpact: 0,
		networkCostUsd: 0,
		routeId: 'none',
		isLiquid: false,
		routeDescription: 'No route found',
		spender: '0x0000000000000000000000000000000000000000' as `0x${string}`,

		to: '0x0000000000000000000000000000000000000000' as `0x${string}`,
		data: '0x' as `0x${string}`,
		value: 0n,

		tokenIn: tokenIn.address,
		tokenOut,
		amountIn,
		amountOut: 0n,
		minAmountOut: 0n,
		slippagePercent: 0
	};
}

export async function getMultipleQuotes(requests: QuoteRequest[]): Promise<QuoteResponse[]> {
	if (RELAY_API_KEY) {
		// With API key, we can parallelize more aggressively (10 req/sec)
		const results = await Promise.all(requests.map(req => getQuote(req)));
		return results;
	}

	const results: QuoteResponse[] = [];
	const delay = 1500; // No API key, be very conservative
	
	for (const req of requests) {
		results.push(await getQuote(req));
		if (requests.indexOf(req) < requests.length - 1) await new Promise(r => setTimeout(r, delay));
	}
	return results;
}

// Check if a route is available for a token (lighter weight than full quote)
export async function checkRouteAvailable(
	chainId: number,
	tokenAddress: string,
	destinationCurrency: string,
	userAddress: string,
	decimals: number = 18,
	amount?: bigint
): Promise<boolean> {
	try {
		// Use provided amount or a small test amount
		const testAmount = amount 
			? amount.toString() 
			: (BigInt(10) ** BigInt(Math.max(decimals - 1, 0))).toString();

		const headers: Record<string, string> = {
			'Content-Type': 'application/json'
		};
		if (RELAY_API_KEY) {
			headers['x-api-key'] = RELAY_API_KEY;
		}

		const payload = {
			user: userAddress.toLowerCase(),
			originChainId: Number(chainId),
			destinationChainId: Number(chainId),
			originCurrency: toRelayAddress(tokenAddress),
			destinationCurrency: toRelayAddress(destinationCurrency),
			amount: testAmount,
			tradeType: 'EXACT_INPUT',
			referrer: 'brass-hands',
			usePermit: false
		};

		const response = await fetch(`${RELAY_API_BASE}/quote`, {
			method: 'POST',
			headers,
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			return false;
		}

		const data = await response.json();
		return data.steps && data.steps.length > 0;
	} catch {
		return false;
	}
}

export function calculatePriceImpact(
	amountIn: bigint,
	amountOut: bigint,
	priceIn: number,
	priceOut: number
): number {
	const inValue = Number(amountIn) * priceIn;
	const outValue = Number(amountOut) * priceOut;

	const impact = ((inValue - outValue) / inValue) * 100;

	return Math.max(0, impact);
}

export function validateQuote(quote: QuoteResponse): void {
	if (quote.isLiquid === false) {
		throw new Error(`🛑 EXECUTION BLOCKED: Insufficient liquidity for this token.`);
	}

	if (quote.priceImpact > 15) {
		throw new Error(
			`🛑 EXECUTION BLOCKED: Price impact too high (${quote.priceImpact.toFixed(2)}%). ` +
				`Maximum allowed is 15%. Consider splitting the swap or trying later.`
		);
	}

	if (quote.priceImpact > 5) {
		console.warn(
			`⚠️ WARNING: High price impact (${quote.priceImpact.toFixed(2)}%). ` +
				`You may receive less than expected.`
		);
	}

	if (quote.amountOut === 0n) {
		throw new Error(
			`🛑 EXECUTION BLOCKED: Quote returned zero output amount. ` +
				`The swap would result in no tokens received.`
		);
	}
}

// Route alternative interface for no-liquidity tokens
export interface RouteAlternative {
	targetToken: TargetToken;
	estimatedOutput: bigint;
	estimatedOutputUsd: number;
	priceImpact: number;
	routeDescription: string;
	isAvailable: boolean;
}

// Check alternative routes for tokens with no liquidity on the current target
export async function checkAlternativeRoutes(
	chainId: number,
	tokenAddress: string,
	userAddress: string,
	decimals: number = 18,
	balance: bigint
): Promise<RouteAlternative[]> {
	const alternatives: RouteAlternative[] = [];
	const addresses = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES];

	if (!addresses) return alternatives;

	// Target tokens to check
	const targetTokens: { token: TargetToken; address: string }[] = [
		{ token: 'ETH' as TargetToken, address: NATIVE_TOKEN_ADDRESS },
		{ token: 'USDC' as TargetToken, address: addresses.USDC },
		{ token: 'DAI' as TargetToken, address: addresses.DAI }
	].filter(t => t.address);

	// Use 98% of balance like normal swaps
	const testAmount = (balance * 98n) / 100n;

	if (testAmount <= 0n) return alternatives;

	// Adjust delay based on API key availability
	const hasApiKey = !!RELAY_API_KEY;
	const REQUEST_DELAY = hasApiKey ? 150 : 1500;

	// Check each target sequentially to avoid rate limits
	for (let index = 0; index < targetTokens.length; index++) {
		const { token, address } = targetTokens[index];
		
		// Add delay between requests
		if (index > 0) {
			await new Promise(r => setTimeout(r, REQUEST_DELAY));
		}

		try {
			const quote = await fetchQuoteWithRetry({
				tokenIn: {
					address: tokenAddress as `0x${string}`,
					chainId: chainId as ChainId,
					decimals,
					symbol: '',
					name: '',
					balance: testAmount,
					balanceFormatted: '',
					priceUsd: 0,
					valueUsd: 0,
					isTaxToken: false,
					riskLevel: 'LOW' as const
				},
				tokenOut: address as `0x${string}`,
				amountIn: testAmount,
				chainId: chainId as ChainId,
				recipient: userAddress as `0x${string}`
			});

			if (quote && quote.isLiquid !== false && quote.amountOut > 0n) {
				alternatives.push({
					targetToken: token,
					estimatedOutput: quote.amountOut,
					estimatedOutputUsd: Number(quote.amountOut) * (quote.networkCostUsd / Number(testAmount) || 0.001),
					priceImpact: quote.priceImpact,
					routeDescription: quote.routeDescription || 'Relay Solver',
					isAvailable: true
				});
			}
		} catch {
			// Skip failed quotes
		}
	}

	return alternatives;
}

// Fetch quote with exponential backoff retry for rate limits
async function fetchQuoteWithRetry(
	request: QuoteRequest,
	maxRetries: number = 3
): Promise<QuoteResponse | null> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			const result = await fetchRelayQuote(request);
			return result;
		} catch (error: any) {
			lastError = error;

			// Check for rate limit error (429)
			if (error?.message?.includes('429') || error?.message?.includes('rate limit')) {
				const delay = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s
				console.warn(`⚠️ Rate limited, retrying in ${delay}ms...`);
				await new Promise(r => setTimeout(r, delay));
				continue;
			}

			// For other errors, don't retry
			break;
		}
	}

	if (lastError) {
		console.error('❌ Quote fetch failed after retries:', lastError);
	}
	return null;
}
