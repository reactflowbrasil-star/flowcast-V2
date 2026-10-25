'use client';

import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-2">{t('common.pageNotFoundTitle')}</h1>
        <p className="text-gray-600 mb-4">{t('common.notFound')}</p>
        <a href="/login" className="text-blue-600 underline">{t('common.goToLogin')}</a>
      </div>
    </div>
  );
}
