// Shared margin profile definitions for option UI.
// Mapping:
// - usePremiumAsMargin drives the existing flag we already send to backend.
// - riskMultiplier is a display-only factor for showing more conservative margin (does not change settlement logic).
export type MarginProfileId = "standard" | "premium-margin" | "conservative";

export interface MarginProfile {
  id: MarginProfileId;
  label: string;
  description: string;
  usePremiumAsMargin: boolean;
  riskMultiplier: number;
}

export const MARGIN_PROFILES: MarginProfile[] = [
  {
    id: "standard",
    label: "Standard",
    description: "Use current initial margin rules",
    usePremiumAsMargin: false,
    riskMultiplier: 1,
  },
  {
    id: "premium-margin",
    label: "Premium as margin",
    description: "Apply premium as collateral (usePremiumAsMargin=true)",
    usePremiumAsMargin: true,
    riskMultiplier: 1,
  },
  {
    id: "conservative",
    label: "Conservative",
    description: "Display-only +20% risk buffer",
    usePremiumAsMargin: false,
    riskMultiplier: 1.2,
  },
];

export function getMarginProfile(id: MarginProfileId): MarginProfile {
  return MARGIN_PROFILES.find((p) => p.id === id) || MARGIN_PROFILES[0];
}
