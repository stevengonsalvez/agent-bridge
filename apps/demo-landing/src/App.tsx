import illustrationUrl from './hero-illustration.svg';

export default function App() {
  return (
    <div className="landing-viewport">
      <header className="landing-nav">
        <div className="brand-logo">
          <span className="brand-dot"></span>
          <span className="brand-name">Agent Bridge</span>
        </div>
        <div className="nav-pill">
          <span className="nav-badge">v0.2.0</span>
          <span className="nav-status">Ready</span>
        </div>
      </header>

      <main className="landing-main">
        <section className="hero-card" data-testid="hero-card">
          <div className="illustration-wrapper">
            <img
              src={illustrationUrl}
              alt="Autonomous UI Engineering illustration"
              className="hero-illustration"
            />
          </div>

          <div className="hero-content">
            <h1 className="hero-headline">Autonomous UI Engineering</h1>
            <p className="hero-subtext">
              Direct your coding agent visually. Annotate, preview instant styles, and ship code in real time.
            </p>

            <div className="button-group">
              <button
                className="btn btn-primary"
                data-testid="btn-primary"
              >
                Deploy to Production
              </button>
              <button className="btn btn-secondary" data-testid="btn-secondary">
                Live Preview
              </button>
              <button className="btn btn-ghost" data-testid="btn-ghost">
                Documentation
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>Press <kbd>Escape</kbd> to toggle Design Mode dock</span>
      </footer>
    </div>
  );
}
