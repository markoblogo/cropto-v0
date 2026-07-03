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

export type DeckProofItem = DeckCardItem & {
  status: string;
};

export type DeckHeroImage = {
  src: string;
  alt: string;
};

export type DeckEcosystemLink = {
  label: string;
  href: string;
  description: string;
  tag: string;
};

export const CROPTO_MAIN_SITE_URL = `${(import.meta.env.VITE_PUBLIC_APP_URL || "https://cr0pto.com").replace(/\/+$/, "")}/`;
export const CROPTO_REPOSITORY_URL = "https://github.com/markoblogo/cropto";

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
  { label: "What", href: "#what" },
  { label: "Indices", href: "#indices" },
  { label: "Proofs", href: "#proofs" },
  { label: "Path", href: "#path" },
  { label: "Deck", href: "#deck" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
];

export const DECK_PAGE_COPY = {
  heroTitle: "Cropto Investor Brief",
  heroSubtitle:
    "Indexed trading and settlement infrastructure for agricultural commodities.",
  heroMicrocopy:
    "Cropto connects local commodity indices, physical-market contracts and programmable settlement workflows. It is the planned trading and settlement layer of the broader AMI stack, built around MN7R, 1D3X, SPIKE/UGA Index and future regulated risk-product partners.",
  heroStatus:
    "Status: functional prototype, paused standalone development, revival-ready for partner-backed pilots.",
  viewDeckCta: "View deck PDF",
  exploreProductCta: "View technical repository",
  discussPilotCta: "Discuss indexed trading pilot",
  exploreAmiCta: "Explore AMI stack",
  videoTitle: "Teaser Video",
  videoIntro:
    "A short visual overview of Cropto's market-infrastructure thesis and product direction for partners and investors.",
  problemTitle: "The Hedging Gap in Physical Commodity Markets",
  problemBody:
    "Global commodity markets operate in persistent turbulence driven by geopolitical shocks, macro uncertainty, and excess financial liquidity. A growing share of volatility is shaped by technical and emotional flows rather than changes in local physical supply-demand fundamentals.",
  problemBody2:
    "Real-sector participants often face a narrow choice: hedge through large exchanges such as CME / MATIF despite basis risk, or avoid hedging and carry direct price exposure. The result is a structural mismatch between available instruments and local risk reality.",
  notEnoughTitle: "Benchmark Liquidity Is Not the Same as Relevant Protection",
  notEnoughBody:
    "Benchmark contracts can be liquid, but liquidity alone does not guarantee hedge efficiency. When local price behavior diverges from benchmark exchange pricing, protection weakens. Cropto starts from a different premise: risk tools should align with the market structure they protect.",
  productTitle: "What Cropto Is",
  productBody:
    "Cropto is designed for spot and options workflows on agricultural commodities and local commodity indices, using benchmark data from 1D3X and SPIKE as reference infrastructure.",
  productBody2:
    "Cropto uses tokenization as infrastructure for document verification, contract-state records, settlement traceability and optional programmable clearing, not as a speculative NFT or public-token product.",
  notCryptoTitle: "What Cropto Is Not",
  notCryptoBody:
    "Cropto is not a generic crypto exchange, DeFi casino or speculative NFT marketplace. Tokenization is used as a representation and trust layer. A tokenized document or contract-state record is not designed for standalone speculation; it represents a verified document, contract state, settlement record or index-linked exposure.",
  indicesTitle: "Why Indices Matter",
  indicesBody:
    "1D3X provides local benchmark infrastructure. SPIKE provides Ukrainian physical-market indices. Cropto uses these indices as reference prices for indexed spot, options and risk-management workflows.",
  indicesPrinciple:
    "No trusted index -> no serious indexed trading layer. Trusted index -> possible local-market risk tools.",
  proofsTitle: "Implemented Technical Proofs",
  proofsBody:
    "The repository already contains working prototype modules and experiments. These are proof points, not claims of live regulated operation.",
  partnerPathTitle: "Commercial and Partner Path",
  partnerPathBody:
    "The next step is not to launch a public crypto market. The next step is to select the right regulated architecture for commodity-index trading, document verification and settlement workflows.",
  regulatoryTitle: "Risk and Regulatory Clarity",
  regulatoryBody:
    "Cropto is not currently offering live financial products or public trading services. The current system should be understood as a prototype and partner-pilot infrastructure. Any production deployment involving financial instruments, clearing, custody, payments or tokenized assets would require appropriate legal, regulatory and partner architecture.",
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
    "Cropto standalone development is currently paused while the AMI ecosystem expands through MN7R, 1D3X and SPIKE. The platform remains a functional prototype with implemented document-tokenization and tokenized-settlement experiments, ready for partner-backed revival or pilot work.",
  deckTitle: "Project Deck",
  deckIntro:
    "Partner / investor overview presentation (strategy, market model, product direction, and expansion logic).",
  faqTitle: "FAQ",
  contactTitle: "Partner & Investor Conversations",
  contactBody:
    "We are open to discussions with strategic partners, market participants, and investors interested in the next generation of commodity market infrastructure.",
  footerNote: "Investor / partner materials. Functional prototype; standalone development currently paused while the AMI ecosystem expands.",
  ctaBandTitle: "Discuss a partner-backed Cropto pilot.",
  ctaBandBody:
    "We are looking for strategic partners, market participants and investors who can help define the regulated architecture for indexed commodity workflows, document verification and settlement traceability.",
};

