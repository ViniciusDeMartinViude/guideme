import Link from "next/link";

const steps = [
  ["01", "Ask in the chat", "Mention VamaBot with the trip idea your group is already discussing."],
  ["02", "Get the useful bits", "It checks weather, current travel information, and the details that change the decision."],
  ["03", "Choose together", "Keep the shortlist, trade-offs, and next questions in the same group thread."],
];

const features = [
  ["✦", "Plans with context", "VamaBot remembers your group’s budget, home airport, dates, and non-negotiables."],
  ["⌁", "Weather that means something", "Forecasts for trips soon; typical climate from recent data for everything further out."],
  ["↗", "Research, not rabbit holes", "Useful travel research brought back to the chat, with sources and the why behind a recommendation."],
];

export default function Home() {
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Main navigation">
        <Link className="wordmark" href="/">
          <span className="wordmark-mark">v</span> vama<span>bot</span>
        </Link>
        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#why-vama">Why Vama</a>
          <a className="nav-cta" href="https://t.me/vamatripbot" target="_blank" rel="noreferrer">
            Open Telegram <span aria-hidden="true">↗</span>
          </a>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> YOUR GROUP’S TRAVEL BRAIN</p>
          <h1>Less planning.<br /><em>More going.</em></h1>
          <p className="hero-text">
            VamaBot lives in your Telegram group and turns the usual “where should we go?” spiral
            into a trip everyone can get behind.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="https://t.me/vamatripbot" target="_blank" rel="noreferrer">
              Plan a trip in Telegram <span aria-hidden="true">→</span>
            </a>
            <a className="text-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
          </div>
          <p className="quiet-note">Built for the chat where every trip actually starts.</p>
        </div>

        <div className="conversation-card" aria-label="Example VamaBot conversation">
          <div className="chat-card-top"><span className="online-dot" /> Weekend escape <span className="chat-members">4 members</span></div>
          <div className="chat-body">
            <div className="bubble bubble-user">Where can 4 of us go for a long weekend in October? Warm, not too expensive.</div>
            <div className="chat-person">MAYA · 10:42</div>
            <div className="bubble bubble-bot"><span className="bot-icon">v</span><p><strong>I’d look at Malta, Seville, and Crete.</strong><br />Malta is the easiest warm bet; Seville is best for food and city energy. Want me to compare flights from your airport?</p></div>
            <div className="chat-person bot-label">VAMABOT · 10:42</div>
            <div className="bubble bubble-user short">Yes please — under €500 each?</div>
            <div className="typing"><i /><i /><i /></div>
          </div>
          <div className="chat-card-bottom"><span>✦</span> VamaBot is checking flights & weather</div>
        </div>
        <div className="sun sun-one" /><div className="sun sun-two" />
      </section>

      <section id="how-it-works" className="how-section">
        <div className="section-intro"><p className="eyebrow"><span /> FROM “MAYBE” TO MADE PLANS</p><h2>Travel planning, where<br />the conversation is.</h2></div>
        <div className="steps">{steps.map(([number, title, text]) => <article className="step" key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>

      <section id="why-vama" className="why-section">
        <div><p className="eyebrow light"><span /> A LITTLE HELP, RIGHT ON TIME</p><h2>The friend who<br /><em>actually</em> researches.</h2></div>
        <div className="feature-list">{features.map(([icon, title, text]) => <article key={title}><span className="feature-icon">{icon}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
      </section>

      <section className="closing"><p className="eyebrow"><span /> YOUR NEXT TRIP STARTS HERE</p><h2>Drop it in the group.</h2><p>VamaBot will take it from there.</p><a className="button primary" href="https://t.me/vamatripbot" target="_blank" rel="noreferrer">Meet VamaBot on Telegram <span aria-hidden="true">→</span></a></section>
      <footer><Link className="wordmark" href="/"><span className="wordmark-mark">v</span> vama<span>bot</span></Link><p>Made for people who would rather be travelling.</p><Link href="/dashboard">Dashboard</Link></footer>
    </main>
  );
}
