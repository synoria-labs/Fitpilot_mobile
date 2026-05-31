import {
  getNutritionAssetUrl,
  getTrainingAssetUrl,
  nutritionClient,
  trainingClient,
} from './api';
import type {
  AssignedProfessionalDomain,
  AssignedProfessionalSummary,
  AssignedProfessionalStatus,
} from '../types';

type AssignedProfessionalApiResponse = {
  id?: string | number | null;
  full_name?: string | null;
  role_label?: string | null;
  avatar_url?: string | null;
  domain?: AssignedProfessionalDomain | null;
  context_label?: string | null;
  status?: string | null;
};

type ClientDirectoryServiceType = 'NUTRITION' | 'TRAINING' | 'BOTH';

type ClientDirectoryProfessionalCard = {
  professional_id?: string | number | null;
  name?: string | null;
  lastname?: string | null;
  profile_picture?: string | null;
  client_relationship?: {
    status?: string | null;
    active_service_types?: ClientDirectoryServiceType[] | null;
  } | null;
};

type ClientDirectoryProfessionalsResponse = {
  items?: ClientDirectoryProfessionalCard[] | null;
  pagination?: {
    page?: number | null;
    totalPages?: number | null;
  } | null;
};

export type CareTeamDomainResult = {
  error: string | null;
  summary: AssignedProfessionalSummary | null;
};

export type CareTeamDomainResults = Record<
  AssignedProfessionalDomain,
  CareTeamDomainResult
>;

const normalizeOptionalText = (value: string | number | null | undefined) => {
  const trimmedValue = String(value ?? '').trim();
  return trimmedValue || null;
};

const resolveAssignedProfessionalStatus = (
  payloadStatus: string | null | undefined,
  id: string | null,
  fullName: string | null,
): AssignedProfessionalStatus => {
  if (payloadStatus === 'assigned') {
    return 'assigned';
  }

  if (payloadStatus === 'unassigned') {
    return 'unassigned';
  }

  return id && fullName ? 'assigned' : 'unassigned';
};

const mapAssignedProfessionalSummary = (
  payload: AssignedProfessionalApiResponse,
  fallbackDomain: AssignedProfessionalDomain,
): AssignedProfessionalSummary => {
  const id = normalizeOptionalText(payload.id);
  const fullName = normalizeOptionalText(payload.full_name);

  return {
    id,
    fullName,
    roleLabel: normalizeOptionalText(payload.role_label),
    avatarUrl:
      fallbackDomain === 'training'
        ? getTrainingAssetUrl(payload.avatar_url)
        : getNutritionAssetUrl(payload.avatar_url),
    domain: payload.domain ?? fallbackDomain,
    contextLabel: normalizeOptionalText(payload.context_label),
    status: resolveAssignedProfessionalStatus(payload.status, id, fullName),
  };
};

const toErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallbackMessage;
};

const ACTIVE_SERVICE_BY_DOMAIN: Record<
  AssignedProfessionalDomain,
  ClientDirectoryServiceType
> = {
  training: 'TRAINING',
  nutrition: 'NUTRITION',
};

const isClientDirectoryServiceType = (
  value: string | null | undefined,
): value is ClientDirectoryServiceType =>
  value === 'NUTRITION' || value === 'TRAINING' || value === 'BOTH';

const serviceTypeCoversDomain = (
  serviceType: ClientDirectoryServiceType,
  domain: AssignedProfessionalDomain,
) => serviceType === 'BOTH' || serviceType === ACTIVE_SERVICE_BY_DOMAIN[domain];

const hasActiveRelationshipForDomain = (
  profile: ClientDirectoryProfessionalCard,
  domain: AssignedProfessionalDomain,
) => {
  const relationship = profile.client_relationship;
  if (relationship?.status !== 'client') {
    return false;
  }

  return (relationship.active_service_types ?? [])
    .filter(isClientDirectoryServiceType)
    .some((serviceType) => serviceTypeCoversDomain(serviceType, domain));
};

