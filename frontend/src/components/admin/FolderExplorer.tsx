'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { 
  Folder, 
  FolderOpen, 
  ArrowUp, 
  RefreshCw, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Home,
  HardDrive
} from 'lucide-react';
import { mediaScannerService, type FolderItem } from '@/services/mediaScanner';

interface FolderExplorerProps {
  selectedPath: string;
  onPathSelect: (path: string) => void;
  className?: string;
}

export default function FolderExplorer({ selectedPath, onPathSelect, className }: FolderExplorerProps) {
  useLoadNamespace('admin/mediaScanner');
  const { t } = useTranslation('admin/mediaScanner');
  const [currentPath, setCurrentPath] = useState<string>('/');

  // Fetch folders for current path
  const { 
    data: folders, 
    isLoading: loadingFolders, 
    error: foldersError,
    refetch: refetchFolders 
  } = useQuery({
    queryKey: ['folders', currentPath],
    queryFn: () => mediaScannerService.listFolders(currentPath),
    staleTime: 30000, // Cache for 30 seconds
  });

  // Update current path when selected path changes externally
  useEffect(() => {
    if (selectedPath && selectedPath !== currentPath) {
      setCurrentPath(selectedPath);
    }
  }, [selectedPath]);

  const handleFolderSelect = (folder: FolderItem) => {
    if (folder.isDirectory) {
      setCurrentPath(folder.path);
    }
  };

  const handleSelectCurrentFolder = () => {
    onPathSelect(currentPath);
  };

  const handleGoUp = () => {
    const pathParts = currentPath.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      pathParts.pop();
      const parentPath = '/' + pathParts.join('/');
      setCurrentPath(parentPath === '/' ? '/' : parentPath);
    }
  };

  const handleGoToRoot = () => {
    setCurrentPath('/');
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatLastModified = (dateString?: string): string => {
    if (!dateString) return '';
    try {
      const normalized = dateString.includes('T')
        ? dateString
        : dateString.replace(' ', 'T');
      const date = new Date(normalized);
      if (Number.isNaN(date.getTime())) {
        return '';
      }
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch {
      return '';
    }
  };

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Folder className="h-5 w-5" />
          {t('mediaScanner.folderExplorer.title')}
        </CardTitle>
        <CardDescription>
          {t('mediaScanner.folderExplorer.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Navigation Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoToRoot}
            disabled={currentPath === '/'}
          >
            <Home className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleGoUp}
            disabled={currentPath === '/'}
          >
            <ArrowUp className="h-4 w-4" />
            {t('mediaScanner.folderExplorer.goUp')}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchFolders()}
            disabled={loadingFolders}
          >
            <RefreshCw className={`h-4 w-4 ${loadingFolders ? 'animate-spin' : ''}`} />
            {t('mediaScanner.folderExplorer.refresh')}
          </Button>
        </div>

        {/* Breadcrumb Path */}
        <div className="flex items-center gap-1 text-sm">
          <Label>{t('mediaScanner.folderExplorer.currentPath')}:</Label>
          <div className="flex items-center gap-1 font-mono bg-muted px-2 py-1 rounded">
            <HardDrive className="h-3 w-3" />
            <span>/</span>
            {pathParts.map((part, index) => (
              <span key={index} className="flex items-center gap-1">
                <span 
                  className="cursor-pointer hover:text-primary"
                  onClick={() => {
                    const newPath = '/' + pathParts.slice(0, index + 1).join('/');
                    setCurrentPath(newPath);
                  }}
                >
                  {part}
                </span>
                {index < pathParts.length - 1 && <span>/</span>}
              </span>
            ))}
          </div>
        </div>

        {/* Folder List */}
        <div className="border rounded-lg">
          <div className="h-64 overflow-y-auto">
            {loadingFolders ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">{t('mediaScanner.folderExplorer.loading')}</span>
              </div>
            ) : foldersError ? (
              <div className="p-4">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t('mediaScanner.folderExplorer.error')}
                  </AlertDescription>
                </Alert>
              </div>
            ) : folders?.success && folders.data.length > 0 ? (
              <div className="p-2">
                {folders.data
                  .filter(f => f.isDirectory)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((folder) => (
                    <div
                      key={folder.path}
                      className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer group"
                      onClick={() => handleFolderSelect(folder)}
                    >
                      <FolderOpen className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{folder.name}</div>
                        {folder.lastModified && (
                          <div className="text-xs text-muted-foreground">
                            {formatLastModified(folder.lastModified)}
                          </div>
                        )}
                      </div>
                      {folder.size && (
                        <Badge variant="outline" className="text-xs">
                          {formatFileSize(folder.size)}
                        </Badge>
                      )}
                    </div>
                  ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Folder className="h-8 w-8 mb-2" />
                <div className="text-center">
                  <div>{t('mediaScanner.folderExplorer.noFolders')}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Select Current Folder */}
        <div className="space-y-2">
          <Button
            onClick={handleSelectCurrentFolder}
            disabled={currentPath === '/'}
            className="w-full"
            variant={selectedPath === currentPath ? "default" : "outline"}
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            {t('mediaScanner.folderExplorer.selectFolder')}: {currentPath}
          </Button>

          {selectedPath && selectedPath !== '/' && selectedPath !== currentPath && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                {t('mediaScanner.folderExplorer.selectedFolder')} <code className="font-mono">{selectedPath}</code>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Folder Stats */}
        {folders?.success && folders.data.length > 0 && (
          <div className="text-xs text-muted-foreground text-center">
            {folders.data.filter(f => f.isDirectory).length} folders, {folders.data.filter(f => !f.isDirectory).length} files
          </div>
        )}
      </CardContent>
    </Card>
  );
}
