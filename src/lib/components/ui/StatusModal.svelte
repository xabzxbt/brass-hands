<script lang="ts">
    import type { BatchStatus } from "$lib/types";

    let {
        status = "IDLE",
        show = false,
        failedStep = undefined,
        error = undefined,
        onClose = () => {},
        onCancel = () => {},
    } = $props<{
        status: BatchStatus;
        show: boolean;
        failedStep?: BatchStatus;
        error?: string;
        onClose?: () => void;
        onCancel?: () => void;
    }>();

    const steps = [
        { id: "ANALYZING", label: "Analyzing Tokens" },
        { id: "APPROVING", label: "Approving Allowances" },
        { id: "SWAPPING", label: "Executing Swaps" },
        { id: "COMPLETED", label: "Conversion Complete" },
    ];

    // Check if we're in an in-progress state (can be cancelled)
    let isInProgress = $derived(
        status === "ANALYZING" || status === "APPROVING" || status === "SWAPPING"
    );

    // Check if we're in a final state
    let isFinal = $derived(status === "COMPLETED" || status === "FAILED");

    function getStepStatus(stepId: string) {
        if (status === "COMPLETED") return "COMPLETED";

        const currentIndex = steps.findIndex((s) => s.id === status);
        const stepIndex = steps.findIndex((s) => s.id === stepId);
        const failedIndex = failedStep ? steps.findIndex((s) => s.id === failedStep) : -1;

        if (status === "FAILED") {
            if (stepIndex < failedIndex) return "COMPLETED";
            if (stepIndex === failedIndex) return "FAILED";
            return "PENDING";
        }

        if (stepIndex < currentIndex) return "COMPLETED";
        if (stepIndex === currentIndex) return "PROCESSING";
        return "PENDING";
    }

    function handleCancel() {
        onCancel();
        onClose();
    }
</script>

{#if show}
<div class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
    <div class="w-full max-w-md bg-white border-2 border-black shadow-[8px_8px_0px_0px_rgba(255,87,34,0.2)] p-8 transition-colors duration-200">
        <div class="mb-8 border-b-2 border-black pb-4">
            <h2 class="text-2xl font-bold uppercase tracking-tight">Status</h2>
        </div>

        <div class="space-y-6">
            {#each steps as step}
                {@const stepStatus = getStepStatus(step.id)}
                <div class="flex items-center gap-4">
                    <div
                        class="w-10 h-10 border-2 border-black flex items-center justify-center font-bold
                        {stepStatus === 'COMPLETED' ? 'bg-black text-white' : ''}
                        {stepStatus === 'PROCESSING' ? 'bg-brutal-primary text-white animate-pulse' : ''}
                        {stepStatus === 'FAILED' ? 'bg-error text-white' : ''}
                        {stepStatus === 'PENDING' ? 'bg-white text-gray-300' : ''}
                    "
                    >
                        {#if stepStatus === "COMPLETED"}
                            ✓
                        {:else if stepStatus === "FAILED"}
                            ✕
                        {:else if stepStatus === "PROCESSING"}
                            ●
                        {:else}
                            ○
                        {/if}
                    </div>
                    <div class="flex-1">
                        <div
                            class="font-bold uppercase tracking-tight {stepStatus ===
                            'PENDING'
                                ? 'text-gray-300'
                                : 'text-black'}"
                        >
                            {step.label}
                        </div>
                    </div>
                </div>
            {/each}
        </div>

        {#if status === "COMPLETED" || status === "FAILED"}
            {#if status === "FAILED" && error}
                <div class="mt-8 p-4 bg-red-50 border-2 border-black text-xs font-bold uppercase">
                    <div class="mb-1 text-error">Error</div>
                    <div class="text-black font-mono lowercase">{error}</div>
                </div>
            {/if}

            <div class="mt-8">
                <button
                    onclick={onClose}
                    class="w-full py-4 border-2 border-black bg-brutal-primary text-white font-bold uppercase shadow-[4px_4px_0px_0px_rgba(255,87,34,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                >
                    {status === "COMPLETED" ? "Close" : "Dismiss"}
                </button>
            </div>
        {:else if isInProgress}
            <div class="mt-8">
                <button
                    onclick={handleCancel}
                    class="w-full py-4 border-2 border-black bg-white text-black font-bold uppercase shadow-[4px_4px_0px_0px_rgba(255,87,34,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
                >
                    Cancel
                </button>
            </div>
        {/if}
    </div>
</div>
{/if}
