import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { StorageService } from '../data/storage.service';
import { SttResultado } from './stt.service';

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-large-v3-turbo';
const DURACAO_PADRAO_MS = 6000;

// MIME types em ordem de preferência por plataforma
const MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

export class WhisperSemAudioError extends Error {
  constructor() {
    super('Nenhum áudio capturado para transcrição.');
    this.name = 'WhisperSemAudioError';
  }
}

export class WhisperApiError extends Error {
  constructor(public readonly status: number, mensagem: string) {
    super(`Groq API erro ${status}: ${mensagem}`);
    this.name = 'WhisperApiError';
  }
}

@Injectable({ providedIn: 'root' })
export class WhisperService {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  constructor(private storage: StorageService) {}

  /**
   * Grava áudio por `duracaoMs` milissegundos e transcreve via Groq Whisper.
   * Injeta as top palavras do vocabulário do usuário no campo `prompt`.
   */
  async transcrever(duracaoMs = DURACAO_PADRAO_MS): Promise<SttResultado> {
    await this.iniciarGravacao();
    await this.aguardar(duracaoMs);
    return this.pararETranscrever();
  }

  async iniciarGravacao(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    this.chunks = [];

    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(100); // coleta chunks a cada 100ms
  }

  async pararETranscrever(): Promise<SttResultado> {
    const blob = await this.pararGravacao();

    if (blob.size === 0) throw new WhisperSemAudioError();

    const texto = await this.enviarParaGroq(blob);
    return { texto: texto.trim(), confianca: 1.0 };
  }

  pararGravacaoSemTranscrever(): void {
    if (this.recorder?.state !== 'inactive') this.recorder?.stop();
    this.liberarStream();
  }

  get gravando(): boolean {
    return this.recorder?.state === 'recording';
  }

  // ── Privados ─────────────────────────────────────────────────────────────

  private pararGravacao(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === 'inactive') {
        resolve(new Blob(this.chunks));
        return;
      }
      this.recorder.onstop = () => {
        const mimeType = this.recorder?.mimeType ?? 'audio/webm';
        resolve(new Blob(this.chunks, { type: mimeType }));
        this.liberarStream();
      };
      this.recorder.stop();
    });
  }

  private async enviarParaGroq(blob: Blob): Promise<string> {
    const prefs = this.storage.getPreferencias();
    const topPalavras = this.storage.getTopPalavras(30);
    const promptVocab = topPalavras.join(', ');

    const ext = this.extensaoDe(blob.type);
    const form = new FormData();
    form.append('file', blob, `audio.${ext}`);
    form.append('model', WHISPER_MODEL);
    form.append('language', prefs.idioma.split('-')[0]); // 'pt-BR' → 'pt'
    form.append('response_format', 'json');
    if (promptVocab) form.append('prompt', promptVocab);

    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${environment.groqApiKey}` },
      body: form,
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new WhisperApiError(resp.status, err);
    }

    const data = (await resp.json()) as { text: string };
    return data.text ?? '';
  }

  private liberarStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private aguardar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private extensaoDe(mimeType: string): string {
    if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
    if (mimeType.includes('ogg')) return 'ogg';
    return 'webm';
  }
}
