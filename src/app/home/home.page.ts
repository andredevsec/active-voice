import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  IonContent, IonHeader, IonToolbar, IonTitle, IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  mic, micOutline, syncOutline, helpCircleOutline,
  checkmarkCircleOutline, alertCircleOutline,
} from 'ionicons/icons';

import { DbService }        from '../services/data/db.service';
import { StorageService }   from '../services/data/storage.service';
import { ProcessorService } from '../services/assistant/processor.service';
import { IntentService, IntentResultado, INTENT_DESCONHECIDO } from '../services/assistant/intent.service';
import { StateService, Estado } from '../services/assistant/state.service';
import { TtsService }       from '../services/voice/tts.service';
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
    private call:      CallService,
    private reminder:  ReminderService,
  ) {
    addIcons({
      mic, micOutline, syncOutline, helpCircleOutline,
      checkmarkCircleOutline, alertCircleOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    this.sub = this.state.estado$.subscribe((e) => (this.estado = e));
    await this.db.initDB();
    await this.reminder.agendarTodosMedicamentos();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
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
      ouvindo:     'Ouvindo...',
      processando: 'Processando...',
      confirmando: 'Confirmar?',
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
    if (this.estado === 'confirmando') { this.negar(); return; }
    await this.iniciarEscuta();
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
      await this.tratarIntent(intent);
    } catch {
      this.state.erro();
      this.tts.falar('Não entendi. Por favor, tente novamente.');
    }
  }

  private async tratarIntent(intent: IntentResultado): Promise<void> {
    switch (intent.intencao) {

      case 'ligar.cuidador':
        await this.pedirConfirmacao(
          intent,
          'Deseja ligar para o cuidador?',
          async () => {
            await this.call.ligar('cuidador');
            this.tts.falar('Ligando para o cuidador.');
          },
        );
        break;

      case 'ligar.emergencia': {
        const servico = (intent.entidades['servico'] ?? 'samu') as 'samu' | 'bombeiros' | 'policia';
        const nomes = { samu: 'SAMU', bombeiros: 'Bombeiros', policia: 'Polícia' };
        await this.pedirConfirmacao(
          intent,
          `Ligar para o ${nomes[servico]}?`,
          async () => {
            this.call.ligarEmergencia(servico);
            this.tts.falar(`Ligando para o ${nomes[servico]}.`);
          },
        );
        break;
      }

      case 'medicamento.tomar':
      case 'medicamento.listar':
        await this.falarMedicamentos();
        break;

      case 'reminder.criar':
        await this.pedirConfirmacao(
          intent,
          'Devo agendar um lembrete de medicamento?',
          async () => {
            await this.reminder.agendarTodosMedicamentos();
            this.tts.falar('Lembretes de medicamentos agendados.');
          },
        );
        break;

      case 'reminder.listar':
        this.tts.falar('Seus lembretes estão configurados para os horários dos seus medicamentos.');
        this.state.voltar();
        break;

      case 'confirmar':
        await this.state.confirmar();
        break;

      case 'negar':
        this.negar();
        break;

      case 'ajuda':
        this.tts.falar(
          'Você pode dizer: ligar para o cuidador, me sinto mal, hora do remédio, ' +
          'me lembra às oito horas, ou aumentar volume.',
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
        this.tts.falar('Não entendi o comando. Pode repetir?');
        this.state.voltar();
    }
  }

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
}
