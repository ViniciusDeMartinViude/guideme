import { listChats } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Home() {
  const chats = listChats();
  return (
    <>
      <h1>Chats</h1>
      {chats.length === 0 && (
        <p className="muted">
          No chats yet. Add the bot to a Telegram group and mention it, or send it <code>/help</code>.
        </p>
      )}
      {chats.map((c) => (
        <a key={c.chat_id} href={`/chats/${c.chat_id}`} className="card" style={{ display: "block" }}>
          <h3>{c.title ?? `Chat ${c.chat_id}`}</h3>
          <div className="row muted">
            <span>{c.message_count} messages</span>
            <span>{c.idea_count} ideas</span>
            <span>updated {c.updated_at} UTC</span>
          </div>
        </a>
      ))}
    </>
  );
}
