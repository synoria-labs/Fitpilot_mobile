import { nutritionClient } from './api';
import type { Allergen, Goal, OnboardingPayload } from '../types/onboarding';

export const onboardingService = {
  getGoals: () => nutritionClient.get<Goal[]>('/goals'),

  getAllergens: () => nutritionClient.get<Allergen[]>('/allergens'),

  submitOnboarding: (payload: OnboardingPayload) =>
    nutritionClient.post<{ success: boolean }>('/professional-clients/onboarding', payload),
};
