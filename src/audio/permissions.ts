import { AudioStudioModule } from '@siteed/audio-studio';

/**
 * Requests microphone (both platforms) and, on Android 13+, the notification
 * permission the foreground-service notification needs. Returns true only if
 * recording can proceed. iOS is unaffected by the notification request.
 */
export async function ensureCapturePermissions(): Promise<boolean> {
  try {
    const result = await AudioStudioModule.requestPermissionsAsync();
    // Expo permission responses expose `granted`; older shapes use `status`.
    return result?.granted === true || result?.status === 'granted';
  } catch {
    return false;
  }
}
