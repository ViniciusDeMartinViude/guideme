import { notFound } from "next/navigation";
import { allMessages, getChat, listIdeas } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const chatId = Number(id);
  const chat = Number.isFinite(chatId) ? getChat(chatId) : undefined;
  if (!chat) notFound();

  const ideas = listIdeas(chatId, true);
  const messages = allMessages(chatId);

  return (
    <main className="container dashboard-page">
      <h1>{chat.title ?? `Chat ${chat.chat_id}`}</h1>
      <p className="muted">chat id {chat.chat_id}</p>

      <h2>Group profile</h2>
      <div className="card">
        <pre>{chat.preferences || "— nothing recorded yet (set with /prefs in Telegram)"}</pre>
      </div>

      <h2>Ideas</h2>
      {ideas.length === 0 && <p className="muted">No ideas saved yet.</p>}
      {ideas.map((i) => (
        <div key={i.id} className="card">
          <div className="row">
            <h3>
              #{i.id} {i.title}
            </h3>
            <span className={`badge ${i.status}`}>{i.status}</span>
          </div>
          {i.notes && <pre>{i.notes}</pre>}
          <div className="muted" style={{ fontSize: 12 }}>
            updated {i.updated_at} UTC
          </div>
        </div>
      ))}

      <h2>Conversation (last {messages.length})</h2>
      {messages.map((m) => (
        <div key={m.id} className={`msg ${m.role}`}>
          <div className="who">
            {m.role === "user" ? (m.author ?? "user") : "bot"} · {m.created_at} UTC
          </div>
          <pre>{m.content}</pre>
        </div>
      ))}
    </main>
  );
}
