<script lang="ts">
	import { revokeStore } from '$lib/stores/revoke.svelte';
	import { walletStore } from '$lib/stores/wallet.svelte';
	import { detectStrategy } from '$lib/services/executionService';
	import type { ChainId } from '$lib/types';
	import type { RevokeItem } from '$lib/types/revoke';
	import { COVALENT_CHAIN_NAMES } from '$lib/types/revoke';
	import { config, modal } from '$lib/config/wagmi';
	import { switchChain } from '@wagmi/core';

	// Chain info for display
	const CHAIN_INFO: Record<ChainId, { name: string; color: string }> = {
		1: { name: 'Ethereum', color: '#627EEA' },
		10: { name: 'Optimism', color: '#FF0420' },
		56: { name: 'BNB Chain', color: '#F0B90B' },
		137: { name: 'Polygon', color: '#8247E5' },
		8453: { name: 'Base', color: '#0052FF' },
		42161: { name: 'Arbitrum', color: '#28A0F0' }
	};

	// Reactive state
	let selectedChainForRevoke = $state<ChainId | null>(null);
	let showConfirmModal = $state(false);
	let failedLogos = $state<Record<string, boolean>>({});

	// Computed
	const isConnected = $derived(walletStore.isConnected);
	const address = $derived(walletStore.address);
	const chainId = $derived(walletStore.chainId as ChainId);

	// Detect strategy on connect
	$effect(() => {
		if (address && chainId) {
			detectStrategy(address, chainId).then((detectedStrategy) => {
				// Sync the detected strategy to revoke store
				revokeStore.setStrategy(detectedStrategy);
				console.log('🔧 Revoke strategy set to:', detectedStrategy);
			});
		}
	});

	// Actions
	async function handleScan() {
		if (!address) return;
		await revokeStore.scanApprovals(address);
	}

	function handleSelectItem(itemId: string) {
		revokeStore.toggleItem(itemId);
	}

	function handleSelectAll() {
		revokeStore.selectAll();
	}

	function handleSelectNone() {
		revokeStore.selectNone();
	}

	function handleSelectHighRisk() {
		revokeStore.selectHighRisk();
	}

	function handleSelectUnlimited() {
		revokeStore.selectUnlimited();
	}

	function handleConnect() {
		modal.open();
	}

	function openRevokeModal(chain: ChainId) {
		selectedChainForRevoke = chain;
		showConfirmModal = true;
	}

	async function confirmRevoke() {
		if (!address || !selectedChainForRevoke) return;
		showConfirmModal = false;
		
		// Switch to the correct chain if needed
		if (chainId !== selectedChainForRevoke) {
			try {
				console.log(`🔄 Switching from chain ${chainId} to ${selectedChainForRevoke}`);
				await switchChain(config, { chainId: selectedChainForRevoke });
				// Wait a bit for the chain switch to complete
				await new Promise(resolve => setTimeout(resolve, 1000));
			} catch (error) {
				console.error('Failed to switch chain:', error);
				alert(`Please switch your wallet to ${CHAIN_INFO[selectedChainForRevoke].name} to revoke approvals on that network.`);
				return;
			}
		}
		
		await revokeStore.executeRevoke(address, selectedChainForRevoke);
	}

	async function handleSingleRevoke(item: RevokeItem) {
		if (!address) return;
		
		// Switch to the correct chain if needed
		if (chainId !== item.chainId) {
			try {
				console.log(`🔄 Switching from chain ${chainId} to ${item.chainId}`);
				await switchChain(config, { chainId: item.chainId });
				// Wait a bit for the chain switch to complete
				await new Promise(resolve => setTimeout(resolve, 1000));
			} catch (error) {
				console.error('Failed to switch chain:', error);
				alert(`Please switch your wallet to ${CHAIN_INFO[item.chainId].name} to revoke this approval.`);
				return;
			}
		}
		
		await revokeStore.revokeSingle(item, address);
	}

	function formatAddress(addr: string): string {
		return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
	}

	function formatValue(value: number): string {
		if (value < 0.01) return '<$0.01';
		if (value < 1) return `$${value.toFixed(2)}`;
		if (value < 1000) return `$${value.toFixed(2)}`;
		if (value < 1000000) return `$${(value / 1000).toFixed(1)}K`;
		return `$${(value / 1000000).toFixed(1)}M`;
	}

	function getRiskColor(risk: string): string {
		if (risk === 'HIGH RISK') return 'text-red-600 bg-red-50';
		if (risk === 'CONSIDER REVOKING') return 'text-yellow-600 bg-yellow-50';
		return 'text-green-600 bg-green-50';
	}

	function getTokenLogoUrl(item: RevokeItem): string {
		// First try Covalent logo URL from API response
		if (item.tokenLogoUrl) {
			return item.tokenLogoUrl;
		}
		
		// Fallback to Dune CDN
		if (!item.tokenAddress) return '';
		const addr = item.tokenAddress.toLowerCase();
		
		const duneSlug = getDuneNetworkSlug(item.chainId);
		if (duneSlug) {
			return `https://logos.dune.com/${duneSlug}/${addr}.png`;
		}
		
		return '';
	}

	function getDuneNetworkSlug(chainId: ChainId): string | null {
		switch (chainId) {
			case 1: return 'ethereum';
			case 10: return 'optimism';
			case 56: return 'bnb';
			case 137: return 'polygon';
			case 8453: return 'base';
			case 42161: return 'arbitrum';
			default: return null;
		}
	}
