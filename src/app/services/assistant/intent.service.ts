import { Injectable } from '@angular/core';
import { StorageService } from '../data/storage.service';

export interface IntentResultado {
  intencao: string;
  confianca: number;
  entidades: Record<string, string>;
  textoOriginal: string;
}

interface IntentConfig {
  padroes: RegExp[];
  sinonimos: string[];
  extrairEntidades?: (texto: string) => Record<string, string>;
}

export const INTENT_DESCONHECIDO = 'desconhecido';

// ── Mapa de intenções ───────────────────────────────────────────────────────

const INTENCOES: Record<string, IntentConfig> = {

  'ligar.cuidador': {
    padroes: [
      /\b(ligar?|chamar?|falar|contatar)\b.{0,20}\b(cuidador[a]?|cuidadora|acompanhante)\b/,
      /\b(cuidador[a]?)\b.{0,20}\b(ligar?|chamar?|chama)\b/,
      /\bpreciso.{0,15}(cuidador[a]?|alguem|alguém)\b/,
      /\bme.{0,10}ajuda\b/,
    ],
    sinonimos: ['ligar cuidador', 'chamar cuidador', 'preciso de ajuda', 'me ajuda'],
  },

  'ligar.emergencia': {
    padroes: [
      /\b(socorro|emergencia|urgente|urgencia)\b/,
      /\b(ligar?|chamar?|chama).{0,20}\b(samu|bombeiro|policia|ambulancia)\b/,
      /\bpreciso.{0,15}(medico|doutor|hospital|ambulancia)\b/,
      /\bme.{0,10}(sinto|senti).{0,15}(mal|ruim)\b/,
      /\bto(u)?.{0,10}(passando mal|me sentindo mal)\b/,
    ],
    sinonimos: ['socorro', 'emergencia', 'me sinto mal', 'preciso medico'],
    extrairEntidades: (texto) => {
      const match = /\b(samu|bombeiro|policia|ambulancia)\b/.exec(texto);
      const r: Record<string, string> = {};
      if (match) r['servico'] = match[1];
      return r;
    },
  },

  'medicamento.tomar': {
    padroes: [
      /\b(tomar?|tomei|hora).{0,20}\b(remedio|remedios|medicamento|comprimido|capsula)\b/,
      /\b(remedio|medicamento).{0,20}\b(tomar?|hora)\b/,
      /\bque.{0,10}(remedio|medicamento).{0,15}(tomar?|devo)\b/,
    ],
    sinonimos: ['tomar remedio', 'hora remedio', 'que remedio tomar'],
    extrairEntidades: (texto) => {
      const hora = /\b(\d{1,2})[h:h ](\d{0,2})\b/.exec(texto);
      const nome = /\b(remedio|medicamento)\s+(\w+)/.exec(texto);
      const entidades: Record<string, string> = {};
      if (hora) entidades['hora'] = hora[0];
      if (nome?.[2]) entidades['nome'] = nome[2];
      return entidades;
    },
  },

  'medicamento.listar': {
    padroes: [
      /\b(quais|lista|mostrar?|ver).{0,20}\b(remedios|medicamentos)\b/,
      /\b(meus|meus).{0,10}(remedios|medicamentos)\b/,
      /\bque.{0,10}(remedios|medicamentos).{0,15}(tenho|preciso|devo)\b/,
    ],
    sinonimos: ['meus remedios', 'listar remedios', 'quais remedios tenho'],
  },

  'reminder.criar': {
    padroes: [
      /\b(lembra|lembre|avisa|avise|cria).{0,20}\b(lembrete|alarme|aviso)\b/,
      /\bme.{0,10}(lembra|avisa).{0,30}\b(as|as|hora)\b/,
      /\b(agendar?|marcar?).{0,20}\b(lembrete|medicamento|consulta)\b/,
    ],
    sinonimos: ['me lembra', 'cria lembrete', 'me avisa', 'agendar lembrete'],
    extrairEntidades: (texto) => {
      const hora = /\b(\d{1,2})[h:\s](\d{0,2})\b/.exec(texto);
      const entidades: Record<string, string> = {};
      if (hora) entidades['hora'] = hora[0].trim();
      return entidades;
    },
  },

  'reminder.listar': {
    padroes: [
      /\b(quais|lista|mostrar?|ver).{0,20}\b(lembretes|alarmes|avisos)\b/,
      /\b(meus|tenho).{0,15}(lembretes|alarmes)\b/,
      /\bo.{0,5}que.{0,10}(tenho|tem).{0,15}(hoje|amanha)\b/,
    ],
    sinonimos: ['meus lembretes', 'listar lembretes', 'o que tenho hoje'],
  },

  'confirmar': {
    padroes: [
      /^\s*(sim|s|pode|ok|okay|isso|confirma|certo|claro|com certeza|correto|vai|pode ser)\s*$/,
    ],
    sinonimos: ['sim', 'pode', 'confirma', 'isso mesmo', 'tudo certo'],
  },

  'negar': {
    padroes: [
      /^\s*(nao|não|cancela|cancelar|para|esquece|deixa|errado|incorreto|negativo)\s*$/,
    ],
    sinonimos: ['nao', 'cancela', 'para', 'esquece isso'],
  },

  'ajuda': {
    padroes: [
      /\b(ajuda|help|o.{0,5}que.{0,10}(faz|pode)|como.{0,10}(funciona|usar))\b/,
      /\b(comandos|opcoes|opções|possibilidades)\b/,
    ],
    sinonimos: ['ajuda', 'o que voce faz', 'como funciona'],
  },

  'volume.aumentar': {
    padroes: [
      /\b(aumentar?|mais.{0,10}alto|elevar?).{0,15}\b(volume|som|voz)\b/,
      /\b(fala|falar?).{0,10}(mais.{0,5}alto|mais.{0,5}forte)\b/,
    ],
    sinonimos: ['aumentar volume', 'mais alto', 'fala mais alto'],
  },

  'volume.diminuir': {
    padroes: [
      /\b(diminuir?|mais.{0,10}baixo|reduzir?).{0,15}\b(volume|som|voz)\b/,
      /\b(fala|falar?).{0,10}(mais.{0,5}baixo|mais.{0,5}devagar)\b/,
    ],
    sinonimos: ['diminuir volume', 'mais baixo', 'fala mais baixo'],
  },

};