const buildProfessionalFullName = (
  profile: ClientDirectoryProfessionalCard,
) => [profile.name, profile.lastname]
  .map(normalizeOptionalText)
  .filter((value): value is string => Boolean(value))
  .join(' ')
  .trim() || null;

const mapClientDirectoryProfessionalSummary = (
  profile: ClientDirectoryProfessionalCard,
  domain: AssignedProfessionalDomain,
): AssignedProfessionalSummary | null => {
  const id = normalizeOptionalText(profile.professional_id);
  const fullName = buildProfessionalFullName(profile);

  if (!id || !fullName) {
    return null;
  }

  return {
    id,
    fullName,
    roleLabel: domain === 'training' ? 'Entrenador' : 'Nutriologo',
    avatarUrl: getNutritionAssetUrl(profile.profile_picture),
    domain,
    contextLabel: 'Seguimiento activo',
    status: 'assigned',
  };
};

const fetchClientDirectoryAssignedProfessional = async (
  domain: AssignedProfessionalDomain,
): Promise<AssignedProfessionalSummary | null> => {
  const serviceType = ACTIVE_SERVICE_BY_DOMAIN[domain];
  let page = 1;
  let totalPages = 1;

  do {
    const response =
      await nutritionClient.get<ClientDirectoryProfessionalsResponse>(
        `/professional-profiles/client-directory?service_type=${encodeURIComponent(serviceType)}&limit=50&page=${page}`,
      );

    const assignedProfile = (response.items ?? []).find((profile) =>
      hasActiveRelationshipForDomain(profile, domain),
    );

    if (assignedProfile) {
      return mapClientDirectoryProfessionalSummary(assignedProfile, domain);
    }

    totalPages = Math.max(Number(response.pagination?.totalPages ?? 1), 1);
    page += 1;
  } while (page <= totalPages);

  return null;
};

export const fetchCareTeamDomainSummaries = async (
  clientId: string,
  dateKey: string,
): Promise<CareTeamDomainResults> => {
  const [trainingResult, nutritionResult] = await Promise.allSettled([
    trainingClient.get<AssignedProfessionalApiResponse>(
      '/client-app/training-professional-summary',
    ),
    nutritionClient.get<AssignedProfessionalApiResponse>(
      `/menus/client-professional-summary?client_id=${encodeURIComponent(clientId)}&date=${encodeURIComponent(dateKey)}`,
    ),
  ]);
  const trainingSummary =
    trainingResult.status === 'fulfilled'
      ? mapAssignedProfessionalSummary(trainingResult.value, 'training')
      : null;
  const trainingError =
    trainingResult.status === 'rejected'
      ? toErrorMessage(
          trainingResult.reason,
          'No fue posible cargar tu profesional de entrenamiento.',
        )
      : null;
  let resolvedTrainingSummary = trainingSummary;
  let resolvedTrainingError = trainingError;

  if (trainingSummary?.status !== 'assigned') {
    try {
      const clientDirectoryTrainingSummary =
        await fetchClientDirectoryAssignedProfessional('training');

      if (clientDirectoryTrainingSummary) {
        resolvedTrainingSummary = clientDirectoryTrainingSummary;
        resolvedTrainingError = null;
      }
    } catch {
      // Keep the training service result when the directory fallback is unavailable.
    }
  }

  return {
    training: {
      error: resolvedTrainingError,
      summary: resolvedTrainingSummary,
    },
    nutrition:
      nutritionResult.status === 'fulfilled'
        ? {
            error: null,
            summary: mapAssignedProfessionalSummary(
              nutritionResult.value,
              'nutrition',
            ),
          }
        : {
            error: toErrorMessage(
              nutritionResult.reason,
              'No fue posible cargar tu profesional de nutricion.',
            ),
            summary: null,
          },
  };
};
