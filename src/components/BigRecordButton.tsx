import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

interface Props {
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}

export function BigRecordButton({ active, onPress, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        active ? styles.stop : styles.start,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.icon}>{active ? '■' : '●'}</Text>
      <Text style={styles.label}>{active ? 'End session' : 'Start session'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  start: { backgroundColor: '#34C759' },
  stop: { backgroundColor: '#FF3B30' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  icon: { fontSize: 36, color: 'white' },
  label: { marginTop: 6, fontSize: 16, fontWeight: '700', color: 'white' },
});
