/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Film,
  Tv,
  Baby,
  Heart,
  Gamepad2,
  Users,
  Folder,
  Play
} from 'lucide-react';
import { toast } from 'sonner';
import { mediaScannerService, type ScanRequest, type ScanStartResponse } from '@/services/mediaScanner';
import TaskControl from './TaskControl';
import MediaWatcherConfig from './MediaWatcherConfig';
import { AdminSectionHeader } from './AdminSectionHeader';

interface MediaScannerProps {
  className?: string;
}

type ContentCategory = 'movies' | 'series' | 'kids' | 'anime';

const CATEGORY_ICONS = {
  movies: Film,
  series: Tv,
  kids: Baby,
  anime: Gamepad2
};

export default function MediaScannerSimple({ className }: MediaScannerProps) {
  useLoadNamespace('admin/mediaScanner');
  const { t } = useTranslation(['admin/mediaScanner', 'admin', 'translation']);

  const CATEGORY_LABELS = {
    movies: t('mediaScanner.categorySelector.movies'),
    series: t('mediaScanner.categorySelector.series'),
    kids: t('mediaScanner.categorySelector.kids'),
    anime: t('mediaScanner.categorySelector.anime')
  };

  // State
  const [selectedCategory, setSelectedCategory] = useState<ContentCategory | null>(null);
  const [manualPath, setManualPath] = useState<string>('');
  const [duplicatePolicy, setDuplicatePolicy] = useState<'omit' | 'replace' | 'allow'>('omit');
  const [addSubtitles, setAddSubtitles] = useState(true);
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<string | null>(null);

  // Start scan mutation
  const startScanMutation = useMutation({
    mutationFn: (request: ScanRequest) => mediaScannerService.startScan(request),
    onSuccess: (response) => {
      if (response.success && response.data) {
        setCurrentScanId(response.data.scan_id);
        setScanStatus('started');
        toast.success(t('mediaScanner.notifications.scanStarted'));
      } else {
        toast.error(`${t('mediaScanner.errors.scanFailed')}: ${response.error?.error || t('mediaScanner.errors.unknownError')}`);
      }
    },
    onError: (error) => {
      toast.error(`${t('mediaScanner.errors.scanFailed')}: ${error.message}`);
    }
  });

  const handleStartScan = () => {
    if (!selectedCategory) {
      toast.error(t('mediaScanner.errors.noCategory'));
      return;
    }

    if (!manualPath || manualPath.trim() === '') {
      toast.error(t('mediaScanner.errors.noFolder'));
      return;
    }

    const request: ScanRequest = {
      root_path: manualPath,
      media: selectedCategory,
      duplicate_policy: duplicatePolicy,
      add_subs: addSubtitles
    };

    startScanMutation.mutate(request);
  };

  const canStartScan = selectedCategory && manualPath && manualPath.trim() !== '' && !startScanMutation.isPending;

  return (
    <div className={`space-y-6 max-w-[1400px] mx-auto w-full ${className || ''}`}>
      <AdminSectionHeader
        icon={Film}
        title={t('mediaScanner.title')}
        description={t('mediaScanner.subtitle')}
      />

      {/* Media Watcher Section */}
      <MediaWatcherConfig />

      {/* Main Layout: 3/4 Scanner + 1/4 Task Control */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Scanner Section - 3/4 */}
        <div className="lg:col-span-3 space-y-6">

          {/* Category Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Film className="h-5 w-5" />
                {t('mediaScanner.categorySelector.title')}
              </CardTitle>
              <CardDescription>
                {t('mediaScanner.categorySelector.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
                  const category = key as ContentCategory;
                  const Icon = CATEGORY_ICONS[category];
                  const isSelected = selectedCategory === category;

                  return (
                    <Button
                      key={category}
                      variant={isSelected ? "default" : "outline"}
                      className={`h-20 flex flex-col gap-2 ${isSelected ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => setSelectedCategory(category)}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-sm">{label}</span>
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Path Input */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Folder className="h-5 w-5" />
                {t('mediaScanner.folderExplorer.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manual-path">{t('mediaScanner.folderExplorer.currentPath')}</Label>
                <Input
                  id="manual-path"
                  type="text"
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  placeholder="/mnt/series/movies"
                />
                <p className="text-sm text-muted-foreground">
                  {t('mediaScanner.folderExplorer.description')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Scan Options */}
          <Card>
            <CardHeader>
              <CardTitle>{t('mediaScanner.scanOptions.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Duplicate Policy */}
              <div className="space-y-2">
                <Label>{t('mediaScanner.scanOptions.duplicatePolicy')}</Label>
                <Select value={duplicatePolicy} onValueChange={(value) => setDuplicatePolicy(value as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="omit">{t('mediaScanner.scanOptions.duplicatePolicyOptions.omit')}</SelectItem>
                    <SelectItem value="replace">{t('mediaScanner.scanOptions.duplicatePolicyOptions.replace')}</SelectItem>
                    <SelectItem value="allow">{t('mediaScanner.scanOptions.duplicatePolicyOptions.allow')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Add Subtitles */}
              <div className="flex items-center space-x-2">
                <Switch
                  id="add-subtitles"
                  checked={addSubtitles}
                  onCheckedChange={setAddSubtitles}
                />
                <Label htmlFor="add-subtitles">{t('mediaScanner.scanOptions.addSubtitles')}</Label>
              </div>
            </CardContent>
          </Card>

          {/* Scan Status */}
          {currentScanId && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-green-500" />
                  {t('mediaScanner.scanStatus.title')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p><strong>{t('mediaScanner.scanStatus.scanId')}:</strong> {currentScanId}</p>
                  <p><strong>{t('mediaScanner.scanStatus.status')}:</strong> {scanStatus === 'started' ? t('mediaScanner.status.scanning') : scanStatus}</p>
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-sm text-emerald-700 dark:text-emerald-300">
                      ✅ {t('mediaScanner.scanStatus.backgroundNote')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Start Scan Button */}
          <Card>
            <CardContent className="pt-6">
              <Button
                onClick={handleStartScan}
                disabled={!canStartScan}
                className="w-full"
                size="lg"
              >
                <Play className="h-5 w-5 mr-2" />
                {startScanMutation.isPending ? t('mediaScanner.status.scanning') : t('mediaScanner.actions.startScan')}
              </Button>
              {currentScanId && (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  {t('mediaScanner.scanStatus.anotherScanNote')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Task Control Section - 1/4 */}
        <div className="lg:col-span-1">
          <TaskControl onTaskUpdate={() => {
            // Refresh any data if needed
          }} />
        </div>
      </div>
    </div>
  );
}
