import { readContract, writeContract } from '@wagmi/core';
import { config } from '$lib/config/wagmi';
import type { Token } from '$lib/types';
import { encodeFunctionData, erc20Abi, isAddress } from 'viem';

export interface AllowanceCheckResult {
	needsApproval: boolean;
	currentAllowance: bigint;
	requiredAmount: bigint;
	token: Token;
}

export async function checkAllowance(
	token: Token,
	amount: bigint,
	spender: `0x${string}`,
	owner: `0x${string}`
): Promise<AllowanceCheckResult> {
	// FIX: Validate inputs
	if (!token.address || !isAddress(token.address)) {
		return {
			needsApproval: true,
			currentAllowance: 0n,
			requiredAmount: amount,
			token
		};
	}
	
	if (!spender || !isAddress(spender)) {
		return {
			needsApproval: true,
			currentAllowance: 0n,
			requiredAmount: amount,
			token
		};
	}
	
	if (!owner || !isAddress(owner)) {
		return {
			needsApproval: true,
			currentAllowance: 0n,
			requiredAmount: amount,
			token
		};
	}
	
	try {
		const currentAllowance = await readContract(config, {
			address: token.address,
			abi: erc20Abi,
			functionName: 'allowance',
			args: [owner, spender],
			chainId: token.chainId
		});

		const needsApproval = currentAllowance < amount;

		return {
			needsApproval,
			currentAllowance,
			requiredAmount: amount,
			token
		};
	} catch (error) {
		return {
			needsApproval: true,
			currentAllowance: 0n,
			requiredAmount: amount,
			token
		};
	}
}

export async function checkMultipleAllowances(
	tokens: Array<{ token: Token; amount: bigint; spender: `0x${string}` }>,
	owner: `0x${string}`
): Promise<AllowanceCheckResult[]> {
	// FIX: Filter out invalid entries first
	const validTokens = tokens.filter(({ token, spender }) => 
		token.address && isAddress(token.address) && spender && isAddress(spender)
	);
	
	if (validTokens.length === 0) {
		return [];
	}
	
	// FIX: Use Promise.allSettled to handle partial failures
	const results = await Promise.allSettled(
		validTokens.map(({ token, amount, spender }) =>
			checkAllowance(token, amount, spender, owner)
		)
	);

	return results.map((result, index) => {
		if (result.status === 'fulfilled') {
			return result.value;
		}
		// Return a default result for failed checks
		const { token, amount } = validTokens[index];
		return {
			needsApproval: true,
			currentAllowance: 0n,
			requiredAmount: amount,
			token
		};
	});
}

export function validateTokenSafety(tokens: Token[]): void {
	for (const token of tokens) {
		// FIX: More descriptive error messages
		if (token.isTaxToken) {
			throw new Error(
				`🛑 EXECUTION BLOCKED: Token ${token.symbol} is flagged as a tax token (fee-on-transfer). ` +
					`Converting this token could result in unexpected losses due to transfer fees.`
			);
		}

		// FIX: HIGH risk should not block, only CRITICAL
		if (token.riskLevel === 'CRITICAL') {
			throw new Error(
				`🛑 EXECUTION BLOCKED: Token ${token.symbol} has CRITICAL risk level. ` +
					`This token may be malicious or have unusual behavior that could cause loss of funds.`
			);
		}

		if (token.balance === 0n) {
			throw new Error(
				`⚠️ VALIDATION ERROR: Token ${token.symbol} has zero balance. ` +
					`Cannot convert a token with no balance.`
			);
		}

		// FIX: Allow tokens with 0 USD value but warn
		if (token.valueUsd < 0) {
			throw new Error(
				`⚠️ VALIDATION ERROR: Token ${token.symbol} has negative USD value. ` +
					`This indicates a data error.`
			);
		}
	}
}

export function buildApprovalTx(
	token: Token,
	amount: bigint,
	spender: `0x${string}`
): {
	to: `0x${string}`;
	data: `0x${string}`;
	value: bigint;
} {
	// FIX: Validate inputs
	if (!token.address || !isAddress(token.address)) {
		throw new Error(`Invalid token address: ${token.address}`);
	}
	if (!spender || !isAddress(spender)) {
		throw new Error(`Invalid spender address: ${spender}`);
	}
	
	return {
		to: token.address,
		data: encodeFunctionData({
			abi: erc20Abi,
			functionName: 'approve',
			args: [spender, amount]
		}),
		value: 0n
	};
}

export function estimateApprovalGasCost(approvalsNeeded: number): number {
	// FIX: Validate input
	if (approvalsNeeded < 0 || !Number.isFinite(approvalsNeeded)) {
		return 0;
	}
	
	const gasPerApproval = 50000;
	const gasPriceGwei = 20;
	const ethPriceUsd = 3000;

	const totalGas = approvalsNeeded * gasPerApproval;
	const ethCost = (totalGas * gasPriceGwei) / 1e9;
	const usdCost = ethCost * ethPriceUsd;

	return usdCost;
}
