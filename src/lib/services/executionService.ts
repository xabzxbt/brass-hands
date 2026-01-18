import type { ExecutionStrategy, BatchStatus, ChainId } from '$lib/types';
import type { TargetToken } from '$lib/config/constants';
import { walletStore } from '$lib/stores/wallet.svelte';
import { getCapabilities, getWalletClient } from '@wagmi/core';
import { config } from '$lib/config/wagmi';

export async function detectStrategy(address: `0x${string}`, chainId: number): Promise<ExecutionStrategy> {
	walletStore.isDetectingStrategy = true;
	try {
		const caps = await getCapabilities(config).catch(() => ({}));
		if ((caps as any)[chainId]?.atomicBatch?.supported) {
			walletStore.setStrategy('STANDARD_BATCH');
			return 'STANDARD_BATCH';
		}
	} catch {}
	walletStore.setStrategy('LEGACY');
	return 'LEGACY';
}

export function getStrategyDescription(strategy: ExecutionStrategy): string {
	switch (strategy) {
		case 'SMART_BATCH':
			return 'Smart Batch (EIP-7702) - Single signature for multiple swaps with delegation';
		case 'STANDARD_BATCH':
			return 'Standard Batch (EIP-5792) - Multiple approvals and swaps in one transaction';
		case 'LEGACY':
			return 'Legacy - Sequential transactions (approve + swap for each token)';
		default:
			return 'Unknown strategy';
	}
}

export function estimateTransactionCount(
	strategy: ExecutionStrategy,
	tokenCount: number
): number {
	switch (strategy) {
		case 'SMART_BATCH':
			return 1;
		case 'STANDARD_BATCH':
			return 1;
		case 'LEGACY':
			return tokenCount * 2;
		default:
			return tokenCount * 2;
	}
}

import type { Token, QuoteResponse } from '$lib/types';
import { writeContract, sendTransaction, waitForTransactionReceipt, getBalance } from '@wagmi/core';
import {
	checkMultipleAllowances,
	validateTokenSafety,
	buildApprovalTx
} from './approvalService';
import { getMultipleQuotes, type QuoteRequest } from './solverService';
import { TOKEN_ADDRESSES } from '$lib/config/constants';

export interface ExecutionResult {
	success: boolean;
	txHashes: `0x${string}`[];
	error?: string;
	totalSwapped: bigint;
	estimatedOutput: bigint;
}

// Helper to add delay between operations
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function executeBatch(
	tokens: Token[],
	strategy: ExecutionStrategy,
	ownerAddress: `0x${string}`,
	chainId: number,
	onStatusUpdate?: (status: BatchStatus) => void,
	targetToken: TargetToken = 'ETH'
): Promise<ExecutionResult> {
	try {
		if (onStatusUpdate) onStatusUpdate('ANALYZING');

		console.log('🚀 Starting batch execution:', {
			tokenCount: tokens.length,
			strategy,
			targetToken,
			chainId
		});

		// 1. Gas Check (Basic)
		const balance = await getBalance(config, {
			address: ownerAddress,
			chainId: chainId as ChainId
		});

		if (balance.value === 0n) {
			throw new Error("Insufficient native balance for gas fees. Please add some ETH/native token to your wallet.");
		}

		validateTokenSafety(tokens);

		const outputToken = getOutputTokenAddress(chainId, targetToken);
		console.log('📍 Output token:', outputToken, 'on chain:', chainId);

		// Filter out tokens that match the target asset (safety check)
		const tokensToExecute = tokens.filter(token => {
			const symbol = token.symbol.toUpperCase();
			if (targetToken === 'ETH') {
				return symbol !== 'ETH' && symbol !== 'WETH';
			}
			return symbol !== targetToken;
		});

		if (tokensToExecute.length === 0) {
			throw new Error("No valid tokens to swap (cannot swap target asset for itself).");
		}

		console.log('🎯 Tokens to execute:', tokensToExecute.map(t => `${t.symbol} (chain: ${t.chainId})`));
		console.log('📋 Execution strategy:', strategy);

		let result: ExecutionResult;

		if (strategy === 'STANDARD_BATCH' && tokensToExecute.length > 0) {
			// Use EIP-5792 batch transaction - all approvals + swaps in one wallet call
			console.log('🚀 Using STANDARD_BATCH (EIP-5792) for', tokensToExecute.length, 'tokens');
			result = await executeBatchWithIndividualQuotes(tokensToExecute, outputToken, ownerAddress, chainId, onStatusUpdate);
		} else {
			// Fallback to legacy sequential transactions
			console.log('🔧 Using LEGACY mode');
			result = await executeLegacyBatch(tokensToExecute, outputToken, ownerAddress, chainId, onStatusUpdate);
		}

		if (result.success && result.txHashes.length > 0) {
			if (onStatusUpdate) onStatusUpdate('COMPLETED');
		} else {
			if (onStatusUpdate) onStatusUpdate('FAILED');
		}
		return result;
	} catch (error) {
		console.error('❌ Execution failed:', error);
		if (onStatusUpdate) onStatusUpdate('FAILED');
		return {
			success: false,
			txHashes: [],
			error: error instanceof Error ? error.message : 'Unknown error',
			totalSwapped: 0n,
			estimatedOutput: 0n
		};
	}
}

