import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '@/db/database';
import { SessionRow, listSessions } from '@/db/repo';
import { LANGUAGE_PACKS } from '@/languages/registry';
import { LanguageCode } from '@/languages/types';
import { formatUsd } from '@/utils/cost';

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      setSessions(listSessions(getDatabase()));
    }, [])
  );

  return (
    <FlatList
      style={styles.container}
      data={sessions}
      keyExtractor={(s) => String(s.id)}
      renderItem={({ item }) => <SessionListItem session={item} />}
      ListEmptyComponent={<Text style={styles.empty}>No sessions yet.</Text>}
    />
  );
}

function SessionListItem({ session }: { session: SessionRow }) {
  const date = new Date(session.started_at);
  const durationMin =
    session.ended_at != null
      ? Math.max(1, Math.round((session.ended_at - session.started_at) / 60000))
      : null;
  return (
    <Link href={{ pathname: '/history/[sessionId]', params: { sessionId: String(session.id) } }}>
      <View style={styles.row}>
        <View style={styles.rowMain}>
          <Text style={styles.title}>
            {LANGUAGE_PACKS[session.language as LanguageCode]?.flag ?? ''}{' '}
            {date.toLocaleDateString()}{' '}
            {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={styles.subtitle}>
            {durationMin != null ? `${durationMin} min · ` : ''}
            {session.utterance_count} utterances · {formatUsd(session.est_cost_usd)}
          </Text>
        </View>
        <Text style={[styles.count, session.error_count > 0 ? styles.countBad : styles.countOk]}>
          {session.error_count}
        </Text>
      </View>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    padding: 14,
    width: '100%',
    maxWidth: 500,
  },
  rowMain: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  subtitle: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  count: { fontSize: 18, fontWeight: '700', marginLeft: 12 },
  countBad: { color: '#FF9500' },
  countOk: { color: '#34C759' },
  empty: { textAlign: 'center', color: '#8E8E93', marginTop: 48 },
});
