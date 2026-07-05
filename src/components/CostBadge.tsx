import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatUsd } from '../utils/cost';

interface Props {
  utteranceCount: number;
  errorCount: number;
  estCostUsd: number;
}

export function CostBadge({ utteranceCount, errorCount, estCostUsd }: Props) {
  return (
    <View style={styles.row}>
      <Stat label="utterances" value={String(utteranceCount)} />
      <Stat label="mistakes" value={String(errorCount)} />
      <Stat label="est. cost" value={formatUsd(estCostUsd)} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-evenly', paddingVertical: 12 },
  stat: { alignItems: 'center' },
  value: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  label: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
});
