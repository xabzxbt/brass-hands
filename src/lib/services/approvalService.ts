import { readContract, writeContract } from '@wagmi/core';
import { config } from '$lib/config/wagmi';
import type { Token } from '$lib/types';
import { encodeFunctionData, erc20Abi } from 'viem';

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
		console.error('❌ Failed to check allowance:', error);
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
	const checks = tokens.map(({ token, amount, spender }) =>
		checkAllowance(token, amount, spender, owner)
	);

	return Promise.all(checks);
}

export function validateTokenSafety(tokens: Token[]): void {
	for (const token of tokens) {
		if (token.isTaxToken) {
			throw new Error(
				`🛑 EXECUTION BLOCKED: Token ${token.symbol} is flagged as a tax token (fee-on-transfer). ` +
					`Converting this token could result in unexpected losses.`
			);
		}

		if (token.riskLevel === 'CRITICAL' || token.riskLevel === 'HIGH') {
			throw new Error(
				`🛑 EXECUTION BLOCKED: Token ${token.symbol} has ${token.riskLevel} risk level. ` +
					`This token may be malicious or have unusual behavior.`
			);
		}

		if (token.balance === 0n) {
			throw new Error(
				`⚠️ VALIDATION ERROR: Token ${token.symbol} has zero balance. ` +
					`Cannot convert a token with no balance.`
			);
		}

		if (token.valueUsd <= 0) {
			throw new Error(
				`⚠️ VALIDATION ERROR: Token ${token.symbol} has no USD value. ` +
					`Cannot determine conversion value.`
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
	const gasPerApproval = 50000;
	const gasPriceGwei = 20;
	const ethPriceUsd = 3000;

	const totalGas = approvalsNeeded * gasPerApproval;
	const ethCost = (totalGas * gasPriceGwei) / 1e9;
	const usdCost = ethCost * ethPriceUsd;

	return usdCost;
}
