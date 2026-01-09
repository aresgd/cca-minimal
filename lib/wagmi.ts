import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, sepolia, base, baseSepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'CCA Minimal',
  projectId: 'cca-minimal', // Get from https://cloud.walletconnect.com
  chains: [mainnet, sepolia, base, baseSepolia],
  ssr: true,
});
