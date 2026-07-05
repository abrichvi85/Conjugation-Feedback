import { useKeepAwake } from 'expo-keep-awake';
import { Link } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { BigRecordButton } from '@/components/BigRecordButton';
import { CorrectionCard } from '@/components/CorrectionCard';
import { CostBadge } from '@/components/CostBadge';
import { StatusPill } from '@/components/StatusPill';
import { useSessionStore } from '@/store/useSessionStore';
import { useSettingsStore } from '@/store/useSettingsStore';

export default function SessionScreen() {
  const { status, feed, aggregates, startedAt, transientError, fatalError, startSession, stopSession } =
    useSessionStore();
  const { hydrated, apiKey } = useSettingsStore();
  const active = status !== 'idle';

  if (!hydrated) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      {active && <KeepAwakeWhileActive />}
      <View style={styles.top}>
        <BigRecordButton
          active={active}
          disabled={!apiKey}
          onPress={active ? stopSession : startSession}
        />
        <View style={styles.statusRow}>
          <StatusPill status={status} />
          {active && startedAt != null && <ElapsedTimer startedAt={startedAt} />}
        </View>
        {!apiKey && (
          <Text style={styles.hint}>
            Add your Gemini API key in <Link href="/settings" style={styles.link}>Settings</Link> to
            start.
          </Text>
        )}
        {fatalError && <Text style={styles.error}>{fatalError}</Text>}
        {transientError && <Text style={styles.warning}>{transientError}</Text>}
      </View>

      <CostBadge
        utteranceCount={aggregates.utteranceCount}
        errorCount={aggregates.errorCount}
        estCostUsd={aggregates.estCostUsd}
      />

      <FlatList
        data={feed}
        keyExtractor={(item) => String(item.utteranceId)}
        renderItem={({ item }) => (
          <CorrectionCard
            transcript={item.transcript}
            hasError={item.hasError}
            errors={item.errors}
            correctedSentence={item.correctedSentence}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {active
              ? 'Speak Polish — corrections will appear here.'
              : 'Start a session, put in your AirPods, and have a conversation in Polish.'}
          </Text>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

function KeepAwakeWhileActive() {
  useKeepAwake();
  return null;
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return <Text style={styles.timer}>{mm}:{ss}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  top: { paddingTop: 24, gap: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  timer: { fontSize: 15, fontVariant: ['tabular-nums'], color: '#3C3C43' },
  hint: { textAlign: 'center', color: '#8E8E93', paddingHorizontal: 32 },
  link: { color: '#007AFF' },
  error: { textAlign: 'center', color: '#FF3B30', paddingHorizontal: 32 },
  warning: { textAlign: 'center', color: '#FF9500', paddingHorizontal: 32 },
  empty: { textAlign: 'center', color: '#8E8E93', marginTop: 32, paddingHorizontal: 40 },
  list: { paddingBottom: 24 },
});
