import "./home.css";

export default function Home() {
  return (
    <main className="home">
      <nav className="home__nav">
        <div className="home__nav-links">
          <a href="/intake">Intake</a>
        </div>
        <div className="home__brand">POPENGINE</div>
        <div className="home__nav-links">
          <a href="/intake">Get started</a>
        </div>
      </nav>

      <div className="home__hero">
        <img
          className="home__photo"
          src="/photos/brooklyn-bridge-skyline.jpg"
          alt="Manhattan skyline seen through the Brooklyn Bridge cables at sunset"
        />
        <div className="home__caption">
          <p className="home__caption-text">
            NYC event intake and permitting — translate complex, multi-agency rules into an
            effortless, high-clarity plan.
          </p>
          <p className="home__coords">40.7061&deg; N / 73.9969&deg; W &middot; FIVE BOROUGHS</p>
        </div>
      </div>

      <div className="home__lede">
        <p>Scaffold online. Synthetic data only; access-gated demo (AD-12).</p>
        <p>
          <a href="/intake">Describe your event</a>
        </p>
      </div>
    </main>
  );
}
