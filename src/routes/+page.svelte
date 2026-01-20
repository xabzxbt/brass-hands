<script lang="ts">
	import { dustStore } from "$lib/stores/dust.svelte";
	import { walletStore } from "$lib/stores/wallet.svelte";
	import { executeBatch } from "$lib/services/executionService";
	import TokenRow from "$lib/components/ui/TokenRow.svelte";
	import SwapPreview from "$lib/components/ui/SwapPreview.svelte";
	import StatusModal from "$lib/components/ui/StatusModal.svelte";
	import NoLiquidityModal from "$lib/components/ui/NoLiquidityModal.svelte";
	import { config, modal } from "$lib/config/wagmi";
	import { switchChain } from "@wagmi/core";
	import { formatUSD } from "$lib/utils/format";
	import { SUPPORTED_CHAINS } from "$lib/config/chains";
	import { getNativeSymbol } from "$lib/services/tokenService";
	import type { ChainId, BatchStatus, Token } from "$lib/types";
	import type { TargetToken } from "$lib/config/constants";

	let isExecuting = $state(false);
	let executionStatus = $state<BatchStatus>("IDLE");
	let lastValidStatus = $state<BatchStatus>("ANALYZING");
	let executionError = $state<string | null>(null);
	let executionSuccess = $state(false);

	let isStarted = $state(false);
	let showTargetSelector = $state(false);

	// No liquidity modal state
	let showNoLiquidityModal = $state(false);
	let noLiquidityToken = $state<Token | null>(null);

	function handleNoLiquidityClick(token: Token) {
		noLiquidityToken = token;
		showNoLiquidityModal = true;
	}

	function closeNoLiquidityModal() {
		showNoLiquidityModal = false;
		noLiquidityToken = null;
	}

	let showLowValue = $state(false);
	let showConnectionToast = $state(false);

	let netValue = $derived(dustStore.totalValue - dustStore.estimatedGasCost);
	let lowValueCount = $derived(dustStore.lowValueTokens.length);
	let canConvert = $derived(
		walletStore.isConnected &&
			dustStore.hasSelection &&
			netValue > 0 &&
			!isExecuting,
	);

	$effect(() => {
		if (walletStore.isConnected) {
			showConnectionToast = true;
			const timer = setTimeout(() => {
				showConnectionToast = false;
			}, 5000);
			return () => clearTimeout(timer);
		} else {
			isStarted = false;
		}
	});

	$effect(() => {
		if (walletStore.chainId && walletStore.detectedStrategy) {
			// Track selection changes to update gas
			const _count = dustStore.selectedCount;
			dustStore.updateGasEstimate(
				walletStore.chainId as ChainId,
				walletStore.detectedStrategy,
			);
		}
	});

	async function switchNetwork(chainId: number) {
		try {
			await switchChain(config, { chainId: chainId as any });
		} catch (error) {
			console.error("Failed to switch network:", error);
		}
	}

	async function handleScan(chainId: ChainId) {
		if (!walletStore.address) {
			alert("Please connect your wallet first");
			return;
		}

		if (walletStore.chainId !== chainId) {
			try {
				await switchChain(config, { chainId });
			} catch (error) {
				console.error("Failed to switch chain:", error);
				alert("Please switch your wallet to the correct network to scan.");
				return;
			}
		}

		await dustStore.scan(walletStore.address, chainId);
	}

	async function handleConvert() {
		if (
			!walletStore.address ||
			!walletStore.chainId ||
			!walletStore.detectedStrategy
		) {
			alert("Wallet not properly connected");
			return;
		}

		if (dustStore.selectedTokens.length === 0) {
			alert("Please select tokens to convert");
			return;
		}

		isExecuting = true;
		executionStatus = "ANALYZING";
		executionError = null;
		executionSuccess = false;

		try {
			const result = await executeBatch(
				dustStore.selectedTokens,
				walletStore.detectedStrategy,
				walletStore.address,
				walletStore.chainId,
				(status) => {
					executionStatus = status;
					if (status !== "FAILED") lastValidStatus = status;
				},
				dustStore.targetToken,
			);

			if (result.success) {
				executionSuccess = true;
				executionStatus = "COMPLETED";
				await handleScan(walletStore.chainId);
			} else {
				executionError = result.error || "Execution failed";
				executionStatus = "FAILED";
			}
		} catch (error) {
			executionError =
				error instanceof Error ? error.message : "Unknown error";
			executionStatus = "FAILED";
		} finally {
		}
	}

	function closeStatusModal() {
		isExecuting = false;
		executionStatus = "IDLE";
		executionError = null;
		executionSuccess = false;
	}

	function cancelExecution() {
		// Reset all execution state
		isExecuting = false;
		executionStatus = "IDLE";
		executionError = null;
		executionSuccess = false;
		lastValidStatus = "ANALYZING";
	}

	$effect(() => {
		if (
			walletStore.isConnected &&
			walletStore.address &&
			walletStore.chainId
		) {
			handleScan(walletStore.chainId);
		}
	});
