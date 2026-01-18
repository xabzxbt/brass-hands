<script lang="ts">
	import "../app.css";
	import Header from "$lib/components/Header.svelte";
	import WalletProvider from "$lib/components/WalletProvider.svelte";

	let { children } = $props();
</script>

<WalletProvider />

<div class="min-h-screen bg-brutal-bg flex flex-col transition-colors duration-200">
	<Header />

	<main class="flex-grow flex items-center justify-center p-4">
		{@render children()}
	</main>

	<footer class="w-full py-4 border-t-2 border-black bg-white flex items-center justify-center text-xs font-medium transition-colors duration-200">
		Built by <a href="https://x.com/xabzxbt" target="_blank" rel="noopener noreferrer" class="text-brutal-primary ml-1 hover:underline">xabzxbt</a>
	</footer>
</div>
