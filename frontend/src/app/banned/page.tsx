
'use client';

import { useTranslation } from 'react-i18next';
 
export default function BannedPage() {
  const { t } = useTranslation();
 
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
          <span className="text-red-600 font-bold">!</span>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">{t('banned.title')}</h1>
        <p className="text-gray-600 mb-4">{t('banned.description')}</p>
        <a href="/login" className="text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded inline-block">{t('common.goToLogin')}</a>
      </div>
    </div>
  );
}
