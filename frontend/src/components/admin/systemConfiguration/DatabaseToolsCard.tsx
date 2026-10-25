import type { TFunction } from 'i18next';
import type { VariantProps } from 'class-variance-authority';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Database, Download, Shield, UploadCloud } from 'lucide-react';
import type { ImportTask, SqliteImportSummary } from '@/services';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

type SqliteImportMutation = {
  isPending: boolean;
  mutate: (file: File) => void;
};

type PostgresExportMutation = {
  isPending: boolean;
  mutate: () => void;
};

type PostgresImportMutation = {
  isPending: boolean;
  mutate: (payload: { file: File; mode: 'append' | 'replace' }) => void;
};

type DatabaseToolsCardProps = {
  t: TFunction;
  sqliteFile: File | null;
  setSqliteFile: (file: File | null) => void;
  sqliteImportMutation: SqliteImportMutation;
  sqliteSummary: SqliteImportSummary | null;
  isImportRunning: boolean;
  postgresFile: File | null;
  setPostgresFile: (file: File | null) => void;
  postgresMode: 'append' | 'replace';
  setPostgresMode: (mode: 'append' | 'replace') => void;
  postgresExportMutation: PostgresExportMutation;
  postgresImportMutation: PostgresImportMutation;
  displayImportTask: ImportTask | null;
  importProgressValue: number;
  importStatusVariant: (status: ImportTask['status']) => BadgeVariant;
  formatImportStage: (stage: string | null | undefined, t: TFunction) => string;
  formatImportTime: (timestamp?: number | null) => string;
  formatImportDuration: (start?: number | null, end?: number | null) => string;
};

