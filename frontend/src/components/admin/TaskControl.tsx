'use client';

import React, { useEffect, useState } from 'react';
import { mediaScannerService, ScanTask } from '@/services/mediaScanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface TaskControlProps {
  onTaskUpdate?: () => void;
}

export default function TaskControl({ onTaskUpdate }: TaskControlProps) {
  useLoadNamespace('admin/mediaScanner');
  const { t } = useTranslation(['admin/mediaScanner', 'admin', 'translation']);

  const [tasks, setTasks] = useState<ScanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchTasks = async () => {
    try {
      const response = await mediaScannerService.getScanTasks();
      if (response.success && Array.isArray(response.data)) {
        setTasks(response.data);
      } else {
        console.error('Invalid response format:', response);
        setTasks([]); // Ensure tasks is always an array
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setTasks([]); // Ensure tasks is always an array on error
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    setCancelling(taskId);
    try {
      const response = await mediaScannerService.cancelScanTask(taskId);
      if (response.success) {
        await fetchTasks();
        onTaskUpdate?.();
      }
    } catch (error) {
      console.error('Error cancelling task:', error);
    } finally {
      setCancelling(null);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm(t('mediaScanner.scanProgress.cancelConfirm'))) {
      return;
    }
    
    setDeleting(taskId);
    try {
      const response = await mediaScannerService.deleteTask(taskId);
      if (response.success) {
        // Remove task from local state immediately for better UX
        setTasks(prev => prev.filter(task => task.id !== taskId));
        onTaskUpdate?.();
      }
    } catch (error) {
      console.error('Error deleting task:', error);
    } finally {
      setDeleting(null);
    }
  };

  const formatDuration = (startTime: number, endTime?: number) => {
    const end = endTime || Math.floor(Date.now() / 1000);
    const duration = end - startTime;
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = duration % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      running: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
      completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
      failed: 'bg-red-500/15 text-red-700 dark:text-red-300',
      cancelled: 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
    };
    
    return (
      <Badge className={variants[status as keyof typeof variants] || 'bg-muted text-foreground'}>
        {getStatusIcon(status)}
        <span className="ml-1 capitalize">{status}</span>
      </Badge>
    );
  };

  useEffect(() => {
    fetchTasks();
    
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('mediaScanner.taskControl.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">{t('mediaScanner.folderExplorer.loading')}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {t('mediaScanner.taskControl.title')}
          <Badge variant="outline">{tasks?.length || 0} {t('mediaScanner.taskControl.tasks')}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!tasks || tasks.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            {t('mediaScanner.taskControl.idle')}
          </div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {getStatusBadge(task.status)}
                  <span className="font-medium capitalize">{task.category}</span>
                </div>
                <div className="flex gap-2">
                  {task.status === 'running' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelTask(task.id)}
                      disabled={cancelling === task.id}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {cancelling === task.id ? t('mediaScanner.taskControl.cancelling') : t('mediaScanner.taskControl.cancel')}
                    </Button>
                  )}
                  {(task.status === 'cancelled' || task.status === 'completed' || task.status === 'failed') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteTask(task.id)}
                      disabled={deleting === task.id}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {deleting === task.id ? t('mediaScanner.taskControl.deleting') : t('mediaScanner.taskControl.delete')}
                    </Button>
                  )}
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground">
                <div><strong>{t('mediaScanner.taskControl.path')}:</strong> {task.path}</div>
                <div><strong>{t('mediaScanner.taskControl.started')}:</strong> {formatTime(task.start_time)}</div>
                <div><strong>{t('mediaScanner.taskControl.duration')}:</strong> {formatDuration(task.start_time, task.end_time)}</div>
                {task.current_file && (
                  <div><strong>{t('mediaScanner.taskControl.currentFile')}:</strong> {task.current_file}</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  {/* Show movies counter for movie-like categories, or series counter for series-like */}
                  {['movies', 'kids'].includes(task.category?.toLowerCase() || '') ? (
                    <div className="text-green-600">✓ {t('mediaScanner.taskControl.stats.movies')}: {task.movies_created}</div>
                  ) : (
                    <>
                      {task.movies_created > 0 && (
                        <div className="text-green-600">✓ {t('mediaScanner.taskControl.stats.movies')}: {task.movies_created}</div>
                      )}
                    </>
                  )}
                  {/* Show series/anime counter based on category type */}
                  {['anime', 'series'].includes(task.category?.toLowerCase() || '') ? (
                    <>
                      <div className="text-blue-600">✓ {task.category}: {task.series_created}</div>
                      <div className="text-purple-600">✓ {t('mediaScanner.taskControl.stats.episodes')}: {task.episodes_created}</div>
                    </>
                  ) : (
                    <>
                      {task.series_created > 0 && (
                        <div className="text-blue-600">✓ {t('mediaScanner.taskControl.stats.series')}: {task.series_created}</div>
                      )}
                      {task.episodes_created > 0 && (
                        <div className="text-purple-600">✓ {t('mediaScanner.taskControl.stats.episodes')}: {task.episodes_created}</div>
                      )}
                    </>
                  )}
                </div>
                <div>
                  <div className="text-orange-600">✓ {t('mediaScanner.taskControl.stats.subtitles')}: {task.subtitles_added}</div>
                  <div className="text-muted-foreground">⊘ {t('mediaScanner.taskControl.stats.skipped')}: {task.skipped}</div>
                  <div className="text-yellow-600">↻ {t('mediaScanner.taskControl.stats.replaced')}: {task.replaced}</div>
                </div>
              </div>

              {task.error_message && (
                <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-300">
                  <strong>{t('mediaScanner.taskControl.error')}:</strong> {task.error_message}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
