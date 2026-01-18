<script lang="ts">
    import type { Token } from "$lib/types";
    import { dustStore } from "$lib/stores/dust.svelte";
    import { formatTokenAmount, formatUSD } from "$lib/utils/format";

    let { token, index, onNoLiquidityClick } = $props<{
        token: Token;
        index: number;
        onNoLiquidityClick?: (token: Token) => void;
    }>();

    let isSelected = $derived(dustStore.isSelected(token));
    let isTarget = $derived(dustStore.isTargetToken(token));
    // Only show "No Routes" if it's selected AND we've confirmed no liquid route, AND it's not the target, AND we're not currently fetching quotes.
    let isNoLiquidity = $derived(token.isLiquid === false && isSelected && !isTarget && !dustStore.isQuoting);

    let imageError = $state(false);
    
    // Derived logo URL with fallback logic
    let logoUrl = $derived.by(() => {
        if (!token.logoUrl || imageError) return null;
        return token.logoUrl;
    });

    function handleToggle() {
        dustStore.toggleToken(token);
    }
</script>

<button
    onclick={handleToggle}
    disabled={isTarget}
    class="w-full p-4 border-2 border-black transition-all text-left relative overflow-hidden
    {isTarget ? 'opacity-50 grayscale cursor-not-allowed' : ''}
    shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
    {isSelected
        ? 'bg-brutal-primary text-white'
        : 'bg-white text-black hover:bg-gray-50'}"
>
    <div class="flex items-center justify-between relative z-10">
        <div class="flex items-center gap-4">
            <div
                class="w-10 h-10 border-2 border-black bg-gray-100 flex items-center justify-center overflow-hidden shrink-0"
            >
                {#if logoUrl}
                    <img
                        src={logoUrl}
                        alt={token.symbol}
                        class="w-full h-full object-cover"
                        onerror={() => (imageError = true)}
                    />
                {:else}
                    <span class="text-black font-bold text-sm font-mono">
                        {(token.symbol || '??').slice(0, 1)}
                    </span>
                {/if}
            </div>

            <div>
                <div
                    class="font-bold text-sm uppercase tracking-tight flex items-center gap-2"
                >
                    {token.symbol}
                    {#if token.isTaxToken}
                        <span
                            class="px-1 py-0.5 bg-black text-white text-[8px] font-bold border border-black uppercase tracking-wider"
                            >TAX</span
                        >
                    {/if}
                </div>
                <div
                    class="text-[10px] font-mono text-gray-500 truncate max-w-[120px]"
                >
                    {token.name}
                </div>
            </div>
        </div>

        <div class="text-right">
            <div class="font-bold text-base font-mono">
                {formatUSD(token.valueUsd)}
            </div>
            <div
                class="text-[10px] font-mono uppercase tracking-tight text-gray-400"
            >
                {formatTokenAmount(token.balanceFormatted)}
            </div>
        </div>
    </div>
</button>
