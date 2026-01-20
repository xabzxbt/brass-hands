<script lang="ts">
	import { walletStore } from "$lib/stores/wallet.svelte";
	import { modal } from "$lib/config/wagmi";
	import { getChainById } from "$lib/config/chains";
	import { page } from '$app/stores';

	function openNetworkModal() {
		modal.open({ view: 'Networks' });
	}

	function handleWalletAction() {
		modal.open();
	}

	let currentChainName = $derived(
		walletStore.chainId 
			? getChainById(walletStore.chainId)?.name?.replace('Mainnet', '')?.trim()?.toUpperCase() 
			: 'OFFLINE'
	);

	let currentPath = $derived($page.url.pathname);
</script>

<header class="w-full h-16 border-b-2 border-black bg-white flex items-center justify-between px-6 sticky top-0 z-50 transition-colors duration-200">
	<div class="flex items-center gap-6">
		<a href="/" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
			<svg class="w-6 h-6" viewBox="0 0 24 24" fill="#ff5722" xmlns="http://www.w3.org/2000/svg">
				<path d="M10.5 13L11.5 9" stroke="black" stroke-width="2" stroke-linecap="round"/>
				<path d="M14 16H15" stroke="black" stroke-width="2" stroke-linecap="round"/>
				<circle cx="9" cy="16" r="4" stroke="black" stroke-width="2"/>
				<circle cx="12" cy="6" r="3" stroke="black" stroke-width="2"/>
				<circle cx="19" cy="16" r="3" stroke="black" stroke-width="2"/>
			</svg>
			<h1 class="text-xl font-bold uppercase tracking-tight text-black">
				BRASS HANDS
			</h1>
		</a>

		<!-- Navigation -->
		<nav class="flex items-center gap-1">
			<a 
				href="/"
				class="px-3 py-1.5 text-sm font-bold uppercase tracking-tight transition-all border-2 
				{!walletStore.isConnected ? 'opacity-50 cursor-not-allowed pointer-events-none grayscale' : ''}
				{currentPath === '/' ? 'bg-black text-white border-black' : 'bg-white text-black border-transparent hover:border-black'}"
			>
				Sweep
			</a>
			<a 
				href="/revoke"
				class="px-3 py-1.5 text-sm font-bold uppercase tracking-tight transition-all border-2 
				{!walletStore.isConnected ? 'opacity-50 cursor-not-allowed pointer-events-none grayscale' : ''}
				{currentPath === '/revoke' ? 'bg-black text-white border-black' : 'bg-white text-black border-transparent hover:border-black'}"
			>
				Revoke
			</a>

			<a 
				href="https://token-price-aggregator.vercel.app/"
				target="_blank"
				rel="noopener noreferrer"
				class="px-3 py-1.5 text-sm font-bold uppercase tracking-tight transition-all border-2 bg-white text-black border-transparent hover:border-black"
			>
				Agregator
			</a>

			<div class="px-3 py-1.5 text-sm font-bold uppercase tracking-tight transition-all border-transparent text-gray-400 cursor-not-allowed flex items-center gap-2 group relative">
				Gas Refuel
				<span class="text-[8px] border border-gray-300 px-1 bg-gray-50 group-hover:bg-black group-hover:text-white transition-colors">SOON</span>
				
				<!-- Tooltip -->
				<div class="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-black text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100] border border-white/20">
					IN DEVELOPMENT
				</div>
			</div>
		</nav>
	</div>

	<div class="flex items-center gap-4">
		{#if walletStore.isConnected}
			<button 
				onclick={openNetworkModal}
				class="h-10 px-4 flex items-center bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(255,87,34,1)] hover:bg-gray-50 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
			>
				<span class="text-black font-bold text-xs uppercase tracking-tight">
					{currentChainName}
				</span>
			</button>

			<button 
				onclick={handleWalletAction}
				class="h-10 px-4 flex items-center bg-black text-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(255,87,34,1)] hover:bg-[#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
			>
				<span class="font-bold text-xs uppercase tracking-tight">
					{walletStore.shortAddress}
				</span>
			</button>
		{:else}
			<button 
				onclick={handleWalletAction}
				class="h-10 px-6 flex items-center bg-black text-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(255,87,34,1)] hover:bg-[#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
			>
				<span class="font-bold text-xs uppercase tracking-tight">
					CONNECT WALLET
				</span>
			</button>
		{/if}
	</div>
</header>
