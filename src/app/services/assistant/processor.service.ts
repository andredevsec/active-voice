import { Injectable } from '@angular/core';
import { StorageService } from '../data/storage.service';
import { SttService, SttBaixaConfiancaError, SttIndisponivelError } from '../voice/stt.service';
import { WhisperService } from '../voice/whisper.service';
import { DbService } from '../data/db.service';

export interface TextoProcessado {
  textoOriginal: string;
  textoNormalizado: string;
  confianca: number;
  fonte: 'stt' | 'whisper';
}

@Injectable({ providedIn: 'root' })
export class ProcessorService {
  constructor(
    private stt: SttService,
    private whisper: WhisperService,
    private storage: StorageService,
    private db: DbService,
  ) {}

  /**
   * Escuta o usuário, aplica fallback para Whisper se necessário,
   * normaliza o texto e registra no histórico.
   */
  async capturarEProcessar(): Promise<TextoProcessado> {
    let textoOriginal: string;
    let confianca: number;
    let fonte: 'stt' | 'whisper';

    try {
      const resultado = await this.stt.ouvir();
      textoOriginal = resultado.texto;
      confianca = resultado.confianca;
      fonte = 'stt';
    } catch (e) {
      if (e instanceof SttBaixaConfiancaError || e instanceof SttIndisponivelError) {
        const resultado = await this.whisper.transcrever();
        textoOriginal = resultado.texto;
        confianca = resultado.confianca;
        fonte = 'whisper';
      } else {
        throw e;
      }
    }

    const textoNormalizado = this.normalizar(textoOriginal);

    this.rastrearVocabulario(textoNormalizado);

    await this.db.saveHistoricoVoz({
      texto_original: textoOriginal,
      intencao_detectada: undefined,
      confianca,
      acao_executada: undefined,
    });

    return { textoOriginal, textoNormalizado, confianca, fonte };
  }

  /**
   * Normaliza texto: lowercase → remove pontuação → espaços duplos →
   * resolve sinônimos do usuário para termos canônicos.
   */
  normalizar(texto: string): string {
    let normalizado = texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')  // remove acentos
      .replace(/[^\w\s]/g, ' ')         // remove pontuação
      .replace(/\s+/g, ' ')             // colapsa espaços
      .trim();

    normalizado = this.resolverSinonimos(normalizado);

    return normalizado;
  }

  /**
   * Substitui frases sinônimas pelos termos canônicos da intenção.
   * Ex.: "chamar alguem" → "ligar cuidador" (se mapeado pelo usuário)
   */
  private resolverSinonimos(texto: string): string {
    const sinonimos = this.storage.getSinonimos();
    let resultado = texto;

    for (const [intencao, frases] of Object.entries(sinonimos)) {
      const termoCanonico = intencao.replace('.', ' ');
      for (const frase of frases) {
        const fraseNorm = frase
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (resultado.includes(fraseNorm)) {
          resultado = resultado.replace(fraseNorm, termoCanonico);
        }
      }
    }

    return resultado;
  }

  private rastrearVocabulario(textoNormalizado: string): void {
    const palavras = textoNormalizado.split(' ').filter((p) => p.length > 2);
    for (const palavra of palavras) {
      this.storage.incrementarPalavra(palavra);
    }
  }
}