// ── Serviço ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class IntentService {
  constructor(private storage: StorageService) {}

  detectar(textoNormalizado: string): IntentResultado {
    const texto = textoNormalizado.trim();

    // 1. Tenta padrões regex nativos
    for (const [intencao, config] of Object.entries(INTENCOES)) {
      for (const padrao of config.padroes) {
        if (padrao.test(texto)) {
          return this.montar(intencao, config, texto, 0.9);
        }
      }
    }

    // 2. Tenta sinônimos embutidos (match exato de substring)
    for (const [intencao, config] of Object.entries(INTENCOES)) {
      for (const sinonimo of config.sinonimos) {
        if (texto.includes(sinonimo)) {
          return this.montar(intencao, config, texto, 0.75);
        }
      }
    }

    // 3. Tenta sinônimos personalizados do usuário (localStorage)
    const sinonimosUsuario = this.storage.getSinonimos();
    for (const [intencao, frases] of Object.entries(sinonimosUsuario)) {
      for (const frase of frases) {
        if (texto.includes(frase)) {
          const config = INTENCOES[intencao];
          return this.montar(
            intencao,
            config ?? { padroes: [], sinonimos: [] },
            texto,
            0.7,
          );
        }
      }
    }

    return {
      intencao: INTENT_DESCONHECIDO,
      confianca: 0,
      entidades: {},
      textoOriginal: texto,
    };
  }

  private montar(
    intencao: string,
    config: IntentConfig,
    texto: string,
    confianca: number,
  ): IntentResultado {
    const entidades = config.extrairEntidades?.(texto) ?? {};
    return { intencao, confianca, entidades, textoOriginal: texto };
  }
}
