import { Injectable } from '@angular/core';

export interface Preferencias {
  ttsVelocidade: number;
  ttsVolume: number;
  ttsPitch: number;
  idioma: string;
  usarWhisperFallback: boolean;
  confiancaMinima: number;
}

const KEY_VOCABULARIO = 'av_vocabulario';
const KEY_SINONIMOS = 'av_sinonimos';
const KEY_PREFERENCIAS = 'av_preferencias';

const DEFAULT_PREFERENCIAS: Preferencias = {
  ttsVelocidade: 0.9,
  ttsVolume: 1.0,
  ttsPitch: 1.0,
  idioma: 'pt-BR',
  usarWhisperFallback: true,
  confiancaMinima: 0.7,
};

@Injectable({ providedIn: 'root' })
export class StorageService {

  // ── Helpers ───────────────────────────────────────────────────────────────

  private get<T>(key: string, defaultValue: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private set<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ── Vocabulário adaptativo ────────────────────────────────────────────────

  getVocabulario(): Record<string, number> {
    return this.get<Record<string, number>>(KEY_VOCABULARIO, {});
  }

  incrementarPalavra(palavra: string): void {
    const vocab = this.getVocabulario();
    const chave = palavra.toLowerCase().trim();
    vocab[chave] = (vocab[chave] ?? 0) + 1;
    this.set(KEY_VOCABULARIO, vocab);
  }

  getTopPalavras(n = 20): string[] {
    const vocab = this.getVocabulario();
    return Object.entries(vocab)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([palavra]) => palavra);
  }

  // ── Sinônimos ─────────────────────────────────────────────────────────────

  getSinonimos(): Record<string, string[]> {
    return this.get<Record<string, string[]>>(KEY_SINONIMOS, {});
  }

  addSinonimo(intencao: string, sinonimo: string): void {
    const sinonimos = this.getSinonimos();
    if (!sinonimos[intencao]) sinonimos[intencao] = [];
    const entrada = sinonimo.toLowerCase().trim();
    if (!sinonimos[intencao].includes(entrada)) {
      sinonimos[intencao].push(entrada);
      this.set(KEY_SINONIMOS, sinonimos);
    }
  }

  getSinonimosPorIntencao(intencao: string): string[] {
    return this.getSinonimos()[intencao] ?? [];
  }

  // ── Preferências ──────────────────────────────────────────────────────────

  getPreferencias(): Preferencias {
    const saved = this.get<Partial<Preferencias>>(KEY_PREFERENCIAS, {});
    return { ...DEFAULT_PREFERENCIAS, ...saved };
  }

  savePreferencias(p: Partial<Preferencias>): void {
    const current = this.getPreferencias();
    this.set(KEY_PREFERENCIAS, { ...current, ...p });
  }

  resetPreferencias(): void {
    this.set(KEY_PREFERENCIAS, DEFAULT_PREFERENCIAS);
  }
}
