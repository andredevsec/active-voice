import { Injectable } from '@angular/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { StorageService } from '../data/storage.service';

export interface SttResultado {
  texto: string;
  confianca: number;
}

export class SttBaixaConfiancaError extends Error {
  constructor(public readonly resultado: SttResultado) {
    super(`Confiança baixa (${resultado.confianca.toFixed(2)}): "${resultado.texto}"`);
    this.name = 'SttBaixaConfiancaError';
  }
}

export class SttIndisponivelError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'SttIndisponivelError';
  }
}

export class SttTimeoutError extends Error {
  constructor() {
    super('Tempo esgotado aguardando resposta do microfone.');
    this.name = 'SttTimeoutError';
  }
}

@Injectable({ providedIn: 'root' })
export class SttService {
  constructor(private storage: StorageService) {}

  async verificarPermissao(): Promise<boolean> {
    const { speechRecognition } = await SpeechRecognition.checkPermissions();
    if (speechRecognition === 'granted') return true;

    const resultado = await SpeechRecognition.requestPermissions();
    return resultado.speechRecognition === 'granted';
  }

  /**
   * Escuta o usuário e retorna texto + confiança.
   * Lança SttBaixaConfiancaError se confiança < preferência mínima.
   * Lança SttIndisponivelError se STT não disponível ou sem permissão.
   */
  async ouvir(): Promise<SttResultado> {
    const { available } = await SpeechRecognition.available();
    if (!available) {
      throw new SttIndisponivelError('Reconhecimento de voz não disponível neste dispositivo.');
    }

    const temPermissao = await this.verificarPermissao();
    if (!temPermissao) {
      throw new SttIndisponivelError('Permissão de microfone negada.');
    }

    const prefs = this.storage.getPreferencias();

    const reconhecimento = SpeechRecognition.start({
      language: prefs.idioma,
      maxResults: 3,
      partialResults: false,
      popup: false,
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new SttTimeoutError()), 12_000),
    );

    const { matches } = await Promise.race([reconhecimento, timeout]);

    const resultado = this.avaliarMatches(matches, prefs.confiancaMinima);

    if (resultado.confianca < prefs.confiancaMinima) {
      throw new SttBaixaConfiancaError(resultado);
    }

    return resultado;
  }

  async parar(): Promise<void> {
    const { listening } = await SpeechRecognition.isListening();
    if (listening) await SpeechRecognition.stop();
  }

  /**
   * Estima confiança a partir dos matches retornados pelo plugin.
   * O plugin não expõe scores nativos — usamos heurísticas:
   *   - sem resultado              → 0.0
   *   - resultado muito curto      → 0.5
   *   - resultado único e claro    → 0.85
   *   - múltiplos matches distintos→ 0.65 (ambiguidade)
   */
  private avaliarMatches(
    matches: string[] | undefined,
    _limiar: number,
  ): SttResultado {
    if (!matches || matches.length === 0 || !matches[0].trim()) {
      return { texto: '', confianca: 0.0 };
    }

    const principal = matches[0].trim();

    if (principal.length < 3) {
      return { texto: principal, confianca: 0.5 };
    }

    // Múltiplos matches com textos bem diferentes → ambiguidade
    const temAmbiguidade =
      matches.length > 1 &&
      matches.some((m) => this.distanciaRelativa(principal, m) > 0.4);

    const confianca = temAmbiguidade ? 0.65 : 0.85;
    return { texto: principal, confianca };
  }

  // Distância relativa entre duas strings (0 = iguais, 1 = completamente diferentes)
  private distanciaRelativa(a: string, b: string): number {
    if (a === b) return 0;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 0;
    return this.levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }
}
