import { useEffect, useState } from 'react';
import i18n, { loadNamespace as loadNs } from '@/lib/i18n';

/**
 * useLoadNamespace(ns)
 * Dynamically loads a translation namespace and reloads it on language changes.
 * Returns a boolean indicating loading state (nsLoading).
 *
 * Notes:
 * - Uses resolvedLanguage when available.
 * - Treats the namespace as "ready" only when both EN and the current language
 *   bundles exist, so fallbackLng works without showing raw keys.
 */
export default function useLoadNamespace(ns: string): boolean {
  const initialLang = i18n.resolvedLanguage || i18n.language || 'en';
  const initialLoaded =
    i18n.hasResourceBundle('en', ns) && i18n.hasResourceBundle(initialLang, ns);

  const [nsLoading, setNsLoading] = useState<boolean>(!initialLoaded);

  useEffect(() => {
    let mounted = true;

    const doLoad = async (lng: string) => {
      try {
        setNsLoading(true);
        await loadNs(lng, ns);
      } finally {
        if (mounted) setNsLoading(false);
      }
    };

    // Initial load for current language.
    doLoad(i18n.resolvedLanguage || i18n.language || 'en');

    // Re-load on language change.
    const onLanguageChanged = (lng: string) => {
      doLoad(lng);
    };

    i18n.on('languageChanged', onLanguageChanged);

    return () => {
      mounted = false;
      i18n.off('languageChanged', onLanguageChanged);
    };
  }, [ns]);

  return nsLoading;
}

// Named export for compatibility
export { useLoadNamespace };
