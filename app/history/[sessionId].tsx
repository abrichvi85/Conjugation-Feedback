import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '@/db/database';
import { MistakeView, flagErrorWrong, listMistakesForSession } from '@/db/repo';

export default function SessionDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [mistakes, setMistakes] = useState<MistakeView[]>([]);

  useEffect(() => {
    if (sessionId) setMistakes(listMistakesForSession(getDatabase(), Number(sessionId)));
  }, [sessionId]);

  const toggleFlag = (mistake: MistakeView) => {
    // Long-press "this correction was wrong" — flagged rows become fixture
    // material for prompt tuning.
    const flagged = mistake.flagged_wrong === 0;
    Alert.alert(
      flagged ? 'Mark correction as wrong?' : 'Unmark correction?',
      mistake.corrected_fragment,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'OK',
          onPress: () => {
            flagErrorWrong(getDatabase(), mistake.id, flagged);
            setMistakes(listMistakesForSession(getDatabase(), Number(sessionId)));
          },
        },
      ]
    );
  };

  return (
    <FlatList
      style={styles.container}
      data={mistakes}
      keyExtractor={(m) => String(m.id)}
      renderItem={({ item }) => (
        <Pressable onLongPress={() => toggleFlag(item)}>
          <View style={[styles.card, item.flagged_wrong ? styles.flagged : null]}>
            <Text style={styles.transcript}>{item.transcript}</Text>
            <Text style={styles.fragment}>
              <Text style={styles.strike}>{item.erroneous_fragment}</Text>
              {'  →  '}
              <Text style={styles.fix}>{item.corrected_fragment}</Text>
            </Text>
            <Text style={styles.explanation}>
              [{item.error_type}] {item.explanation_short}
            </Text>
            {item.flagged_wrong ? <Text style={styles.flagNote}>Marked as wrong correction</Text> : null}
          </View>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No mistakes in this session. Świetnie!</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  card: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    padding: 14,
  },
  flagged: { opacity: 0.5 },
  transcript: { fontSize: 13, color: '#8E8E93' },
  fragment: { fontSize: 16, marginTop: 6 },
  strike: { textDecorationLine: 'line-through', color: '#FF3B30' },
  fix: { color: '#34C759', fontWeight: '700' },
  explanation: { fontSize: 13, color: '#636366', marginTop: 6 },
  flagNote: { fontSize: 12, color: '#FF9500', marginTop: 6, fontStyle: 'italic' },
  empty: { textAlign: 'center', color: '#8E8E93', marginTop: 48 },
});
