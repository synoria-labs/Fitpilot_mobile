import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  FitpilotHealthAvailability,
  FitpilotHealthPermissionStatus,
} from '../../modules/fitpilot-health';
import {
  connectedHealthService,
  type ConnectedHealthSyncResponse,
  type ConnectedHealthSummaryResponse,
} from '../services/connectedHealth';
import type {
  ConnectedHealthFeedbackRange,
} from '../types/connectedHealthFeedback';
import {
  buildConnectedHealthFeedback,
  shouldAutoSyncConnectedHealth,
} from '../utils/connectedHealthFeedback';

type UseConnectedHealthFeedbackOptions = {
  days?: ConnectedHealthFeedbackRange;
  autoSync?: boolean;
  autoSyncThrottleMs?: number;
  enabled?: boolean;
};

const DEFAULT_SYNC_THROTTLE_MS = 60_000;
const FRESHNESS_TICK_MS = 60_000;

type LoadOptions = {
  allowAutoSync?: boolean;
  silent?: boolean;
};

const AUTO_SYNC_SESSION_KEY = 'connected-health-feedback-v1';
const autoSyncAttempted = new Set<string>();

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const pickLatestIsoString = (
  current: string | null | undefined,
  candidate: string | null | undefined,
): string | null => {
  const candidateMs = candidate ? Date.parse(candidate) : Number.NaN;
  if (Number.isNaN(candidateMs)) {
    return current ?? null;
  }

  const currentMs = current ? Date.parse(current) : Number.NaN;
  if (!Number.isNaN(currentMs) && currentMs > candidateMs) {
    return current ?? null;
  }

  return candidate ?? null;
};

const withSuccessfulSyncTimestamp = (
  summary: ConnectedHealthSummaryResponse,
  syncResult: ConnectedHealthSyncResponse,
): ConnectedHealthSummaryResponse => {
  const syncedAt = pickLatestIsoString(null, syncResult.synced_at);
  if (!syncedAt) {
    return summary;
  }

  let updatedPlatformConnection = false;
  const connections = summary.connections.map((connection) => {
    if (connection.platform !== syncResult.platform) {
      return connection;
    }

    updatedPlatformConnection = true;
    return {
      ...connection,
      last_sync_at: pickLatestIsoString(connection.last_sync_at, syncedAt),
    };
  });

  const nextConnections =
    updatedPlatformConnection || connections.length !== 1
      ? connections
      : connections.map((connection) => ({
          ...connection,
          last_sync_at: pickLatestIsoString(connection.last_sync_at, syncedAt),
        }));

  return {
    ...summary,
    connections: nextConnections,
    latest_sync: summary.latest_sync
      ? {
          ...summary.latest_sync,
          platform: syncResult.platform,
          status: 'completed',
          completed_at: pickLatestIsoString(summary.latest_sync.completed_at, syncedAt),
          records_received: Math.max(
            summary.latest_sync.records_received,
            syncResult.records_received,
          ),
        }
      : {
          platform: syncResult.platform,
          status: 'completed',
          completed_at: syncedAt,
          records_received: syncResult.records_received,
          records_upserted: 0,
        },
  };
};

