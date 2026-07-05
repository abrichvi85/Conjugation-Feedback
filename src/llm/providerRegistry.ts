import { GeminiProvider } from './GeminiProvider';
import { CredentialsSource, LlmProvider } from './types';

export type ProviderId = 'gemini';
// Future entries: 'openai-oauth' (Sign in with ChatGPT, when GA),
// 'proxy' (our backend, required before public App Store release).

type ProviderFactory = (credentials: CredentialsSource, model: string) => LlmProvider;

const FACTORIES: Record<ProviderId, ProviderFactory> = {
  gemini: (credentials, model) => new GeminiProvider(credentials, model),
};

export function createProvider(
  providerId: ProviderId,
  credentials: CredentialsSource,
  model: string
): LlmProvider {
  const factory = FACTORIES[providerId];
  if (!factory) throw new Error(`Unknown LLM provider: ${providerId}`);
  return factory(credentials, model);
}
