import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GrammarError } from '../llm/types';

interface Props {
  transcript: string;
  hasError: boolean;
  errors: GrammarError[];
  correctedSentence: string;
  /** Prior occurrences of this exact correction in the session. */
  repeats?: number;
}

export function CorrectionCard({ transcript, hasError, errors, correctedSentence, repeats }: Props) {
  if (!hasError) {
    return (
      <View style={[styles.card, styles.okCard]}>
        <Text style={styles.okMark}>✓</Text>
        <Text style={styles.transcriptOk} numberOfLines={2}>
          {transcript}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, styles.errorCard]}>
      {repeats != null && repeats > 0 && (
        <Text style={styles.repeatBadge}>again ×{repeats + 1}</Text>
      )}
      <Text style={styles.transcript}>{transcript}</Text>
      <Text style={styles.corrected}>{correctedSentence}</Text>
      {errors.map((e, i) => (
        <View key={i} style={styles.errorRow}>
          <Text style={styles.fragment}>
            <Text style={styles.strike}>{e.erroneousFragment}</Text>
            {'  →  '}
            <Text style={styles.fix}>{e.correctedFragment}</Text>
          </Text>
          <Text style={styles.explanation}>{e.explanationShort}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  okCard: { flexDirection: 'row', alignItems: 'center', gap: 8, opacity: 0.7 },
  okMark: { color: '#34C759', fontSize: 16, fontWeight: '700' },
  transcriptOk: { flex: 1, fontSize: 14, color: '#3C3C43' },
  errorCard: { borderLeftWidth: 3, borderLeftColor: '#FF9500' },
  repeatBadge: {
    position: 'absolute',
    top: 10,
    right: 12,
    fontSize: 11,
    fontWeight: '700',
    color: '#FF9500',
  },
  transcript: { fontSize: 14, color: '#8E8E93' },
  corrected: { fontSize: 16, fontWeight: '600', color: '#1C1C1E', marginTop: 4 },
  errorRow: { marginTop: 8 },
  fragment: { fontSize: 15 },
  strike: { textDecorationLine: 'line-through', color: '#FF3B30' },
  fix: { color: '#34C759', fontWeight: '700' },
  explanation: { fontSize: 13, color: '#636366', marginTop: 2 },
});
