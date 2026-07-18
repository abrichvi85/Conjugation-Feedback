import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ErrorTypeCount, RecurringMistake, SpeakingTotals, VocabGapView } from '../db/repo';

interface Props {
  totals: SpeakingTotals;
  errorTypes: ErrorTypeCount[];
  recurring: RecurringMistake[];
  vocabGaps: VocabGapView[];
}

/**
 * The "grammar fingerprint": real minutes spoken (the metric no simulated
 * tutor can claim), error-type breakdown, recurring mistakes, and vocabulary
 * gaps mined from actual conversations.
 */
export function ProgressHeader({ totals, errorTypes, recurring, vocabGaps }: Props) {
  const totalMin = Math.round(totals.total_audio_seconds / 60);
  const weekMin = Math.round(totals.week_audio_seconds / 60);
  const maxCount = errorTypes[0]?.n ?? 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.minutesRow}>
        <View style={styles.minuteStat}>
          <Text style={styles.minuteValue}>{weekMin}</Text>
          <Text style={styles.minuteLabel}>min spoken this week</Text>
        </View>
        <View style={styles.minuteStat}>
          <Text style={styles.minuteValue}>{totalMin}</Text>
          <Text style={styles.minuteLabel}>min spoken total</Text>
        </View>
      </View>

      {errorTypes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>YOUR GRAMMAR FINGERPRINT (30 DAYS)</Text>
          {errorTypes.map((e) => (
            <View key={e.error_type} style={styles.barRow}>
              <Text style={styles.barLabel}>{e.error_type.replace('_', ' ')}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { flex: Math.max(e.n / (maxCount || 1), 0.04) }]} />
                <View style={{ flex: 1 - Math.max(e.n / (maxCount || 1), 0.04) }} />
              </View>
              <Text style={styles.barCount}>{e.n}</Text>
            </View>
          ))}
        </View>
      )}

      {recurring.filter((r) => r.n > 1).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>KEEPS COMING BACK</Text>
          {recurring
            .filter((r) => r.n > 1)
            .slice(0, 3)
            .map((r) => (
              <Text key={r.corrected_fragment} style={styles.recurring}>
                <Text style={styles.recurringFix}>{r.corrected_fragment}</Text>
                <Text style={styles.recurringCount}>  ×{r.n}</Text>
              </Text>
            ))}
        </View>
      )}

      {vocabGaps.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WORDS YOU WERE MISSING</Text>
          {vocabGaps.slice(0, 5).map((g) => (
            <Text key={g.id} style={styles.vocab}>
              <Text style={styles.vocabTarget}>{g.target_suggestion}</Text>
              <Text style={styles.vocabMeaning}>  — {g.intended_meaning}</Text>
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 12, paddingBottom: 4 },
  minutesRow: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 8 },
  minuteStat: { alignItems: 'center' },
  minuteValue: { fontSize: 28, fontWeight: '800', color: '#1C1C1E' },
  minuteLabel: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  section: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    padding: 14,
  },
  sectionTitle: { fontSize: 11, color: '#8E8E93', marginBottom: 8, letterSpacing: 0.4 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  barLabel: { width: 100, fontSize: 13, color: '#3C3C43' },
  barTrack: { flex: 1, flexDirection: 'row', height: 8 },
  bar: { backgroundColor: '#FF9500', borderRadius: 4 },
  barCount: { width: 28, textAlign: 'right', fontSize: 13, color: '#8E8E93' },
  recurring: { fontSize: 15, marginVertical: 2 },
  recurringFix: { color: '#34C759', fontWeight: '600' },
  recurringCount: { color: '#FF9500', fontWeight: '700' },
  vocab: { fontSize: 15, marginVertical: 2 },
  vocabTarget: { fontWeight: '700', color: '#1C1C1E' },
  vocabMeaning: { color: '#636366' },
});