export default function DatabaseToolsCard({
  t,
  sqliteFile,
  setSqliteFile,
  sqliteImportMutation,
  sqliteSummary,
  isImportRunning,
  postgresFile,
  setPostgresFile,
  postgresMode,
  setPostgresMode,
  postgresExportMutation,
  postgresImportMutation,
  displayImportTask,
  importProgressValue,
  importStatusVariant,
  formatImportStage,
  formatImportTime,
  formatImportDuration}: DatabaseToolsCardProps) {
  const formatImportStatus = (status: ImportTask['status']) => {
    switch (status) {
      case 'running':
        return t('systemConfiguration.dbToolsImportStatusRunning', {});
      case 'completed':
        return t('systemConfiguration.dbToolsImportStatusCompleted', {});
      case 'failed':
        return t('systemConfiguration.dbToolsImportStatusFailed', {});
      case 'cancelled':
        return t('systemConfiguration.dbToolsImportStatusCancelled', {});
      default:
        return status;
    }
  };

  const formatImportKind = (kind: ImportTask['kind']) => {
    return kind === 'sqlite'
      ? t('systemConfiguration.dbToolsImportKindSqlite', {})
      : t('systemConfiguration.dbToolsImportKindPostgres', {});
  };

  const formatImportMode = (mode: string) => {
    if (mode === 'append') return t('systemConfiguration.dbToolsImportModeAppendShort', {});
    if (mode === 'replace') return t('systemConfiguration.dbToolsImportModeReplaceShort', {});
    return mode;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          {t('systemConfiguration.dbToolsTitle', {})}
        </CardTitle>
        <CardDescription>
          {t('systemConfiguration.dbToolsDescription', {})}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <Label className="text-sm font-medium">
                {t('systemConfiguration.dbToolsLegacyTitle', {})}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {t('systemConfiguration.dbToolsLegacyDescription', {})}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
              <Input
                type="file"
                accept=".db"
                disabled={isImportRunning}
                onChange={(e) => setSqliteFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                onClick={() => sqliteFile && sqliteImportMutation.mutate(sqliteFile)}
                disabled={!sqliteFile || sqliteImportMutation.isPending || isImportRunning}
              >
                <UploadCloud className="h-4 w-4 mr-2" />
                {sqliteImportMutation.isPending
                  ? t('common.saving', {})
                  : isImportRunning
                  ? t('systemConfiguration.dbToolsImportRunning', {})
                  : t('systemConfiguration.dbToolsImportLegacyAction', {})}
              </Button>
            </div>
          </div>
          {sqliteSummary && (
            <div className="mt-4 rounded-md border border-border/60 bg-background p-3 text-sm">
              <div className="flex flex-wrap items-center gap-4">
                <span>
                  {t('systemConfiguration.dbToolsRowsSeen', {})}:{' '}
                  <strong>{sqliteSummary.total_rows_seen}</strong>
                </span>
                <span>
                  {t('systemConfiguration.dbToolsRowsInserted', {})}:{' '}
                  <strong>{sqliteSummary.total_rows_inserted}</strong>
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('systemConfiguration.dbToolsLegacyHint', {})}
              </p>
              {sqliteSummary.errors && sqliteSummary.errors.length > 0 && (
                <p className="mt-2 text-xs text-amber-600">
                  {t('systemConfiguration.dbToolsImportPartial', {
                  })}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <Label className="text-sm font-medium">
                {t('systemConfiguration.dbToolsExportTitle', {})}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {t('systemConfiguration.dbToolsExportDescription', {})}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => postgresExportMutation.mutate()}
              disabled={postgresExportMutation.isPending}
            >
              <Download className="h-4 w-4 mr-2" />
              {postgresExportMutation.isPending
                ? t('common.saving', {})
                : t('systemConfiguration.dbToolsExportAction', {})}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
          <div className="flex flex-col gap-2">
            <div>
              <Label className="text-sm font-medium">
                {t('systemConfiguration.dbToolsImportNewTitle', {})}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {t('systemConfiguration.dbToolsImportNewDescription', {})}
              </p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <Input
                type="file"
                accept=".sql"
                disabled={isImportRunning}
                onChange={(e) => setPostgresFile(e.target.files?.[0] ?? null)}
              />
              <Select
                value={postgresMode}
                onValueChange={(value) => setPostgresMode(value as 'append' | 'replace')}
                disabled={isImportRunning}
              >
                <SelectTrigger className="md:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="append">{t('systemConfiguration.dbToolsModeAppend', {})}</SelectItem>
                  <SelectItem value="replace">{t('systemConfiguration.dbToolsModeReplace', {})}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="destructive"
                onClick={() => postgresFile && postgresImportMutation.mutate({ file: postgresFile, mode: postgresMode })}
                disabled={!postgresFile || postgresImportMutation.isPending || isImportRunning}
              >
                <UploadCloud className="h-4 w-4 mr-2" />
                {postgresImportMutation.isPending
                  ? t('common.saving', {})
                  : isImportRunning
                  ? t('systemConfiguration.dbToolsImportRunning', {})
                  : t('systemConfiguration.dbToolsImportNewAction', {})}
              </Button>
            </div>
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                {t('systemConfiguration.dbToolsImportWarning', {})}
              </AlertDescription>
            </Alert>
          </div>
        </div>

        {displayImportTask && (
          <div className="rounded-lg border border-border/60 bg-background p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="text-sm font-medium">
                  {t('systemConfiguration.dbToolsImportStatusTitle', {})}
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('systemConfiguration.dbToolsImportStatusHint', {})}
                </p>
              </div>
              <Badge variant={importStatusVariant(displayImportTask.status)} className="capitalize">
                {formatImportStatus(displayImportTask.status)}
              </Badge>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground md:grid-cols-2">
              <span>
                {t('systemConfiguration.dbToolsImportType', {})}:{' '}
                <strong className="text-foreground">
                  {formatImportKind(displayImportTask.kind)}
                </strong>
              </span>
              <span>
                {t('systemConfiguration.dbToolsImportStage', {})}:{' '}
                <strong className="text-foreground">
                  {formatImportStage(displayImportTask.stage, t)}
                </strong>
              </span>
              <span>
                {t('systemConfiguration.dbToolsImportStarted', {})}:{' '}
                <strong className="text-foreground">
                  {formatImportTime(displayImportTask.start_time)}
                </strong>
              </span>
              <span>
                {t('systemConfiguration.dbToolsImportDuration', {})}:{' '}
                <strong className="text-foreground">
                  {formatImportDuration(displayImportTask.start_time, displayImportTask.end_time)}
                </strong>
              </span>
              <span className="md:col-span-2">
                {t('systemConfiguration.dbToolsImportSource', {})}:{' '}
                <strong className="text-foreground">{displayImportTask.source}</strong>
              </span>
              {displayImportTask.mode && (
                <span>
                  {t('systemConfiguration.dbToolsImportMode', {})}:{' '}
                  <strong className="text-foreground">{formatImportMode(displayImportTask.mode)}</strong>
                </span>
              )}
            </div>

            {displayImportTask.kind === 'sqlite' && displayImportTask.total_tables > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {t('systemConfiguration.dbToolsImportTableProgress', {})}
                  </span>
                  <span className="font-medium text-foreground">
                    {displayImportTask.current_table_index}/{displayImportTask.total_tables}
                  </span>
                </div>
                <Progress value={importProgressValue} />
                {displayImportTask.current_table && (
                  <p className="text-xs text-muted-foreground">
                    {t('systemConfiguration.dbToolsImportCurrentTable', {})}:{' '}
                    <span className="text-foreground">{displayImportTask.current_table}</span>
                  </p>
                )}
              </div>
            )}

            {displayImportTask.kind === 'sqlite' && (
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span>
                  {t('systemConfiguration.dbToolsRowsSeen', {})}:{' '}
                  <strong className="text-foreground">{displayImportTask.rows_seen}</strong>
                </span>
                <span>
                  {t('systemConfiguration.dbToolsRowsInserted', {})}:{' '}
                  <strong className="text-foreground">{displayImportTask.rows_inserted}</strong>
                </span>
              </div>
            )}

            {displayImportTask.status === 'failed' && displayImportTask.error_message && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{displayImportTask.error_message}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
