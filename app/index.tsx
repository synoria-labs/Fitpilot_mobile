import React from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

export default function Index() {
  const { isAuthenticated, user } = useAuthStore();

  // Redirect based on auth state
  if (isAuthenticated) {
    if (user?.onboardingStatus !== 'completed') {
      return <Redirect href="/onboarding" />;
    }

    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/login" />;
}
