import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, sepolia, base, baseSepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'CCA Minimal',
  projectId: 'dfda96ad00844623a353556991d78e37',
  chains: [mainnet, sepolia, base, baseSepolia],
  ssr: true,
});