</script>

<svelte:head>
	<title>Revoke Approvals | Brass Hands</title>
</svelte:head>

{#if !isConnected}
	<div class="w-full max-w-6xl mx-auto flex flex-col items-center px-4 pb-20 mt-10">
		<!-- Not Connected State -->
		<div class="relative w-full h-full flex flex-col items-center justify-center overflow-hidden min-h-[80vh]">
			<!-- Decorative Background Elements -->
			<div class="absolute top-10 left-10 w-32 h-32 border-4 border-black rotate-12 opacity-10 select-none pointer-events-none"></div>
			<div class="absolute bottom-20 left-20 w-48 h-48 border-4 border-black -rotate-12 opacity-10 select-none pointer-events-none"></div>
			<div class="absolute top-1/4 right-1/4 w-12 h-12 bg-brutal-primary border-4 border-black rotate-45 opacity-20 select-none pointer-events-none"></div>
			<div class="absolute -bottom-10 right-1/3 w-64 h-12 bg-black opacity-5 rotate-3 select-none pointer-events-none"></div>

			<div class="flex flex-col items-center justify-center text-center animate-fade-in w-full z-10">
				<h1 class="text-[6rem] font-black uppercase tracking-tight mb-2 text-black leading-none text-center">
					REVOKE
				</h1>
				<p class="text-xl font-bold text-gray-400 mb-16 uppercase tracking-widest">
					Protect your assets from malicious approvals
				</p>
				
				<button 
					onclick={handleConnect}
					class="bg-black text-white text-xl font-bold uppercase px-16 py-6 border-2 border-black shadow-[8px_8px_0px_0px_rgba(255,87,34,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all mb-20 hover:bg-[#111]"
				>
					CONNECT WALLET
				</button>
			</div>
		</div>
	</div>
{:else}
	<div class="w-full max-w-6xl mx-auto flex flex-col items-center px-4 pb-20 mt-10">
		<div class="w-full flex flex-col gap-10 animate-fade-in relative">
			<div class="flex flex-col lg:flex-row gap-8 w-full items-start">
			<!-- MAIN WINDOW: APPROVALS LIST -->
			<div class="flex-1 w-full bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col min-h-[500px] relative overflow-hidden">
				{#if revokeStore.status === 'SCANNING'}
					<div class="absolute inset-0 bg-black/5 pointer-events-none z-10 overflow-hidden">
						<div class="absolute w-full h-[2px] bg-brutal-primary shadow-[0_0_15px_rgba(255,87,34,0.5)] animate-[scan_2s_linear_infinite]"></div>
					</div>
				{/if}

				<div class="p-6 border-b-2 border-black flex justify-between items-center bg-gray-50">
					<div class="flex-1 min-w-0 pr-4">
						<h2 class="font-black uppercase tracking-tight text-xl leading-none text-black">TOKEN APPROVALS</h2>
						<p class="text-[10px] font-bold text-gray-400 mt-1 uppercase">Review and revoke permissions</p>
					</div>
										
					<div class="flex gap-2 flex-shrink-0">
						<button 
							onclick={handleSelectAll}
							class="px-3 py-1.5 border-2 border-black text-[10px] font-bold uppercase hover:bg-white transition-all bg-gray-100 whitespace-nowrap shadow-[2px_2px_0px_0px_rgba(255,87,34,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
						>
							Select All
						</button>
						<button 
							onclick={handleSelectNone}
							class="px-3 py-1.5 border-2 border-black text-[10px] font-bold uppercase hover:bg-white transition-all bg-gray-100 whitespace-nowrap shadow-[2px_2px_0px_0px_rgba(255,87,34,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
						>
							Clear All
						</button>
					</div>
				</div>

				<div class="flex-grow overflow-y-auto max-h-[600px] p-6">
					{#if revokeStore.status === 'SCANNING'}
						<div class="flex flex-col items-center justify-center py-20 gap-4">
							<div class="w-12 h-12 border-4 border-brutal-primary border-t-transparent animate-spin"></div>
							<span class="text-xs font-bold uppercase tracking-[0.3em] animate-pulse">Scanning approvals...</span>
						</div>
					{:else if revokeStore.revokeItems.length === 0 && revokeStore.lastScanTime}
						<div class="flex flex-col items-center justify-center py-20 text-center gap-4">
							<p class="text-sm font-bold text-gray-400 uppercase tracking-widest">No active approvals found</p>
						</div>
					{:else if revokeStore.revokeItems.length === 0}
						<div class="flex flex-col items-center justify-center py-20 text-center gap-4">
							<p class="text-sm font-bold text-gray-400 uppercase tracking-widest">Click "Scan" to check approvals</p>
						</div>
					{:else}
						<div class="space-y-4">
							{#each revokeStore.chainStats as chain}
								{#if chain.count > 0}
									<div class="border-2 border-black bg-gray-50">
										<!-- Chain Header -->
										<div class="flex items-center justify-between p-3 border-b-2 border-black bg-white">
											<div class="flex items-center gap-2">
												<div 
													class="w-3 h-3 border-2 border-black"
													style="background-color: {CHAIN_INFO[chain.chainId].color}"
												></div>
												<span class="font-black uppercase text-sm">{CHAIN_INFO[chain.chainId].name}</span>
												<span class="text-gray-400 font-bold text-[10px]">({chain.count})</span>
											</div>
											<span class="text-[10px] font-bold text-brutal-primary">{formatValue(chain.valueAtRisk)} AT RISK</span>
										</div>

										<!-- Approvals -->
										<div class="divide-y-2 divide-black/10">
											{#each revokeStore.itemsByChain[chain.chainId] as item}
												<div class="flex items-center gap-3 p-3 hover:bg-white transition-colors">
													<input
														type="checkbox"
														checked={item.selected}
														onchange={() => handleSelectItem(item.id)}
														class="w-4 h-4 border-2 border-black bg-white accent-brutal-primary"
													/>
											
													<!-- Token -->
													<div class="flex items-center gap-2 min-w-[100px]">
														{#if getTokenLogoUrl(item) && !failedLogos[item.id]}
															<img 
																src={getTokenLogoUrl(item)} 
																alt={item.tokenSymbol}
																class="w-6 h-6 border border-black rounded-sm"
																onerror={() => failedLogos[item.id] = true}
															/>
														{:else}
															<div class="w-6 h-6 border border-black bg-gray-100 flex items-center justify-center text-[10px] font-bold">
																{item.tokenSymbol.slice(0, 1)}
															</div>
														{/if}
														<span class="font-bold text-xs uppercase">{item.tokenSymbol}</span>
													</div>
											
													<!-- Spender -->
													<div class="flex-1">
														<div class="text-xs font-bold">{item.spenderLabel || formatAddress(item.spenderAddress)}</div>
														<div class="text-[9px] text-gray-400 font-mono">{formatAddress(item.spenderAddress)}</div>
													</div>
											
													<!-- Risk -->
													<span class="px-2 py-0.5 border border-black text-[9px] font-black uppercase {getRiskColor(item.riskFactor)}">
														{#if item.riskFactor === 'HIGH RISK'}
															HIGH
														{:else if item.riskFactor === 'CONSIDER REVOKING'}
															WARN
														{:else}
															✓
														{/if}
													</span>
											
													<!-- Value -->
													<span class="text-xs font-black text-brutal-primary min-w-[60px] text-right">
														{formatValue(item.valueAtRiskQuote)}
													</span>
												</div>
											{/each}
										</div>
									</div>
								{/if}
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- SIDEBAR: ACTIONS & STATS -->
			<div class="w-full lg:w-[350px] flex flex-col gap-6 sticky top-24">
				<!-- Stats Card -->
				<div class="bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col relative">
					<div class="p-6 border-b-2 border-black bg-gray-50">
						<h2 class="font-black uppercase tracking-tight text-xl leading-none text-black">OVERVIEW</h2>
						<p class="text-[10px] font-bold text-gray-400 mt-1 uppercase">Approval statistics</p>
					</div>

					<div class="p-6 flex flex-col gap-6">
						<!-- Total Approvals -->
						<div class="border-2 border-black p-4 bg-gray-50">
							<div class="flex justify-between items-center mb-4">
								<span class="text-[10px] font-bold uppercase text-gray-400">Total Approvals</span>
								<span class="px-2 py-0.5 bg-black text-white text-[10px] font-bold">{revokeStore.revokeItems.length}</span>
							</div>
													
							<div class="flex items-baseline gap-2">
								<span class="text-4xl font-black text-brutal-primary leading-none">
									{formatValue(revokeStore.totalValueAtRisk)}
								</span>
								<span class="text-xs font-bold text-gray-400 uppercase tracking-widest">at Risk</span>
							</div>
						</div>
					
						<!-- Selected -->
						<div class="border-2 border-black p-4 bg-gray-50">
							<div class="flex justify-between items-center mb-4">
								<span class="text-[10px] font-bold uppercase text-gray-400">Selected</span>
								<span class="px-2 py-0.5 bg-black text-white text-[10px] font-bold">{revokeStore.selectedItems.length}</span>
							</div>
													
							<div class="flex items-baseline gap-2">
								<span class="text-4xl font-black text-black leading-none">
									{formatValue(revokeStore.selectedValueAtRisk)}
								</span>
								<span class="text-xs font-bold text-gray-400 uppercase tracking-widest">Value</span>
							</div>
						</div>

						<!-- Quick Filters -->
						<div class="pt-4 border-t-2 border-black">
							<div class="text-[10px] font-bold uppercase text-gray-400 mb-3">Quick Filters</div>
							<div class="grid grid-cols-2 gap-3">
								<button
									onclick={handleSelectHighRisk}
									class="px-3 py-2 border-2 border-black bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold uppercase shadow-[2px_2px_0px_0px_rgba(255,87,34,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
								>
									High Risk
								</button>
								<button
									onclick={handleSelectUnlimited}
									class="px-3 py-2 border-2 border-black bg-yellow-50 hover:bg-yellow-100 text-yellow-600 text-[10px] font-bold uppercase shadow-[2px_2px_0px_0px_rgba(255,87,34,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
								>
									Unlimited
								</button>
							</div>
						</div>
					</div>

					<!-- Error Display -->
					{#if revokeStore.error}
						<div class="px-4 py-3 bg-red-50 border-t-2 border-black">
							<p class="text-[10px] font-bold text-red-600 uppercase">{revokeStore.error}</p>
						</div>
					{/if}

					<!-- Scan Button -->
					<button
						onclick={handleScan}
						disabled={revokeStore.status === 'SCANNING'}
						class="w-full py-6 border-t-2 border-black font-black uppercase text-xl transition-all flex items-center justify-center gap-3 active:bg-black
						{revokeStore.status === 'SCANNING' 
							? 'bg-[#737373] text-white opacity-50 cursor-not-allowed' 
							: 'bg-brutal-primary text-white hover:bg-black'}"
					>
						{#if revokeStore.status === 'SCANNING'}
							<div class="w-5 h-5 border-4 border-white border-t-transparent animate-spin"></div>
							SCANNING...
						{:else}
							SCAN APPROVALS
						{/if}
					</button>
				</div>

				<!-- Revoke Action Card -->
				{#if revokeStore.selectedItems.length > 0}
					<div class="bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col relative">
						<div class="p-6 border-b-2 border-black bg-gray-50">
							<h2 class="font-black uppercase tracking-tight text-xl leading-none text-black">REVOKE</h2>
							<p class="text-[10px] font-bold text-gray-400 mt-1 uppercase">Remove selected approvals</p>
						</div>

						<div class="p-4">
							{#each revokeStore.chainStats.filter(c => revokeStore.selectedItems.filter(i => i.chainId === c.chainId).length > 0) as chain}
								<button
									onclick={() => openRevokeModal(chain.chainId)}
									class="w-full mb-2 px-4 py-3 bg-red-600 hover:bg-red-700 border-2 border-black text-white font-bold text-sm uppercase shadow-[4px_4px_0px_0px_rgba(255,87,34,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
								>
									Revoke {revokeStore.selectedItems.filter(i => i.chainId === chain.chainId).length} on {CHAIN_INFO[chain.chainId].name}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
{/if}

<!-- Confirm Modal -->
{#if showConfirmModal && selectedChainForRevoke}
	<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
		<div class="bg-white border-4 border-black max-w-md w-full p-6 shadow-[12px_12px_0px_0px_rgba(255,87,34,0.2)]">
			<h3 class="text-2xl font-black uppercase mb-4 text-black">Confirm Revoke</h3>
			<p class="text-gray-600 font-bold mb-4">
				You are about to revoke 
				<span class="text-black font-black">
					{revokeStore.selectedItems.filter(i => i.chainId === selectedChainForRevoke).length}
				</span> 
				approvals on 
				<span class="text-black font-black">
					{CHAIN_INFO[selectedChainForRevoke].name}
				</span>.
			</p>
			<p class="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-widest">
				This will send multiple transactions to set allowances to 0.
			</p>
			<div class="flex gap-3">
				<button
					onclick={() => showConfirmModal = false}
					class="flex-1 px-4 py-3 bg-white border-2 border-black hover:bg-gray-50 font-bold uppercase shadow-[4px_4px_0px_0px_rgba(255,87,34,0.2)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
				>
					Cancel
				</button>
				<button
					onclick={confirmRevoke}
					class="flex-1 px-4 py-3 bg-red-600 border-2 border-black hover:bg-red-700 text-white font-bold uppercase shadow-[4px_4px_0px_0px_rgba(255,87,34,0.2)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
				>
					Confirm Revoke
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Progress Modal -->
{#if revokeStore.status === 'REVOKING' && revokeStore.currentProgress}
	<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
		<div class="bg-white border-4 border-black max-w-md w-full p-6 text-center shadow-[12px_12px_0px_0px_rgba(255,87,34,0.2)]">
			<div class="w-16 h-16 mx-auto mb-4 border-4 border-brutal-primary border-t-transparent animate-spin"></div>
			<h3 class="text-2xl font-black uppercase mb-2 text-black">Revoking Approvals</h3>
			<p class="text-gray-600 font-bold mb-4">
				{revokeStore.currentProgress.current} / {revokeStore.currentProgress.total}
			</p>
			<div class="h-4 bg-gray-200 border-2 border-black overflow-hidden">
				<div 
					class="h-full bg-brutal-primary transition-all duration-300"
					style="width: {(revokeStore.currentProgress.current / revokeStore.currentProgress.total) * 100}%"
				></div>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes scan {
		0% { top: -10%; }
		100% { top: 110%; }
	}
</style>
