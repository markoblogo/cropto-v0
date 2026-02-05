export const AUTH_PROMPT_EVENT = "cropto:auth-required";

export interface AuthPromptDetail {
  returnTo?: string;
}

export function getCurrentPathWithSearch(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

export function openAuthPrompt(returnTo?: string) {
  if (typeof window === "undefined") return;
  const detail: AuthPromptDetail = { returnTo: returnTo || getCurrentPathWithSearch() };
  window.dispatchEvent(new CustomEvent<AuthPromptDetail>(AUTH_PROMPT_EVENT, { detail }));
}

