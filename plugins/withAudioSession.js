/**
 * Build-time guard for the live-listening audio session.
 *
 * react-native-live-audio-stream (current version) already configures
 * AVAudioSession the way this app requires:
 *   .playAndRecord + AVAudioSessionModeVoiceChat
 *   + AllowBluetooth (keeps the AirPods HFP mic live while expo-speech TTS
 *     plays into the AirPods)
 *   + DuckOthers (music/podcasts duck during a session)
 *
 * This plugin verifies that at prebuild time so a future library upgrade that
 * silently drops Bluetooth routing fails loudly instead of shipping a build
 * where the AirPods mic goes dead.
 *
 * UIBackgroundModes/NSMicrophoneUsageDescription live in app.json infoPlist.
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const TARGET = 'node_modules/react-native-live-audio-stream/ios/RNLiveAudioStream.m';
const REQUIRED = [
  'AVAudioSessionCategoryPlayAndRecord',
  'AVAudioSessionCategoryOptionAllowBluetooth',
];

module.exports = function withAudioSession(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const file = path.join(cfg.modRequest.projectRoot, TARGET);
      if (!fs.existsSync(file)) {
        throw new Error(`[withAudioSession] ${TARGET} not found — is react-native-live-audio-stream installed?`);
      }
      const src = fs.readFileSync(file, 'utf8');
      const missing = REQUIRED.filter((token) => !src.includes(token));
      if (missing.length > 0) {
        throw new Error(
          `[withAudioSession] ${TARGET} no longer sets: ${missing.join(', ')}. ` +
            'The AirPods mic would go dead while TTS plays. Patch the library ' +
            '(patch-package) or update this plugin before building.'
        );
      }
      return cfg;
    },
  ]);
};