export const PROBLEM_BULLETS = [
  "High basis risk vs local physical markets",
  "Limited alternatives for SMEs and regional traders",
  "Exchange liquidity concentrated in global benchmarks",
  "Risk tools often detached from local market behavior",
];

export const PRODUCT_FEATURES: DeckCardItem[] = [
  {
    title: "Market Instruments Layer",
    description: "Spot, options and index-linked instruments on agricultural commodities and logistics.",
  },
  {
    title: "Document & Contract Layer",
    description: "Digital contracts, document tokenization, audit trail and document-state verification.",
  },
  {
    title: "Settlement Layer",
    description: "Internal USD-linked settlement unit, FX bridge, clearing logic and payment-state tracking.",
  },
  {
    title: "Blockchain / Trust Layer",
    description: "Optional on-chain anchoring, document fingerprints, tokenized records and programmable settlement experiments.",
  },
];

export const TECHNICAL_PROOFS: DeckProofItem[] = [
  {
    title: "Document-to-token workflow",
    description: "CroptOptionNFT and related routes prove document-bound option records can be represented as verifiable ERC-721 testnet records.",
    status: "Prototype",
  },
  {
    title: "Non-speculative document records",
    description: "NFT-like records are framed as document, contract-state and audit records, not collectible assets or retail trading inventory.",
    status: "Implemented proof",
  },
  {
    title: "Polygon Amoy settlement experiments",
    description: "The current codebase uses Polygon Amoy for CROPT ERC-20 and document-record experiments, keeping testnet references aligned with the repository-backed network.",
    status: "Experimental",
  },
  {
    title: "Tokenized asset settlement tests",
    description: "On-chain mint/balance routes, transaction records, option exercise, margin and settlement tables show settlement mechanics in prototype form.",
    status: "Prototype",
  },
  {
    title: "Internal settlement unit concept",
    description: "CROPT is used as a demo USD-linked accounting, margin and settlement unit. Final production rails remain architecture-dependent.",
    status: "Concept + demo",
  },
  {
    title: "Market workflow modules",
    description: "Sea Brokerage Monitor, BID/OFFER/TRADE flows, Telegram relay, scheduled reports and Sheets import support market-memory and broker workflow use cases.",
    status: "Functional modules",
  },
];

export const PARTNER_PATH_STEPS: DeckCardItem[] = [
  {
    title: "Partner-backed pilot",
    description: "Define market, commodity, participants, governance and pilot success criteria with strategic partners.",
  },
  {
    title: "1D3X/SPIKE index-data integration",
    description: "Consume live or demo benchmark data as reference prices for indexed workflows.",
  },
  {
    title: "Regulated architecture selection",
    description: "Choose public-chain, permissioned-ledger, private-ledger or non-crypto accounting based on legal and partner needs.",
  },
  {
    title: "Clearing and settlement partner research",
    description: "Map custody, payment rails, FX bridge, clearing logic and reporting requirements.",
  },
  {
    title: "Document verification pilot",
    description: "Test document fingerprints, contract-state records and settlement-state traceability with real partner workflows.",
  },
  {
    title: "Spot/options simulation before live products",
    description: "Run indexed simulations before any regulated financial product or production trading workflow.",
  },
];

export const MARKET_MODEL_STEPS: DeckCardItem[] = [
  {
    title: "1. Producer / real-sector hedge adoption",
    description: "Participants hedge local exposure with instruments closer to local market behavior.",
  },
  {
    title: "2. Local-market speculative liquidity",
    description: "Hedging demand can attract managed risk capital around local exposure rather than only global benchmarks.",
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
    title: "Indexed risk exposure",
    description: "For participants expressing managed views on local markets, spreads, and volatility.",
  },
  {
    title: "Arbitrage / Relative Value",
    description: "Cross-market and cross-tenor strategies built on tokenized index infrastructure.",
  },
];

export const WHY_NOW_POINTS = [
  "Persistent geopolitical and macro volatility",
  "Need for more locally relevant risk tools",
  "Maturing document-verification and settlement rails",
  "Increasing demand for transparent, programmable market infrastructure",
  "Opportunity to build category leadership early in indexed commodity risk infrastructure",
];

export const DECK_FAQ_ITEMS: DeckFaqItem[] = [
  {
    question: "What is Cropto in one sentence?",
    answer:
      "Cropto is the indexed trading, document-verification and settlement layer for agricultural commodity markets.",
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
    tag: "Partner",
  },
  {
    label: "Trade Solution",
    href: "https://trade-solution.eu/",
    description: "Commodity trade and operations context",
    tag: "Related Project",
  },
  {
    label: "Liqua",
    href: "https://liqua.abvx.xyz/",
    description: "Related market infrastructure project",
    tag: "Ecosystem",
  },
  {
    label: "Cropto beta",
    href: CROPTO_MAIN_SITE_URL,
    description: "Current product environment",
    tag: "Beta",
  },
  {
    label: "GitHub repository",
    href: CROPTO_REPOSITORY_URL,
    description: "Technical source and status docs",
    tag: "Technical",
  },
];

export const CONTACT_INTEREST_OPTIONS = [
  "Partnership discussion",
  "Investor conversation",
  "Pilot / integration interest",
  "Indexed trading pilot",
];
