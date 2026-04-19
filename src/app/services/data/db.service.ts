import { Injectable } from '@angular/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';

export interface Paciente {
  id: number;
  nome: string;
  data_nascimento?: string;
  telefone_proprio?: string;
  criado_em: string;
}

export interface Cuidador {
  id: number;
  nome: string;
  telefone: string;
  relacao?: string;
  principal: number;
  criado_em: string;
}

export interface Medicamento {
  id: number;
  nome: string;
  dosagem?: string;
  horarios: string[];
  ativo: number;
  criado_em: string;
}

export interface HistoricoVoz {
  id: number;
  texto_original: string;
  intencao_detectada?: string;
  confianca?: number;
  acao_executada?: string;
  criado_em: string;
}

const DB_NAME = 'active_voice.db';
const DB_VERSION = 1;

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS paciente (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    nome             TEXT    NOT NULL,
    data_nascimento  TEXT,
    telefone_proprio TEXT,
    criado_em        TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cuidador (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome      TEXT    NOT NULL,
    telefone  TEXT    NOT NULL,
    relacao   TEXT,
    principal INTEGER DEFAULT 0,
    criado_em TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS medicamentos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome      TEXT    NOT NULL,
    dosagem   TEXT,
    horarios  TEXT    NOT NULL,
    ativo     INTEGER DEFAULT 1,
    criado_em TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS historico_voz (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    texto_original     TEXT NOT NULL,
    intencao_detectada TEXT,
    confianca          REAL,
    acao_executada     TEXT,
    criado_em          TEXT DEFAULT (datetime('now'))
  );
`;

@Injectable({ providedIn: 'root' })
export class DbService {
  private sqlite = new SQLiteConnection(CapacitorSQLite);
  private db: SQLiteDBConnection | null = null;

  async initDB(): Promise<void> {
    this.db = await this.sqlite.createConnection(
      DB_NAME,
      false,
      'no-encryption',
      DB_VERSION,
      false,
    );
    await this.db.open();
    await this.db.execute(CREATE_TABLES);
  }

  private assertDB(): SQLiteDBConnection {
    if (!this.db) throw new Error('DbService: banco não inicializado. Chame initDB() primeiro.');
    return this.db;
  }

  // ── Paciente ─────────────────────────────────────────────────────────────

  async getPaciente(): Promise<Paciente | null> {
    const db = this.assertDB();
    const result = await db.query('SELECT * FROM paciente LIMIT 1;');
    return (result.values?.[0] as Paciente) ?? null;
  }

  async savePaciente(p: Omit<Paciente, 'id' | 'criado_em'>): Promise<void> {
    const db = this.assertDB();
    const existing = await this.getPaciente();
    if (existing) {
      await db.run(
        'UPDATE paciente SET nome = ?, data_nascimento = ?, telefone_proprio = ? WHERE id = ?;',
        [p.nome, p.data_nascimento ?? null, p.telefone_proprio ?? null, existing.id],
      );
    } else {
      await db.run(
        'INSERT INTO paciente (nome, data_nascimento, telefone_proprio) VALUES (?, ?, ?);',
        [p.nome, p.data_nascimento ?? null, p.telefone_proprio ?? null],
      );
    }
  }

  // ── Cuidador ─────────────────────────────────────────────────────────────

  async getCuidadores(): Promise<Cuidador[]> {
    const db = this.assertDB();
    const result = await db.query('SELECT * FROM cuidador ORDER BY principal DESC, nome ASC;');
    return (result.values ?? []) as Cuidador[];
  }

  async getCuidadorPrincipal(): Promise<Cuidador | null> {
    const db = this.assertDB();
    const result = await db.query('SELECT * FROM cuidador WHERE principal = 1 LIMIT 1;');
    return (result.values?.[0] as Cuidador) ?? null;
  }

  async saveCuidador(c: Omit<Cuidador, 'id' | 'criado_em'>): Promise<void> {
    const db = this.assertDB();
    if (c.principal === 1) {
      await db.run('UPDATE cuidador SET principal = 0;');
    }
    await db.run(
      'INSERT INTO cuidador (nome, telefone, relacao, principal) VALUES (?, ?, ?, ?);',
      [c.nome, c.telefone, c.relacao ?? null, c.principal],
    );
  }

  async deleteCuidador(id: number): Promise<void> {
    const db = this.assertDB();
    await db.run('DELETE FROM cuidador WHERE id = ?;', [id]);
  }

  // ── Medicamentos ─────────────────────────────────────────────────────────

  async getMedicamentos(apenasAtivos = false): Promise<Medicamento[]> {
    const db = this.assertDB();
    const sql = apenasAtivos
      ? 'SELECT * FROM medicamentos WHERE ativo = 1 ORDER BY nome ASC;'
      : 'SELECT * FROM medicamentos ORDER BY nome ASC;';
    const result = await db.query(sql);
    return ((result.values ?? []) as Omit<Medicamento, 'horarios'> & { horarios: string }[]).map(
      (row) => ({ ...row, horarios: JSON.parse(row.horarios) as string[] }),
    );
  }

  async saveMedicamento(m: Omit<Medicamento, 'id' | 'criado_em'>): Promise<void> {
    const db = this.assertDB();
    await db.run(
      'INSERT INTO medicamentos (nome, dosagem, horarios, ativo) VALUES (?, ?, ?, ?);',
      [m.nome, m.dosagem ?? null, JSON.stringify(m.horarios), m.ativo],
    );
  }

  async toggleMedicamento(id: number, ativo: boolean): Promise<void> {
    const db = this.assertDB();
    await db.run('UPDATE medicamentos SET ativo = ? WHERE id = ?;', [ativo ? 1 : 0, id]);
  }

  async deleteMedicamento(id: number): Promise<void> {
    const db = this.assertDB();
    await db.run('DELETE FROM medicamentos WHERE id = ?;', [id]);
  }

  // ── Histórico de voz ─────────────────────────────────────────────────────

  async saveHistoricoVoz(h: Omit<HistoricoVoz, 'id' | 'criado_em'>): Promise<void> {
    const db = this.assertDB();
    await db.run(
      'INSERT INTO historico_voz (texto_original, intencao_detectada, confianca, acao_executada) VALUES (?, ?, ?, ?);',
      [h.texto_original, h.intencao_detectada ?? null, h.confianca ?? null, h.acao_executada ?? null],
    );
  }

  async getHistoricoVoz(limite = 50): Promise<HistoricoVoz[]> {
    const db = this.assertDB();
    const result = await db.query(
      'SELECT * FROM historico_voz ORDER BY criado_em DESC LIMIT ?;',
      [limite],
    );
    return (result.values ?? []) as HistoricoVoz[];
  }
}
