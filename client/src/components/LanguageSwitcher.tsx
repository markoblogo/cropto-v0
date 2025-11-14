import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Languages } from 'lucide-react';

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  
  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'uk' : 'en';
    i18n.changeLanguage(newLang);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleLanguage}
      title={`${t('header.language')}: ${i18n.language.toUpperCase()}`}
      data-testid="button-language-toggle"
    >
      <Languages className="h-5 w-5" />
      <span className="sr-only">{t('header.language')}</span>
    </Button>
  );
}
