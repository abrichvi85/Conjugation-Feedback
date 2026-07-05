import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { ColorValue, Text } from 'react-native';

import { useSettingsStore } from '@/store/useSettingsStore';

function TabIcon({ symbol, color }: { symbol: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{symbol}</Text>;
}

export default function RootLayout() {
  const hydrate = useSettingsStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#007AFF' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Session',
          tabBarIcon: ({ color }) => <TabIcon symbol="🎙" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon symbol="📒" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon symbol="⚙️" color={color} />,
        }}
      />
    </Tabs>
  );
}
