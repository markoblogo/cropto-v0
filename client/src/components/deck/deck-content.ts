export type DeckNavItem = {
  label: string;
  href: `#${string}`;
};

export type DeckFaqItem = {
  question: string;
  answer: string;
};

export type DeckCardItem = {
  title: string;
  description: string;
};

export type DeckHeroImage = {
  src: string;
  alt: string;
};

export type DeckEcosystemLink = {
  label: string;
  href: string;
  description: string;
};

export const CROPTO_MAIN_SITE_URL = "https://cropto.abvx.xyz/";

// YouTube source reference for teaser playback on /deck.
export const CROPTO_DECK_VIDEO_SOURCE_URL = "https://youtu.be/zumLJKZQFxc";
export const CROPTO_DECK_VIDEO_YOUTUBE_ID = "zumLJKZQFxc";

export const CROPTO_GOOGLE_SLIDES_PUBLIC_URL =
  "https://docs.google.com/presentation/d/e/2PACX-1vS3ZuJDEm_pUcaHyDVa9PYffdDrZQXKatsHV3nISsDL5KlW9SFYYsvVsFf7NaahWPqViijK2RhQY9Jl/pub?start=true&loop=true&delayms=3000";

export const CROPTO_GOOGLE_SLIDES_EMBED_URL =
  "https://docs.google.com/presentation/d/e/2PACX-1vS3ZuJDEm_pUcaHyDVa9PYffdDrZQXKatsHV3nISsDL5KlW9SFYYsvVsFf7NaahWPqViijK2RhQY9Jl/pubembed?start=false&loop=false&delayms=3000";

export const CROPTO_DECK_PDF_URL = "/deck/presentations/cropto-investor-deck.pdf";

export const CROPTO_DECK_HERO_IMAGES: DeckHeroImage[] = [
  { src: "/deck/hero/hero1.svg", alt: "Cropto market architecture hero visual one" },
  { src: "/deck/hero/hero2.svg", alt: "Cropto market architecture hero visual two" },
  { src: "/deck/hero/hero3.svg", alt: "Cropto market architecture hero visual three" },
  { src: "/deck/hero/hero4.svg", alt: "Cropto market architecture hero visual four" },
  { src: "/deck/hero/hero5.svg", alt: "Cropto market architecture hero visual five" },
];

