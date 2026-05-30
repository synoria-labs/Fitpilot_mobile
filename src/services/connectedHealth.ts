import FitpilotHealth, {
  type FitpilotHealthAvailability,
  type FitpilotHealthPermissionStatus,
  type FitpilotHealthSyncPayload,
} from '../../modules/fitpilot-health';
import { nutritionClient } from './api';

export type ConnectedHealthConnection = {
  platform: 'healthkit' | 'health_connect';
  status: string;
  permissions: string[];
  sharing_enabled: boolean;
  last_sync_at: string | null;
  updated_at: string | null;
};

export type ConnectedHealthDailySummary = {
  date: string;
  active_energy_kcal: number | null;
  basal_energy_kcal: number | null;
  total_energy_kcal: number | null;
  steps: number | null;
  distance_m: number | null;
  exercise_minutes: number | null;
  sleep_minutes: number | null;
  sleep_efficiency_pct: number | null;
  resting_hr_bpm: number | null;
  avg_hr_bpm: number | null;
  hrv_ms: number | null;
  systolic_avg_mmhg: number | null;
  diastolic_avg_mmhg: number | null;
  glucose_avg_mg_dl: number | null;
  recovery_score: number | null;
  flags: string[];
  sources: string[];
};

export type ConnectedHealthRecommendation = {
  observed_tdee_kcal: {
    days_7: number | null;
    days_14: number | null;
    days_30: number | null;
  };
  current_tdee_kcal: number | null;
  current_target_calories: number | null;
  suggested_tdee_kcal: number | null;
  delta_from_current_kcal: number | null;
  confidence: 'low' | 'medium' | 'high';
  application_mode: 'recommendation_only';
};

export type ConnectedHealthSummaryResponse = {
  connections: ConnectedHealthConnection[];
  range: {
    start_date: string;
    end_date: string;
  };
  summaries: ConnectedHealthDailySummary[];
  recommendations: ConnectedHealthRecommendation;
  latest_sync: {
    platform: string;
    status: string;
    completed_at: string | null;
    records_received: number;
    records_upserted: number;
    error_message?: string | null;
  } | null;
};

export type ConnectedHealthSyncResponse = {
  platform: 'healthkit' | 'health_connect';
  records_received: number;
  daily_summaries_processed: number;
  synced_at: string;
};

const buildSyncRange = (days: number) => {
  const endAt = new Date();
  const startAt = new Date(endAt);
  startAt.setDate(startAt.getDate() - Math.max(1, days) + 1);
  startAt.setHours(0, 0, 0, 0);

  return {
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  };
};

const withSharingEnabled = (
  payload: FitpilotHealthSyncPayload,
): FitpilotHealthSyncPayload & { sharing_enabled: boolean } => ({
  ...payload,
  sharing_enabled: true,
});

export const connectedHealthService = {
  isAvailable: (): Promise<FitpilotHealthAvailability> =>
    FitpilotHealth.isAvailable(),

  requestPermissions: (): Promise<FitpilotHealthPermissionStatus> =>
    FitpilotHealth.requestPermissions(),

  getGrantedPermissions: (): Promise<FitpilotHealthPermissionStatus> =>
    FitpilotHealth.getGrantedPermissions(),

  openSettings: (): Promise<void> => FitpilotHealth.openSettings(),

  getSummary: (days = 30): Promise<ConnectedHealthSummaryResponse> =>
    nutritionClient.get<ConnectedHealthSummaryResponse>(
      `/connected-health/me/summary?days=${days}`,
    ),

  sync: async (days = 30): Promise<ConnectedHealthSyncResponse> => {
    const availability = await FitpilotHealth.isAvailable();
    if (!availability.available) {
      throw new Error(availability.message || 'Salud conectada no esta disponible en este dispositivo.');
    }

    const payload = await FitpilotHealth.syncRange(buildSyncRange(days));
    return nutritionClient.post<ConnectedHealthSyncResponse>(
      '/connected-health/sync',
      withSharingEnabled(payload),
    );
  },

  setSharing: (
    sharingEnabled: boolean,
    platform?: ConnectedHealthConnection['platform'],
  ): Promise<{ sharing_enabled: boolean; platform: string }> =>
    nutritionClient.patch('/connected-health/me/sharing', {
      platform,
      sharing_enabled: sharingEnabled,
    }),

  setSetupStatus: (
    status: 'completed' | 'skipped',
  ): Promise<{ connected_health_setup_status: string }> =>
    nutritionClient.patch('/connected-health/me/setup', { status }),
};
