export type InstallAdvice = 'installed' | 'prompt' | 'iosShare' | 'none';

export function installAdvice(env: { ua: string; standalone: boolean; canPrompt: boolean }): InstallAdvice {
  if (env.standalone) return 'installed';
  if (env.canPrompt) return 'prompt';
  if (/iPhone|iPad|iPod/.test(env.ua)) return 'iosShare';
  return 'none';
}
