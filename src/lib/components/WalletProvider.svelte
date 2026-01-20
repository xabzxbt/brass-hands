<script lang="ts">
	import { onMount } from 'svelte';
	import { getAccount, watchAccount, watchChainId } from '@wagmi/core';
	import { config } from '$lib/config/wagmi';
	import { walletStore } from '$lib/stores/wallet.svelte';
	import { detectStrategy } from '$lib/services/executionService';

	onMount(() => {
		// Sync initial state
		const syncState = () => {
			const account = getAccount(config);
			if (account.isConnected && account.address && account.chainId) {
				walletStore.setConnected(account.address as `0x${string}`, account.chainId);
				detectStrategy(account.address as `0x${string}`, account.chainId)
					.then(s => walletStore.setStrategy(s))
					.catch(() => {});
			} else {
				walletStore.setDisconnected();
			}
		};

		syncState();

		const unsubscribeAccount = watchAccount(config, {
			onChange(account) {
				if (account.isConnected && account.address && account.chainId) {
					walletStore.setConnected(account.address as `0x${string}`, account.chainId);
					detectStrategy(account.address as `0x${string}`, account.chainId)
						.then(s => walletStore.setStrategy(s))
						.catch(() => {});
				} else if (account.isDisconnected) {
					walletStore.setDisconnected();
				}
			}
		});

		const unsubscribeChain = watchChainId(config, {
			onChange(chainId) {
				walletStore.setChainId(chainId);
				const account = getAccount(config);
				if (account.isConnected && account.address) {
					detectStrategy(account.address as `0x${string}`, chainId)
						.then(s => walletStore.setStrategy(s))
						.catch(() => {});
				}
			}
		});

		return () => {
			unsubscribeAccount();
			unsubscribeChain();
		};
	});
</script>
