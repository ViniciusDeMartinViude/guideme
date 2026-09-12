import { notFound } from "next/navigation";
import { getSharedTrip } from "@/lib/db";

export const dynamic = "force-dynamic";

const statusLabel = { open: "Considering", shortlisted: "Shortlisted", booked: "Booked" };

export default async function TripPreview({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const trip = getSharedTrip(token);
  if (!trip) notFound();

  const ideas = trip.ideas.filter((idea) => idea.status !== "rejected");
  return (
    <main className="trip-preview">
      <header className="trip-header">
        <a className="wordmark" href="/"><span className="wordmark-mark">v</span> vama<span>bot</span></a>
        <span>Unlisted trip preview</span>
      </header>
      <section className="trip-hero">
        <p className="eyebrow"><span /> GROUP TRIP PLAN</p>
        <h1>{trip.chat.title ?? "The next adventure"}</h1>
        <p>This is the current plan taking shape in the group chat.</p>
      </section>
      <section className="trip-content">
        <article className="trip-profile">
          <p className="eyebrow"><span /> THE BRIEF</p>
          <pre>{trip.chat.preferences || "The group is still shaping the dates, budget, and travel wish list."}</pre>
        </article>
        <section className="trip-ideas">
          <div><p className="eyebrow"><span /> WHERE IT STANDS</p><h2>The shortlist</h2></div>
          {ideas.length ? <div className="trip-idea-grid">{ideas.map((idea) => (
            <article className="trip-idea" key={idea.id}>
              <span className={`trip-status ${idea.status}`}>{statusLabel[idea.status as keyof typeof statusLabel] ?? idea.status}</span>
              <h3>{idea.title}</h3>
              {idea.notes && <p>{idea.notes}</p>}
            </article>
          ))}</div> : <p className="trip-empty">No destinations have been saved yet. The group is still exploring.</p>}
        </section>
      </section>
      <footer className="trip-footer">Made with VamaBot · Updated {trip.updated_at} UTC</footer>
    </main>
  );
}
