<script lang="ts">
    import { DUST_CONFIG } from "$lib/config/constants";
    import { formatUSD } from "$lib/utils/format";
    import { dustStore } from "$lib/stores/dust.svelte";
    import { walletStore } from "$lib/stores/wallet.svelte";
    import { getChainById } from "$lib/config/chains";
    import { getNativeSymbol } from "$lib/services/tokenService";

    let {
        grossValue,
        networkCost,
        priceImpact = 0,
        quoteError = null,
    } = $props<{
        grossValue: number;
        networkCost: number;
        priceImpact?: number;
        quoteError?: string | null;
    }>();

    let netValue = $derived(grossValue - networkCost);

    let networkName = $derived(
        walletStore.chainId 
            ? getNativeSymbol(walletStore.chainId)
            : 'GAS'
    );

    let impactSeverity = $derived(
        priceImpact > DUST_CONFIG.BLOCK_IMPACT
            ? "CRITICAL"
            : priceImpact > DUST_CONFIG.WARN_IMPACT
              ? "WARNING"
              : "SAFE",
    );
</script>

<div class="w-full border-2 border-black bg-white p-5 space-y-4">
    <div class="flex justify-between items-start">
        <span class="text-[9px] font-bold uppercase text-gray-400 tracking-widest">Selected Assets</span>
        <span class="bg-black text-white text-[10px] font-black px-1.5 py-0.5 leading-none">{dustStore.selectedCount}</span>
    </div>

    <div class="space-y-1">
        <div class="flex items-baseline gap-2">
            <span class="text-4xl font-black text-black tabular-nums tracking-tighter">
                {formatUSD(grossValue)}
            </span>
            <span class="text-[9px] font-bold uppercase text-gray-400 tracking-widest">Gross</span>
        </div>
        
        <div class="flex justify-between items-center text-[10px] font-bold uppercase tracking-tight">
            <span class="text-gray-400">{networkName} GAS</span>
            <span class="text-red-500">
                {#if networkCost > 0}
                    -{formatUSD(networkCost)}
                {:else if dustStore.selectedCount > 0}
                    CALCULATING...
                {:else}
                    $0.00
                {/if}
            </span>
        </div>
    </div>

    <div class="pt-4 border-t-2 border-black border-dashed flex items-center justify-between">
        <div class="flex flex-col">
            <span class="text-[9px] font-bold uppercase text-gray-400 tracking-widest leading-none mb-1">Estimated Net</span>
            <span class="text-2xl font-black {netValue > 0 ? 'text-green-600' : 'text-red-600'} leading-none tabular-nums">
                {formatUSD(netValue)}
            </span>
        </div>
        
        <div class="text-right">
            {#if dustStore.isQuoting}
                <div class="flex items-center gap-1.5 text-[#ff6a2e] font-black text-[9px] uppercase tracking-widest">
                    <div class="w-2 h-2 bg-[#ff6a2e] animate-pulse"></div>
                    Analyzing...
                </div>
            {:else if dustStore.selectedCount > 0}
                {#if netValue <= 0}
                    <div class="flex items-center gap-1.5 text-red-600 font-black text-[9px] uppercase tracking-widest">
                        <div class="w-2 h-2 bg-red-600 animate-pulse"></div>
                        Not Profitable
                    </div>
                {:else}
                    <div class="flex items-center gap-1.5 text-green-600 font-black text-[9px] uppercase tracking-widest">
                        <span class="text-xs">✓</span>
                        Approved
                    </div>
                {/if}
            {/if}
        </div>
    </div>
</div>
