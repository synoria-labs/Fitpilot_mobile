import { useCallback, useEffect, useMemo } from 'react';
import { useCareTeamStore } from '../store/careTeamStore';
import { getTodayDateKey } from '../utils/date';
import { countUniqueAssignedProfessionals } from '../utils/careTeam';

export const useCareTeam = (clientId: string | null) => {
  const summaries = useCareTeamStore((state) => state.summaries);
  const errors = useCareTeamStore((state) => state.errors);
  const requestKey = useCareTeamStore((state) => state.requestKey);
  const hasLoaded = useCareTeamStore((state) => state.hasLoaded);
  const isLoading = useCareTeamStore((state) => state.isLoading);
  const isRefreshing = useCareTeamStore((state) => state.isRefreshing);
  const loadCareTeam = useCareTeamStore((state) => state.loadCareTeam);
  const dateKey = getTodayDateKey();
  const expectedRequestKey = clientId ? `${clientId}:${dateKey}` : null;
  const hasLoadedCurrentRequest =
    Boolean(expectedRequestKey) &&
    hasLoaded &&
    requestKey === expectedRequestKey;

  useEffect(() => {
    if (!clientId) {
      return;
    }

    void loadCareTeam(clientId, { dateKey });
  }, [clientId, dateKey, loadCareTeam]);

  const assignedCount = useMemo(
    () => countUniqueAssignedProfessionals(summaries),
    [summaries],
  );

  const refreshCareTeam = useCallback(async () => {
    if (!clientId) {
      return;
    }

    await loadCareTeam(clientId, { dateKey, force: true });
  }, [clientId, dateKey, loadCareTeam]);

  return {
    dateKey,
    summaries,
    errors,
    isLoading,
    isRefreshing,
    hasLoaded: hasLoadedCurrentRequest,
    assignedCount,
    refreshCareTeam,
  };
};
