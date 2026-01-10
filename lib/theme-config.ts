// Theme configuration for customizable auction participation pages
// Teams can customize these values to match their branding

export interface AuctionTheme {
  // Branding
  projectName: string;
  projectLogo?: string; // URL to logo image
  projectDescription?: string;

  // Colors (Tailwind classes or hex values)
  primaryColor: string;       // Main accent color (buttons, highlights)
  primaryHover: string;       // Hover state for primary
  secondaryColor: string;     // Secondary accent
  backgroundColor: string;    // Page background
  cardBackground: string;     // Card/panel backgrounds
  textPrimary: string;        // Main text color
  textSecondary: string;      // Muted text color

  // Gradient backgrounds
  gradientFrom: string;
  gradientTo: string;

  // Status colors
  statusActive: string;
  statusPending: string;
  statusEnded: string;
  statusClaimable: string;

  // Social links
  website?: string;
  twitter?: string;
  discord?: string;
  telegram?: string;

  // Custom content
  heroTitle?: string;
  heroSubtitle?: string;
  tokenSymbol?: string;

  // Features to show/hide
  showTimer: boolean;
  showProgressBar: boolean;
  showLeaderboard: boolean;
  showYourBids: boolean;
}

// Default theme matching the existing CCA Minimal style
export const defaultTheme: AuctionTheme = {
  projectName: 'Token Sale',
  projectDescription: 'Participate in our fair token distribution via Continuous Clearing Auction',

  primaryColor: 'bg-indigo-600',
  primaryHover: 'hover:bg-indigo-700',
  secondaryColor: 'bg-purple-600',
  backgroundColor: 'bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800',
  cardBackground: 'bg-white dark:bg-gray-800',
  textPrimary: 'text-gray-900 dark:text-white',
  textSecondary: 'text-gray-600 dark:text-gray-400',

  gradientFrom: 'from-blue-50 dark:from-gray-900',
  gradientTo: 'to-indigo-100 dark:to-gray-800',

  statusActive: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  statusPending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  statusEnded: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  statusClaimable: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',

  showTimer: true,
  showProgressBar: true,
  showLeaderboard: false,
  showYourBids: true,

  heroTitle: 'Join the Token Sale',
  heroSubtitle: 'Fair price discovery through continuous clearing auction',
};

// Example themes teams can use as starting points
export const darkGamingTheme: AuctionTheme = {
  projectName: 'GameFi Token',
  projectDescription: 'Power up your gaming experience with our utility token',

  primaryColor: 'bg-purple-600',
  primaryHover: 'hover:bg-purple-700',
  secondaryColor: 'bg-pink-600',
  backgroundColor: 'bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900',
  cardBackground: 'bg-gray-800/80 backdrop-blur',
  textPrimary: 'text-white',
  textSecondary: 'text-gray-400',

  gradientFrom: 'from-gray-900',
  gradientTo: 'to-purple-900',

  statusActive: 'bg-green-500/20 text-green-400 border border-green-500/30',
  statusPending: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  statusEnded: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  statusClaimable: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',

  showTimer: true,
  showProgressBar: true,
  showLeaderboard: true,
  showYourBids: true,

  heroTitle: 'Enter the Arena',
  heroSubtitle: 'Secure your tokens before the battle begins',
};

export const cleanMinimalTheme: AuctionTheme = {
  projectName: 'Protocol Token',
  projectDescription: 'Decentralized infrastructure for the future',

  primaryColor: 'bg-black dark:bg-white',
  primaryHover: 'hover:bg-gray-800 dark:hover:bg-gray-200',
  secondaryColor: 'bg-gray-600',
  backgroundColor: 'bg-white dark:bg-black',
  cardBackground: 'bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800',
  textPrimary: 'text-black dark:text-white',
  textSecondary: 'text-gray-500 dark:text-gray-500',

  gradientFrom: 'from-white dark:from-black',
  gradientTo: 'to-gray-50 dark:to-gray-900',

  statusActive: 'bg-black text-white dark:bg-white dark:text-black',
  statusPending: 'bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  statusEnded: 'bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  statusClaimable: 'bg-black text-white dark:bg-white dark:text-black',

  showTimer: true,
  showProgressBar: true,
  showLeaderboard: false,
  showYourBids: true,

  heroTitle: 'Token Distribution',
  heroSubtitle: 'Fair launch via continuous clearing auction',
};

// Helper to merge partial theme with defaults
export function createTheme(overrides: Partial<AuctionTheme>): AuctionTheme {
  return { ...defaultTheme, ...overrides };
}

// Pre-configured auction themes (teams can add their own here)
export const auctionThemes: Record<string, AuctionTheme> = {
  default: defaultTheme,
  gaming: darkGamingTheme,
  minimal: cleanMinimalTheme,
};
