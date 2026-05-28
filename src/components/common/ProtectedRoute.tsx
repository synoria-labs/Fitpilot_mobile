import React from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { LoadingSpinner } from './LoadingSpinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  loadingText?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  loadingText = 'Validando sesion...',
}) => {
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const onboardingStatus = useAuthStore((state) => state.user?.onboardingStatus);

  if (!isInitialized) {
    return <LoadingSpinner fullScreen text={loadingText} />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  if (onboardingStatus !== 'completed') {
    return <Redirect href="/onboarding" />;
  }

  return <>{children}</>;
};
