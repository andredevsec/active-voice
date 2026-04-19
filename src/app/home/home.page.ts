import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  IonContent, IonHeader, IonToolbar, IonTitle, IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  mic, micOutline, syncOutline, helpCircleOutline, checkmarkCircleOutline,
} from 'ionicons/icons';

import { DbService }        from '../services/data/db.service';
import { StorageService }   from '../services/data/storage.service';
import { ProcessorService } from '../services/assistant/processor.service';
import { IntentService, IntentResultado, INTENT_DESCONHECIDO } from '../services/assistant/intent.service';
import { StateService, Estado } from '../services/assistant/state.service';
import { TtsService }       from '../services/voice/tts.service';
import { SttService }       from '../services/voice/stt.service';
import { CallService }      from '../services/actions/call.service';
import { ReminderService }  from '../services/actions/reminder.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon],
})
export class HomePage implements OnInit, OnDestroy {
  estado: Estado = 'idle';
  textoEntendido = '';
  mensagemConfirmacao = '';

  private sub!: Subscription;

  constructor(
    private db:        DbService,
    private storage:   StorageService,
    private processor: ProcessorService,
    private intentSvc: IntentService,
    private state:     StateService,
    private tts:       TtsService,
    private stt:       SttService,
    private call:      CallService,
    private reminder:  ReminderService,
  ) {
    addIcons({ mic, micOutline, syncOutline, helpCircleOutline, checkmarkCircleOutline });
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    this.sub = this.state.estado$.subscribe((e) => (this.estado = e));
    await this.db.initDB();
    await this.reminder.agendarTodosMedicamentos();
    this.tts.falar('Active Voice pronto. Toque no microfone para falar.');
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.tts.parar();
  }

  // ── Template helpers ──────────────────────────────────────────────────────

  get micIcone(): string {
    const mapa: Record<Estado, string> = {
      idle:         'mic-outline',
      ouvindo:      'mic',
      processando:  'sync-outline',
      confirmando:  'help-circle-outline',
      executando:   'checkmark-circle-outline',
    };
    return mapa[this.estado];
  }

  get estadoLabel(): string {
    const mapa: Record<Estado, string> = {
      idle:        'Toque para falar',
      ouvindo:     'Ouvindo... (toque para cancelar)',
      processando: 'Processando...',
      confirmando: 'Confirmar? (ou fale sim / não)',
      executando:  'Executando...',
    };
    return mapa[this.estado];
  }

  get micDesabilitado(): boolean {
    return this.estado === 'processando' || this.estado === 'executando';
  }

  // ── Ações do template ─────────────────────────────────────────────────────

  async aoTocarMic(): Promise<void> {
    if (this.micDesabilitado) return;
    switch (this.estado) {
      case 'idle':
        await this.iniciarEscuta();
        break;
      case 'ouvindo':
        await this.cancelarEscuta();
        break;
      case 'confirmando':
        await this.escutarConfirmacaoVoz();
        break;
    }
  }

  async confirmar(): Promise<void> {
    await this.state.confirmar();
  }

  negar(): void {
    this.state.negar();
    this.tts.falar('Cancelado.');
  }

  // ── Fluxo principal ───────────────────────────────────────────────────────

  private async iniciarEscuta(): Promise<void> {
    this.state.iniciarEscuta();
    this.tts.parar();
    this.textoEntendido = '';

    try {
      const resultado = await this.processor.capturarEProcessar();
      this.state.iniciarProcessamento();
      this.textoEntendido = resultado.textoOriginal;

      const intent = this.intentSvc.detectar(resultado.textoNormalizado);
      await this.tratarIntent(intent, resultado.confianca);
    } catch (e) {
      this.state.erro();
      this.falarErro(e);
    }
  }

  private async cancelarEscuta(): Promise<void> {
    await this.stt.parar();
    this.state.voltar();
    this.tts.falar('Escuta cancelada.');
  }

  /**
   * Captura rápida de voz para confirmar/negar sem passar pelo fluxo completo.
   * Mantém o estado confirmando se não entender a resposta.
   */
  private async escutarConfirmacaoVoz(): Promise<void> {
    try {
      const resultado = await this.stt.ouvir();
      const normalizado = this.processor.normalizar(resultado.texto);
      const intent = this.intentSvc.detectar(normalizado);

      if (intent.intencao === 'confirmar') {
        await this.confirmar();
      } else if (intent.intencao === 'negar') {
        this.negar();
      }
      // Se não entender, mantém estado confirmando — usuário usa os botões
    } catch {
      // Falha silenciosa: aguarda interação pelos botões
    }
  }

  // ── Tratamento de intenções ───────────────────────────────────────────────

