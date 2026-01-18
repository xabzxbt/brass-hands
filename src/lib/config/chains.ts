import { mainnet, arbitrum, base, polygon, optimism, bsc } from '@reown/appkit/networks';
import type { AppKitNetwork } from '@reown/appkit/networks';

export const SUPPORTED_CHAINS = [
	mainnet,
	arbitrum,
	base,
	polygon,
	optimism,
	bsc
] as [AppKitNetwork, ...AppKitNetwork[]];

export const CHAIN_BY_ID = {
	[mainnet.id]: mainnet,
	[arbitrum.id]: arbitrum,
	[base.id]: base,
	[polygon.id]: polygon,
	[optimism.id]: optimism,
	[bsc.id]: bsc
} as const;

export function getChainById(chainId: number) {
	return CHAIN_BY_ID[chainId as keyof typeof CHAIN_BY_ID];
}

export function isChainSupported(chainId: number): boolean {
	return chainId in CHAIN_BY_ID;
}
