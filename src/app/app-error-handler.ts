import { ErrorHandler, Injectable } from '@angular/core';
import { TtsService } from './services/voice/tts.service';

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  constructor(private tts: TtsService) {}

  handleError(error: unknown): void {
    console.error('[AppErrorHandler]', error);

    // Erros de chunk lazy-load (rede) — orienta o usuário a reabrir o app
    if (error instanceof Error && error.message.includes('Loading chunk')) {
      this.tts.falar('Falha ao carregar o aplicativo. Verifique sua conexão e reabra o app.');
      return;
    }

    // Erros de expressão Angular no template — não expõe detalhes técnicos
    if (error instanceof Error && error.message.includes('ExpressionChanged')) {
      return;
    }

    // Qualquer erro não tratado nos serviços de voz
    const nomeErro = error instanceof Error ? error.name : '';
    const mensagensConhecidas = [
      'SttTimeoutError', 'SttIndisponivelError', 'SttBaixaConfiancaError',
      'WhisperApiError', 'WhisperSemInternetError', 'WhisperTimeoutError', 'WhisperSemAudioError',
    ];

    if (mensagensConhecidas.includes(nomeErro)) return; // já tratado na camada de voz

    this.tts.falar('O aplicativo encontrou um problema. Por favor, feche e abra novamente.');
  }
}
