import { getNutritionAssetUrl, nutritionClient } from './api';

export type PublicProfessionalRole = 'nutritionist' | 'trainer';
export type PublicProfessionalServiceMode = 'online' | 'in_person' | 'hybrid';
export type ServiceType = 'NUTRITION' | 'TRAINING' | 'BOTH';
export type ServicePrices = Record<ServiceType, number | string | null>;
export type ClientProfessionalRelationshipStatus = 'none' | 'prospect' | 'client';
export type ProfessionalContactRequestStatus =
  | 'new'
  | 'read'
  | 'contacted'
  | 'proposed'
  | 'scheduled'
  | 'converted'
  | 'dismissed';

export interface ProfessionalAvailabilitySlot {
  id: number;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
}

export type PublicProfessionalAvailabilitySlotStatus = 'available' | 'occupied';

export interface PublicProfessionalAvailabilityTimeSlot {
  start_at: string;
  end_at: string;
  status: PublicProfessionalAvailabilitySlotStatus;
}

export interface PublicProfessionalAvailabilityDay {
  date: string;
  has_available_slots: boolean;
  slots: PublicProfessionalAvailabilityTimeSlot[];
}

export interface ClientProfessionalRelationship {
  status: ClientProfessionalRelationshipStatus;
  active_service_types: ServiceType[];
  bookable_service_types: ServiceType[];
  latest_contact_request_id: number | null;
  latest_contact_request_status: ProfessionalContactRequestStatus | null;
  can_show_interest: boolean;
  can_book_directly: boolean;
}

export interface PublicProfessionalCard {
  professional_id: number;
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
  service_prices: ServicePrices;
  available_service_types: ServiceType[];
  client_relationship?: ClientProfessionalRelationship;
}

export interface PublicProfessionalDetail extends PublicProfessionalCard {
  biography: string | null;
  availability_slots: ProfessionalAvailabilitySlot[];
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

export interface PublicProfessionalAvailabilityResponse {
  items: PublicProfessionalAvailabilityDay[];
}

export interface ListPublicProfessionalsParams {
  q?: string;
  role?: PublicProfessionalRole;
  service_type?: ServiceType;
  service_mode?: PublicProfessionalServiceMode;
  min_price?: number;
  max_price?: number;
  page?: number;
  limit?: number;
}

export interface GetPublicProfessionalAvailabilityParams {
  from: string;
  to: string;
  duration_minutes?: number;
}

export interface CreateProfessionalContactRequestPayload {
  role?: PublicProfessionalRole;
  service_type?: ServiceType;
  message?: string | null;
  share_contact: boolean;
  requested_start_at?: string | null;
  requested_duration_minutes?: number | null;
}

export interface CreateProfessionalAppointmentPayload {
  service_type: ServiceType;
  scheduled_at: string;
  duration_minutes?: number | null;
}

export interface ProfessionalContactRequest {
  id: number;
  professional_id: number;
  client_id: number;
  requested_role: PublicProfessionalRole;
  requested_service_type: ServiceType;
  message: string | null;
  requested_start_at: string | null;
  requested_duration_minutes: number | null;
  proposed_start_at: string | null;
  proposed_duration_minutes: number | null;
  scheduled_appointment_id: number | null;
  client_name: string;
  client_email: string | null;
  client_phone_number: string | null;
  consultation_price_amount: number | string | null;
  consultation_price_currency: string | null;
  status: ProfessionalContactRequestStatus;
  conversation_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProfessionalProfileView {
  id: number;
  professional_id: number;
  client_id: number;
  view_count: number;
  first_viewed_at: string;
  last_viewed_at: string;
}

export interface ProfessionalAppointment {
  id: number;
  professional_id: number;
  client_id: number;
  scheduled_at: string;
  duration_minutes: number | null;
  status: string | null;
  title: string | null;
  type: ServiceType | null;
}

const buildQueryString = <T extends object>(params: T) => {
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
    `/professional-profiles/client-directory${buildQueryString(params)}`,
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
    `/professional-profiles/client-directory/${encodeURIComponent(username)}`,
  );

  return mapProfileImageUrl(response);
};

export const getPublicProfessionalAvailability = async (
  username: string,
  params: GetPublicProfessionalAvailabilityParams,
): Promise<PublicProfessionalAvailabilityResponse> =>
  nutritionClient.get<PublicProfessionalAvailabilityResponse>(
    `/professional-profiles/public/${encodeURIComponent(username)}/availability${buildQueryString(params)}`,
  );

export const createProfessionalContactRequest = async (
  username: string,
  payload: CreateProfessionalContactRequestPayload,
): Promise<ProfessionalContactRequest> =>
  nutritionClient.post<ProfessionalContactRequest>(
    `/professional-profiles/public/${encodeURIComponent(username)}/contact-requests`,
    payload,
  );

export const createProfessionalAppointment = async (
  username: string,
  payload: CreateProfessionalAppointmentPayload,
): Promise<ProfessionalAppointment> =>
  nutritionClient.post<ProfessionalAppointment>(
    `/professional-profiles/client-directory/${encodeURIComponent(username)}/appointments`,
    payload,
  );

export const recordProfessionalProfileView = async (
  username: string,
): Promise<ProfessionalProfileView> =>
  nutritionClient.post<ProfessionalProfileView>(
    `/professional-profiles/public/${encodeURIComponent(username)}/view`,
    {},
  );
