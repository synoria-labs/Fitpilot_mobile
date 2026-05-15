import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  FitpilotHealthAvailability,
  FitpilotHealthPermissionStatus,
} from '../../modules/fitpilot-health';
import {
  connectedHealthService,
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
  enabled?: boolean;
};

type LoadOptions = {
  allowAutoSync?: boolean;
  silent?: boolean;
};

const AUTO_SYNC_SESSION_KEY = 'connected-health-feedback-v1';
const autoSyncAttempted = new Set<string>();

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function useConnectedHealthFeedback({
  days = 7,
  autoSync = false,
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
  const isMountedRef = useRef(true);
  const summaryRef = useRef<ConnectedHealthSummaryResponse | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);

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

      const nextSummary =
        summaryResult.status === 'fulfilled' ? summaryResult.value : summaryRef.current;
      const nextAvailability =
        availabilityResult.status === 'fulfilled' ? availabilityResult.value : null;
      const nextPermissions =
        permissionResult.status === 'fulfilled' ? permissionResult.value : null;

      if (summaryResult.status === 'fulfilled') {
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
        shouldAutoSyncConnectedHealth(nextSummary);

      if (shouldAutoSync) {
        autoSyncAttempted.add(AUTO_SYNC_SESSION_KEY);
        setIsSyncing(true);
        setSyncError(null);

        try {
          await connectedHealthService.sync(30);
          const refreshedSummary = await connectedHealthService.getSummary(days);

          if (isMountedRef.current) {
            setSummary(refreshedSummary);
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

    setIsSyncing(true);
    setSyncError(null);

    try {
      await connectedHealthService.sync(30);
      const refreshedSummary = await connectedHealthService.getSummary(days);

      if (isMountedRef.current) {
        setSummary(refreshedSummary);
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

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    void load({ allowAutoSync: autoSync });
  }, [autoSync, enabled, load]);

  const feedback = useMemo(
    () => buildConnectedHealthFeedback(summary, days),
    [days, summary],
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
  };
}
