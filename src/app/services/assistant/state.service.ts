import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { IntentResultado } from './intent.service';

export type Estado = 'idle' | 'ouvindo' | 'processando' | 'confirmando' | 'executando';

export interface ContextoConfirmacao {
  intent: IntentResultado;
  mensagem: string;
  aoConfirmar: () => Promise<void>;
  aoNegar?: () => void;
}

// Transições válidas
const TRANSICOES: Record<Estado, Estado[]> = {
  idle:         ['ouvindo'],
  ouvindo:      ['processando', 'idle'],
  processando:  ['confirmando', 'executando', 'idle'],
  confirmando:  ['executando', 'idle'],
  executando:   ['idle'],
};

const TIMEOUT_CONFIRMACAO_MS = 15_000;

@Injectable({ providedIn: 'root' })
export class StateService implements OnDestroy {
  private _estado$ = new BehaviorSubject<Estado>('idle');
  private _contexto: ContextoConfirmacao | null = null;
  private _ultimoIntent: IntentResultado | null = null;
  private _timeoutConfirmacao: ReturnType<typeof setTimeout> | null = null;

  readonly estado$ = this._estado$.asObservable();

  get estado(): Estado {
    return this._estado$.value;
  }

  get ultimoIntent(): IntentResultado | null {
    return this._ultimoIntent;
  }

  get contextoConfirmacao(): ContextoConfirmacao | null {
    return this._contexto;
  }

  // ── Transições ────────────────────────────────────────────────────────────

  iniciarEscuta(): void {
    this.transitar('ouvindo');
  }

  iniciarProcessamento(): void {
    this.transitar('processando');
  }

  solicitarConfirmacao(contexto: ContextoConfirmacao): void {
    this._contexto = contexto;
    this._ultimoIntent = contexto.intent;
    this.transitar('confirmando');
    this.iniciarTimeoutConfirmacao();
  }

  iniciarExecucao(): void {
    this.cancelarTimeout();
    this._contexto = null;
    this.transitar('executando');
  }

  async confirmar(): Promise<void> {
    if (this.estado !== 'confirmando' || !this._contexto) return;
    const acao = this._contexto.aoConfirmar;
    this.iniciarExecucao();
    try {
      await acao();
    } finally {
      this.voltar();
    }
  }

  negar(): void {
    if (this.estado !== 'confirmando') return;
    this._contexto?.aoNegar?.();
    this.cancelarTimeout();
    this._contexto = null;
    this.transitar('idle');
  }

  voltar(): void {
    this.cancelarTimeout();
    this._contexto = null;
    this.transitar('idle');
  }

  erro(): void {
    this.cancelarTimeout();
    this._contexto = null;
    this._estado$.next('idle');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private transitar(destino: Estado): void {
    const permitidos = TRANSICOES[this.estado];
    if (!permitidos.includes(destino)) {
      console.warn(`StateService: transição inválida ${this.estado} → ${destino}`);
      return;
    }
    this._estado$.next(destino);
  }

  private iniciarTimeoutConfirmacao(): void {
    this.cancelarTimeout();
    this._timeoutConfirmacao = setTimeout(() => {
      if (this.estado === 'confirmando') this.negar();
    }, TIMEOUT_CONFIRMACAO_MS);
  }

  private cancelarTimeout(): void {
    if (this._timeoutConfirmacao !== null) {
      clearTimeout(this._timeoutConfirmacao);
      this._timeoutConfirmacao = null;
    }
  }

  ngOnDestroy(): void {
    this.cancelarTimeout();
    this._estado$.complete();
  }
}
