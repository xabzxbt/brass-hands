import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { REOWN_PROJECT_ID } from './constants';
import { SUPPORTED_CHAINS } from './chains';

import type { AppKitNetwork } from '@reown/appkit/networks';

import { mainnet } from '@reown/appkit/networks';

export const wagmiAdapter = new WagmiAdapter({
	projectId: REOWN_PROJECT_ID,
	networks: SUPPORTED_CHAINS
});

export const config = wagmiAdapter.wagmiConfig;

export const modal = createAppKit({
	adapters: [wagmiAdapter],
	networks: SUPPORTED_CHAINS,
	defaultNetwork: mainnet,
	projectId: REOWN_PROJECT_ID,
	metadata: {
		name: 'Brass Hands',
		description: 'Sweep small token balances into liquid assets',
		url: typeof window !== 'undefined' ? window.location.origin : 'https://brasshands.xyz',
		icons: ['https://brasshands.xyz/logo.png']
	},
	features: {
		analytics: true,
		email: false,
		socials: false
	},
	themeMode: 'dark',
	themeVariables: {
		'--w3m-accent': '#FF4D00',
		'--w3m-border-radius-master': '0px',
		'--w3m-font-family': 'monospace'
	}
});
