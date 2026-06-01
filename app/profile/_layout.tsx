import React from 'react';
import { Stack } from 'expo-router';
import { ProtectedRoute } from '../../src/components/common';

export default function ProtectedProfileLayout() {
  return (
    <ProtectedRoute>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="personal-info" />
        <Stack.Screen name="professionals" />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="notifications-settings" />
        <Stack.Screen name="connected-health" />
        <Stack.Screen name="help" />
        <Stack.Screen name="contact-support" />
        <Stack.Screen name="legal/[document]" />
        <Stack.Screen name="theme-settings" />
      </Stack>
    </ProtectedRoute>
  );
}
