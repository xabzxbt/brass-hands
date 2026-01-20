// Token Service for Brass Hands
import type { Token, ChainId, TokenFilter, HoldingsResponse } from '$lib/types';
import { DUST_CONFIG, TAX_TOKEN_BLOCKLIST, ROUTESCAN_API_KEY, API_ENDPOINTS, TOKEN_ADDRESSES } from '$lib/config/constants';
import { getBalance } from '@wagmi/core';
import { config } from '$lib/config/wagmi';
import { formatUnits, createPublicClient, http, erc20Abi, getAddress, isAddress } from 'viem';
import { mainnet, polygon, arbitrum, base, optimism, bsc } from 'viem/chains';
import { checkRouteAvailable } from './solverService';

const RELAY_API_BASE = 'https://api.relay.link';
const ETH_PLACEHOLDER = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'.toLowerCase();
const MAIN_THRESHOLD_USD = 0.01;
const TARGET_TOKEN_ADDRESSES = {
	1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
	8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
	42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
	137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC
	10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC
	56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC
};

// Transfer fee detection
const TRANSFER_FEE_FUNCTIONS = ['transferFee', 'transferFeeBps', 'transferFeeBP', 'transferFeeBasisPoints'];
const TRANSFER_FEE_ABI = TRANSFER_FEE_FUNCTIONS.map(name => ({
	name, type: 'function' as const, stateMutability: 'view' as const,
	inputs: [], outputs: [{ type: 'uint256' as const }],
}));

const KNOWN_TRANSFER_FEE_TOKENS: Record<number, Record<string, number>> = {
	8453: {
		'0xfb42da273158b0f642f59f2ba7cc1d5457481677': 125,
	},
};

// FIX: LRU-like cache with size limit to prevent memory leaks
const MAX_CACHE_SIZE = 1000;
const transferFeeCache = new Map<string, boolean>();
const relayPriceCache = new Map<string, { price: number | null; timestamp: number }>();
const RELAY_PRICE_CACHE_TTL = 5 * 60 * 1000;

// FIX: Cache cleanup function
function cleanupCache<K, V>(cache: Map<K, V>, maxSize: number): void {
	if (cache.size > maxSize) {
		const keysToDelete = Array.from(cache.keys()).slice(0, cache.size - maxSize);
		keysToDelete.forEach(key => cache.delete(key));
	}
}

const PUBLIC_RPC_URLS: Record<number, string[]> = {
	1: ['https://rpc.ankr.com/eth', 'https://eth.llamarpc.com'],
	8453: ['https://mainnet.base.org', 'https://base.llamarpc.com'],
	42161: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com'],
	137: ['https://polygon-rpc.com', 'https://rpc.ankr.com/polygon'],
	10: ['https://mainnet.optimism.io', 'https://optimism.llamarpc.com'],
	56: ['https://bsc-dataseed.binance.org', 'https://binance.llamarpc.com'],
};

const getViemChain = (chainId: number) => {
	switch (chainId) {
		case 1: return mainnet;
		case 8453: return base;
		case 42161: return arbitrum;
		case 137: return polygon;
		case 10: return optimism;
		case 56: return bsc;
		default: return mainnet;
	}
};

// FIX: Cache public clients to avoid creating new instances
const publicClientCache = new Map<number, ReturnType<typeof createPublicClient>>();

const getPublicClient = (chainId: number) => {
	if (publicClientCache.has(chainId)) {
		return publicClientCache.get(chainId)!;
	}
	
	const rpcUrl = PUBLIC_RPC_URLS[chainId]?.[0];
	if (!rpcUrl) throw new Error(`No RPC configured for chain ${chainId}`);
	
	const client = createPublicClient({
		chain: getViemChain(chainId) as any,
		transport: http(rpcUrl, { batch: true, timeout: 30_000 }),
		batch: { multicall: true },
	});
	
	publicClientCache.set(chainId, client);
	return client;
};

