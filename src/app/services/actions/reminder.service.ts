import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { DbService, Medicamento } from '../data/db.service';

// IDs de notificação: base 1000 por medicamento, +índice de horário
// Ex.: medicamento id=3, horário[1] → notificationId = 3000 + 1 = 3001
const BASE_ID = 1000;

@Injectable({ providedIn: 'root' })
export class ReminderService {
  constructor(private db: DbService) {}

  async verificarPermissao(): Promise<boolean> {
    const { display } = await LocalNotifications.requestPermissions();
    return display === 'granted';
  }

  /**
   * Agenda notificações diárias para todos os medicamentos ativos.
   * Cancela notificações antigas antes de reagendar.
   */
  async agendarTodosMedicamentos(): Promise<void> {
    const temPermissao = await this.verificarPermissao();
    if (!temPermissao) return;

    const medicamentos = await this.db.getMedicamentos(true);
    await this.cancelarTodos(medicamentos);

    const notificacoes = medicamentos.flatMap((med) =>
      this.montarNotificacoes(med),
    );

    if (notificacoes.length > 0) {
      await LocalNotifications.schedule({ notifications: notificacoes });
    }
  }

  /**
   * Agenda notificações apenas para um medicamento específico.
   */
  async agendarMedicamento(medicamento: Medicamento): Promise<void> {
    const temPermissao = await this.verificarPermissao();
    if (!temPermissao) return;

    await this.cancelarPorMedicamento(medicamento.id);

    const notificacoes = this.montarNotificacoes(medicamento);
    if (notificacoes.length > 0) {
      await LocalNotifications.schedule({ notifications: notificacoes });
    }
  }

  /**
   * Cancela todos os lembretes de um medicamento pelo id.
   */
  async cancelarPorMedicamento(medicamentoId: number): Promise<void> {
    const ids = Array.from({ length: 24 }, (_, i) => ({
      id: BASE_ID * medicamentoId + i,
    }));
    await LocalNotifications.cancel({ notifications: ids });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private montarNotificacoes(med: Medicamento) {
    return med.horarios.map((horario, idx) => {
      const [hora, minuto] = this.parseHorario(horario);
      return {
        id: BASE_ID * med.id + idx,
        title: `Hora do remédio: ${med.nome}`,
        body: med.dosagem
          ? `Tomar ${med.dosagem} às ${horario}`
          : `Tomar às ${horario}`,
        schedule: {
          on: { hour: hora, minute: minuto },
          repeats: true,
        },
        sound: undefined,
        actionTypeId: '',
        extra: { medicamentoId: med.id, horario },
      };
    });
  }

  private async cancelarTodos(medicamentos: Medicamento[]): Promise<void> {
    const ids = medicamentos.flatMap((med) =>
      med.horarios.map((_, idx) => ({ id: BASE_ID * med.id + idx })),
    );
    if (ids.length > 0) {
      await LocalNotifications.cancel({ notifications: ids });
    }
  }

  private parseHorario(horario: string): [number, number] {
    const partes = horario.replace('h', ':').split(':');
    return [
      parseInt(partes[0] ?? '0', 10),
      parseInt(partes[1] ?? '0', 10),
    ];
  }
}
