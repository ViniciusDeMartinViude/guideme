import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config";

// Next.js dev reloads modules on every edit; keep one handle per process.
const g = globalThis as typeof globalThis & { __holidayDb?: DatabaseSync };
if (!g.__holidayDb) {
  mkdirSync(dirname(config.dbPath), { recursive: true });
  g.__holidayDb = new DatabaseSync(config.dbPath);
}
const db = g.__holidayDb;

db.exec(`
  create table if not exists chats (
    chat_id integer primary key,
    title text,
    preferences text not null default '',
    updated_at text not null default (datetime('now'))
  );
  create table if not exists messages (
    id integer primary key autoincrement,
    chat_id integer not null,
    role text not null check (role in ('user','assistant')),
    author text,
    content text not null,
    created_at text not null default (datetime('now'))
  );
  create index if not exists messages_chat on messages(chat_id, id);
  create table if not exists ideas (
    id integer primary key autoincrement,
    chat_id integer not null,
    title text not null,
    notes text not null default '',
    status text not null default 'open' check (status in ('open','shortlisted','rejected','booked')),
    created_at text not null default (datetime('now')),
    updated_at text not null default (datetime('now'))
  );
  create index if not exists ideas_chat on ideas(chat_id, status);
`);

export type Idea = {
  id: number;
  title: string;
  notes: string;
  status: "open" | "shortlisted" | "rejected" | "booked";
  created_at: string;
  updated_at: string;
};

export type Chat = {
  chat_id: number;
  title: string | null;
  preferences: string;
  updated_at: string;
  message_count: number;
  idea_count: number;
};

export type StoredMessage = { role: "user" | "assistant"; author: string | null; content: string };

export function ensureChat(chatId: number, title: string | undefined): void {
  db.prepare(
    `insert into chats (chat_id, title) values (?, ?)
     on conflict(chat_id) do update set title = coalesce(excluded.title, chats.title)`,
  ).run(chatId, title ?? null);
}

export function listChats(): Chat[] {
  return db
    .prepare(
      `select c.*,
              (select count(*) from messages m where m.chat_id = c.chat_id) as message_count,
              (select count(*) from ideas i where i.chat_id = c.chat_id and i.status <> 'rejected') as idea_count
         from chats c order by c.updated_at desc`,
    )
    .all() as Chat[];
}

export function getChat(chatId: number): Chat | undefined {
  return listChats().find((c) => c.chat_id === chatId);
}

export type MessageRow = StoredMessage & { id: number; created_at: string };

export function allMessages(chatId: number, limit = 200): MessageRow[] {
  return (
    db
      .prepare(
        `select id, role, author, content, created_at from messages where chat_id = ? order by id desc limit ?`,
      )
      .all(chatId, limit) as MessageRow[]
  ).reverse();
}

export function getPreferences(chatId: number): string {
  const row = db.prepare(`select preferences from chats where chat_id = ?`).get(chatId) as
    | { preferences: string }
    | undefined;
  return row?.preferences ?? "";
}

export function setPreferences(chatId: number, preferences: string): void {
  db.prepare(
    `update chats set preferences = ?, updated_at = datetime('now') where chat_id = ?`,
  ).run(preferences, chatId);
}

export function appendMessage(chatId: number, msg: StoredMessage): void {
  db.prepare(`insert into messages (chat_id, role, author, content) values (?, ?, ?, ?)`).run(
    chatId,
    msg.role,
    msg.author,
    msg.content,
  );
}

export function recentMessages(chatId: number, limit: number): StoredMessage[] {
  const rows = db
    .prepare(
      `select role, author, content from messages where chat_id = ? order by id desc limit ?`,
    )
    .all(chatId, limit) as StoredMessage[];
  return rows.reverse();
}

export function clearMessages(chatId: number): void {
  db.prepare(`delete from messages where chat_id = ?`).run(chatId);
}

export function listIdeas(chatId: number, includeRejected = false): Idea[] {
  const sql = includeRejected
    ? `select * from ideas where chat_id = ? order by id`
    : `select * from ideas where chat_id = ? and status <> 'rejected' order by id`;
  return db.prepare(sql).all(chatId) as Idea[];
}

export function saveIdea(chatId: number, title: string, notes: string): Idea {
  const result = db
    .prepare(`insert into ideas (chat_id, title, notes) values (?, ?, ?)`)
    .run(chatId, title, notes);
  return db.prepare(`select * from ideas where id = ?`).get(Number(result.lastInsertRowid)) as Idea;
}

export function updateIdea(
  chatId: number,
  id: number,
  patch: { notes?: string; status?: Idea["status"] },
): Idea | undefined {
  const current = db
    .prepare(`select * from ideas where id = ? and chat_id = ?`)
    .get(id, chatId) as Idea | undefined;
  if (!current) return undefined;
  db.prepare(
    `update ideas set notes = ?, status = ?, updated_at = datetime('now') where id = ?`,
  ).run(patch.notes ?? current.notes, patch.status ?? current.status, id);
  return db.prepare(`select * from ideas where id = ?`).get(id) as Idea;
}
