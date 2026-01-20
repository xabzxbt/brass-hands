/**
 * Revoke Store
 * State management for the Revoke tool using Svelte 5 runes
 */

import type { ChainId } from '$lib/types';
import type { 
	ApprovalsResponse, 
	TokenApproval, 
	RevokeItem, 
	RevokeFilter, 
	RevokeStatus,
	RevokeBatchResult
} from '$lib/types/revoke';
import { getAllApprovals, calculateTotalValueAtRisk } from '$lib/services/approvalScanService';
import { executeBatchRevoke, executeLegacyRevoke, executeSingleRevoke } from '$lib/services/revokeService';
import type { ExecutionStrategy } from '$lib/types';

// Initial filter state
const defaultFilter: RevokeFilter = {
	showUnlimited: true,
	showHighRisk: true,
	showLowValue: true,
	minValueAtRisk: 0,
	selectedChains: [1, 10, 56, 137, 8453, 42161]
};

// Svelte 5 reactive store
function createRevokeStore() {
	// State
	let status = $state<RevokeStatus>('IDLE');
	let approvalsData = $state<ApprovalsResponse[]>([]);
	let revokeItems = $state<RevokeItem[]>([]);
	let filter = $state<RevokeFilter>({ ...defaultFilter });
	let error = $state<string | null>(null);
	let lastScanTime = $state<number | null>(null);
	let currentProgress = $state<{ current: number; total: number } | null>(null);
	let executionResult = $state<RevokeBatchResult | null>(null);
	let strategy = $state<ExecutionStrategy>('LEGACY');

	// Computed values
	const selectedItems = $derived(revokeItems.filter(item => item.selected));
	
	const totalValueAtRisk = $derived(
		calculateTotalValueAtRisk(approvalsData)
	);

	const selectedValueAtRisk = $derived(
		selectedItems.reduce((sum, item) => sum + item.valueAtRiskQuote, 0)
	);

	const filteredItems = $derived(() => {
		return revokeItems.filter(item => {
			// Chain filter
			if (!filter.selectedChains.includes(item.chainId)) {
				return false;
			}

			// Unlimited filter
			if (filter.showUnlimited && !item.isUnlimited) {
				// If showUnlimited is enabled, we might want to show limited too
				// For now, show all
			}

			// High risk filter
			if (filter.showHighRisk && item.riskFactor !== 'HIGH RISK') {
				// Show high risk items if filter enabled
			}

			// Min value filter
			if (item.valueAtRiskQuote < filter.minValueAtRisk) {
				return false;
			}

			return true;
		});
	});

	const itemsByChain = $derived(() => {
		const grouped: Record<ChainId, RevokeItem[]> = {
			1: [],
			10: [],
			56: [],
			137: [],
			8453: [],
			42161: []
		};

		for (const item of revokeItems) {
			if (grouped[item.chainId]) {
				grouped[item.chainId].push(item);
			}
		}

		return grouped;
	});

	const chainStats = $derived(() => {
		return Object.entries(itemsByChain()).map(([chainId, items]) => ({
			chainId: Number(chainId) as ChainId,
			count: items.length,
			valueAtRisk: items.reduce((sum, item) => sum + item.valueAtRiskQuote, 0),
			unlimitedCount: items.filter(item => item.isUnlimited).length,
			highRiskCount: items.filter(item => item.riskFactor === 'HIGH RISK').length
		}));
	});

	// Actions
	async function scanApprovals(walletAddress: `0x${string}`, chainIds?: ChainId[]) {
		status = 'SCANNING';
		error = null;
		revokeItems = [];
		approvalsData = [];

		const chainsToScan = chainIds || filter.selectedChains;

		try {
			const results = await getAllApprovals(walletAddress, chainsToScan);
			approvalsData = results;

			// Transform to RevokeItems
			const items: RevokeItem[] = [];

			for (const response of results) {
				for (const approval of response.tokenApprovals) {
					for (const spender of approval.spenders) {
						items.push({
							id: `${response.chainId}-${approval.tokenAddress}-${spender.spenderAddress}`,
							type: 'ERC20',
							chainId: response.chainId,
							tokenAddress: approval.tokenAddress,
							tokenSymbol: approval.tickerSymbol,
							tokenName: approval.tokenAddressLabel,
							tokenLogoUrl: approval.logoUrl,
							spenderAddress: spender.spenderAddress,
							spenderLabel: spender.spenderAddressLabel,
							allowance: spender.allowance,
							allowanceRaw: spender.allowanceRaw,
							isUnlimited: spender.isUnlimited,
							valueAtRiskQuote: spender.valueAtRiskQuote,
							riskFactor: spender.riskFactor,
							selected: false
						});
					}
				}


				// Add NFT approvals
				for (const nftApproval of response.nftApprovals) {
					items.push({
						id: `${response.chainId}-${nftApproval.contractAddress}-${nftApproval.spenderAddress}-nft`,
						type: 'NFT',
						chainId: response.chainId,
						tokenAddress: nftApproval.contractAddress,
						tokenSymbol: nftApproval.contractName || 'NFT',
						tokenName: nftApproval.contractName,
						tokenLogoUrl: nftApproval.logoUrl,
						spenderAddress: nftApproval.spenderAddress,
						spenderLabel: nftApproval.spenderAddressLabel,
						allowance: nftApproval.isApprovedForAll ? 'ALL' : 'LIMITED',
						allowanceRaw: 0n,
						isUnlimited: nftApproval.isApprovedForAll,
						valueAtRiskQuote: 0, // NFT value calculation would need additional API
						riskFactor: nftApproval.isApprovedForAll ? 'HIGH RISK' : 'LOW RISK',
						selected: false
					});
				}
			}

			// Sort by value at risk (highest first)
			items.sort((a, b) => b.valueAtRiskQuote - a.valueAtRiskQuote);

			revokeItems = items;
			lastScanTime = Date.now();
			status = 'IDLE';

		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error';
			console.error('❌ Scan failed:', msg);
			error = msg;
			status = 'FAILED';
		}
	}

	function toggleItem(itemId: string) {
		revokeItems = revokeItems.map(item => 
			item.id === itemId ? { ...item, selected: !item.selected } : item
		);
	}

	function selectAll() {
		revokeItems = revokeItems.map(item => ({ ...item, selected: true }));
	}

	function selectNone() {
		revokeItems = revokeItems.map(item => ({ ...item, selected: false }));
	}

	function selectHighRisk() {
		revokeItems = revokeItems.map(item => ({
			...item,
			selected: item.riskFactor === 'HIGH RISK'
		}));
	}

	function selectUnlimited() {
		revokeItems = revokeItems.map(item => ({
			...item,
			selected: item.isUnlimited
		}));
	}

	function selectByChain(chainId: ChainId) {
		revokeItems = revokeItems.map(item => ({
			...item,
			selected: item.chainId === chainId
		}));
	}

	function setFilter(newFilter: Partial<RevokeFilter>) {
		filter = { ...filter, ...newFilter };
	}

	function setStrategy(newStrategy: ExecutionStrategy) {
		strategy = newStrategy;
	}

	async function executeRevoke(
		ownerAddress: `0x${string}`,
		chainId: ChainId
	) {
		const itemsToRevoke = selectedItems.filter(item => item.chainId === chainId);
		
		if (itemsToRevoke.length === 0) {
			error = 'No items selected for this chain';
			return;
		}

		status = 'REVOKING';
		error = null;
		executionResult = null;
		currentProgress = { current: 0, total: itemsToRevoke.length };

		try {
			let result: RevokeBatchResult;

			if (strategy === 'STANDARD_BATCH') {
				result = await executeBatchRevoke(
					itemsToRevoke, 
					ownerAddress, 
					chainId,
					(current, total) => {
						currentProgress = { current, total };
					}
				);
			} else {
				result = await executeLegacyRevoke(
					itemsToRevoke, 
					ownerAddress, 
					chainId,
					(current, total) => {
						currentProgress = { current, total };
					}
				);
			}

			executionResult = result;

			// Remove successfully revoked items from the list
			if (result.revokedCount > 0) {
				const revokedIds = new Set(itemsToRevoke.slice(0, result.revokedCount).map(i => i.id));
				revokeItems = revokeItems.filter(item => !revokedIds.has(item.id));
			}

			status = result.success ? 'COMPLETED' : 'FAILED';
			if (!result.success && result.errors.length > 0) {
				error = result.errors.join(' | ');
			}

		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error';
			error = msg;
			status = 'FAILED';
		} finally {
			currentProgress = null;
		}
	}

	async function revokeSingle(
		item: RevokeItem,
		ownerAddress: `0x${string}`
	) {
		status = 'REVOKING';
		error = null;

		try {
			const result = await executeSingleRevoke(item, ownerAddress, item.chainId);

			if (result.success) {
				// Remove from list
				revokeItems = revokeItems.filter(i => i.id !== item.id);
				status = 'COMPLETED';
			} else {
				error = result.error || 'Failed to revoke';
				status = 'FAILED';
			}

		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error';
			error = msg;
			status = 'FAILED';
		}
	}

	function reset() {
		status = 'IDLE';
		approvalsData = [];
		revokeItems = [];
		error = null;
		lastScanTime = null;
		currentProgress = null;
		executionResult = null;
	}

	return {
		// State getters
		get status() { return status; },
		get approvalsData() { return approvalsData; },
		get revokeItems() { return revokeItems; },
		get filter() { return filter; },
		get error() { return error; },
		get lastScanTime() { return lastScanTime; },
		get currentProgress() { return currentProgress; },
		get executionResult() { return executionResult; },
		get strategy() { return strategy; },

		// Computed getters
		get selectedItems() { return selectedItems; },
		get totalValueAtRisk() { return totalValueAtRisk; },
		get selectedValueAtRisk() { return selectedValueAtRisk; },
		get filteredItems() { return filteredItems(); },
		get itemsByChain() { return itemsByChain(); },
		get chainStats() { return chainStats(); },

		// Actions
		scanApprovals,
		toggleItem,
		selectAll,
		selectNone,
		selectHighRisk,
		selectUnlimited,
		selectByChain,
		setFilter,
		setStrategy,
		executeRevoke,
		revokeSingle,
		reset
	};
}

export const revokeStore = createRevokeStore();