export const DECK_NAV_ITEMS: DeckNavItem[] = [
  { label: "Overview", href: "#overview" },
  { label: "Problem", href: "#problem" },
  { label: "Product", href: "#product" },
  { label: "Market Model", href: "#market-model" },
  { label: "Deck", href: "#deck" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

export const DECK_PAGE_COPY = {
  heroTitle: "Cropto brings local market risk tools into modern digital infrastructure.",
  heroSubtitle:
    "A tokenized spot-index framework for commodity hedging, speculation, and arbitrage - built to reflect physical market realities, not just global benchmark exchanges.",
  heroMicrocopy:
    "Built for commodity traders, producers, and market participants seeking more relevant hedging instruments.",
  viewDeckCta: "View partner deck",
  exploreProductCta: "Explore Cropto product",
  backToCroptoCta: "Back to Cropto",
  videoTitle: "Teaser Video",
  videoIntro:
    "A short visual overview of Cropto's market thesis and product direction for partners and investors.",
  problemTitle: "The Hedging Gap in Physical Commodity Markets",
  problemBody:
    "Global commodity markets operate in persistent turbulence driven by geopolitical shocks, macro uncertainty, and excess financial liquidity. A growing share of volatility is shaped by technical and emotional flows rather than changes in local physical supply-demand fundamentals.",
  problemBody2:
    "Real-sector participants often face a narrow choice: hedge through large exchanges such as CME / MATIF despite basis risk, or avoid hedging and carry direct price exposure. The result is a structural mismatch between available instruments and local risk reality.",
  notEnoughTitle: "Benchmark Liquidity Is Not the Same as Relevant Protection",
  notEnoughBody:
    "Benchmark contracts can be liquid, but liquidity alone does not guarantee hedge efficiency. When local price behavior diverges from benchmark exchange pricing, protection weakens. Cropto starts from a different premise: risk tools should align with the market structure they protect.",
  productTitle: "Cropto: Tokenized Local Spot-Index Risk Infrastructure",
  productBody:
    "Cropto is building an accessible alternative for commodity risk management based on tokenized local spot indices. The goal is stronger correlation with physical market realities and more flexible settlement rails enabled by modern blockchain infrastructure.",
  productBody2:
    "Cropto is designed as a bridge between the physical commodity world and programmable digital market infrastructure.",
  marketModelTitle: "How Cropto Changes the Market Structure",
  marketModelIntro:
    "Cropto is not only a trading interface. It can become infrastructure that improves how risk is distributed across real-sector and financial participants.",
  marketModelTakeaway:
    "Cropto can turn local market risk into a scalable digital liquidity layer - without disconnecting from physical market fundamentals.",
  marketScopeTitle: "Geographic Scope and Expansion Logic",
  marketScopeBody:
    "Cropto starts where basis mismatch and local pricing realities create strong demand for better-aligned risk tools, then expands through a repeatable index-and-liquidity model.",
  useCasesTitle: "Core Use Cases",
  whyNowTitle: "Why Now",
  statusTitle: "Product Status",
  statusBody:
    "Cropto is in active development, with core product foundations already built. The current environment is available for review, testing, and partner conversations while platform capabilities continue to expand.",
  deckTitle: "Project Deck",
  deckIntro:
    "Partner / investor overview presentation (strategy, market model, product direction, and expansion logic).",
  faqTitle: "FAQ",
  contactTitle: "Partner & Investor Conversations",
  contactBody:
    "We are open to discussions with strategic partners, market participants, and investors interested in the next generation of commodity market infrastructure.",
  footerNote: "Investor / partner materials. Product is in active development.",
  ctaBandTitle: "Build with the next layer of commodity market infrastructure.",
  ctaBandBody:
    "We are looking for strategic partners, market participants, and investors who want to help shape locally relevant risk infrastructure for global commodity markets.",
};

export const PROBLEM_BULLETS = [
  "High basis risk vs local physical markets",
  "Limited alternatives for SMEs and regional traders",
  "Exchange liquidity concentrated in global benchmarks",
  "Risk tools often detached from local market behavior",
];

export const PRODUCT_FEATURES: DeckCardItem[] = [
  {
    title: "Tokenized local spot indices",
    description: "Index design aligned with local market pricing behavior.",
  },
  {
    title: "Futures-like and options-like framework",
    description: "Instrument architecture in active development across roadmap stages.",
  },
  {
    title: "Regional market rollout",
    description: "Country-by-country expansion model with reusable index logic.",
  },
  {
    title: "Transparent digital-first rails",
    description: "Programmable execution and settlement workflows with auditability in mind.",
  },
];

export const MARKET_MODEL_STEPS: DeckCardItem[] = [
  {
    title: "1. Producer / real-sector hedge adoption",
    description: "Participants hedge local exposure with instruments closer to local market behavior.",
  },
  {
    title: "2. Local-market speculative liquidity",
    description: "Hedging demand attracts speculative capital around local risk rather than only global benchmarks.",
  },
  {
    title: "3. Scalable digital participation",
    description: "Smaller firms and non-physical participants can express market views without logistics exposure.",
  },
  {
    title: "4. Cleaner supply-chain roles",
    description: "Physical players focus on operations while risk transfer becomes more efficient in dedicated rails.",
  },
  {
    title: "5. Liquidity flywheel",
    description: "More hedgers -> more liquidity -> better pricing -> stronger utility for hedgers.",
  },
];

export const TARGET_MARKETS = ["Ukraine", "Europe", "USA", "Brazil", "Argentina", "Canada"];

export const USE_CASES: DeckCardItem[] = [
  {
    title: "Hedging",
    description: "For producers and commercial participants seeking protection closer to local market conditions.",
  },
  {
    title: "Speculation",
    description: "For participants expressing views on local markets, spreads, and volatility.",
  },
  {
    title: "Arbitrage / Relative Value",
    description: "Cross-market and cross-tenor strategies built on tokenized index infrastructure.",
  },
];

export const WHY_NOW_POINTS = [
  "Persistent geopolitical and macro volatility",
  "Need for more locally relevant risk tools",
  "Maturing blockchain infrastructure and settlement rails",
  "Increasing demand for transparent, programmable market infrastructure",
  "Opportunity to build category leadership early in tokenized commodity risk markets",
];

export const DECK_FAQ_ITEMS: DeckFaqItem[] = [
  {
    question: "What is Cropto in one sentence?",
    answer:
      "Cropto is a tokenized local spot-index infrastructure for commodity hedging, speculation, and arbitrage.",
  },
  {
    question: "Who is Cropto for first?",
    answer:
      "Initial focus is on real-sector commodity participants and trading firms that need risk tools better aligned with local market dynamics.",
  },
  {
    question: "How do you differ from CME / MATIF-based hedging?",
    answer:
      "Cropto is designed to reduce mismatch between benchmark instruments and local physical exposure by building instruments on local spot-index logic.",
  },
  {
    question: "What is the relationship between Cropto and physical trade?",
    answer:
      "Cropto is built to improve risk transfer around physical commodity markets, not replace physical logistics and execution.",
  },
];

export const DECK_ECOSYSTEM_LINKS: DeckEcosystemLink[] = [
  {
    label: "Spike.brokers",
    href: "https://spike.broker/",
    description: "Broker infrastructure partner",
  },
  {
    label: "Trade Solution",
    href: "https://trade-solution.eu/",
    description: "Commodity trade and operations context",
  },
  {
    label: "Liqua",
    href: "https://liqua.abvx.xyz/",
    description: "Related market infrastructure project",
  },
  {
    label: "Cropto beta",
    href: "https://cropto.abvx.xyz/",
    description: "Current product environment",
  },
];

export const CONTACT_INTEREST_OPTIONS = [
  "Partnership discussion",
  "Investor conversation",
  "Pilot / integration interest",
];
