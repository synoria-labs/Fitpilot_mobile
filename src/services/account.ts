import { getRefreshToken, nutritionClient } from './api';
import type {
  ApiMessageResponse,
  ChangePasswordPayload,
  NutritionAuthUserResponse,
  UpdateCurrentUserPayload,
  User,
  UserRole,
} from '../types';

const normalizeRole = (role: string | null | undefined): UserRole => {
  const normalizedRole = role?.trim().toLowerCase();

  if (normalizedRole === 'admin' || normalizedRole === 'administrator') {
    return 'admin';
  }

  if (normalizedRole === 'professional' || normalizedRole === 'trainer') {
    return 'trainer';
  }

  return 'client';
};

const normalizeProfessionalRoles = (
  professionalRole: NutritionAuthUserResponse['professional_role'],
): string[] => {
  if (Array.isArray(professionalRole)) {
    return professionalRole.filter((role): role is string => typeof role === 'string');
  }

  if (typeof professionalRole === 'string' && professionalRole.trim()) {
    return [professionalRole.trim()];
  }

  return [];
};

export const mapNutritionUserToUser = (payload: NutritionAuthUserResponse): User => {
  const firstName = payload.name?.trim() || null;
  const lastName = payload.lastname?.trim() || null;
  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || payload.email;

  return {
    id: String(payload.id),
    email: payload.email,
    displayName,
    firstName,
    lastName,
    role: normalizeRole(payload.role),
    phoneNumber: payload.phone_number ?? null,
    isPhoneVerified: payload.is_phone_verified ?? false,
    onboardingStatus: payload.onboarding_status ?? null,
    profilePictureUrl: payload.profile_picture ?? null,
    professionalRoles: normalizeProfessionalRoles(payload.professional_role),
    currentSubscription: payload.current_subscription ?? null,
    hasSubscription: payload.has_subscription ?? false,
    hasActiveSubscription: payload.has_active_subscription ?? false,
    subscriptionVigency: payload.subscription_vigency ?? null,
  };
};

export const getCurrentUser = async (): Promise<User> => {
  const payload = await nutritionClient.get<NutritionAuthUserResponse>('/auth/me');
  return mapNutritionUserToUser(payload);
};

export const updateCurrentUser = async (
  payload: UpdateCurrentUserPayload,
): Promise<User> => {
  const response = await nutritionClient.patch<NutritionAuthUserResponse>('/users/me', payload);
  return mapNutritionUserToUser(response);
};

export const changePassword = async (
  payload: ChangePasswordPayload,
): Promise<ApiMessageResponse> => {
  const refreshToken = await getRefreshToken();

  if (!refreshToken) {
    throw new Error('No fue posible validar tu sesión actual. Inicia sesión de nuevo.');
  }

  return nutritionClient.post<ApiMessageResponse>(
    '/auth/change-password',
    {
      current_password: payload.currentPassword,
      new_password: payload.newPassword,
    },
    {
      headers: {
        'x-refresh-token': refreshToken,
      },
      skipAuthRefresh: true,
    },
  );
};

export type AccountDeletionStatus = {
  requested: boolean;
  requested_at: string | null;
  scheduled_deletion_at: string | null;
  grace_period_days: number;
  days_until_deletion: number | null;
};

export const getAccountDeletionStatus = async (): Promise<AccountDeletionStatus> =>
  nutritionClient.get<AccountDeletionStatus>('/users/me/account-deletion');

export const requestAccountDeletion = async (): Promise<AccountDeletionStatus> =>
  nutritionClient.post<AccountDeletionStatus>('/users/me/account-deletion');

export const cancelAccountDeletion = async (): Promise<AccountDeletionStatus> =>
  nutritionClient.delete<AccountDeletionStatus>('/users/me/account-deletion');
