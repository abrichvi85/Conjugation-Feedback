import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SessionUiStatus } from '../store/useSessionStore';

const LABELS: Record<SessionUiStatus, string> = {
  idle: 'Not listening',
  listening: 'Listening…',
  thinking: 'Checking…',
  speaking: 'Speaking correction',
};

const COLORS: Record<SessionUiStatus, string> = {
  idle: '#8E8E93',
  listening: '#34C759',
  thinking: '#FF9500',
  speaking: '#007AFF',
};

export function StatusPill({ status }: { status: SessionUiStatus }) {
  return (
    <View style={[styles.pill, { backgroundColor: COLORS[status] + '22' }]}>
      <View style={[styles.dot, { backgroundColor: COLORS[status] }]} />
      <Text style={[styles.label, { color: COLORS[status] }]}>{LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 13, fontWeight: '600' },
});
