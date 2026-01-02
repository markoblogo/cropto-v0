import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';

type Language = 'en' | 'uk' | 'es' | 'pt';

const languages: Array<{ code: Language; label: string; flag: string }> = [
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'uk', label: 'UK', flag: '🇺🇦' },
  { code: 'es', label: 'ES', flag: '🇪🇸' },
  { code: 'pt', label: 'PT', flag: '🇧🇷' },
];

export default function FlagSwitcher() {
  const { i18n, t } = useTranslation();
  
  const normalizedLang = (i18n.language.split('-')[0] as Language) || 'en';
  const currentLanguage = languages.find(lang => lang.code === normalizedLang) || languages[0];

  const handleLanguageChange = (langCode: Language) => {
    i18n.changeLanguage(langCode);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title={`${t('header.language')}: ${currentLanguage.label}`}
          data-testid="button-language-toggle"
          className="font-mono text-xs gap-1.5"
        >
          <Globe className="h-4 w-4" />
          <span>{currentLanguage.flag}</span>
          <span>{currentLanguage.label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={normalizedLang === lang.code ? 'bg-accent' : ''}
          >
            <span className="mr-2">{lang.flag}</span>
            <span>{lang.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
