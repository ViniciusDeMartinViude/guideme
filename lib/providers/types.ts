/** One stored conversation turn, already rendered as text ("Name: message" for users). */
export type Turn = { role: "user" | "assistant"; text: string };
