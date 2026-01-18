<script lang="ts">
    import type { Token } from "$lib/types";
    import type { TargetToken } from "$lib/config/constants";
    import { formatTokenAmount, formatUSD } from "$lib/utils/format";
    import { checkAlternativeRoutes, type RouteAlternative } from "$lib/services/solverService";
    import { dustStore } from "$lib/stores/dust.svelte";
    import { walletStore } from "$lib/stores/wallet.svelte";

    let {
        token,
        show = false,
        onClose = () => {},
    } = $props<{
        token: Token | null;
        show: boolean;
        onClose?: () => void;
    }>();

    let isLoading = $state(false);
    let alternatives = $state<RouteAlternative[]>([]);
    let error = $state<string | null>(null);

    // Fetch alternatives when modal opens
    $effect(() => {
        if (show && token && walletStore.address && walletStore.chainId) {
            fetchAlternatives();
        }
    });

    async function fetchAlternatives() {
        if (!token || !walletStore.address || !walletStore.chainId) return;

        isLoading = true;
        error = null;
        alternatives = [];

        try {
            const results = await checkAlternativeRoutes(
                walletStore.chainId,
                token.address,
                walletStore.address,
                token.decimals,
                token.balance
            );
            alternatives = results;
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to fetch alternatives';
        } finally {
            isLoading = false;
        }
    }

    async function handleSelectAlternative(alt: RouteAlternative) {
        if (!token) return;
        
        // Switch target token if different
        if (alt.targetToken !== dustStore.targetToken) {
            dustStore.setTargetToken(alt.targetToken);
        }
        
        // Mark token as liquid for new target and auto-select it
        dustStore.updateTokenLiquidity(token.address, true);
        
        // Auto-select the token after a brief delay for route check to complete
        setTimeout(() => {
            if (token && !dustStore.isSelected(token)) {
                dustStore.selectTokenDirectly(token);
            }
        }, 100);
        
        onClose();
    }

    function handleClose() {
        alternatives = [];
        error = null;
        onClose();
    }
</script>

{#if show && token}
<div class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
    <div class="w-full max-w-lg bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(255,87,34,0.2)] p-8 max-h-[80vh] flex flex-col transition-colors duration-200">
        <div class="mb-6 border-b-2 border-black pb-4 flex justify-between items-center bg-gray-50 -m-8 px-8 py-4 mb-4">
            <h2 class="text-xl font-bold uppercase tracking-tight">Route Alternatives</h2>
            <button onclick={handleClose} class="text-xl font-bold">✕</button>
        </div>

        <div class="flex-grow overflow-y-auto pr-2">
            <!-- Token Info -->
            <div class="p-4 border-2 border-black bg-gray-50 mb-6 flex items-center gap-4">
                <div class="w-12 h-12 border-2 border-black bg-white flex items-center justify-center overflow-hidden">
                    {#if token.logoUrl}
                        <img src={token.logoUrl} alt={token.symbol} class="w-full h-full object-cover" />
                    {:else}
                        <span class="font-bold">{token.symbol.slice(0, 1)}</span>
                    {/if}
                </div>
                <div>
                    <div class="font-bold uppercase tracking-tight">{token.symbol}</div>
                    <div class="text-[10px] font-mono text-gray-400">No direct route found</div>
                </div>
            </div>

            <!-- Status / Loading -->
            {#if isLoading}
                <div class="flex flex-col items-center justify-center py-8">
                    <div class="w-8 h-8 border-4 border-brutal-primary border-t-transparent animate-spin mb-4"></div>
                    <p class="text-sm font-bold uppercase tracking-widest animate-pulse">Searching...</p>
                </div>
            {:else if error}
                <div class="border-2 border-black bg-red-50 p-4 text-xs font-bold uppercase">
                    <div class="text-error mb-1">Error</div>
                    <div class="text-black font-mono lowercase">{error}</div>
                </div>
            {:else if alternatives.length === 0}
                <div class="text-center py-8 border-2 border-black border-dashed bg-gray-50">
                    <h3 class="font-bold uppercase mb-2">No Routes Found</h3>
                    <p class="text-xs text-gray-400 font-medium px-4">
                        This token has no liquidity on any supported DEX for your target asset.
                    </p>
                </div>
            {:else}
                <div class="space-y-3">
                    {#each alternatives as alt}
                        <button
                            onclick={() => handleSelectAlternative(alt)}
                            class="w-full p-4 border-2 border-black bg-white hover:bg-gray-50 shadow-[4px_4px_0px_0px_rgba(255,87,34,0.2)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all text-left"
                        >
                            <div class="flex justify-between items-center">
                                <div>
                                    <div class="font-bold uppercase text-sm">{token.symbol} → {alt.targetToken}</div>
                                    <div class="text-[10px] font-mono text-gray-400">via {alt.routeDescription}</div>
                                </div>
                                <div class="text-right">
                                    <div class="font-bold font-mono text-base">~{formatUSD(alt.estimatedOutputUsd)}</div>
                                    {#if alt.priceImpact > 0}
                                        <div class="text-[10px] font-bold {alt.priceImpact > 5 ? 'text-error' : 'text-gray-400'}">
                                            -{alt.priceImpact.toFixed(1)}% impact
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>

        <button 
            onclick={handleClose}
            class="w-full py-4 border-t-2 border-black bg-gray-50 font-bold uppercase hover:bg-gray-100 transition-all mt-4"
        >
            CANCEL
        </button>
    </div>
</div>
{/if}
