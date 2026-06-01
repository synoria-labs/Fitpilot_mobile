import React from 'react';
import { Stack } from 'expo-router';
import { ProtectedRoute } from '../../src/components/common';

export default function ProtectedProfessionalsLayout() {
  return (
    <ProtectedRoute>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="[username]" />
      </Stack>
    </ProtectedRoute>
  );
}
