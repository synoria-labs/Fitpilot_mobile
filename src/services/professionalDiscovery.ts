import { getNutritionAssetUrl, nutritionClient } from './api';

export type PublicProfessionalRole = 'nutritionist' | 'trainer';
export type PublicProfessionalServiceMode = 'online' | 'in_person' | 'hybrid';
export type ProfessionalContactRequestStatus =
  | 'new'
  | 'read'
  | 'contacted'
  | 'dismissed';

export interface PublicProfessionalCard {
  username: string;
  name: string;
  lastname: string | null;
  profile_picture: string | null;
  roles: PublicProfessionalRole[];
  title: string | null;
  specialties: string[];
  public_city: string | null;
  public_state: string | null;
  public_service_mode: PublicProfessionalServiceMode | null;
  consultation_price_amount: number | string | null;
  consultation_price_currency: string | null;
}

export interface PublicProfessionalDetail extends PublicProfessionalCard {
  biography: string | null;
  social_media: {
    website: string | null;
    instagram: string | null;
    linkedin: string | null;
    facebook: string | null;
  };
}

export interface PublicProfessionalsResponse {
  items: PublicProfessionalCard[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListPublicProfessionalsParams {
  q?: string;
  role?: PublicProfessionalRole;
  service_mode?: PublicProfessionalServiceMode;
  min_price?: number;
  max_price?: number;
  page?: number;
  limit?: number;
}

export interface CreateProfessionalContactRequestPayload {
  role: PublicProfessionalRole;
  message?: string | null;
  share_contact: boolean;
}

export interface ProfessionalContactRequest {
  id: number;
  professional_id: number;
  client_id: number;
  requested_role: PublicProfessionalRole;
  message: string | null;
  client_name: string;
  client_email: string | null;
  client_phone_number: string | null;
  consultation_price_amount: number | string | null;
  consultation_price_currency: string | null;
  status: ProfessionalContactRequestStatus;
  created_at: string;
  updated_at: string;
}

const buildQueryString = (params: ListPublicProfessionalsParams) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    searchParams.set(key, String(value));
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
};

const mapProfileImageUrl = <T extends PublicProfessionalCard>(profile: T): T => ({
  ...profile,
  profile_picture: getNutritionAssetUrl(profile.profile_picture),
});

export const listPublicProfessionals = async (
  params: ListPublicProfessionalsParams = {},
): Promise<PublicProfessionalsResponse> => {
  const response = await nutritionClient.get<PublicProfessionalsResponse>(
    `/professional-profiles/public${buildQueryString(params)}`,
  );

  return {
    ...response,
    items: response.items.map(mapProfileImageUrl),
  };
};

export const getPublicProfessionalByUsername = async (
  username: string,
): Promise<PublicProfessionalDetail> => {
  const response = await nutritionClient.get<PublicProfessionalDetail>(
    `/professional-profiles/public/${encodeURIComponent(username)}`,
  );

  return mapProfileImageUrl(response);
};

export const createProfessionalContactRequest = async (
  username: string,
  payload: CreateProfessionalContactRequestPayload,
): Promise<ProfessionalContactRequest> =>
  nutritionClient.post<ProfessionalContactRequest>(
    `/professional-profiles/public/${encodeURIComponent(username)}/contact-requests`,
    payload,
  );
