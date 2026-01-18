import type { ChainId } from '$lib/types';
import type { ExecutionStrategy } from '$lib/types';

// FIX: Supported chain IDs for validation
const SUPPORTED_CHAIN_IDS: readonly ChainId[] = [1, 10, 56, 137, 8453, 42161] as const;

function isValidChainId(chainId: number): chainId is ChainId {
	return SUPPORTED_CHAIN_IDS.includes(chainId as ChainId);
}

class WalletStore {
	isConnected = $state(false);
	address = $state<`0x${string}` | null>(null);
	chainId = $state<ChainId | null>(null);
	isConnecting = $state(false);
	error = $state<string | null>(null);

	detectedStrategy = $state<ExecutionStrategy | null>(null);
	isDetectingStrategy = $state(false);

	shortAddress = $derived(
		this.address ? `${this.address.slice(0, 6)}...${this.address.slice(-4)}` : null
	);

	hasWallet = $derived(this.isConnected && this.address !== null);
	
	// FIX: Add derived state for valid connection
	isValidConnection = $derived(
		this.isConnected && 
		this.address !== null && 
		this.chainId !== null && 
		isValidChainId(this.chainId)
	);

	setConnected(address: `0x${string}`, chainId: number) {
		// FIX: Validate address format
		if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
			console.error('Invalid address format:', address);
			this.setError('Invalid wallet address format');
			return;
		}
		
		// FIX: Validate and warn about unsupported chains
		if (!isValidChainId(chainId)) {
			console.warn('Connected to unsupported chain:', chainId);
		}
		
		this.isConnected = true;
		this.address = address;
		this.chainId = isValidChainId(chainId) ? chainId : null;
		this.error = null;
		this.isConnecting = false;
	}

	setChainId(chainId: number) {
		// FIX: Validate chain ID
		if (isValidChainId(chainId)) {
			this.chainId = chainId;
			this.error = null;
		} else {
			console.warn('Switched to unsupported chain:', chainId);
			this.chainId = null;
			// Don't set error - just log warning
		}
	}

	setDisconnected() {
		this.isConnected = false;
		this.address = null;
		this.chainId = null;
		this.detectedStrategy = null;
		this.error = null;
		this.isConnecting = false;
		this.isDetectingStrategy = false;
	}

	setStrategy(strategy: ExecutionStrategy) {
		this.detectedStrategy = strategy;
	}

	setError(error: string) {
		this.error = error;
		console.error('⚠️ Wallet error:', error);
	}

	clearError() {
		this.error = null;
	}
	
	// FIX: Add method to check if chain is supported
	isChainSupported(chainId: number): boolean {
		return isValidChainId(chainId);
	}
	
	// FIX: Get list of supported chains
	getSupportedChains(): readonly ChainId[] {
		return SUPPORTED_CHAIN_IDS;
	}

	reset() {
		this.isConnected = false;
		this.address = null;
		this.chainId = null;
		this.isConnecting = false;
		this.error = null;
		this.detectedStrategy = null;
		this.isDetectingStrategy = false;
	}
}

export const walletStore = new WalletStore();
