import React from 'react';
import { Stack } from 'expo-router';
import { ProtectedRoute } from '../../src/components/common';

export default function ProtectedDietLayout() {
  return (
    <ProtectedRoute>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="weekly-plan" />
        <Stack.Screen name="shopping-list" />
      </Stack>
    </ProtectedRoute>
  );
}
