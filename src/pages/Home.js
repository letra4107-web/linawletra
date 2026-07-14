import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

export default function Home() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const MOBILE_BREAKPOINT = 760;

  const sections = useMemo(() => ([
    { id: 'features', label: 'Mga Tampok' },
    { id: 'roles', label: 'Para Kanino' },
    { id: 'contact', label: 'Tungkol sa Amin' },
  ]), []);

  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleNav = (id) => {
    setMobileOpen(false);
    scrollToId(id);
  };

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > MOBILE_BREAKPOINT) {
        setMobileOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="home">
      <header className="home-topbar">
        <div className="home-shell">
          <div className="home-topbar-inner">
            <button
              type="button"
              className="home-brand home-brand-btn"
              onClick={() => {
                setMobileOpen(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              aria-label="Go to top"
            >
              <img className="home-logo-img" src="/logo.png" alt="LinawLetra logo" />
              <span className="home-brand-title">
                <strong>LinawLetra</strong>
                <span>Tagalog literacy support</span>
              </span>
            </button>

            <nav className="home-nav" aria-label="Landing navigation">
              {sections.map((s) => (
                <button key={s.id} type="button" onClick={() => handleNav(s.id)}>
                  {s.label}
                </button>
              ))}
            </nav>

            <div className="home-actions">
              <button className="home-btn home-btn-ghost home-actions-login" onClick={() => navigate('/login')}>
                Login
              </button>
              <button className="home-btn home-btn-primary home-actions-primary" onClick={() => navigate('/register')}>
                Sign Up
              </button>
              <button
                className="home-mobile-toggle"
                type="button"
                aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileOpen ? 'true' : 'false'}
                onClick={() => setMobileOpen((v) => !v)}
              >
                {mobileOpen ? 'Close' : 'Menu'}
              </button>
            </div>
          </div>

          {mobileOpen && (
            <div className="home-mobile-panel" role="menu" aria-label="Mobile navigation">
              {sections.map((s) => (
                <button key={s.id} type="button" onClick={() => handleNav(s.id)}>
                  {s.label}
                </button>
              ))}
              <div className="home-mobile-cta">
                <button className="home-btn home-btn-ghost" onClick={() => { setMobileOpen(false); navigate('/login'); }}>
                  Login
                </button>
                <button className="home-btn home-btn-primary" onClick={() => { setMobileOpen(false); navigate('/register'); }}>
                  Sign Up
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* HERO */}
      <section className="home-hero">
        <div className="home-shell">
          <div className="home-hero-card home-fade-in">
            <div className="home-hero-grid">
              <div className="home-hero-copy">
                <span className="home-badge">AI-powered - Tagalog - Dyslexia-friendly</span>
                <h1 className="home-h1">
                  <span className="home-h1-line">Linaw</span>
                  <span className="home-h1-line home-h1-accent">Letra</span>
                </h1>
                <p className="home-tagline">Katuwang sa Pagbasa para sa Batang Pilipino</p>
                <p className="home-hero-description">
                  Tulong sa pagbabasa para sa mga batang may dyslexia sa Grades 1-6 gamit ang AI - syllable decoding, speech feedback, at marami pa.
                </p>
                <div className="home-hero-search-card">
                  <div className="home-search-text">Mga pantig:</div>
                  <div className="home-search-chips">
                    <span>ha</span>
                    <span>hi</span>
                    <span>ho</span>
                    <span>ga</span>
                    <span>be</span>
                    <span>sa</span>
                  </div>
                </div>
                <div className="home-hero-cta">
                  <button className="home-btn home-btn-primary" onClick={() => navigate('/register')}>
                    Magsimula
                  </button>
                  <button className="home-btn home-btn-ghost" onClick={() => navigate('/login')}>
                    Subukan ang Demo
                  </button>
                </div>
                <div className="home-hero-stats">
                  <div>
                    <strong>2,400+</strong>
                    <span>Mag-aaral</span>
                  </div>
                  <div>
                    <strong>180+</strong>
                    <span>Paaralan</span>
                  </div>
                  <div>
                    <strong>98%</strong>
                    <span>Masiyang magulang</span>
                  </div>
                </div>
              </div>
              <div className="home-hero-side">
                <div className="home-device-card">
                  <div className="home-device-chip">Antas 3</div>
                  <div className="home-device-title">AI Reading Coach</div>
                  <p>
                    Nagbibigay ng malinaw na gabay sa pagbigkas at tulong sa pagbuo ng tiwala habang nagbabasa.
                  </p>
                </div>
                <div className="home-progress-card">
                  <div className="home-progress-head">
                    <span>Progress Tracking</span>
                    <strong>72%</strong>
                  </div>
                  <div className="home-progress-bar">
                    <div className="home-progress-fill" />
                  </div>
                  <div className="home-progress-meta">
                    <span>Natapos</span>
                    <span>6 / 8 aralin</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section home-feature-section" id="features">
        <div className="home-shell">
          <div className="home-feature-head">
            <p className="home-section-tag">Mga Tampok ng LinawLetra</p>
            <h2>Dinisenyo para sa Bawat Bata</h2>
            <p className="home-lead">
              Bawat tampok ay may layuning gawing mas madali, mas masaya, at mas epektibo ang pagbabasa para sa mga batang may dyslexia.
            </p>
          </div>
          <div className="home-feature-grid">
            <div className="home-card home-fade-in">
              <h3>Syllable-Based Decoding</h3>
              <p>
                Hinahati ng AI ang mga salitang Tagalog sa mga pantig para mas madaling maunawaan at mabasa ng bata.
              </p>
            </div>
            <div className="home-card home-fade-in">
              <h3>AI Speech Feedback</h3>
              <p>
                Instant na feedback sa bigkas para mas mabilis matutunan kung paano masabi nang tama ang bawat salita.
              </p>
            </div>
            <div className="home-card home-fade-in">
              <h3>Multisensory Reading</h3>
              <p>
                Pagkakaroon ng tunog, kulay, at teksto upang suportahan ang natatanging paraan ng pagkatuto ng bata.
              </p>
            </div>
            <div className="home-card home-fade-in">
              <h3>Progress Tracking</h3>
              <p>
                Subaybayan ang pag-unlad nang malinaw sa pamamagitan ng progress score, milestones, at reading reports.
              </p>
            </div>
            <div className="home-card home-fade-in">
              <h3>Accessibility Tools</h3>
              <p>
                Mga adjustable na font, contrast, at reading comfort settings para sa mas maayos na karanasan.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section home-role-section" id="roles">
        <div className="home-shell">
          <p className="home-section-tag">Para Kanino ang LinawLetra?</p>
          <h2>Isang Platform para sa Lahat</h2>
          <p className="home-lead">
            Kung estudyante, guro, o magulang ka - mayroon kaming solusyon na akma para sa iyo.
          </p>
          <div className="home-grid-3">
            <div className="home-card home-fade-in">
              <h3>Estudyante</h3>
              <p>Para sa mga batang nag-aaral na may mas malinaw at mas suportadong practice.</p>
              <ul className="home-list">
                <li>Matutunan ang mga pantig nang masaya</li>
                <li>Makakuha ng instant na feedback</li>
                <li>Masanay sa sariling pagbabasa</li>
              </ul>
              <button type="button" className="home-card-btn" onClick={() => navigate('/register')}>Magsimula Ako</button>
            </div>
            <div className="home-card home-fade-in">
              <h3>Guro</h3>
              <p>Para sa mga guro na nais suportahan ang bawat mag-aaral na may malinaw na data at guidance.</p>
              <ul className="home-list">
                <li>Subaybayan ang klase nang madali</li>
                <li>Makakuha ng level ng reading bawat bata</li>
                <li>Magbigay ng mabilis na intervention</li>
              </ul>
              <button type="button" className="home-card-btn" onClick={() => navigate('/register')}>Para sa Guro</button>
            </div>
            <div className="home-card home-fade-in">
              <h3>Magulang</h3>
              <p>Para sa pamilyang gustong makita ang progreso at maging kasangga sa pag-aaral ng anak.</p>
              <ul className="home-list">
                <li>Makita ang progreso ng anak</li>
                <li>Makakuha ng malinaw na feedback</li>
                <li>Matutunan kung paano tumulong</li>
              </ul>
              <button type="button" className="home-card-btn" onClick={() => navigate('/register')}>Para sa Magulang</button>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section home-quote-section">
        <div className="home-shell">
          <div className="home-quote-panel home-fade-in">
            <blockquote>
              "Ang bawat bata ay nararapat sa pagkakataong matuto nang may dignidad at kasiyahan."
            </blockquote>
            <small>— Pangako ng LinawLetra</small>
          </div>
        </div>
      </section>

      <section className="home-section home-signup-section">
        <div className="home-shell">
          <div className="home-signup-grid">
            <div className="home-signup-copy home-fade-in">
              <p className="home-section-tag">Subukan ang Libreng Demo</p>
              <h2>Handa ka na ba? Subukan nang Libre</h2>
              <p className="home-lead">
                I-sign up ngayon at makakuha ng libreng 30-araw na access sa lahat ng features ng LinawLetra - walang credit card na kailangan.
              </p>
              <ul className="home-list home-signup-list">
                <li>Libre ng 30-araw na full access</li>
                <li>Walang credit card na kailangan</li>
                <li>Setup sa loob ng 5 minuto</li>
                <li>Suporta sa Filipino at English</li>
              </ul>
            </div>
            <div className="home-signup-card home-fade-in">
              <form className="home-form" onSubmit={(e) => { e.preventDefault(); navigate('/register'); }}>
                <div className="home-form-group">
                  <label htmlFor="name">Pangalan</label>
                  <input id="name" type="text" className="home-form-input" placeholder="Ilagay ang iyong pangalan" required />
                </div>
                <div className="home-form-group">
                  <label htmlFor="email">Email Address</label>
                  <input id="email" type="email" className="home-form-input" placeholder="email@halimbawa.com" required />
                </div>
                <button type="submit" className="home-form-submit">Subukan ang Demo nang Libre</button>
                <p className="home-form-note">
                  Sa pamamagitan ng pag-sign up, sumasang-ayon ka sa aming Privacy Policy at Terms of Use.
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="home-footer" id="contact">
        <div className="home-shell">
          <div className="home-footer-grid">
            <div className="home-footer-column">
              <button
                type="button"
                className="home-brand home-brand-btn home-footer-logo"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <img className="home-logo-img" src="/logo.png" alt="LinawLetra logo" />
                <span className="home-brand-title">
                  <strong>LinawLetra</strong>
                  <span>Tagalog literacy support</span>
                </span>
              </button>
              <p className="home-footer-copy">
                Pinagkakatiwalaang tool para sa pagbabasa ng mga batang Pilipino.
              </p>
              <div className="home-footer-contact">
                <a href="mailto:linawletra@gmail.com">linawletra@gmail.com</a>
                <span>Philippines</span>
              </div>
            </div>

            <div className="home-footer-column">
              <h3 className="home-footer-heading">Mga Link</h3>
              <nav className="home-footer-nav" aria-label="Footer navigation">
                <button type="button" onClick={() => handleNav('features')}>Mga Tampok</button>
                <button type="button" onClick={() => handleNav('roles')}>Para Kanino</button>
                <button type="button" onClick={() => handleNav('contact')}>Tungkol sa Amin</button>
              </nav>
            </div>

            <div className="home-footer-column">
              <h3 className="home-footer-heading">Suporta</h3>
              <div className="home-footer-links">
                <a href="/terms">Terms of Use</a>
                <a href="/privacy">Privacy Policy</a>
                <button type="button" className="home-footer-link-button" onClick={() => navigate('/register')}>
                  Magsimula
                </button>
              </div>
            </div>
          </div>

          <div className="home-footer-bottom">
            <small>(c) {new Date().getFullYear()} LinawLetra. All rights reserved.</small>
            <button className="home-footer-top" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              Back to top
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
