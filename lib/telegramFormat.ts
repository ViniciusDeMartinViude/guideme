// Claude writes lightweight markdown; Telegram wants HTML. Convert the subset we allow.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function markdownToTelegramHtml(md: string): string {
  const lines = md.split("\n").map((line) => {
    let l = escapeHtml(line);
    l = l.replace(/^#{1,6}\s+(.*)$/, "<b>$1</b>"); // headings -> bold
    l = l.replace(/^(\s*)[-*]\s+/, "$1• "); // bullets
    l = l.replace(/`([^`]+)`/g, "<code>$1</code>");
    l = l.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    l = l.replace(/__(.+?)__/g, "<b>$1</b>");
    l = l.replace(/(^|[\s(])\*(?!\s)(.+?)(?<!\s)\*(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>");
    l = l.replace(/(^|[\s(])_(?!\s)(.+?)(?<!\s)_(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>");
    l = l.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
    return l;
  });
  return lines.join("\n");
}

const LIMIT = 4000;

/** Split on paragraph/line boundaries so each chunk fits Telegram's 4096-char cap. */
export function splitMessage(text: string): string[] {
  if (text.length <= LIMIT) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const para of text.split("\n")) {
    if ((current + "\n" + para).length > LIMIT) {
      if (current) chunks.push(current);
      current = para.length > LIMIT ? para.slice(0, LIMIT) : para;
    } else {
      current = current ? current + "\n" + para : para;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
