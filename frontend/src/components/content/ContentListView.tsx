'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, Trash2, Eye, Play, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { contentService } from '@/services';
import { ContentType, Content } from '@/types';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface ContentListViewProps {
  contentType: ContentType;
  className?: string;
  onEdit?: (content: Content) => void;
}

export default function ContentListView({ contentType, className, onEdit }: ContentListViewProps) {
  useLoadNamespace('admin/content');
  const { t } = useTranslation(['admin/content', 'common']);
  const [searchQuery, setSearchQuery] = useState('');
  // const [selectedContent, setSelectedContent] = useState<Content | null>(null);
  
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Fetch content by type
  const { data: contentList, isLoading, error } = useQuery({
    queryKey: ['content', contentType, searchQuery],
    queryFn: async () => {
      const result = await contentService.getContent({
        type: contentType,
        search: searchQuery || undefined,
        active: undefined, // Show all content
      });
      if (result.success) {
        return result.data.content;
      }
      throw new Error(result.error.details);
    }});

  // Delete content mutation
  const deleteContentMutation = useMutation({
    mutationFn: async (contentId: number) => {
      const result = await contentService.deleteContent(contentId);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content', contentType] });
    }});

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const result = await contentService.bulkDeleteContent(ids);
      if (result.success && result.data) return result.data;
      throw new Error(result.error?.details || t('contentList.bulkDeleteFailed'));
    },
    onSuccess: () => {
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['content', contentType] });
    },
    onError: (err: any) => {
      console.error('Bulk delete error', err);
    }
  });

  // Toggle content status mutation
  const toggleContentStatusMutation = useMutation({
    mutationFn: async (contentId: number) => {
      const result = await contentService.toggleContentStatus(contentId);
      if (result.success) {
        return result.data;
      }
      throw new Error(result.error.details);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content', contentType] });
    }});

  // Clear selection when list changes - must be before any conditional returns
  React.useEffect(() => {
    setSelectedIds([]);
  }, [contentList]);

  const handleDeleteContent = (content: Content) => {
    deleteContentMutation.mutate(content.id);
  };

  const handleToggleStatus = (content: Content) => {
    toggleContentStatusMutation.mutate(content.id);
  };

  const getContentTypeLabel = (type: ContentType) => {
    switch (type) {
      case ContentType.VOD:
        return t('contentType.movie');
      case ContentType.TV:
        return t('contentTypeExtended.tvChannel');
      case ContentType.SERIES:
        return t('contentTypeExtended.tvSeries');
      case ContentType.EVENTS:
        return t('contentTypeExtended.event');
      case ContentType.KIDS:
        return t('contentTypeExtended.kidsContent');
      case ContentType.ANIME:
        return t('contentTypeExtended.anime');
      default:
        return t('contentTypeExtended.content');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadge = (content: Content) => {
    if (content.active) {
      return (
        <Badge variant="default" className="bg-green-600">
          <CheckCircle className="h-3 w-3 mr-1" />
          {t('common.active')}
        </Badge>
      );
    } else {
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          {t('common.inactive')}
        </Badge>
      );
    }
  };

  const getContentInfo = (content: Content) => {
    const info = [];
    
    if (content.year) {
      info.push(`${content.year}`);
    }
    
    if (content.runtime) {
      info.push(t('contentList.runtimeMinutes', { minutes: content.runtime }));
    }
    
    if (content.channel_number) {
      info.push(t('contentList.channelNumber', { number: content.channel_number }));
    }
    
    if (content.is_live) {
      info.push(t('contentList.live'));
    }
    
    return info.join(' • ');
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{t('contentList.listTitle', { type: getContentTypeLabel(contentType) })}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{t('contentList.listTitle', { type: getContentTypeLabel(contentType) })}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {t('contentList.failedToLoad', { message: error.message })}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={className}>
      <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                {getContentTypeLabel(contentType)} 
                <span className="text-gray-500 text-lg font-normal">{t('contentList.library')}</span>
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {t('contentList.manageAndViewAll', { type: getContentTypeLabel(contentType).toLowerCase() })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-200"></div>
              <div className="relative flex items-center bg-black rounded-lg">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                <Input
                    placeholder={t('contentList.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-64 border-0 bg-transparent text-white placeholder:text-slate-600 focus-visible:ring-0 focus-visible:ring-offset-0 h-10"
                />
              </div>
            </div>
            
            {selectedIds.length > 0 && (
                 <Button
                variant="destructive"
                size="sm"
                className="h-10 px-4 shadow-lg shadow-red-900/20"
                onClick={() => {
                  if (selectedIds.length === 0) return;
                  if (!confirm(t('contentList.confirmBulkDelete', { count: selectedIds.length }))) return;
                  bulkDeleteMutation.mutate(selectedIds);
                }}
                disabled={selectedIds.length === 0 || bulkDeleteMutation.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" /> {t('contentList.deleteSelected', { count: selectedIds.length })}
              </Button>
            )}
          </div>
      </div>

      <Card className="border-0 bg-transparent shadow-none">
      <CardContent className="p-0">
        {contentList && contentList.length > 0 ? (
          <div className="rounded-xl border border-white/5 bg-black/20 backdrop-blur-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-white/5">
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="w-12 text-slate-400">
                  <input
                    type="checkbox"
                    className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/20"
                    checked={contentList?.length ? selectedIds.length === contentList.length : false}
                    onChange={(e) => {
                      if (!contentList) return;
                      if (e.target.checked) {
                        setSelectedIds(contentList.map(c => c.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                  />
                </TableHead>
                <TableHead className="text-slate-400 font-medium">{t('common.title')}</TableHead>
                <TableHead className="text-slate-400 font-medium">{t('common.info')}</TableHead>
                <TableHead className="text-slate-400 font-medium">{t('common.status')}</TableHead>
                <TableHead className="text-slate-400 font-medium">{t('contentList.created')}</TableHead>
                <TableHead className="text-right text-slate-400 font-medium">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contentList.map((content) => (
                <TableRow key={content.id} className="border-white/5 hover:bg-white/5 transition-colors group">
                  <TableCell>
                    <input
                        type="checkbox"
                        className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/20"
                        checked={selectedIds.includes(content.id)}
                        onChange={(e) => {
                            if (e.target.checked) {
                                setSelectedIds([...selectedIds, content.id]);
                            } else {
                                setSelectedIds(selectedIds.filter(id => id !== content.id));
                            }
                        }}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-4">
                      <div className="relative h-16 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-slate-800 shadow-lg group-hover:shadow-blue-900/20 transition-all">
                        {content.poster_url ? (
                          <Image
                            src={content.poster_url}
                            alt={content.title}
                            fill
                            className="object-cover"
                          />
                        ) : (
                             <div className="h-full w-full flex items-center justify-center">
                                 <Play className="h-4 w-4 text-slate-600" />
                             </div>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-200 group-hover:text-white transition-colors">{content.title}</div>
                        {content.description && (
                          <div className="text-xs text-slate-500 line-clamp-1 max-w-[200px]">
                            {content.description}
                          </div>
                        )}
                        {content.tmdb_id && (
                          <div className="flex items-center gap-1 mt-1">
                              <Badge variant="outline" className="text-[10px] h-4 px-1 border-slate-700 text-slate-400">
                                {t('contentList.tmdb')}
                              </Badge>
                              <span className="text-[10px] text-slate-600">{content.tmdb_id}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-400 font-medium">
                      {getContentInfo(content)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(content)}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-500">
                      {formatDate(content.created_at)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10"
                        onClick={() => onEdit?.(content)}
                        title={t('contentList.viewEditContent')}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        className={content.active ? "h-8 w-8 text-slate-400 hover:text-amber-400 hover:bg-amber-400/10" : "h-8 w-8 text-slate-400 hover:text-green-400 hover:bg-green-400/10"}
                        onClick={() => handleToggleStatus(content)}
                        disabled={toggleContentStatusMutation.isPending}
                      >
                        {content.active ? (
                            <XCircle className="h-4 w-4" />
                        ) : (
                            <CheckCircle className="h-4 w-4" />
                        )}
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-red-400/10"
                            disabled={deleteContentMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-white">{t('contentList.deleteContentTitle')}</AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-400">
                              {t('contentList.deleteContentDescription', { title: content.title })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteContent(content)}
                              className="bg-red-600 hover:bg-red-700 text-white border-0"
                            >
                              {t('contentList.deleteContentAction')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        ) : (
          <div className="text-center py-20 rounded-xl border border-dashed border-slate-800 bg-black/20">
            <div className="h-20 w-20 bg-slate-900/50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                <Play className="h-8 w-8 text-slate-700" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {t('contentList.noTypeFound', { type: getContentTypeLabel(contentType).toLowerCase() })}
            </h3>
            <p className="text-slate-500 mb-6 max-w-md mx-auto">
              {searchQuery 
                ? t('contentList.noContentMatching', { query: searchQuery })
                : t('contentList.getStartedByAddingFirst', { type: getContentTypeLabel(contentType).toLowerCase() })
              }
            </p>
            <Button className="bg-blue-600 hover:bg-blue-500 text-white border-0">
                {t('contentList.addContent')}
            </Button>
          </div>
        )}

        {/* Error Display */}
        {(deleteContentMutation.error || toggleContentStatusMutation.error) && (
          <Alert variant="destructive" className="mt-6 bg-red-900/20 border-red-900/50 text-red-200">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {deleteContentMutation.error?.message || toggleContentStatusMutation.error?.message}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
