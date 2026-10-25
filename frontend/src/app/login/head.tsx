'use client';

import { useTranslation } from 'react-i18next';

export default function Head() {
  const { t } = useTranslation();
  return (
    <>
      <title>{t('login.signIn')}</title>
      <meta name="robots" content="noindex" />
    </>
  );
}