// Execute batch using EIP-5792 with individual quotes for each token
async function executeBatchWithIndividualQuotes(
	tokens: Token[], 
	outputToken: `0x${string}`, 
	owner: `0x${string}`, 
	chainId: number, 
	onStatus?: (s: BatchStatus) => void
): Promise<ExecutionResult> {
	console.log('📦 Building batch transaction for', tokens.length, 'tokens on chain', chainId);
	
	if (onStatus) onStatus('ANALYZING');
	
	const calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }> = [];
	const errors: string[] = [];
	let totalOut = 0n;
	
	// Get quotes for all tokens sequentially with delay to avoid rate limiting
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		
		// Add delay between quote requests to avoid rate limiting
		if (i > 0) {
			await delay(500);
		}
		
		try {
			console.log(`📊 Getting quote for ${token.symbol} (${i + 1}/${tokens.length})...`);
			
			// IMPORTANT: Use the actual chainId from the function parameter, not from token
			const quoteRequest: QuoteRequest = {
				tokenIn: { ...token, chainId: chainId as ChainId },
				tokenOut: outputToken,
				amountIn: (token.balance * 98n) / 100n,
				chainId: chainId as ChainId,
				recipient: owner
			};
			
			const quotes = await getMultipleQuotes([quoteRequest]);
			const quote = quotes[0];
			
			if (!quote || !quote.isLiquid) {
				const errorMsg = quote?.routeDescription || 'No route found';
				console.warn(`⚠️ Skipping ${token.symbol}: ${errorMsg}`);
				errors.push(`${token.symbol}: ${errorMsg}`);
				continue;
			}
			
			if (!quote.to || quote.to === '0x0000000000000000000000000000000000000000' || !quote.data || quote.data === '0x') {
				console.warn(`⚠️ Skipping ${token.symbol}: Invalid quote data`);
				errors.push(`${token.symbol}: Invalid quote`);
				continue;
			}
			
			const spender = (quote.spender || quote.to) as `0x${string}`;
			
			// Check if approval is needed
			const checks = await checkMultipleAllowances([{ token: { ...token, chainId: chainId as ChainId }, amount: token.balance, spender }], owner);
			
			if (checks[0].needsApproval) {
				console.log(`📝 Adding approval for ${token.symbol} to spender ${spender}`);
				const approvalTx = buildApprovalTx({ ...token, chainId: chainId as ChainId }, checks[0].requiredAmount, spender);
				calls.push(approvalTx);
			}
			
			// Add swap call
			console.log(`🔄 Adding swap for ${token.symbol}`);
			calls.push({
				to: quote.to,
				data: quote.data,
				value: quote.value || 0n
			});
			
			totalOut += quote.amountOut;
			
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error';
			console.error(`❌ Failed to prepare ${token.symbol}:`, msg);
			errors.push(`${token.symbol}: ${msg}`);
		}
	}
	
	if (calls.length === 0) {
		throw new Error(`No valid swaps to execute. ${errors.join(' | ')}`);
	}
	
	console.log(`📤 Sending batch with ${calls.length} calls (approvals + swaps) on chain ${chainId}`);
	if (onStatus) onStatus('SWAPPING');
	
	// Get wallet client and send batch
	const walletClient = await getWalletClient(config, { chainId: chainId as ChainId });
	if (!walletClient) throw new Error('No wallet client available');
	
	try {
		const result = await (walletClient.request as any)({
			method: 'wallet_sendCalls',
			params: [{
				version: '1.0',
				chainId: `0x${chainId.toString(16)}`,
				from: owner,
				calls: calls.map(c => ({
					to: c.to,
					data: c.data,
					value: c.value ? `0x${c.value.toString(16)}` : '0x0'
				}))
			}]
		});
		
		const txHash = (Array.isArray(result) ? result[0] : result) as `0x${string}`;
		console.log('✅ Batch transaction submitted:', txHash);
		
		// Wait for confirmation
		if (txHash && txHash.startsWith('0x')) {
			try {
				const receipt = await waitForTransactionReceipt(config, { hash: txHash, chainId: chainId as ChainId });
				console.log('✅ Batch transaction confirmed:', receipt.status);
			} catch (e) {
				console.log('⏳ Could not wait for receipt (batch may use different confirmation)');
			}
		}
		
		return {
			success: true,
			txHashes: [txHash],
			totalSwapped: tokens.reduce((sum, t) => sum + t.balance, 0n),
			estimatedOutput: totalOut,
			error: errors.length > 0 ? `Partial: ${errors.join(' | ')}` : undefined
		};
		
	} catch (e: any) {
		console.error('❌ Batch transaction failed:', e);
		
		// If user rejected, don't fallback
		if (e?.message?.includes('rejected') || e?.code === 4001 || e?.message?.includes('denied')) {
			throw new Error('Transaction rejected by user');
		}
		
		console.log('🔄 Falling back to legacy sequential execution...');
		return executeLegacyBatch(tokens, outputToken, owner, chainId, onStatus);
	}
}

