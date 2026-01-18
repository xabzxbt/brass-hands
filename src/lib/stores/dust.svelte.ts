import type { Token, ChainId, TokenSelection, ExecutionStrategy, QuoteResponse } from '$lib/types';
import { fetchHoldings, filterDustTokens, calculateTotalValue, getNativeSymbol } from '$lib/services/tokenService';
import { estimateGasCostUsd } from '$lib/services/gasService';
import { getMultipleQuotes, getMultiInputQuote, checkRouteAvailable } from '$lib/services/solverService';
import { walletStore } from './wallet.svelte';
import type { TargetToken } from '$lib/config/constants';
import { TOKEN_ADDRESSES, RELAY_API_KEY } from '$lib/config/constants';

class DustStore {
	isScanning = $state(false);
	isCheckingRoutes = $state(false);
	isQuoting = $state(false);
	scannedTokens = $state<Token[]>([]);
	filteredTokens = $state<Token[]>([]);
	selectedTokens = $state<Token[]>([]);
	targetToken = $state<TargetToken>('ETH');
	quotes = $state<QuoteResponse[]>([]);
	estimatedGasCost = $state(0);
	error = $state<string | null>(null);
	lastScanTime = $state<number | null>(null);

	totalValue = $derived(calculateTotalValue(this.selectedTokens));
	mainTokens = $derived(this.filteredTokens.filter(t => (t.valueUsd ?? 0) >= 0.01));
	lowValueTokens = $derived(this.filteredTokens.filter(t => (t.valueUsd ?? 0) < 0.01));
	totalOutput = $derived(this.quotes.reduce((sum, q) => sum + (q.outAmount || 0n), 0n));
	avgPriceImpact = $derived(
		this.quotes.length > 0 
			? this.quotes.reduce((sum, q) => sum + q.priceImpact, 0) / this.quotes.length 
			: 0
	);
	quoteError = $derived(this.quotes.find(q => !q.isLiquid)?.routeDescription || null);
	dustCount = $derived(this.filteredTokens.length);
	selectedCount = $derived(this.selectedTokens.length);
	hasSelection = $derived(this.selectedTokens.length > 0);

	async scan(address: string, chainId: ChainId) {
		this.isScanning = true;
		this.error = null;

		try {
			const holdings = await fetchHoldings(address, chainId);

			this.scannedTokens = holdings.tokens;
			this.filteredTokens = filterDustTokens(holdings.tokens);
			this.lastScanTime = holdings.scannedAt;
			this.selectedTokens = [];

			// REMOVED: Automatic route checking for all tokens.
			// Logic is now: User selects -> We check route for that selection.
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Failed to scan tokens';
			console.error('Scan error:', err);
		} finally {
			this.isScanning = false;
		}
	}

