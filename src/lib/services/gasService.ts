import { getPublicClient } from '@wagmi/core';
import { config } from '$lib/config/wagmi';
import { formatUnits } from 'viem';
import { getNativeTokenPrice } from './tokenService';
import type { ExecutionStrategy, ChainId } from '$lib/types';

const GAS_LIMITS = {
	APPROVE: 50000n,
	SWAP: 180000n,
	BATCH_OVERHEAD: 100000n
};

export async function estimateGasCostUsd(
	chainId: ChainId,
	strategy: ExecutionStrategy,
	tokenCount: number
): Promise<number> {
	if (tokenCount === 0) return 0;

	try {
		const client = getPublicClient(config, { chainId });
		if (!client) return 0;

		const gasPrice = await client.getGasPrice();
		const nativePrice = getNativeTokenPrice(chainId);

		let estimatedGas = 0n;

		if (strategy === 'LEGACY') {
			estimatedGas = (GAS_LIMITS.APPROVE + GAS_LIMITS.SWAP) * BigInt(tokenCount);
		} else {
			estimatedGas = GAS_LIMITS.BATCH_OVERHEAD + (GAS_LIMITS.SWAP * BigInt(tokenCount));
		}

		const costInNative = Number(formatUnits(estimatedGas * gasPrice, 18));
		const totalCostUsd = costInNative * nativePrice;

		console.log(`⛽ Gas Est [${chainId}]: ${tokenCount} tokens = ${totalCostUsd.toFixed(4)} USD`);

		return totalCostUsd;
	} catch (error) {
		console.error('❌ Gas estimation failed:', error);
		return 0;
	}
}