  private async tratarIntent(intent: IntentResultado, confianca: number): Promise<void> {
    if (confianca < 0.5) {
      this.tts.falar('Não consegui entender bem. Pode falar de novo?');
      this.state.voltar();
      return;
    }

    switch (intent.intencao) {

      case 'ligar.cuidador':
        this.pedirConfirmacao(intent, 'Deseja ligar para o cuidador?', async () => {
          try {
            await this.call.ligar('cuidador');
            this.tts.falar('Ligando para o cuidador.');
          } catch {
            this.tts.falar('Nenhum cuidador cadastrado. Ligando para o SAMU.');
            setTimeout(() => this.call.ligarEmergencia('samu'), 2500);
          }
        });
        break;

      case 'ligar.emergencia': {
        const servico = (intent.entidades['servico'] ?? 'samu') as 'samu' | 'bombeiros' | 'policia';
        const nomes: Record<string, string> = { samu: 'SAMU', bombeiros: 'Bombeiros', policia: 'Polícia' };
        const nome = nomes[servico] ?? 'SAMU';
        this.pedirConfirmacao(intent, `Ligar para o ${nome}?`, async () => {
          this.call.ligarEmergencia(servico);
          this.tts.falar(`Ligando para o ${nome}.`);
        });
        break;
      }

      case 'medicamento.tomar':
      case 'medicamento.listar':
        await this.falarMedicamentos();
        break;

      case 'reminder.criar':
        this.pedirConfirmacao(intent, 'Devo agendar lembretes para os seus medicamentos?', async () => {
          await this.reminder.agendarTodosMedicamentos();
          this.tts.falar('Lembretes de medicamentos agendados com sucesso.');
        });
        break;

      case 'reminder.listar': {
        const meds = await this.db.getMedicamentos(true);
        if (meds.length === 0) {
          this.tts.falar('Você não tem medicamentos cadastrados.');
        } else {
          const lista = meds.map((m) => `${m.nome} às ${m.horarios.join(' e ')}`).join('. ');
          this.tts.falar(`Seus lembretes de medicamentos: ${lista}.`);
        }
        this.state.voltar();
        break;
      }

      case 'confirmar':
        if (this.state.contextoConfirmacao) {
          await this.confirmar();
        } else {
          this.tts.falar('Não há nada pendente para confirmar.');
          this.state.voltar();
        }
        break;

      case 'negar':
        if (this.state.contextoConfirmacao) {
          this.negar();
        } else {
          this.state.voltar();
        }
        break;

      case 'ajuda':
        this.tts.falar(
          'Você pode dizer: ligar para o cuidador, estou passando mal, ' +
          'hora do remédio, quais meus remédios, ' +
          'ou fala mais alto para aumentar o volume.',
        );
        this.state.voltar();
        break;

      case 'volume.aumentar':
        this.ajustarVolume(0.15);
        break;

      case 'volume.diminuir':
        this.ajustarVolume(-0.15);
        break;

      case INTENT_DESCONHECIDO:
      default:
        this.tts.falar('Não reconheci esse comando. Diga ajuda para ouvir o que posso fazer.');
        this.state.voltar();
    }
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private pedirConfirmacao(
    intent: IntentResultado,
    mensagem: string,
    aoConfirmar: () => Promise<void>,
  ): void {
    this.mensagemConfirmacao = mensagem;
    this.state.solicitarConfirmacao({
      intent,
      mensagem,
      aoConfirmar,
      aoNegar: () => this.tts.falar('Cancelado.'),
    });
    this.tts.falar(mensagem);
  }

  private async falarMedicamentos(): Promise<void> {
    const medicamentos = await this.db.getMedicamentos(true);
    if (medicamentos.length === 0) {
      this.tts.falar('Nenhum medicamento cadastrado.');
    } else {
      const lista = medicamentos
        .map((m) => `${m.nome} às ${m.horarios.join(' e ')}`)
        .join('. ');
      this.tts.falar(`Seus medicamentos: ${lista}.`);
    }
    this.state.voltar();
  }

  private ajustarVolume(delta: number): void {
    const prefs = this.storage.getPreferencias();
    const novoVolume = Math.min(1, Math.max(0, prefs.ttsVolume + delta));
    this.storage.savePreferencias({ ttsVolume: novoVolume });
    this.tts.falar('Volume ajustado.');
    this.state.voltar();
  }

  private falarErro(e: unknown): void {
    if (!(e instanceof Error)) {
      this.tts.falar('Ocorreu um erro inesperado. Por favor, tente novamente.');
      return;
    }

    const mensagens: Record<string, string> = {
      SttTimeoutError:
        'O microfone não respondeu a tempo. Toque novamente para tentar.',
      SttIndisponivelError:
        'Permissão de microfone negada. Abra as configurações e permita o acesso ao microfone.',
      WhisperSemInternetError:
        'Sem conexão com a internet. Verifique o Wi-Fi e tente novamente.',
      WhisperTimeoutError:
        'O servidor demorou demais para responder. Tente novamente em instantes.',
      WhisperApiError:
        'Erro ao processar o áudio. Tente novamente ou fale mais devagar.',
      WhisperSemAudioError:
        'Nenhum áudio foi capturado. Fale mais alto e mais perto do microfone.',
    };

    const mensagem = mensagens[e.name];
    this.tts.falar(mensagem ?? 'Ocorreu um erro inesperado. Por favor, tente novamente.');
  }
}
