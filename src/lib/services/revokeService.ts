/**
 * Revoke Service
 * Handles execution of revoke transactions (set allowance to 0)
 * Supports EIP-5792 batch transactions and legacy sequential mode
 */

import type { ChainId } from '$lib/types';
import type { RevokeItem, RevokeBatchResult } from '$lib/types/revoke';
import { writeContract, sendTransaction, waitForTransactionReceipt, getWalletClient } from '@wagmi/core';
import { config } from '$lib/config/wagmi';
import { encodeFunctionData } from 'viem';

// ERC20 ABI for approve function
const ERC20_APPROVE_ABI = [
	{
		name: 'approve',
		type: 'function',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'spender', type: 'address' },
			{ name: 'amount', type: 'uint256' }
		],
		outputs: [{ type: 'bool' }]
	}
] as const;

// ERC721 ABI for setApprovalForAll
const ERC721_SET_APPROVAL_ABI = [
	{
		name: 'setApprovalForAll',
		type: 'function',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'operator', type: 'address' },
			{ name: 'approved', type: 'bool' }
		],
		outputs: []
	}
] as const;

// Helper to add delay between operations
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Build revoke transaction data for ERC20 token
 */
export function buildRevokeERC20Tx(
	tokenAddress: `0x${string}`,
	spenderAddress: `0x${string}`
): { to: `0x${string}`; data: `0x${string}`; value: bigint } {
	const data = encodeFunctionData({
		abi: ERC20_APPROVE_ABI,
		functionName: 'approve',
		args: [spenderAddress, 0n]
	});

	return {
		to: tokenAddress,
		data,
		value: 0n
	};
}

/**
 * Build revoke transaction data for NFT (setApprovalForAll = false)
 */
export function buildRevokeNFTTx(
	contractAddress: `0x${string}`,
	operatorAddress: `0x${string}`
): { to: `0x${string}`; data: `0x${string}`; value: bigint } {
	const data = encodeFunctionData({
		abi: ERC721_SET_APPROVAL_ABI,
		functionName: 'setApprovalForAll',
		args: [operatorAddress, false]
	});

	return {
		to: contractAddress,
		data,
		value: 0n
	};
}

/**
 * Build partial revoke transaction (reduce allowance instead of setting to 0)
 */
export function buildPartialRevokeTx(
	tokenAddress: `0x${string}`,
	spenderAddress: `0x${string}`,
	newAllowance: bigint
): { to: `0x${string}`; data: `0x${string}`; value: bigint } {
	const data = encodeFunctionData({
		abi: ERC20_APPROVE_ABI,
		functionName: 'approve',
		args: [spenderAddress, newAllowance]
	});

	return {
		to: tokenAddress,
		data,
		value: 0n
	};
}

/**
 * Execute batch revoke using EIP-5792 (wallet_sendCalls)
 */
export async function executeBatchRevoke(
	items: RevokeItem[],
	ownerAddress: `0x${string}`,
	chainId: ChainId,
	onProgress?: (current: number, total: number) => void
): Promise<RevokeBatchResult> {
	const calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }> = [];
	const errors: string[] = [];

	// Build all revoke transactions
	for (const item of items) {
		try {
			let tx: { to: `0x${string}`; data: `0x${string}`; value: bigint };

			if (item.type === 'ERC20') {
				tx = buildRevokeERC20Tx(item.tokenAddress, item.spenderAddress);
			} else {
				tx = buildRevokeNFTTx(item.tokenAddress, item.spenderAddress);
			}
			calls.push(tx);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error';
			errors.push(`${item.tokenSymbol}: ${msg}`);
		}
	}

	if (calls.length === 0) {
		return {
			success: false,
			txHashes: [],
			revokedCount: 0,
			failedCount: items.length,
			errors: errors.length > 0 ? errors : ['No valid revoke transactions to execute']
		};
	}

	// Try batch execution first
	try {
		const walletClient = await getWalletClient(config, { chainId });
		if (!walletClient) throw new Error('No wallet client available');

		const result = await (walletClient.request as any)({
			method: 'wallet_sendCalls',
			params: [{
				version: '1.0',
				chainId: `0x${chainId.toString(16)}`,
				from: ownerAddress,
				calls: calls.map(c => ({
					to: c.to,
					data: c.data,
					value: '0x0'
				}))
			}]
		});

		const txHash = (Array.isArray(result) ? result[0] : result) as `0x${string}`;

		// Wait for confirmation
		if (txHash && txHash.startsWith('0x')) {
			try {
				await waitForTransactionReceipt(config, { hash: txHash, chainId });
			} catch (e) {
				// Silent wait
			}
		}

		return {
			success: true,
			txHashes: [txHash],
			revokedCount: calls.length,
			failedCount: errors.length,
			errors
		};

	} catch (e: any) {
		// If user rejected, don't fallback
		if (e?.message?.includes('rejected') || e?.code === 4001 || e?.message?.includes('denied')) {
			return {
				success: false,
				txHashes: [],
				revokedCount: 0,
				failedCount: items.length,
				errors: ['Transaction rejected by user']
			};
		}

		return executeLegacyRevoke(items, ownerAddress, chainId, onProgress);
	}
}

