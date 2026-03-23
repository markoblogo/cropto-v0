import { useTheme } from "next-themes";

type ThemeAwareLogoProps = {
  alt: string;
  className?: string;
  testId?: string;
};

const CROPO_LOGO_LIGHT_SRC = "/branding/cropto-logo-light.svg";
const CROPO_LOGO_DARK_SRC = "/branding/cropto-logo-dark.svg";

export function ThemeAwareLogo({ alt, className = "h-8 w-auto", testId }: ThemeAwareLogoProps) {
  const { theme, resolvedTheme } = useTheme();
  const effectiveTheme = theme === "system" ? resolvedTheme : theme;
  const src = effectiveTheme === "dark" ? CROPO_LOGO_DARK_SRC : CROPO_LOGO_LIGHT_SRC;

  return <img src={src} alt={alt} className={className} data-testid={testId} />;
}
