export interface Goal {
  id: number;
  code?: string;
  name: string;
  description?: string | null;
  created_at?: string;
}

export interface Allergen {
  id: number;
  name: string;
  type: string;
  created_at?: string;
}

export interface Metrics {
  weight_kg: number;
  height_cm: number;
}

export type OnboardingGenre = 'man' | 'female';

export interface Preferences {
  likes: string[];
  dislikes: string[];
}

export type InjuryStatus = 'active' | 'recovering' | 'resolved' | 'chronic';

export interface Injury {
  name: string;
  body_part: string;
  severity: number;
  status: InjuryStatus;
  limitations: string;
  diagnosis_date?: string | null;
  recovery_date?: string | null;
}

export interface OnboardingPayload {
  user_id: number;
  form_version: string;
  date_of_birth: string;
  genre: OnboardingGenre;
  goals: Goal[];
  allergens: Allergen[];
  metrics: Metrics;
  preferences: Preferences;
  injuries: Injury[];
  medical_conditions: string;
  notes: string;
}
