import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { captureOneUtterance } from '@/audio/oneShot';
import { ensureCapturePermissions } from '@/audio/permissions';
import { pcmToWav } from '@/audio/wav';
import { getDatabase } from '@/db/database';
import { DrillItem, listDrillItems } from '@/db/repo';
import { createProvider } from '@/llm/providerRegistry';
import { DrillCheckResult } from '@/llm/types';
import { useSessionStore } from '@/store/useSessionStore';
import { settingsCredentials, useSettingsStore } from '@/store/useSettingsStore';

type AttemptState =
  | { kind: 'idle' }
  | { kind: 'listening' }
  | { kind: 'checking' }
  | { kind: 'result'; result: DrillCheckResult }
  | { kind: 'nothing-heard' }
  | { kind: 'error' };

export default function PracticeScreen() {
  const { apiKey, language, model } = useSettingsStore();
  const sessionActive = useSessionStore((s) => s.status !== 'idle');
  const [items, setItems] = useState<DrillItem[]>([]);
  const [activeErrorId, setActiveErrorId] = useState<number | null>(null);
  const [attempt, setAttempt] = useState<AttemptState>({ kind: 'idle' });
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set());

  useFocusEffect(
    useCallback(() => {
      setItems(listDrillItems(getDatabase(), language, 10));
    }, [language])
  );

  const runDrill = async (item: DrillItem) => {
    if (sessionActive || attempt.kind === 'listening' || attempt.kind === 'checking') return;
    setActiveErrorId(item.error_id);
    setAttempt({ kind: 'listening' });
    try {
      if (!(await ensureCapturePermissions())) {
        setAttempt({ kind: 'error' });
        return;
      }
      const utterance = await captureOneUtterance();
      if (!utterance) {
        setAttempt({ kind: 'nothing-heard' });
        return;
      }
      setAttempt({ kind: 'checking' });
      const provider = createProvider('gemini', settingsCredentials, model);
      const target = item.corrected_sentence ?? item.corrected_fragment;
      const result = await provider.checkDrillAttempt(
        pcmToWav(utterance.pcm, utterance.sampleRate),
        target,
        language
      );
      setAttempt({ kind: 'result', result });
      if (result.correct) {
        setDoneIds((prev) => new Set(prev).add(item.error_id));
      }
    } catch {
      setAttempt({ kind: 'error' });
    }
  };

  if (!apiKey) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Add your Gemini API key in Settings to practice.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={items}
      keyExtractor={(i) => String(i.error_id)}
      ListHeaderComponent={
        <Text style={styles.header}>
          A 2-minute warm-up from your own recent mistakes. Tap a card, then say the corrected
          sentence out loud.
        </Text>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          No mistakes to practice yet — have a conversation first, then come back here.
        </Text>
      }
      renderItem={({ item }) => (
        <DrillCard
          item={item}
          done={doneIds.has(item.error_id)}
          active={activeErrorId === item.error_id}
          attempt={activeErrorId === item.error_id ? attempt : { kind: 'idle' }}
          disabled={sessionActive}
          onPress={() => void runDrill(item)}
        />
      )}
      contentContainerStyle={styles.list}
    />
  );
}

function DrillCard({
  item,
  done,
  active,
  attempt,
  disabled,
  onPress,
}: {
  item: DrillItem;
  done: boolean;
  active: boolean;
  attempt: AttemptState;
  disabled: boolean;
  onPress: () => void;
}) {
  const target = item.corrected_sentence ?? item.corrected_fragment;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.card, done && styles.cardDone]}>
      <Text style={styles.prompt}>
        You said <Text style={styles.strike}>{item.erroneous_fragment}</Text> — now say:
      </Text>
      <Text style={styles.target}>{target}</Text>
      <Text style={styles.explanation}>{item.explanation_short}</Text>
      {done && !active && <Text style={styles.ok}>✓ Nailed it</Text>}
      {active && attempt.kind === 'listening' && (
        <Text style={styles.listening}>🎙 Listening — say it now…</Text>
      )}
      {active && attempt.kind === 'checking' && (
        <View style={styles.rowCenter}>
          <ActivityIndicator size="small" />
          <Text style={styles.checking}> Checking…</Text>
        </View>
      )}
      {active && attempt.kind === 'result' && (
        <Text style={attempt.result.correct ? styles.ok : styles.retry}>
          {attempt.result.correct ? '✓ ' : '✗ '}
          {attempt.result.feedbackShort}
          {!attempt.result.correct && attempt.result.transcript
            ? `  (heard: "${attempt.result.transcript}")`
            : ''}
        </Text>
      )}
      {active && attempt.kind === 'nothing-heard' && (
        <Text style={styles.retry}>Didn't catch anything — tap to try again.</Text>
      )}
      {active && attempt.kind === 'error' && (
        <Text style={styles.retry}>Couldn't check that one — tap to retry.</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F2F7' },
  list: { paddingBottom: 24 },
  header: { margin: 16, color: '#3C3C43', fontSize: 14 },
  empty: { textAlign: 'center', color: '#8E8E93', marginTop: 48, paddingHorizontal: 40 },
  card: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 12,
    padding: 14,
  },
  cardDone: { opacity: 0.65, borderLeftWidth: 3, borderLeftColor: '#34C759' },
  prompt: { fontSize: 13, color: '#8E8E93' },
  strike: { textDecorationLine: 'line-through', color: '#FF3B30' },
  target: { fontSize: 17, fontWeight: '600', color: '#1C1C1E', marginTop: 4 },
  explanation: { fontSize: 13, color: '#636366', marginTop: 4 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  listening: { marginTop: 8, color: '#007AFF', fontWeight: '600' },
  checking: { color: '#8E8E93' },
  ok: { marginTop: 8, color: '#34C759', fontWeight: '600' },
  retry: { marginTop: 8, color: '#FF9500' },
});
