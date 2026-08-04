import Database from 'better-sqlite3'
import type { HistoryRecord, HistorySummary, NewHistoryEntry } from './types'

/** 历史记录条数上限（超出后最旧的被淘汰） */
const MAX_ENTRIES = 500

/**
 * 分析历史的 SQLite 存储（better-sqlite3，主进程内同步访问）。
 * 构造函数不依赖 electron，dbPath 由 main.ts 在 app ready 后注入（userData/history.db），
 * 便于独立测试与打包路径统一。
 */
export class HistoryStore {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS analyses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        key_text TEXT,
        bpm REAL,
        chord_count INTEGER NOT NULL,
        section_count INTEGER NOT NULL,
        result_json TEXT NOT NULL
      )
    `)
  }

  /** 写入一条分析记录，返回新行 id；随后淘汰超出上限的最旧记录 */
  insert(entry: NewHistoryEntry): number {
    const info = this.db
      .prepare(
        `INSERT INTO analyses (file_name, file_path, created_at, key_text, bpm, chord_count, section_count, result_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.fileName,
        entry.filePath,
        Date.now(),
        entry.keyText,
        entry.bpm,
        entry.chordCount,
        entry.sectionCount,
        entry.resultJson,
      )
    this.db
      .prepare(
        `DELETE FROM analyses WHERE id NOT IN (SELECT id FROM analyses ORDER BY created_at DESC, id DESC LIMIT ?)`,
      )
      .run(MAX_ENTRIES)
    return Number(info.lastInsertRowid)
  }

  /** 列表（新→旧），不含结果 JSON */
  list(): HistorySummary[] {
    return this.db
      .prepare(
        `SELECT id, file_name, file_path, created_at, key_text, bpm, chord_count, section_count
         FROM analyses ORDER BY created_at DESC, id DESC`,
      )
      .all() as HistorySummary[]
  }

  /** 单条完整记录 */
  get(id: number): HistoryRecord | null {
    const row = this.db.prepare(`SELECT * FROM analyses WHERE id = ?`).get(id) as HistoryRecord | undefined
    return row ?? null
  }

  remove(id: number): void {
    this.db.prepare(`DELETE FROM analyses WHERE id = ?`).run(id)
  }

  /** 更新已有记录的结果 JSON（手动校正持久化用） */
  updateResultJson(id: number, resultJson: string): void {
    this.db.prepare(`UPDATE analyses SET result_json = ? WHERE id = ?`).run(resultJson, id)
  }

  /** 清空全部历史记录（设置页「清空分析历史」） */
  clear(): void {
    this.db.prepare(`DELETE FROM analyses`).run()
  }

  close(): void {
    this.db.close()
  }
}
