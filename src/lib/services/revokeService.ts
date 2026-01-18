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
	console.log(`🔒 Starting batch revoke for ${items.length} approvals on chain ${chainId}`);

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
			console.log(`📝 Added revoke for ${item.tokenSymbol} -> ${item.spenderLabel || item.spenderAddress.slice(0, 10)}`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error';
			console.error(`❌ Failed to build revoke tx for ${item.tokenSymbol}:`, msg);
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

		console.log(`📤 Sending batch revoke with ${calls.length} calls`);

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
		console.log('✅ Batch revoke transaction submitted:', txHash);

		// Wait for confirmation
		if (txHash && txHash.startsWith('0x')) {
			try {
				const receipt = await waitForTransactionReceipt(config, { hash: txHash, chainId });
				console.log('✅ Batch revoke confirmed:', receipt.status);
			} catch (e) {
				console.log('⏳ Could not wait for receipt (batch may use different confirmation)');
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
		console.error('❌ Batch revoke failed:', e);

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

		// Fallback to legacy mode
		console.log('🔄 Falling back to legacy sequential revoke...');
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
	console.log(`🔧 Starting legacy revoke for ${items.length} approvals on chain ${chainId}`);

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
			console.log(`🔒 Revoking ${item.tokenSymbol} (${i + 1}/${items.length})...`);

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

			console.log(`📝 Revoke tx: ${txHash}`);
			txHashes.push(txHash);

			// Wait for confirmation
			const receipt = await waitForTransactionReceipt(config, { hash: txHash, chainId });
			
			if (receipt.status === 'success') {
				console.log(`✅ Revoked ${item.tokenSymbol}`);
				revokedCount++;
			} else {
				throw new Error('Transaction failed');
			}

		} catch (e: any) {
			const msg = e instanceof Error ? e.message : 'Unknown error';
			console.error(`❌ Failed to revoke ${item.tokenSymbol}:`, msg);

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

	console.log('🏁 Legacy revoke complete:', {
		revokedCount,
		failedCount: errors.length,
		txHashes: txHashes.length
	});

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
	console.log(`🔒 Revoking single approval: ${item.tokenSymbol} -> ${item.spenderAddress.slice(0, 10)}`);

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

		console.log(`📝 Revoke tx: ${txHash}`);

		// Wait for confirmation
		const receipt = await waitForTransactionReceipt(config, { hash: txHash, chainId });
		
		if (receipt.status === 'success') {
			console.log(`✅ Revoked ${item.tokenSymbol}`);
			return { success: true, txHash };
		} else {
			return { success: false, error: 'Transaction failed on chain' };
		}

	} catch (e: any) {
		const msg = e instanceof Error ? e.message : 'Unknown error';
		console.error(`❌ Failed to revoke ${item.tokenSymbol}:`, msg);
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

	console.log(`🔒 Reducing allowance for ${item.tokenSymbol} to ${newAllowance.toString()}`);

	try {
		const txHash = await writeContract(config, {
			address: item.tokenAddress,
			abi: ERC20_APPROVE_ABI,
			functionName: 'approve',
			args: [item.spenderAddress, newAllowance],
			chainId
		});

		console.log(`📝 Partial revoke tx: ${txHash}`);

		// Wait for confirmation
		const receipt = await waitForTransactionReceipt(config, { hash: txHash, chainId });
		
		if (receipt.status === 'success') {
			console.log(`✅ Reduced allowance for ${item.tokenSymbol}`);
			return { success: true, txHash };
		} else {
			return { success: false, error: 'Transaction failed on chain' };
		}

	} catch (e: any) {
		const msg = e instanceof Error ? e.message : 'Unknown error';
		console.error(`❌ Failed to reduce allowance for ${item.tokenSymbol}:`, msg);
		return { success: false, error: msg };
	}
}