const getTokenLogoUrl = (chainId: number, tokenAddress: string): string => {
	if (!tokenAddress) return '';
	
	// FIX: Validate address before processing
	if (!isAddress(tokenAddress)) return '';
	
	const addr = tokenAddress.toLowerCase();
	if (addr === ETH_PLACEHOLDER) return 'https://assets.coingecko.com/coins/images/279/small/ethereum.png';
	
	// Dune Logo CDN (Primary)
	const duneSlug = getDuneNetworkSlug(chainId);
	if (duneSlug) {
		return `https://logos.dune.com/${duneSlug}/${addr}.png`;
	}

	// Fallback to TrustWallet
	try {
		const checksummed = getAddress(tokenAddress);
		const trustWalletUrl = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${getTrustWalletNetwork(chainId)}/assets/${checksummed}/logo.png`;
		return trustWalletUrl;
	} catch {
		return '';
	}
};

const getDuneNetworkSlug = (chainId: number): string | null => {
	switch (chainId) {
		case 1: return 'ethereum';
		case 10: return 'optimism';
		case 56: return 'bnb';
		case 137: return 'polygon';
		case 8453: return 'base';
		case 42161: return 'arbitrum';
		case 43114: return 'avalanche';
		default: return null;
	}
};

const getTrustWalletNetwork = (chainId: number): string => {
	switch (chainId) {
		case 1: return 'ethereum';
		case 137: return 'polygon';
		case 42161: return 'arbitrum';
		case 8453: return 'base';
		case 10: return 'optimism';
		case 56: return 'smartchain';
		default: return 'ethereum';
	}
};

export const detectTransferFeeToken = async (chainId: number, tokenAddress: string): Promise<boolean> => {
	// FIX: Better input validation
	if (!tokenAddress || !isAddress(tokenAddress)) return false;
	
	const normalizedAddress = tokenAddress.toLowerCase();
	if (normalizedAddress === '0x0000000000000000000000000000000000000000') return false;
	
	const cacheKey = `${chainId}-${normalizedAddress}`;
	if (transferFeeCache.has(cacheKey)) {
		return transferFeeCache.get(cacheKey)!;
	}

	const knownFee = KNOWN_TRANSFER_FEE_TOKENS[chainId]?.[normalizedAddress];
	if (knownFee !== undefined) {
		const isFee = knownFee > 0;
		transferFeeCache.set(cacheKey, isFee);
		cleanupCache(transferFeeCache, MAX_CACHE_SIZE);
		return isFee;
	}

	let isFee = false;
	try {
		const results = await getPublicClient(chainId).multicall({
			contracts: TRANSFER_FEE_FUNCTIONS.map(functionName => ({
				address: tokenAddress as `0x${string}`,
				abi: TRANSFER_FEE_ABI,
				functionName,
			})),
			allowFailure: true,
		});
		isFee = results.some(r => r.status === 'success' && r.result && BigInt(r.result as any) > 0n);
	} catch {
		// Silent fail
	}

	transferFeeCache.set(cacheKey, isFee);
	cleanupCache(transferFeeCache, MAX_CACHE_SIZE);
	return isFee;
};

export const detectTransferFeeTokensBatch = async (chainId: number, addresses: string[]): Promise<Map<string, boolean>> => {
	const results = new Map<string, boolean>();
	
	// FIX: Filter invalid addresses first
	const validAddresses = addresses.filter(addr => addr && isAddress(addr));
	
	const uncached = validAddresses.filter(addr => {
		const norm = addr.toLowerCase();
		if (norm === '0x0000000000000000000000000000000000000000') { 
			results.set(norm, false); 
			return false; 
		}
		const cacheKey = `${chainId}-${norm}`;
		if (transferFeeCache.has(cacheKey)) { 
			results.set(norm, transferFeeCache.get(cacheKey)!); 
			return false; 
		}
		const known = KNOWN_TRANSFER_FEE_TOKENS[chainId]?.[norm];
		if (known !== undefined) { 
			const isFee = known > 0; 
			transferFeeCache.set(cacheKey, isFee); 
			results.set(norm, isFee); 
			return false; 
		}
		return true;
	});

	if (uncached.length) {
		const client = getPublicClient(chainId);
		const contracts = uncached.flatMap(addr => 
			TRANSFER_FEE_FUNCTIONS.map(fn => ({ 
				address: addr as `0x${string}`, 
				abi: TRANSFER_FEE_ABI, 
				functionName: fn 
			}))
		);
		
		try {
			const res = await client.multicall({ contracts, allowFailure: true });
			uncached.forEach((addr, i) => {
				const isFee = res.slice(i * 4, (i + 1) * 4).some(r => 
					r.status === 'success' && r.result && BigInt(r.result as any) > 0n
				);
				const cacheKey = `${chainId}-${addr.toLowerCase()}`;
				transferFeeCache.set(cacheKey, isFee);
				results.set(addr.toLowerCase(), isFee);
			});
		} catch (error) {
			uncached.forEach(addr => results.set(addr.toLowerCase(), false));
		}
	}
	
	cleanupCache(transferFeeCache, MAX_CACHE_SIZE);
	return results;
};

const fetchRelayTokenPrice = async (chainId: number, tokenAddress: string): Promise<number | null> => {
	// Relay price calls are currently disabled to avoid 400 errors and console clutter.
	// We rely on RouteScan provided prices during the initial scan.
	return null;
};

const applyRelayPrices = async (holdings: Token[], chainId: number): Promise<Token[]> => {
	const updated = await Promise.all(
		holdings.map(async (token) => {
			const relayPrice = await fetchRelayTokenPrice(chainId, token.address);
			if (!relayPrice || relayPrice <= 0) {
				return token;
			}

			const decimals = token.decimals || 18;
			const amount = Number(formatUnits(token.balance, decimals));
			const valueUsd = amount * relayPrice;

			return {
				...token,
				priceUsd: relayPrice,
				valueUsd,
			};
		})
	);

	return updated.sort((a, b) => b.valueUsd - a.valueUsd);
};

const getRouteScanApiBase = (chainId: number): string => {
	return API_ENDPOINTS.ROUTESCAN;
};

const getRouteScanNetwork = (chainId: number): string => {
	switch (chainId) {
		case 1: return 'mainnet';
		case 137: return 'polygon';
		case 42161: return 'arbitrum';
		case 8453: return 'base';
		case 10: return 'optimism';
		case 56: return 'bsc';
		default: return 'mainnet';
	}
};

// FIX: Helper for safe fetch with timeout and abort
async function safeFetch(
	url: string, 
	options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
	const { timeout = 30000, ...fetchOptions } = options;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);
	
	try {
		const response = await fetch(url, {
			...fetchOptions,
			signal: controller.signal,
		});
		return response;
	} finally {
		clearTimeout(timeoutId);
	}
}

export async function fetchHoldings(
	address: string,
	chainId: ChainId
): Promise<HoldingsResponse> {
	// FIX: Validate address input
	if (!address || !isAddress(address)) {
		throw new Error('Invalid wallet address');
	}
	
	try {
		let allItems: any[] = [];
		let nextToken: string | null = null;
		const LIMIT = 100;
		const MAX_PAGES = 10;

		const apiBase = getRouteScanApiBase(chainId);
		const network = getRouteScanNetwork(chainId);
		const normalizedAddress = address.toLowerCase();
		const headers: Record<string, string> = { 'accept': 'application/json' };
		if (ROUTESCAN_API_KEY) headers['X-API-KEY'] = ROUTESCAN_API_KEY;

		// 1. Fetch from assets (Most comprehensive)
		const slugsToTry = [network, 'mainnet'];
		for (const slug of slugsToTry) {
			try {
				const assetsUrl = `${apiBase}/network/${slug}/evm/${chainId}/address/${normalizedAddress}/assets?limit=${LIMIT}`;
				const assetsRes = await safeFetch(assetsUrl, { headers, timeout: 15000 });
				if (assetsRes.ok) {
					const assetsData = await assetsRes.json();
					if (assetsData.items?.length) {
						// Filter out items that are not tokens (e.g. native)
						const items = assetsData.items.filter((i: any) => i.address && i.address.toLowerCase() !== ETH_PLACEHOLDER);
						allItems.push(...items);
						break;
					}
				}
			} catch (e) { 
				// Silent fail
			}
		}

		// Also try the dedicated /tokens endpoint if assets fails
		if (allItems.length === 0) {
			for (const slug of slugsToTry) {
				try {
					const tokensUrl = `${apiBase}/network/${slug}/evm/${chainId}/address/${normalizedAddress}/tokens?limit=${LIMIT}`;
					const tokensRes = await safeFetch(tokensUrl, { headers, timeout: 15000 });
					if (tokensRes.ok) {
						const tokensData = await tokensRes.json();
						if (tokensData.items?.length) {
							allItems.push(...tokensData.items);
							break;
						}
					}
				} catch {}
			}
		}

		// 2. Fetch from erc20-holdings
		const supportedHoldingsChains = [1, 10, 56, 137, 8453, 42161, 43114];
		if (supportedHoldingsChains.includes(chainId)) {
			for (const slug of slugsToTry) {
				let foundWithSlug = false;
				nextToken = null; // Reset for new slug
				for (let page = 0; page < MAX_PAGES; page++) {
					const existingTokens = new Set(allItems.map(i => (i.tokenAddress || i.contractAddress || i.address)?.toLowerCase()));
					let url = `${apiBase}/network/${slug}/evm/${chainId}/address/${normalizedAddress}/erc20-holdings?limit=${LIMIT}`;
					if (nextToken) url += `&next=${encodeURIComponent(nextToken)}`;

					try {
						const response = await safeFetch(url, { headers, timeout: 15000 });
						if (!response.ok) break;

						const data = await response.json();
						const newItems = (data.items || []).filter((i: any) => !existingTokens.has((i.tokenAddress || i.contractAddress || i.address)?.toLowerCase()));
						allItems.push(...newItems);
						foundWithSlug = true;
						nextToken = data.link?.nextToken;
						if (!nextToken) break;
					} catch {
						break;
					}
				}
				if (foundWithSlug) break;
			}
		}

		// 3. Fallback to Etherscan-like API for thorough token discovery (Transactions based)
		try {
			for (const slug of slugsToTry) {
				// Get ALL token transfers to find hidden tokens
				const txUrl = `${apiBase}/network/${slug}/evm/${chainId}/etherscan/api?module=account&action=tokentx&address=${normalizedAddress}&startblock=0&endblock=99999999&sort=desc&apikey=${ROUTESCAN_API_KEY || ''}`;
				const txRes = await safeFetch(txUrl, { timeout: 15000 });
				if (txRes.ok) {
					const txData = await txRes.json();
					if (txData.status === '1' && Array.isArray(txData.result)) {
						const txTokens = new Set<string>();
						txData.result.forEach((tx: any) => {
							if (tx.contractAddress) txTokens.add(tx.contractAddress.toLowerCase());
						});
						
						const existingTokens = new Set(allItems.map(i => (i.tokenAddress || i.contractAddress || i.address || '').toLowerCase()));
						
						for (const addr of txTokens) {
							if (addr && !existingTokens.has(addr)) {
								allItems.push({ tokenAddress: addr, tokenQuantity: '0', tokenSymbol: '', tokenDecimals: 0 });
							}
						}
						break;
					}
				}
			}
		} catch (e) { 
			// Silent fail
		}

		// 4. Force-add popular tokens for the chain to ensure they are checked
		const popular = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES] as Record<string, string>;
		if (popular) {
			const existingTokens = new Set(allItems.map(i => (i.tokenAddress || i.contractAddress || i.address)?.toLowerCase()));
			Object.values(popular).forEach(addr => {
				if (typeof addr === 'string' && !existingTokens.has(addr.toLowerCase())) {
					allItems.push({ tokenAddress: addr.toLowerCase(), tokenQuantity: '0' });
				}
			});
		}

		const filtered = allItems.filter(item => {
			const addr = item.tokenAddress || item.contractAddress || item.address;
			return addr && isAddress(addr);
		});

		if (!filtered.length) {
			const native = await fetchNativeBalance(address as `0x${string}`, chainId);
			const token = createNativeToken(chainId, native);
			return { address, chainId, tokens: [token], totalValueUsd: token.valueUsd, scannedAt: Date.now() };
		}

		const publicClient = getPublicClient(chainId);
		
		// FIX: Build metadata calls more safely
		const tokensNeedingMetadata: typeof filtered = [];
		const metadataCalls: any[] = [];
		
		filtered.forEach(item => {
			const addr = item.tokenAddress || item.contractAddress || item.address;
			if (!item.tokenSymbol || !item.tokenDecimals) {
				tokensNeedingMetadata.push(item);
				metadataCalls.push({ address: addr as `0x${string}`, abi: erc20Abi, functionName: 'symbol' });
				metadataCalls.push({ address: addr as `0x${string}`, abi: erc20Abi, functionName: 'name' });
				metadataCalls.push({ address: addr as `0x${string}`, abi: erc20Abi, functionName: 'decimals' });
			}
		});

		const metadataResults = metadataCalls.length 
			? await publicClient.multicall({ contracts: metadataCalls, allowFailure: true }).catch(() => []) 
			: [];
		
		// FIX: Map metadata results back to tokens correctly
		const metadataMap = new Map<string, { symbol: string; name: string; decimals: number }>();
		tokensNeedingMetadata.forEach((item, idx) => {
			const addr = (item.tokenAddress || item.contractAddress || item.address).toLowerCase();
			const baseIdx = idx * 3;
			metadataMap.set(addr, {
				symbol: (metadataResults[baseIdx]?.result as string) || 'UNKNOWN',
				name: (metadataResults[baseIdx + 1]?.result as string) || 'Unknown Token',
				decimals: Number(metadataResults[baseIdx + 2]?.result || 18),
			});
		});
		
		const enriched = filtered.map(item => {
			const tokenAddress = item.tokenAddress || item.contractAddress || item.address;
			const normalizedAddr = tokenAddress.toLowerCase();
			const metadata = metadataMap.get(normalizedAddr);
			
			const tokenSymbol = item.tokenSymbol || item.symbol || item.token_symbol || metadata?.symbol || 'UNKNOWN';
			const tokenName = item.tokenName || item.name || item.token_name || metadata?.name || tokenSymbol;
			const tokenDecimals = Number(item.tokenDecimals || item.decimals || item.token_decimals || metadata?.decimals || 18);

			// Anti-Spam Filtering Logic (Symbol/Name/Decimals checks)
			const spamPatterns = [/visit/i, /claim/i, /free/i, /gift/i, /reward/i, /voucher/i, /airdrop/i, /http/i, /\.com/i, /\.io/i, /\.net/i, /\.org/i, /www\./i];
			const isSpamPattern = spamPatterns.some(p => p.test(tokenName) || p.test(tokenSymbol)) || tokenSymbol.length > 12;
			const isInvalidDecimals = tokenDecimals === 0 || tokenDecimals > 30;

			return {
				...item,
				tokenAddress,
				tokenSymbol,
				tokenName,
				tokenDecimals,
				isSpamPattern,
				isInvalidDecimals
			};
		});

		// 3. Multicall balances in batches to avoid RPC limits
		const batchSize = 100;
		const balances: any[] = [];
		for (let i = 0; i < enriched.length; i += batchSize) {
			const batch = enriched.slice(i, i + batchSize);
			const results = await publicClient.multicall({
				contracts: batch.map(i => ({ 
					address: i.tokenAddress as `0x${string}`, 
					abi: erc20Abi, 
					functionName: 'balanceOf', 
					args: [address] 
				})),
				allowFailure: true,
			}).catch(() => batch.map(() => ({ status: 'failure' as const })));
			balances.push(...results);
		}

		const fees = await detectTransferFeeTokensBatch(chainId, enriched.map(i => i.tokenAddress));

		const targetToken = TARGET_TOKEN_ADDRESSES[chainId as keyof typeof TARGET_TOKEN_ADDRESSES] || ETH_PLACEHOLDER;

		const holdingsRaw = enriched.map((item, i) => {
			const onChain = balances[i];
			let balance = item.tokenQuantity || item.balance || item.token_quantity || '0';
			if (typeof balance === 'string' && balance.startsWith('0x')) balance = BigInt(balance).toString();
			const decimals = Number(item.tokenDecimals) || 18;
			
			if (onChain?.status === 'success' && onChain.result !== undefined) {
				balance = onChain.result.toString();
			}
			
			const price = item.tokenPrice || item.price || item.token_price || 0;
			const valUsd = item.tokenValueInUsd || item.valueUsd || item.value_usd || (Number(formatUnits(BigInt(balance), decimals)) * Number(price));

			return {
				...item,
				balance: BigInt(balance),
				decimals,
				priceUsd: Number(price),
				valueUsd: Number(valUsd),
				isTaxToken: fees.get(item.tokenAddress.toLowerCase()) || false,
			};
		}).filter(t => t.balance > 0n);

		// Parallel check for liquid routes for tokens that pass basic spam filter
		// FIX: Limit concurrent route checks to avoid rate limiting
		const CONCURRENT_ROUTE_CHECKS = 5;
		const liquidCheckResults: boolean[] = [];
		
		for (let i = 0; i < holdingsRaw.length; i += CONCURRENT_ROUTE_CHECKS) {
			const batch = holdingsRaw.slice(i, i + CONCURRENT_ROUTE_CHECKS);
			const batchResults = await Promise.all(
				batch.map(async (t) => {
					// Don't check route if it's already a clear spam or very low value
					if (t.isSpamPattern || t.isInvalidDecimals || t.valueUsd < 0.0001) {
						return false;
					}
					// Check route availability with the actual balance for accuracy
					return await checkRouteAvailable(chainId, t.tokenAddress, targetToken, address, t.decimals, t.balance);
				})
			);
			liquidCheckResults.push(...batchResults);
		}

		const verified = holdingsRaw.map((item, i): Token | null => {
			const isLiquid = liquidCheckResults[i];
			
			// Simplified Visibility Filter (Softest possible threshold)
			if (!item.tokenSymbol) return null;
			
			// Always show if usdValue is null/infinite or above threshold
			const hasValue = item.valueUsd != null && Number.isFinite(item.valueUsd);
			
			// Hide only absolute zero-value dust (<0.0001 USD)
			if (hasValue && item.valueUsd < 0.0001) return null;

			// FIX: Safely create checksummed address
			let checksummedAddress: `0x${string}`;
			try {
				checksummedAddress = getAddress(item.tokenAddress);
			} catch {
				return null; // Skip invalid addresses
			}

			return {
				address: checksummedAddress, 
				chainId,
				symbol: item.tokenSymbol, 
				name: item.tokenName || item.tokenSymbol, 
				decimals: item.decimals,
				logoUrl: getTokenLogoUrl(chainId, item.tokenAddress),
				balance: item.balance, 
				balanceFormatted: formatBalance(item.balance.toString(), item.decimals),
				priceUsd: item.priceUsd, 
				valueUsd: item.valueUsd,
				isTaxToken: item.isTaxToken,
				riskLevel: assessRiskLevel(item.tokenSymbol, item.valueUsd, item.isTaxToken),
				isLiquid: isLiquid !== false
			};
		}).filter((t): t is Token => t !== null);

		const nativeBalance = await fetchNativeBalance(address as `0x${string}`, chainId);
		const nativeToken = createNativeToken(chainId, nativeBalance);

		const all = [nativeToken, ...verified]
			.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));

		return { address, chainId, tokens: all, totalValueUsd: all.reduce((sum, t) => sum + t.valueUsd, 0), scannedAt: Date.now() };
	} catch (error) {
		throw error;
	}
}

async function fetchNativeBalance(
	address: `0x${string}`,
	chainId: ChainId
): Promise<{ balance: bigint; valueUsd: number }> {
	try {
		const result = await getBalance(config, { address, chainId });
		const nativeTokenPrice = await fetchRelayTokenPrice(chainId, ETH_PLACEHOLDER);
		const balanceInEth = Number(formatUnits(result.value, 18));
		const valueUsd = balanceInEth * (nativeTokenPrice || getNativeTokenPrice(chainId));

		return { balance: result.value, valueUsd };
	} catch {
		return { balance: 0n, valueUsd: 0 };
	}
}

function createNativeToken(chainId: ChainId, nativeResult: { balance: bigint; valueUsd: number }): Token {
	return {
		address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as `0x${string}`,
		chainId,
		symbol: getNativeSymbol(chainId),
		name: 'Native Token',
		decimals: 18,
		logoUrl: getNativeLogo(chainId),
		balance: nativeResult.balance,
		balanceFormatted: formatUnits(nativeResult.balance, 18),
		priceUsd: nativeResult.valueUsd > 0 && nativeResult.balance > 0n
			? nativeResult.valueUsd / Number(formatUnits(nativeResult.balance, 18))
			: 0,
		valueUsd: nativeResult.valueUsd,
		isTaxToken: false,
		riskLevel: 'LOW',
		// Native token is always liquid (it's the target)
		isLiquid: true,
	};
}

export function getNativeTokenPrice(chainId: ChainId): number {
	const prices: Record<ChainId, number> = {
		1: 3300,
		42161: 3300,
		8453: 3300,
		137: 0.45,
		10: 3300,
		56: 600
	};
	return prices[chainId] || 0;
}

export function getNativeSymbol(chainId: ChainId): string {
	switch (chainId) {
		case 137: return 'POL';
		case 56: return 'BNB';
		default: return 'ETH';
	}
}

function getNativeLogo(chainId: ChainId): string {
	switch (chainId) {
		case 137: return 'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png';
		case 56: return 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png';
		default: return 'https://assets.coingecko.com/coins/images/279/small/ethereum.png';
	}
}

function assessRiskLevel(symbol: string, valueUsd: number, isTaxToken: boolean): Token['riskLevel'] {
	if (isTaxToken) return 'HIGH';
	
	const upperSymbol = symbol.toUpperCase();
	if (['USDC', 'USDC.E', 'USDT', 'DAI', 'FRAX', 'USDT.E'].includes(upperSymbol)) return 'LOW';
	if (['WETH', 'ETH', 'WBTC', 'UNI', 'LINK', 'WSTETH', 'AAVE', 'WMATIC', 'MATIC', 'POL', 'WPOL'].includes(upperSymbol)) return 'LOW';
	if (valueUsd < 1) return 'MEDIUM';
	
	return 'MEDIUM';
}

function formatBalance(balance: string, decimals: number): string {
	if (!balance) return '0';
	try {
		const normalized = formatUnits(BigInt(balance), decimals);
		const num = Number(normalized);
		if (!Number.isFinite(num) || num === 0) return '0';
		if (num < 0.0001) return '<0.0001';
		if (num < 1) return num.toFixed(4);
		if (num < 1000) return num.toFixed(2);
		if (num < 1000000) return (num / 1000).toFixed(2) + 'K';
		return (num / 1000000).toFixed(2) + 'M';
	} catch {
		return '0';
	}
}

export function filterDustTokens(tokens: Token[], filter?: Partial<TokenFilter>): Token[] {
	const filterConfig: TokenFilter = {
		minValueUsd: filter?.minValueUsd ?? DUST_CONFIG.MIN_VALUE,
		maxValueUsd: filter?.maxValueUsd ?? DUST_CONFIG.MAX_VALUE,
		excludeTaxTokens: filter?.excludeTaxTokens ?? false,
		allowedRiskLevels: filter?.allowedRiskLevels ?? ['LOW', 'MEDIUM', 'HIGH']
	};

	return tokens.filter((token) => {
		const inValueRange =
			token.valueUsd >= filterConfig.minValueUsd && token.valueUsd <= filterConfig.maxValueUsd;
		if (!inValueRange) return false;

		if (filterConfig.excludeTaxTokens) {
			if (token.isTaxToken) return false;
			if (TAX_TOKEN_BLOCKLIST.has(token.address.toLowerCase())) return false;
		}

		if (!filterConfig.allowedRiskLevels.includes(token.riskLevel)) return false;

		return true;
	});
}

export function calculateTotalValue(tokens: Token[]): number {
	return tokens.reduce((sum, token) => sum + token.valueUsd, 0);
}

export function sortTokensByValue(tokens: Token[]): Token[] {
	return [...tokens].sort((a, b) => b.valueUsd - a.valueUsd);
}
