// FIX: Safe access to env variables with fallbacks
export const REOWN_PROJECT_ID = import.meta.env.VITE_PROJECT_ID || '';
export const RELAY_API_KEY = import.meta.env.VITE_RELAY_API_KEY || '';
export const ROUTESCAN_API_KEY = import.meta.env.VITE_ROUTESCAN_API_KEY || '';
export const COVALENT_API_KEY = import.meta.env.VITE_COVALENT_API_KEY || '';

export const API_ENDPOINTS = {
	ROUTESCAN: 'https://api.routescan.io/v2',
	DUNE: 'https://api.dune.com/api/v1',
	RELAY: 'https://api.relay.link/execute',
	ALCHEMY_MULTICALL: 'https://eth-mainnet.g.alchemy.com/v2'
} as const;

export const DUST_CONFIG = {
	MIN_VALUE: 0.00,
	MAX_VALUE: 100000.00,
	WARN_IMPACT: 5,
	BLOCK_IMPACT: 15,
	DEFAULT_OUTPUT_TOKEN: 'ETH' as const
} as const;

export type TargetToken = 'ETH' | 'USDC' | 'DAI';

// FIX: Add type for chain-specific token addresses
export type ChainTokenAddresses = {
	WETH: string;
	USDC: string;
	USDT?: string;
	DAI: string;
	USDbC?: string;
};

export const TOKEN_ADDRESSES: Record<number, ChainTokenAddresses> = {
	1: {
		WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
		USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
		USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
		DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F'
	},
	42161: {
		WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
		USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
		USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'
	},
	8453: {
		WETH: '0x4200000000000000000000000000000000000006',
		USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
		USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
		DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb'
	},
	137: {
		WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
		USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
		USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
		DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'
	},
	10: {
		WETH: '0x4200000000000000000000000000000000000006',
		USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
		USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
		DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'
	},
	56: {
		WETH: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
		USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
		USDT: '0x55d398326f99059fF775485246999027B3197955',
		DAI: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3'
	}
} as const;

// FIX: Use Map for better performance and type safety
export const TAX_TOKEN_BLOCKLIST = new Set<string>([
	'0x000000000000000000000000000000000000dead',
]);

// FIX: Add helper function to check if address is in blocklist
export function isBlocklistedToken(address: string): boolean {
	return TAX_TOKEN_BLOCKLIST.has(address.toLowerCase());
}

// FIX: Add helper to get token addresses for a chain
export function getChainTokenAddresses(chainId: number): ChainTokenAddresses | undefined {
	return TOKEN_ADDRESSES[chainId];
}