	async checkRoutesForTokens(chainId: ChainId, userAddress: string) {
		if (this.filteredTokens.length === 0) return;

		this.isCheckingRoutes = true;

		try {
			// Get destination token address
			const addresses = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES];
			let destToken: string;
			if (this.targetToken === 'ETH') {
				destToken = addresses?.WETH || '0x0000000000000000000000000000000000000000';
			} else {
				destToken = addresses?.[this.targetToken as keyof typeof addresses] || '0x0000000000000000000000000000000000000000';
			}

			// Adjust batch size and delay based on API key
			// Without API key: 50 req/min -> smaller batches, longer delays
			// With API key: 10 req/sec -> larger batches, shorter delays
			const hasApiKey = !!RELAY_API_KEY;
			const BATCH_SIZE = hasApiKey ? 5 : 2;
			const BATCH_DELAY = hasApiKey ? 500 : 2000;
			
			const tokens = this.filteredTokens.filter(t => !this.isTargetToken(t));
			
			for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
				const batch = tokens.slice(i, i + BATCH_SIZE);
				
				const results = await Promise.all(
					batch.map(token => 
						checkRouteAvailable(
							chainId,
							token.address,
							destToken,
							userAddress,
							token.decimals,
							token.balance
						)
					)
				);

				// Update token liquidity status
				batch.forEach((token, idx) => {
					this.updateTokenLiquidity(token.address, results[idx]);
				});

				// Delay between batches to respect rate limits
				if (i + BATCH_SIZE < tokens.length) {
					await new Promise(r => setTimeout(r, BATCH_DELAY));
				}
			}
		} catch (err) {
			console.error('Route check error:', err);
		} finally {
			this.isCheckingRoutes = false;
		}
	}

	setTargetToken(token: TargetToken) {
		this.targetToken = token;
		// Deselect the token if it matches the new target
		this.selectedTokens = this.selectedTokens.filter(t => !this.isTargetToken(t));
		
		// Re-check routes for new target
		if (walletStore.address && walletStore.chainId) {
			this.checkRoutesForTokens(walletStore.chainId as ChainId, walletStore.address);
		}
		
		this.updateQuotes();
	}

	isTargetToken(token: Token): boolean {
		const symbol = token.symbol.toUpperCase();
		if (this.targetToken === 'ETH') {
			const nativeSymbol = getNativeSymbol(walletStore.chainId || 1);
			return symbol === nativeSymbol || symbol === 'W' + nativeSymbol || symbol === 'WETH';
		}
		return symbol === this.targetToken;
	}

	toggleToken(token: Token) {
		if (this.isTargetToken(token)) return;

		const index = this.selectedTokens.findIndex((t) => t.address === token.address);

		if (index >= 0) {
			this.selectedTokens = this.selectedTokens.filter((_, i) => i !== index);
			// Reset liquidity status when deselected to clear labels
			this.updateTokenLiquidity(token.address, true);
		} else {
			this.selectedTokens = [...this.selectedTokens, token];
		}
		
		this.updateQuotes();
	}

	// Select a token directly (bypassing liquidity check, used after route switch)
	selectTokenDirectly(token: Token) {
		if (this.isTargetToken(token)) return;
		
		const isAlreadySelected = this.selectedTokens.some((t) => t.address === token.address);
		if (!isAlreadySelected) {
			// Get the fresh token from filtered list (with updated liquidity status)
			const freshToken = this.filteredTokens.find(t => t.address === token.address);
			if (freshToken) {
				this.selectedTokens = [...this.selectedTokens, freshToken];
				this.updateQuotes();
			}
		}
	}

	async updateQuotes() {
		// Only select tokens that are NOT the target token
		const tokensToQuote = this.selectedTokens.filter(
			t => !this.isTargetToken(t)
		);

		if (tokensToQuote.length === 0) {
			this.quotes = [];
			return;
		}

		if (!walletStore.address || !walletStore.chainId) return;

		this.isQuoting = true;
		try {
			const chainId = walletStore.chainId as ChainId;
			const addresses = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES];
			
			let outputToken: `0x${string}`;
			if (this.targetToken === 'ETH') {
				// Use native address, Relay handles wrapping/unwrapping automatically
				outputToken = '0x0000000000000000000000000000000000000000' as `0x${string}`;
			} else {
				outputToken = addresses?.[this.targetToken as keyof typeof addresses] as `0x${string}`;
			}

			if (!outputToken) throw new Error(`Target token ${this.targetToken} not supported on this chain`);

			const requests = tokensToQuote.map(token => ({
				tokenIn: token,
				tokenOut: outputToken,
				amountIn: (token.balance * 98n) / 100n,
				chainId,
				recipient: walletStore.address as `0x${string}`
			}));

			// Use multi-input quote for cross-chain batch results
			// For same-chain, individual quotes are more reliable and match batchbridge approach
			const isCrossChain = requests.some(r => r.chainId !== Number(chainId)); // This is always false currently as we scan one chain at a time
			
			// Actually, even for same-chain, let's try multi-input first, but if it's specifically same-chain, 
			// let's follow batchbridge and use individual quotes to avoid Relay's multi-input limitations.
			const useMultiInput = false; // Force individual quotes for now to match batchbridge same-chain behavior

			if (useMultiInput && requests.length > 1) {
				const batchQuote = await getMultiInputQuote(requests);
				if (batchQuote) {
					this.quotes = [batchQuote];
					return;
				}
			}

			this.quotes = await getMultipleQuotes(requests);
			
			// Update gas estimate after getting quotes
			if (walletStore.chainId && walletStore.detectedStrategy) {
				await this.updateGasEstimate(chainId, walletStore.detectedStrategy);
			}

			// Update liquidity status based on quote results
			this.quotes.forEach((quote, idx) => {
				if (quote.isLiquid === false) {
					this.updateTokenLiquidity(tokensToQuote[idx].address, false);
				}
			});
		} catch (err) {
			console.error('Failed to fetch quotes:', err);
		} finally {
			this.isQuoting = false;
		}
	}

	isSelected(token: Token): boolean {
		return this.selectedTokens.some((t) => t.address === token.address);
	}

	selectAll() {
		this.selectedTokens = this.filteredTokens.filter(
			(t) => !this.isTargetToken(t)
		);
		this.updateQuotes();
	}

	deselectAll() {
		this.selectedTokens = [];
		this.quotes = [];
		this.estimatedGasCost = 0;
	}

	async updateGasEstimate(chainId: ChainId, strategy: ExecutionStrategy) {
		if (this.selectedTokens.length === 0) {
			this.estimatedGasCost = 0;
			return;
		}

		this.estimatedGasCost = await estimateGasCostUsd(
			chainId,
			strategy,
			this.selectedTokens.length
		);
	}

	updateTokenLiquidity(address: `0x${string}`, isLiquid: boolean) {
		const update = (tokens: Token[]) =>
			tokens.map((t) => (t.address.toLowerCase() === address.toLowerCase() ? { ...t, isLiquid } : t));

		this.scannedTokens = update(this.scannedTokens);
		this.filteredTokens = update(this.filteredTokens);
		this.selectedTokens = update(this.selectedTokens);

		// REMOVED: Automatic filtering of selected tokens.
		// We keep the selection even if the route check fails, so the user can decide what to do.
	}

	reset() {
		this.isScanning = false;
		this.isCheckingRoutes = false;
		this.scannedTokens = [];
		this.filteredTokens = [];
		this.selectedTokens = [];
		this.quotes = [];
		this.error = null;
		this.lastScanTime = null;
	}
}

export const dustStore = new DustStore();
