import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, LogOut } from 'lucide-react';

const BannedAccount: React.FC = () => {
  const { logout } = useAuth();
  const { t } = useTranslation();

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Logout error handled silently
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <CardTitle className="text-xl font-semibold text-gray-900">
            {t('banned.title', {})}
          </CardTitle>
          <CardDescription className="text-gray-600">
            {t('banned.description', {})}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center space-y-2">
            <p className="text-sm text-gray-700">
              {t('banned.message1', {})}
            </p>
            <p className="text-sm text-gray-700">
              {t('banned.message2', {})}
            </p>
          </div>
          
          <div className="pt-4">
            <Button 
              onClick={handleLogout}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              size="lg"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t('common.logout')}
            </Button>
          </div>
          
          <div className="text-center pt-2">
            <p className="text-xs text-gray-500">
              {t('banned.contactSupport', {})}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BannedAccount;