export function useConnectedHealthFeedback({
  days = 7,
  autoSync = false,
  autoSyncThrottleMs = DEFAULT_SYNC_THROTTLE_MS,
  enabled = true,
}: UseConnectedHealthFeedbackOptions = {}) {
  const [summary, setSummary] = useState<ConnectedHealthSummaryResponse | null>(null);
  const [availability, setAvailability] = useState<FitpilotHealthAvailability | null>(null);
  const [permissions, setPermissions] = useState<FitpilotHealthPermissionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isMountedRef = useRef(true);
  const summaryRef = useRef<ConnectedHealthSummaryResponse | null>(null);
  const lastSyncAttemptRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    setNowMs(Date.now());
    const intervalId = setInterval(() => {
      if (isMountedRef.current) {
        setNowMs(Date.now());
      }
    }, FRESHNESS_TICK_MS);

    return () => clearInterval(intervalId);
  }, [enabled]);

  const load = useCallback(
    async ({ allowAutoSync = false, silent = false }: LoadOptions = {}) => {
      if (!enabled) {
        return;
      }

      const hasCachedSummary = summaryRef.current !== null;

      if (!silent) {
        if (hasCachedSummary) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }
      }

      setError(null);

      const [summaryResult, availabilityResult, permissionResult] = await Promise.allSettled([
        connectedHealthService.getSummary(days),
        connectedHealthService.isAvailable(),
        connectedHealthService.getGrantedPermissions(),
      ]);

      if (!isMountedRef.current) {
        return;
      }

      const loadedAtMs = Date.now();
      const nextSummary =
        summaryResult.status === 'fulfilled' ? summaryResult.value : summaryRef.current;
      const nextAvailability =
        availabilityResult.status === 'fulfilled' ? availabilityResult.value : null;
      const nextPermissions =
        permissionResult.status === 'fulfilled' ? permissionResult.value : null;

      setNowMs(loadedAtMs);

      if (summaryResult.status === 'fulfilled') {
        summaryRef.current = nextSummary;
        setSummary(nextSummary);
      } else {
        setError(
          getErrorMessage(
            summaryResult.reason,
            'No fue posible cargar tus datos de salud conectada.',
          ),
        );
      }

      if (nextAvailability) {
        setAvailability(nextAvailability);
      }

      if (nextPermissions) {
        setPermissions(nextPermissions);
      }

      const shouldAutoSync =
        allowAutoSync &&
        autoSync &&
        !autoSyncAttempted.has(AUTO_SYNC_SESSION_KEY) &&
        nextAvailability?.available === true &&
        shouldAutoSyncConnectedHealth(nextSummary, loadedAtMs);

      if (shouldAutoSync) {
        autoSyncAttempted.add(AUTO_SYNC_SESSION_KEY);
        const autoSyncStartedAtMs = Date.now();
        lastSyncAttemptRef.current = autoSyncStartedAtMs;
        setIsSyncing(true);
        setSyncError(null);
        setNowMs(autoSyncStartedAtMs);

        try {
          const syncResult = await connectedHealthService.sync(30);
          const refreshedSummary = await connectedHealthService.getSummary(days);
          const nextSyncedSummary = withSuccessfulSyncTimestamp(
            refreshedSummary,
            syncResult,
          );

          if (isMountedRef.current) {
            const refreshedAtMs = Date.now();
            summaryRef.current = nextSyncedSummary;
            setSummary(nextSyncedSummary);
            setNowMs(refreshedAtMs);
          }
        } catch (syncFailure) {
          if (isMountedRef.current) {
            setSyncError(
              getErrorMessage(
                syncFailure,
                'No se pudo sincronizar salud conectada.',
              ),
            );
          }
        } finally {
          if (isMountedRef.current) {
            setIsSyncing(false);
          }
        }
      }

      if (isMountedRef.current && !silent) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [autoSync, days, enabled],
  );

  const refresh = useCallback(
    async () => {
      await load({ allowAutoSync: false });
    },
    [load],
  );

  const sync = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const syncStartedAtMs = Date.now();
    lastSyncAttemptRef.current = syncStartedAtMs;
    setIsSyncing(true);
    setSyncError(null);
    setNowMs(syncStartedAtMs);

    try {
      const syncResult = await connectedHealthService.sync(30);
      const refreshedSummary = await connectedHealthService.getSummary(days);
      const nextSyncedSummary = withSuccessfulSyncTimestamp(
        refreshedSummary,
        syncResult,
      );

      if (isMountedRef.current) {
        const refreshedAtMs = Date.now();
        summaryRef.current = nextSyncedSummary;
        setSummary(nextSyncedSummary);
        setNowMs(refreshedAtMs);
      }
    } catch (syncFailure) {
      if (isMountedRef.current) {
        setSyncError(
          getErrorMessage(syncFailure, 'No se pudo sincronizar salud conectada.'),
        );
      }
    } finally {
      if (isMountedRef.current) {
        setIsSyncing(false);
      }
    }
  }, [days, enabled]);

  const syncIfStale = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const checkedAtMs = Date.now();
    setNowMs(checkedAtMs);

    if (availability?.available !== true) {
      return;
    }

    if (!shouldAutoSyncConnectedHealth(summaryRef.current, checkedAtMs)) {
      return;
    }

    if (checkedAtMs - lastSyncAttemptRef.current < autoSyncThrottleMs) {
      return;
    }

    await sync();
  }, [autoSyncThrottleMs, availability?.available, enabled, sync]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    void load({ allowAutoSync: autoSync });
  }, [autoSync, enabled, load]);

  const feedback = useMemo(
    () => buildConnectedHealthFeedback(summary, days, nowMs),
    [days, nowMs, summary],
  );

  const hasGrantedPermissions = (permissions?.granted.length ?? 0) > 0;
  const needsPermissionCta =
    availability?.available === true &&
    !hasGrantedPermissions &&
    !feedback.hasData;

  return {
    availability,
    permissions,
    summary,
    feedback,
    isLoading,
    isRefreshing,
    isSyncing,
    error,
    syncError,
    needsPermissionCta,
    refresh,
    sync,
    syncIfStale,
  };
}
