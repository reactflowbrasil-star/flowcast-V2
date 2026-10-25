import React from 'react';
import { SecurityStatsResponse } from '../../types/security';
import { SecurityService } from '../../services/securityService';
import { useTranslation } from 'react-i18next';
import useLoadNamespace from '@/hooks/useLoadNamespace';

interface SecurityStatsProps {
  stats: SecurityStatsResponse;
}

const SecurityStats: React.FC<SecurityStatsProps> = ({ stats }) => {
  useLoadNamespace('admin/security');
  const { t } = useTranslation('admin/security');
  return (
    <div className="space-y-6">
      {/* Incident Types Chart */}
      <div className="bg-card shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-foreground mb-4">{t('stats.incidentsByType')}</h3>
        <div className="space-y-3">
          {stats.incidents_by_type.map((incident) => (
            <div key={incident.incident_type} className="flex items-center justify-between">
              <div className="flex items-center">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  SecurityService.getIncidentSeverityColor(incident.incident_type)
                }`}>
                  {SecurityService.getIncidentTypeLabel(incident.incident_type)}
                </span>
              </div>
              <span className="text-sm font-medium text-foreground">{incident.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Incidents */}
      <div className="bg-card shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-foreground mb-4">{t('stats.recentIncidents')}</h3>
        <div className="space-y-3">
          {stats.recent_incidents.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('stats.noRecentIncidents')}</p>
          ) : (
            stats.recent_incidents.map((incident) => (
              <div key={incident.id} className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
                <div className="flex items-center space-x-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    SecurityService.getIncidentSeverityColor(incident.incident_type)
                  }`}>
                    {SecurityService.getIncidentTypeLabel(incident.incident_type)}
                  </span>
                  <span className="text-sm font-medium text-foreground">{incident.username}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {SecurityService.formatDate(incident.created_at)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Security Summary */}
      <div className="bg-card shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-foreground mb-4">{t('stats.summary')}</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.total_incidents}</div>
            <div className="text-sm text-muted-foreground">{t('stats.totalIncidents')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.incidents_today}</div>
            <div className="text-sm text-muted-foreground">{t('stats.todaysIncidents')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.active_bans}</div>
            <div className="text-sm text-muted-foreground">{t('stats.activeBans')}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-800">{stats.permanent_bans}</div>
            <div className="text-sm text-muted-foreground">{t('stats.permanentBans')}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityStats;
