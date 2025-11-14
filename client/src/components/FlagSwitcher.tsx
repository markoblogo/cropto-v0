import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';

export default function FlagSwitcher() {
  const { i18n, t } = useTranslation();
  
  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'uk' : 'en';
    i18n.changeLanguage(newLang);
  };

  const currentLang = i18n.language.toUpperCase();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      title={`${t('header.language')}: ${currentLang}`}
      data-testid="button-language-toggle"
      className="font-mono text-xs gap-1.5"
    >
      <Globe className="h-4 w-4" />
      <span>{currentLang}</span>
    </Button>
  );
}
