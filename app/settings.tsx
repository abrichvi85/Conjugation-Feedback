import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ALL_LANGUAGES } from '@/languages/registry';
import { LanguageCode } from '@/languages/types';
import { createProvider } from '@/llm/providerRegistry';
import { useSessionStore } from '@/store/useSessionStore';
import { TtsRatePreset, settingsCredentials, useSettingsStore } from '@/store/useSettingsStore';
import { MODEL_PRICING } from '@/utils/cost';

export default function SettingsScreen() {
  const settings = useSettingsStore();
  const sessionActive = useSessionStore((s) => s.status !== 'idle');
  const [keyDraft, setKeyDraft] = useState('');
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');

  const saveKey = async () => {
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    await settings.setApiKey(trimmed);
    setKeyDraft('');
    setTestState('idle');
  };

  const testKey = async () => {
    setTestState('testing');
    try {
      await createProvider('gemini', settingsCredentials, settings.model).testConnection();
      setTestState('ok');
    } catch {
      setTestState('fail');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="Gemini API key">
        <Text style={styles.keyStatus}>
          {settings.apiKey ? `Saved: ••••${settings.apiKey.slice(-4)}` : 'No key saved'}
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Paste your Gemini API key"
          value={keyDraft}
          onChangeText={setKeyDraft}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <View style={styles.buttonRow}>
          <Button label="Save" onPress={saveKey} disabled={!keyDraft.trim()} />
          <Button
            label={testState === 'testing' ? 'Testing…' : 'Test key'}
            onPress={testKey}
            disabled={!settings.apiKey || testState === 'testing'}
          />
          {testState === 'testing' && <ActivityIndicator />}
          {testState === 'ok' && <Text style={styles.ok}>✓ Key works</Text>}
          {testState === 'fail' && <Text style={styles.fail}>✗ Key failed</Text>}
        </View>
        <Text style={styles.hint}>
          Get a key at aistudio.google.com. It is stored only on this device (secure enclave).
        </Text>
      </Section>

      <Section title="Feedback">
        <Row label="Speak corrections aloud">
          <Switch value={settings.verbalFeedback} onValueChange={settings.setVerbalFeedback} />
        </Row>
        <Text style={styles.hint}>
          When on, corrections are spoken into your AirPods immediately. Mistakes are always saved
          to History either way.
        </Text>
        <Row label="Voice speed">
          <SegmentedControl<TtsRatePreset>
            options={[
              { value: 'slow', label: 'Slower' },
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: 'Faster' },
            ]}
            value={settings.ttsRate}
            onChange={settings.setTtsRate}
          />
        </Row>
      </Section>

      <Section title="Model">
        <SegmentedControl
          options={Object.keys(MODEL_PRICING).map((m) => ({
            value: m,
            label: m.replace('gemini-', '').replace('-flash-lite', ' Flash-Lite'),
          }))}
          value={settings.model}
          onChange={settings.setModel}
        />
        <Text style={styles.hint}>3.1 is smarter; 2.5 is ~60% cheaper.</Text>
      </Section>

      <Section title="Language">
        <View style={sessionActive ? styles.disabled : null}>
          <SegmentedControl<LanguageCode>
            options={ALL_LANGUAGES.map((pack) => ({
              value: pack.code,
              label: `${pack.flag} ${pack.displayName}`,
            }))}
            value={settings.language}
            onChange={(code) => {
              if (!sessionActive) settings.setLanguage(code);
            }}
          />
        </View>
        <Text style={styles.hint}>
          {sessionActive
            ? 'End the current session to switch languages.'
            : 'Corrections and spoken feedback follow the selected language.'}
        </Text>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, disabled && styles.buttonDisabled, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segments}>
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          onPress={() => onChange(opt.value)}
          style={[styles.segment, value === opt.value && styles.segmentActive]}
        >
          <Text style={[styles.segmentLabel, value === opt.value && styles.segmentLabelActive]}>
            {opt.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  content: { paddingVertical: 16, paddingBottom: 48 },
  section: { marginBottom: 24, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 13, color: '#8E8E93', marginBottom: 8, marginLeft: 4 },
  sectionBody: { backgroundColor: 'white', borderRadius: 12, padding: 14, gap: 10 },
  keyStatus: { fontSize: 14, color: '#3C3C43' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C7C7CC',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { color: 'white', fontWeight: '600' },
  ok: { color: '#34C759', fontWeight: '600' },
  fail: { color: '#FF3B30', fontWeight: '600' },
  hint: { fontSize: 12, color: '#8E8E93' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: 15, color: '#1C1C1E', flexShrink: 1, marginRight: 12 },
  disabled: { opacity: 0.5 },
  segments: {
    flexDirection: 'row',
    backgroundColor: '#E5E5EA',
    borderRadius: 8,
    padding: 2,
  },
  segment: { flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: 'center' },
  segmentActive: { backgroundColor: 'white' },
  segmentLabel: { fontSize: 13, color: '#3C3C43' },
  segmentLabelActive: { fontWeight: '600', color: '#1C1C1E' },
});
