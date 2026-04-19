import { Injectable } from '@angular/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { StorageService } from '../data/storage.service';

@Injectable({ providedIn: 'root' })
export class TtsService {
  private falando_ = false;

  constructor(private storage: StorageService) {}

  async falar(texto: string): Promise<void> {
    if (!texto.trim()) return;
    await this.parar();

    const prefs = this.storage.getPreferencias();
    this.falando_ = true;

    try {
      await TextToSpeech.speak({
        text:     texto,
        lang:     prefs.idioma,
        rate:     prefs.ttsVelocidade,
        pitch:    prefs.ttsPitch,
        volume:   prefs.ttsVolume,
        category: 'ambient',
      });
    } finally {
      this.falando_ = false;
    }
  }

  async parar(): Promise<void> {
    try {
      await TextToSpeech.stop();
    } catch {
      // ignora se não havia fala ativa
    }
    this.falando_ = false;
  }

  get falando(): boolean {
    return this.falando_;
  }

  // Mantém compatibilidade com chamadas síncronas (fire-and-forget)
  falarSync(texto: string): void {
    this.falar(texto).catch(() => {});
  }
}
