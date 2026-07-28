import "./home.css";

// Real product numbers, not marketing filler: the published ruleset's own counts
// (rules/nyc-rules.v2.8.json — 33 rules, 8 distinct agencies across DOB/DOHMH/FDNY/SLA/DEP/
// Parks/NYPD/SAPO). Nothing here is invented.
const RULE_COUNT = 33;
const AGENCY_COUNT = 8;

export default function Home() {
  return (
    <main className="home">
      <div className="home__grid">
        <div className="home__hero-photo">
          <img src="/photos/williamsburg-bridge-dusk.jpg" alt="" aria-hidden="true" />
          <div className="home__hero-overlay">
            <p className="home__eyebrow">New York City event compliance</p>
            <h1 className="home__headline">
              Agency routing, permit generation, deadline intelligence — read straight from the
              published ruleset.
            </h1>
            <p className="home__coords">40.7128&deg; N / 74.0060&deg; W &middot; NYC, NY 10007</p>
          </div>
        </div>

        <div className="home__stat home__stat--rules">
          <span className="home__stat-number">{RULE_COUNT}</span>
          <span className="home__stat-label">Rules</span>
        </div>

        <div className="home__grid-photo">
          <img src="/photos/times-square-street.jpg" alt="" aria-hidden="true" />
        </div>

        <div className="home__grid-photo">
          <img src="/photos/event-crowd.jpg" alt="" aria-hidden="true" />
        </div>

        <div className="home__stat home__stat--agencies">
          <img src="/photos/manhattan-skyline-haze.jpg" alt="" aria-hidden="true" />
          <div className="home__stat-overlay">
            <span className="home__stat-number">{AGENCY_COUNT}</span>
            <span className="home__stat-label">Agencies</span>
          </div>
        </div>
      </div>

      <div className="home__cta">
        <a href="/intake" className="home__begin">
          Begin intake
          <span aria-hidden="true">&darr;</span>
        </a>
      </div>

      <p className="home__lede">
        Scaffold online. Synthetic data only; access-gated demo (AD-12).
        {" "}
        <a href="/intake">Describe your event</a>
      </p>
    </main>
  );
}
