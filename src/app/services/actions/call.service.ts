import { Injectable } from '@angular/core';
import { DbService } from '../data/db.service';

export const NUMERO_SAMU = '192';
export const NUMERO_BOMBEIROS = '193';
export const NUMERO_POLICIA = '190';

export type TipoLigacao = 'cuidador' | 'samu' | 'bombeiros' | 'policia';

@Injectable({ providedIn: 'root' })
export class CallService {
  constructor(private db: DbService) {}

  async ligarCuidador(): Promise<void> {
    const cuidador = await this.db.getCuidadorPrincipal();
    if (!cuidador) throw new Error('Nenhum cuidador principal cadastrado.');
    this.abrir(cuidador.telefone);
  }

  ligarEmergencia(tipo: TipoLigacao = 'samu'): void {
    const numeros: Record<TipoLigacao, string> = {
      cuidador: '',
      samu:      NUMERO_SAMU,
      bombeiros: NUMERO_BOMBEIROS,
      policia:   NUMERO_POLICIA,
    };
    const numero = numeros[tipo];
    if (!numero) return;
    this.abrir(numero);
  }

  async ligar(tipo: TipoLigacao): Promise<void> {
    if (tipo === 'cuidador') {
      await this.ligarCuidador();
    } else {
      this.ligarEmergencia(tipo);
    }
  }

  private abrir(numero: string): void {
    const limpo = numero.replace(/\D/g, '');
    window.location.href = `tel:${limpo}`;
  }
}
