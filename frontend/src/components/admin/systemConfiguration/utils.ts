export const parseBoolConfig = (val: unknown) => {
  if (val === undefined || val === null) return true;
  const s = String(val).toLowerCase();
  return !['false', '0', 'off', 'no', 'none', ''].includes(s);
};

export const formatImportStage = (
  stage: string | null | undefined,
  t: (key: string, options?: Record<string, any>) => string
) => {
  if (!stage) {
    return t('systemConfiguration.dbToolsImportStageStarting', {});
  }
  const labels: Record<string, string> = {
    starting: t('systemConfiguration.dbToolsImportStageStarting', {}),
    importing: t('systemConfiguration.dbToolsImportStageImporting', {}),
    resetting_schema: t('systemConfiguration.dbToolsImportStageResetting', {}),
    restoring: t('systemConfiguration.dbToolsImportStageRestoring', {}),
    completed: t('systemConfiguration.dbToolsImportStageCompleted', {}),
    failed: t('systemConfiguration.dbToolsImportStageFailed', {})};
  if (labels[stage]) {
    return labels[stage];
  }
  return stage.replace(/_/g, ' ');
};

export const importStatusVariant = (status: string) => {
  switch (status) {
    case 'running':
      return 'secondary';
    case 'failed':
      return 'destructive';
    case 'completed':
      return 'default';
    default:
      return 'outline';
  }
};

export const formatImportTime = (timestamp?: number | null) => {
  if (!timestamp) return '-';
  return new Date(timestamp * 1000).toLocaleString();
};

export const formatImportDuration = (start?: number | null, end?: number | null) => {
  if (!start) return '-';
  const endTime = end ?? Math.floor(Date.now() / 1000);
  const duration = Math.max(0, endTime - start);
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};
