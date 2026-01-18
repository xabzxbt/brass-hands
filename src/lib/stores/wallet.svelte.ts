import type { ChainId } from '$lib/types';
import type { ExecutionStrategy } from '$lib/types';

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

	setConnected(address: `0x${string}`, chainId: number) {
		this.isConnected = true;
		this.address = address;
		this.chainId = chainId as ChainId;
		this.error = null;
	}

	setChainId(chainId: number) {
		this.chainId = chainId as ChainId;
	}

	setDisconnected() {
		this.isConnected = false;
		this.address = null;
		this.chainId = null;
		this.detectedStrategy = null;
		this.error = null;
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
