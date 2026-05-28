import { nutritionClient } from './api';

const PUBLIC_AUTH_CONFIG = {
  skipAuth: true,
  skipAuthRefresh: true,
} as const;

export interface CheckPhoneAvailabilityPayload {
  phone_number: string;
}

export interface PhoneAvailabilityResponse {
  isAvailable: boolean;
}

export interface SendEmailVerificationPayload {
  name: string;
  lastname: string;
  email: string;
  password: string;
  role: 'CLIENT';
  phone_number: string;
  signup_session_id: string;
  captcha_token?: string;
}

export interface SendEmailVerificationResponse {
  attemptNumber?: number;
  message: string;
  nextCooldownSeconds: number;
  retryAfterSeconds?: number;
  captchaRequired?: boolean;
  code?: string;
}

export interface VerifyEmailPayload {
  email: string;
  code: string;
  signup_session_id: string;
}

export interface VerifyEmailResponse {
  verified: true;
  email: string;
  message: string;
  verification_proof: string;
  proof_expires_at: string;
}

export interface SignupPayload {
  name: string;
  lastname: string;
  email: string;
  password: string;
  role: 'CLIENT';
  phone_number: string;
  signup_session_id: string;
  email_verification_proof: string;
}

export interface SignupResponse {
  access_token?: string;
  refresh_token?: string;
  token?: string;
  message?: string;
  code?: string;
}

export const registrationService = {
  checkPhoneAvailability: (payload: CheckPhoneAvailabilityPayload) =>
    nutritionClient.post<PhoneAvailabilityResponse>(
      '/auth/check-phone-availability',
      payload,
      PUBLIC_AUTH_CONFIG,
    ),

  sendEmailVerification: (payload: SendEmailVerificationPayload) =>
    nutritionClient.post<SendEmailVerificationResponse>(
      '/auth/send-email-verification',
      payload,
      PUBLIC_AUTH_CONFIG,
    ),

  verifyEmail: (payload: VerifyEmailPayload) =>
    nutritionClient.post<VerifyEmailResponse>(
      '/auth/verify-email',
      payload,
      PUBLIC_AUTH_CONFIG,
    ),

  signup: (payload: SignupPayload) =>
    nutritionClient.post<SignupResponse>('/auth/signup', payload, PUBLIC_AUTH_CONFIG),
};
