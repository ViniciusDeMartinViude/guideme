// Web search through Exa (https://exa.ai/docs/reference/search).
// Recommended request: query + highlights, nothing else.

type ExaResult = {
  title: string | null;
  url: string;
  publishedDate?: string | null;
  highlights?: string[];
};

export async function webSearch(query: string, apiKey: string): Promise<string> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ query, type: "auto", numResults: 6, contents: { highlights: true } }),
  });
  if (!res.ok) throw new Error(`Exa ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { results?: ExaResult[] };
  const results = data.results ?? [];
  if (!results.length) return "No results.";
  return results
    .map((r, i) => {
      const date = r.publishedDate ? ` (${r.publishedDate.slice(0, 10)})` : "";
      const body = (r.highlights ?? []).map((h) => h.replace(/\s+/g, " ").trim()).join(" … ");
      return `${i + 1}. ${r.title ?? "(untitled)"}${date}\n   ${r.url}\n   ${body}`;
    })
    .join("\n\n");
}