</script>

{#if !walletStore.isConnected}
	<div class="relative w-full h-full flex flex-col items-center justify-center overflow-hidden min-h-[80vh]">
		<!-- Decorative Background Elements -->
		<div class="absolute top-10 left-10 w-32 h-32 border-4 border-black rotate-12 opacity-10 select-none pointer-events-none"></div>
		<div class="absolute bottom-20 left-20 w-48 h-48 border-4 border-black -rotate-12 opacity-10 select-none pointer-events-none"></div>
		<div class="absolute top-1/4 right-1/4 w-12 h-12 bg-brutal-primary border-4 border-black rotate-45 opacity-20 select-none pointer-events-none"></div>
		<div class="absolute -bottom-10 right-1/3 w-64 h-12 bg-black opacity-5 rotate-3 select-none pointer-events-none"></div>

		<div class="flex flex-col items-center justify-center text-center animate-fade-in w-full z-10">
			<h1 class="text-[6rem] font-black uppercase tracking-tight mb-2 text-black leading-none text-center">
				BRASS HANDS
			</h1>
			<p class="text-xl font-bold text-gray-400 mb-16 uppercase tracking-widest">
				The Ultimate Brutalist DeFi Toolbox
			</p>

			<button
				onclick={() => modal.open()}
				class="bg-black text-white text-xl font-bold uppercase px-16 py-6 border-2 border-black shadow-[8px_8px_0px_0px_rgba(255,87,34,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all mb-20 hover:bg-[#111]"
			>
				CONNECT WALLET
			</button>
		</div>

		<!-- Network list positioned to the right -->
		<div class="fixed right-8 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-20 hidden lg:flex">
			<span class="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 mb-2 [writing-mode:vertical-lr] rotate-180 self-center">SUPPORTED NETWORKS</span>
			{#each [
				{ name: 'ETHEREUM' },
				{ name: 'BASE' },
				{ name: 'ARBITRUM' },
				{ name: 'OPTIMISM' },
				{ name: 'POLYGON' },
				{ name: 'BNB CHAIN' }
			] as net}
				<div class="bg-white border-2 border-black px-6 py-3 flex items-center justify-center font-bold text-[10px] shadow-[4px_4px_0px_0px_rgba(255,87,34,1)] hover:translate-x-[-4px] transition-all group cursor-default">
					<span class="tracking-tighter">{net.name}</span>
				</div>
			{/each}
		</div>
	</div>
{:else if !isStarted}
	<div class="w-full max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[70vh] gap-12">
		<div class="text-center">
			<h2 class="text-4xl font-black uppercase mb-4 text-black tracking-tight">Select a Service</h2>
			<p class="text-sm font-bold text-gray-400 uppercase tracking-[0.2em]">What would you like to do today?</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 w-full">
			<!-- SWEEP CARD -->
			<button 
				onclick={() => isStarted = true}
				class="group flex flex-col bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(255,87,34,0.2)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[12px_12px_0px_0px_rgba(255,87,34,1)] transition-all text-left"
			>
				<div class="w-16 h-16 bg-black text-white flex items-center justify-center mb-6 group-hover:bg-brutal-primary transition-colors border-2 border-black shadow-[4px_4px_0px_0px_rgba(255,87,34,0.2)]">
					<span class="text-3xl font-black italic">S</span>
				</div>
				<h3 class="text-3xl font-black uppercase mb-3 text-black group-hover:text-brutal-primary transition-colors leading-tight">SWEEP</h3>
				<p class="text-sm font-bold text-gray-500 uppercase leading-relaxed mb-8 flex-grow">
					Clean up your wallet by converting small token dust into liquid assets like ETH, USDC, or DAI.
				</p>
				<div class="flex items-center gap-2 text-black font-black uppercase text-xs tracking-widest border-t-2 border-black pt-4 mt-auto">
					Open Sweep <span class="group-hover:translate-x-1 transition-transform">→</span>
				</div>
			</button>

			<!-- REVOKE CARD -->
			<a 
				href="/revoke"
				class="group flex flex-col bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(255,87,34,0.2)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[12px_12px_0px_0px_rgba(255,87,34,1)] transition-all"
			>
				<div class="w-16 h-16 bg-black text-white flex items-center justify-center mb-6 group-hover:bg-red-600 transition-colors border-2 border-black shadow-[4px_4px_0px_0px_rgba(255,87,34,0.2)]">
					<span class="text-3xl font-black italic">R</span>
				</div>
				<h3 class="text-3xl font-black uppercase mb-3 text-black group-hover:text-red-600 transition-colors leading-tight">REVOKE</h3>
				<p class="text-sm font-bold text-gray-500 uppercase leading-relaxed mb-8 flex-grow">
					View and revoke token approvals to protect your wallet from malicious contracts and unauthorized access.
				</p>
				<div class="flex items-center gap-2 text-black font-black uppercase text-xs tracking-widest border-t-2 border-black pt-4 mt-auto">
					Open Revoke <span class="group-hover:translate-x-1 transition-transform">→</span>
				</div>
			</a>

			<!-- GAS REFUEL CARD (Under Development) -->
			<div 
				class="group flex flex-col bg-gray-50 border-4 border-black/10 p-8 transition-all grayscale opacity-70 relative overflow-hidden"
			>
				<!-- Badge -->
				<div class="absolute top-4 right-4 bg-black text-white text-[10px] font-black px-2 py-1 rotate-3 border-2 border-black shadow-[2px_2px_0px_0px_rgba(255,87,34,1)]">
					IN DEV
				</div>

				<div class="w-16 h-16 bg-gray-200 text-gray-400 flex items-center justify-center mb-6 border-2 border-black/10">
					<span class="text-3xl font-black italic">G</span>
				</div>
				<h3 class="text-3xl font-black uppercase mb-3 text-gray-400 leading-tight">GAS REFUEL</h3>
				<p class="text-sm font-bold text-gray-400 uppercase leading-relaxed mb-8 flex-grow">
					Bridge native gas tokens across different chains seamlessly. Never run out of gas for your transactions.
				</p>
				<div class="flex items-center gap-2 text-gray-300 font-black uppercase text-xs tracking-widest border-t-2 border-black/10 pt-4 mt-auto">
					Under Development
				</div>
			</div>

			<!-- AGGREGATOR CARD -->
			<a 
				href="https://token-price-aggregator.vercel.app/"
				target="_blank"
				rel="noopener noreferrer"
				class="group flex flex-col bg-white border-4 border-black p-8 shadow-[8px_8px_0px_0px_rgba(132,204,22,0.2)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[12px_12px_0px_0px_rgba(132,204,22,1)] transition-all"
			>
				<div class="w-16 h-16 bg-black text-white flex items-center justify-center mb-6 group-hover:bg-[#84cc16] transition-colors border-2 border-black shadow-[4px_4px_0px_0px_rgba(132,204,22,0.2)]">
					<span class="text-3xl font-black italic">A</span>
				</div>
				<h3 class="text-3xl font-black uppercase mb-3 text-black group-hover:text-[#84cc16] transition-colors leading-tight">AGREGATOR</h3>
				<p class="text-sm font-bold text-gray-500 uppercase leading-relaxed mb-8 flex-grow">
					Compare token prices across multiple aggregators to find the best swap rates and liquidity.
				</p>
				<div class="flex items-center gap-2 text-black font-black uppercase text-xs tracking-widest border-t-2 border-black pt-4 mt-auto">
					Open Agregator <span class="group-hover:translate-x-1 transition-transform">→</span>
				</div>
			</a>
		</div>
	</div>
{:else}
	<!-- Notification Toast -->
	{#if showConnectionToast}
		<div class="fixed top-4 left-1/2 -translate-x-1/2 z-[300] animate-fade-in">
			<div class="bg-white border-2 border-green-600 px-6 py-3 flex items-center gap-4 shadow-[4px_4px_0px_0px_rgba(22,101,52,0.2)]">
				<span class="text-green-600 font-bold">✓</span>
				<span class="text-sm font-bold text-black uppercase tracking-tight">Wallet connected</span>
				<button 
					onclick={() => showConnectionToast = false}
					class="text-gray-400 hover:text-black ml-2"
				>✕</button>
			</div>
		</div>
	{/if}

	<StatusModal
		show={isExecuting ||
			executionStatus === "COMPLETED" ||
			executionStatus === "FAILED"}
		status={executionStatus}
		failedStep={executionStatus === "FAILED" ? lastValidStatus : undefined}
		error={executionError || undefined}
		onClose={closeStatusModal}
		onCancel={cancelExecution}
	/>

	<NoLiquidityModal
		token={noLiquidityToken}
		show={showNoLiquidityModal}
		onClose={closeNoLiquidityModal}
	/>

	<div class="w-full max-w-6xl mx-auto flex flex-col items-center px-4 pb-20 mt-10">
		<div class="w-full flex flex-col gap-10 animate-fade-in relative">
			<!-- Network Selector -->
			<div class="flex flex-wrap justify-center gap-3">
				{#each SUPPORTED_CHAINS as chain}
					<button 
						onclick={() => switchNetwork(Number(chain.id))}
						class="px-5 py-2 border-2 border-black font-black uppercase text-xs transition-all tracking-widest
						{walletStore.chainId === Number(chain.id) 
							? 'bg-black text-white shadow-[4px_4px_0px_0px_rgba(255,87,34,1)] translate-x-[-2px] translate-y-[-2px]' 
							: 'bg-white text-black hover:bg-gray-50 shadow-[4px_4px_0px_0px_rgba(255,87,34,0.2)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none'}"
					>
						{chain.name}
					</button>
				{/each}
			</div>

			<div class="flex flex-col lg:flex-row gap-8 items-start">
				<!-- LEFT WINDOW: WALLET SCAN -->
				<div class="flex-grow w-full bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col min-h-[500px] relative overflow-hidden">
					{#if dustStore.isScanning}
						<div class="absolute inset-0 bg-black/5 pointer-events-none z-10 overflow-hidden">
							<div class="absolute w-full h-[2px] bg-brutal-primary shadow-[0_0_15px_rgba(255,87,34,0.5)] animate-[scan_2s_linear_infinite]"></div>
						</div>
					{/if}

					<div class="p-6 border-b-2 border-black flex justify-between items-center bg-gray-50">
						<div class="flex-1 min-w-0 pr-4">
							<h2 class="font-black uppercase tracking-tight text-xl leading-none text-black">WALLET SCAN</h2>
							<p class="text-[10px] font-bold text-gray-400 mt-1 uppercase">Select assets to sweep</p>
						</div>
						
						<div class="flex gap-2 flex-shrink-0">
							<button 
								onclick={() => dustStore.selectAll()}
								class="px-3 py-1.5 border-2 border-black text-[10px] font-bold uppercase hover:bg-white transition-all bg-gray-100 whitespace-nowrap shadow-[2px_2px_0px_0px_rgba(255,87,34,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
							>
								Select All
							</button>
							<button 
								onclick={() => dustStore.deselectAll()}
								class="px-3 py-1.5 border-2 border-black text-[10px] font-bold uppercase hover:bg-white transition-all bg-gray-100 whitespace-nowrap shadow-[2px_2px_0px_0px_rgba(255,87,34,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
							>
								Clear All
							</button>
						</div>
					</div>

					<div class="flex-grow overflow-y-auto max-h-[600px] p-6">
						{#if dustStore.isScanning}
							<div class="flex flex-col items-center justify-center py-20 gap-4">
								<div class="w-12 h-12 border-4 border-brutal-primary border-t-transparent animate-spin"></div>
								<span class="text-xs font-bold uppercase tracking-[0.3em] animate-pulse">Scanning wallet...</span>
							</div>
						{:else if dustStore.filteredTokens.length === 0 && dustStore.lastScanTime}
							<div class="flex flex-col items-center justify-center py-20 text-center gap-4">
								<p class="text-sm font-bold text-gray-400 uppercase tracking-widest">No dust tokens found</p>
							</div>
						{:else}
							<div class="space-y-2">
								{#each showLowValue ? dustStore.filteredTokens : dustStore.mainTokens as token, i (token.address)}
									<TokenRow {token} index={i} onNoLiquidityClick={handleNoLiquidityClick} />
								{/each}
							</div>

							{#if lowValueCount > 0}
								<button 
									onclick={() => showLowValue = !showLowValue}
									class="w-full mt-6 py-4 border-2 border-black border-dashed text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-black hover:border-solid transition-all"
								>
									{showLowValue ? '-' : '+'} {lowValueCount} LOW-VALUE TOKENS
								</button>
							{/if}
						{/if}
					</div>
				</div>

				<!-- RIGHT WINDOW: CONVERT TO -->
				<div class="w-full lg:w-[350px] flex flex-col gap-6 sticky top-24">
					<div class="bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col relative">
						<div class="p-6 border-b-2 border-black bg-gray-50">
							<h2 class="font-black uppercase tracking-tight text-xl leading-none text-black">CONVERT TO</h2>
							<p class="text-[10px] font-bold text-gray-400 mt-1 uppercase">Choose your destination asset</p>
						</div>

						<div class="p-6 flex flex-col gap-6">
							<!-- Asset Selection -->
							<div>
								<div class="text-[10px] font-bold uppercase text-gray-400 mb-3">Target Asset</div>
								<div class="grid grid-cols-3 gap-2">
									{#each ['ETH', 'USDC', 'DAI'] as asset}
										<button 
											onclick={() => dustStore.setTargetToken(asset as any)}
											class="py-3 border-2 font-black uppercase text-xs transition-all tracking-widest
											{dustStore.targetToken === asset 
												? 'bg-black text-white shadow-[2px_2px_0px_0px_rgba(255,87,34,1)] translate-x-[-1px] translate-y-[-1px]' 
												: 'bg-white text-black hover:bg-gray-50 shadow-[2px_2px_0px_0px_rgba(255,87,34,0.2)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'}"
										>
											{asset === 'ETH' ? getNativeSymbol(walletStore.chainId || 1) : asset}
										</button>
									{/each}
								</div>
							</div>

							<SwapPreview 
								grossValue={dustStore.totalValue} 
								networkCost={dustStore.estimatedGasCost}
								priceImpact={dustStore.avgPriceImpact}
								quoteError={dustStore.quoteError}
							/>
						</div>

						<button 
							onclick={handleConvert}
							disabled={!canConvert || dustStore.isScanning || dustStore.isQuoting}
							class="w-full py-6 border-t-2 border-black font-black uppercase text-xl transition-all flex items-center justify-center gap-3 active:bg-black
							{canConvert && !dustStore.isScanning && !dustStore.isQuoting
								? 'bg-brutal-primary text-white hover:bg-black' 
								: 'bg-[#737373] text-white opacity-50 cursor-not-allowed'}"
						>
							SWEEP TO {dustStore.targetToken === 'ETH' ? getNativeSymbol(walletStore.chainId || 1) : dustStore.targetToken}
							<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square">
								<path d="M5 12h14M12 5l7 7-7 7"></path>
							</svg>
						</button>
					</div>
				</div>
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
