import { Stack } from 'expo-router';
import React from 'react';

export default function HistoryLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'History' }} />
      <Stack.Screen name="[sessionId]" options={{ title: 'Session' }} />
    </Stack>
  );
}