async function executeLegacyBatch(
	tokens: Token[], 
	outputToken: `0x${string}`, 
	owner: `0x${string}`, 
	chainId: number, 
	onStatus?: (s: BatchStatus) => void
): Promise<ExecutionResult> {
	const txHashes: `0x${string}`[] = [];
	let totalSwapped = 0n, totalOut = 0n;
	const errors: string[] = [];

	console.log('🔧 Executing legacy batch for', tokens.length, 'tokens on chain', chainId);

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		
		// Add delay between tokens to avoid rate limiting
		if (i > 0) {
			console.log('⏳ Waiting before next token...');
			await delay(1000);
		}
		
		try {
			console.log(`\n📊 Processing ${token.symbol} (${i + 1}/${tokens.length})...`);
			
			// Get fresh quote for this token
			// IMPORTANT: Use the actual chainId from parameter
			const quoteRequest: QuoteRequest = {
				tokenIn: { ...token, chainId: chainId as ChainId },
				tokenOut: outputToken,
				amountIn: (token.balance * 98n) / 100n,
				chainId: chainId as ChainId,
				recipient: owner
			};
			
			console.log('📝 Quote request:', {
				tokenIn: token.symbol,
				tokenOut: outputToken,
				amountIn: quoteRequest.amountIn.toString(),
				chainId: chainId
			});
			
			const quotes = await getMultipleQuotes([quoteRequest]);
			const quote = quotes[0];
			
			if (!quote) {
				const errorMsg = 'Failed to get quote';
				console.warn(`⚠️ Skipping ${token.symbol}: ${errorMsg}`);
				errors.push(`${token.symbol}: ${errorMsg}`);
				continue;
			}

			if (!quote.isLiquid) {
				const errorMsg = quote.routeDescription || 'No route found';
				console.warn(`⚠️ Skipping ${token.symbol}: ${errorMsg}`);
				errors.push(`${token.symbol}: ${errorMsg}`);
				continue;
			}

			if (!quote.to || quote.to === '0x0000000000000000000000000000000000000000') {
				const errorMsg = 'Invalid quote - no destination address';
				console.warn(`⚠️ Skipping ${token.symbol}: ${errorMsg}`);
				errors.push(`${token.symbol}: ${errorMsg}`);
				continue;
			}

			if (!quote.data || quote.data === '0x') {
				const errorMsg = 'Invalid quote - no transaction data';
				console.warn(`⚠️ Skipping ${token.symbol}: ${errorMsg}`);
				errors.push(`${token.symbol}: ${errorMsg}`);
				continue;
			}
			
			console.log('✅ Got valid quote:', {
				to: quote.to,
				value: quote.value?.toString(),
				outAmount: quote.outAmount?.toString(),
				routeDescription: quote.routeDescription
			});
			
			const spender = (quote.spender || quote.to) as `0x${string}`;
			
			// Check and handle approval
			const tokenWithChain = { ...token, chainId: chainId as ChainId };
			const checks = await checkMultipleAllowances([{ token: tokenWithChain, amount: token.balance, spender }], owner);
			
			if (checks[0].needsApproval) {
				console.log(`🔓 Approving ${token.symbol} for spender ${spender} on chain ${chainId}`);
				if (onStatus) onStatus('APPROVING');
				
				try {
					const approveHash = await writeContract(config, {
						address: token.address,
						abi: [
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
						],
						functionName: 'approve',
						args: [spender, checks[0].requiredAmount],
						chainId: chainId as ChainId
					});
					
					console.log('📝 Approval tx:', approveHash);
					txHashes.push(approveHash);
					
					// Wait for approval to be confirmed
					const approvalReceipt = await waitForTransactionReceipt(config, { 
						hash: approveHash, 
						chainId: chainId as ChainId 
					});
					console.log('✅ Approval confirmed, status:', approvalReceipt.status);
					
					if (approvalReceipt.status !== 'success') {
						throw new Error('Approval transaction failed');
					}
					
					// Small delay after approval
					await delay(500);
					
				} catch (approveError: any) {
					console.error('❌ Approval failed:', approveError);
					if (approveError?.message?.includes('rejected') || approveError?.code === 4001) {
						throw new Error('Transaction rejected by user');
					}
					throw approveError;
				}
			} else {
				console.log(`✅ ${token.symbol} already approved`);
			}
			
			// Execute the swap
			console.log(`🔄 Executing swap for ${token.symbol} on chain ${chainId}`);
			if (onStatus) onStatus('SWAPPING');
			
			try {
				const swapHash = await sendTransaction(config, { 
					account: owner, 
					to: quote.to, 
					data: quote.data, 
					value: quote.value || 0n, 
					chainId: chainId as ChainId
				});
				
				console.log('📝 Swap tx:', swapHash);
				txHashes.push(swapHash);
				
				// Wait for swap to be confirmed
				const swapReceipt = await waitForTransactionReceipt(config, { 
					hash: swapHash, 
					chainId: chainId as ChainId 
				});
				console.log('✅ Swap confirmed, status:', swapReceipt.status);
				
				if (swapReceipt.status !== 'success') {
					throw new Error('Swap transaction failed');
				}
				
				totalSwapped += token.balance;
				totalOut += quote.amountOut;
				
				console.log(`✅ Successfully swapped ${token.symbol}`);
				
			} catch (swapError: any) {
				console.error('❌ Swap failed:', swapError);
				if (swapError?.message?.includes('rejected') || swapError?.code === 4001) {
					throw new Error('Transaction rejected by user');
				}
				throw swapError;
			}
			
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error';
			console.error(`❌ Failed to swap ${token.symbol}:`, msg);
			
			// If user rejected, stop everything
			if (msg.includes('rejected by user')) {
				throw e;
			}
			
			errors.push(`${token.symbol}: ${msg}`);
		}
	}

	if (txHashes.length === 0) {
		if (errors.length > 0) {
			throw new Error(`Execution Failed: ${errors.join(' | ')}`);
		}
		throw new Error("No liquid routes found for the selected tokens. Relay Protocol might have a minimum amount requirement (usually >$1).");
	}

	console.log('🏁 Batch execution complete:', {
		successfulTxs: txHashes.length,
		totalSwapped: totalSwapped.toString(),
		totalOut: totalOut.toString(),
		errors
	});

	return { 
		success: txHashes.length > 0, 
		txHashes, 
		totalSwapped, 
		estimatedOutput: totalOut,
		error: errors.length > 0 ? errors.join(' | ') : undefined
	};
}

function getOutputTokenAddress(chainId: number, targetToken: TargetToken = 'ETH'): `0x${string}` {
	const addresses = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES];
	if (!addresses) {
		throw new Error(`Unsupported chain ID: ${chainId}`);
	}

	// For ETH, we use the native address (0x0..0) 
	// Relay will handle the conversion properly
	switch (targetToken) {
		case 'ETH':
			// Use native token address - Relay will swap to ETH directly
			return '0x0000000000000000000000000000000000000000' as `0x${string}`;
		case 'USDC':
			return addresses.USDC as `0x${string}`;
		case 'DAI':
			return addresses.DAI as `0x${string}`;
		default:
			return '0x0000000000000000000000000000000000000000' as `0x${string}`;
	}
}
