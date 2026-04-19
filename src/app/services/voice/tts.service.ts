import { Injectable } from '@angular/core';
import { StorageService } from '../data/storage.service';

@Injectable({ providedIn: 'root' })
export class TtsService {
  private synth = window.speechSynthesis;
  private vozPtBR: SpeechSynthesisVoice | null = null;

  constructor(private storage: StorageService) {
    this.carregarVoz();
    // iOS/Android carregam vozes de forma assíncrona
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = () => this.carregarVoz();
    }
  }

  private carregarVoz(): void {
    const vozes = this.synth.getVoices();
    this.vozPtBR =
      vozes.find((v) => v.lang === 'pt-BR') ??
      vozes.find((v) => v.lang.startsWith('pt')) ??
      null;
  }

  falar(texto: string): void {
    if (!texto.trim()) return;
    this.parar();

    const prefs = this.storage.getPreferencias();
    const utterance = new SpeechSynthesisUtterance(texto);

    utterance.lang = prefs.idioma;
    utterance.rate = prefs.ttsVelocidade;
    utterance.volume = prefs.ttsVolume;
    utterance.pitch = prefs.ttsPitch;

    if (this.vozPtBR) utterance.voice = this.vozPtBR;

    this.synth.speak(utterance);
  }

  parar(): void {
    if (this.synth.speaking) this.synth.cancel();
  }

  pausar(): void {
    if (this.synth.speaking) this.synth.pause();
  }

  retomar(): void {
    if (this.synth.paused) this.synth.resume();
  }

  get falando(): boolean {
    return this.synth.speaking;
  }
}
