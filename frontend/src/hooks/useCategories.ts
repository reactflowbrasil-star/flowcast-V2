import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiService } from '@/services/api';
import { apiErrorMessage } from '@/lib/utils';

export interface Category {
  id: number;
  name: string;
  category_type: string;
}

export const useCategories = () => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      const result = await apiService.get<Category[]>('/api/reseller/categories');
      if (result.success) {
        return result.data;
      }
      throw new Error(apiErrorMessage(result.error, t('products.errors.loadCategoriesFailed')));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useCategoriesAdmin = () => {
  const { t } = useTranslation();
  return useQuery({
    queryKey: ['categories-admin'],
    queryFn: async (): Promise<Category[]> => {
      const result = await apiService.get<Category[]>('/api/admin/categories');
      if (result.success) {
        return result.data;
      }
      throw new Error(apiErrorMessage(result.error, t('products.errors.loadCategoriesFailed')));
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};