/**
 * Execute revokes sequentially (legacy mode for wallets without EIP-5792)
 */
export async function executeLegacyRevoke(
	items: RevokeItem[],
	ownerAddress: `0x${string}`,
	chainId: ChainId,
	onProgress?: (current: number, total: number) => void
): Promise<RevokeBatchResult> {
	const txHashes: `0x${string}`[] = [];
	const errors: string[] = [];
	let revokedCount = 0;

	for (let i = 0; i < items.length; i++) {
		const item = items[i];

		// Rate limiting
		if (i > 0) {
			await delay(500);
		}

		if (onProgress) {
			onProgress(i + 1, items.length);
		}

		try {
			let txHash: `0x${string}`;

			if (item.type === 'ERC20') {
				txHash = await writeContract(config, {
					address: item.tokenAddress,
					abi: ERC20_APPROVE_ABI,
					functionName: 'approve',
					args: [item.spenderAddress, 0n],
					chainId
				});
			} else {
				txHash = await writeContract(config, {
					address: item.tokenAddress,
					abi: ERC721_SET_APPROVAL_ABI,
					functionName: 'setApprovalForAll',
					args: [item.spenderAddress, false],
					chainId
				});
			}

			txHashes.push(txHash);

			// Wait for confirmation
			const receipt = await waitForTransactionReceipt(config, { hash: txHash, chainId });
			
			if (receipt.status === 'success') {
				revokedCount++;
			} else {
				throw new Error('Transaction failed');
			}

		} catch (e: any) {
			const msg = e instanceof Error ? e.message : 'Unknown error';

			// If user rejected, stop everything
			if (e?.message?.includes('rejected') || e?.code === 4001) {
				return {
					success: false,
					txHashes,
					revokedCount,
					failedCount: items.length - revokedCount,
					errors: ['Transaction rejected by user']
				};
			}

			errors.push(`${item.tokenSymbol}: ${msg}`);
		}
	}

	return {
		success: revokedCount > 0,
		txHashes,
		revokedCount,
		failedCount: errors.length,
		errors
	};
}

/**
 * Execute single revoke transaction
 */
export async function executeSingleRevoke(
	item: RevokeItem,
	ownerAddress: `0x${string}`,
	chainId: ChainId
): Promise<{ success: boolean; txHash?: `0x${string}`; error?: string }> {
	try {
		let txHash: `0x${string}`;

		if (item.type === 'ERC20') {
			txHash = await writeContract(config, {
				address: item.tokenAddress,
				abi: ERC20_APPROVE_ABI,
				functionName: 'approve',
				args: [item.spenderAddress, 0n],
				chainId
			});
		} else {
			txHash = await writeContract(config, {
				address: item.tokenAddress,
				abi: ERC721_SET_APPROVAL_ABI,
				functionName: 'setApprovalForAll',
				args: [item.spenderAddress, false],
				chainId
			});
		}

		// Wait for confirmation
		const receipt = await waitForTransactionReceipt(config, { hash: txHash, chainId });
		
		if (receipt.status === 'success') {
			return { success: true, txHash };
		} else {
			return { success: false, error: 'Transaction failed on chain' };
		}

	} catch (e: any) {
		const msg = e instanceof Error ? e.message : 'Unknown error';
		return { success: false, error: msg };
	}
}

/**
 * Execute partial revoke (reduce allowance)
 */
export async function executePartialRevoke(
	item: RevokeItem,
	newAllowance: bigint,
	chainId: ChainId
): Promise<{ success: boolean; txHash?: `0x${string}`; error?: string }> {
	if (item.type !== 'ERC20') {
		return { success: false, error: 'Partial revoke only supported for ERC20 tokens' };
	}

	try {
		const txHash = await writeContract(config, {
			address: item.tokenAddress,
			abi: ERC20_APPROVE_ABI,
			functionName: 'approve',
			args: [item.spenderAddress, newAllowance],
			chainId
		});

		// Wait for confirmation
		const receipt = await waitForTransactionReceipt(config, { hash: txHash, chainId });
		
		if (receipt.status === 'success') {
			return { success: true, txHash };
		} else {
			return { success: false, error: 'Transaction failed on chain' };
		}

	} catch (e: any) {
		const msg = e instanceof Error ? e.message : 'Unknown error';
		return { success: false, error: msg };
	}
}
