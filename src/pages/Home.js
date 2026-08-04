import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiEye,
  FiSliders,
  FiHeart,
  FiBookOpen,
  FiMic,
  FiZap,
  FiTrendingUp,
  FiUsers,
  FiCheckCircle,
  FiStar,
  FiMail,
} from 'react-icons/fi';
import { FaFacebookF, FaInstagram } from 'react-icons/fa';
import './Home.css';

const SYLLABLES = ['Ba', 'Be', 'Bi', 'Bo', 'Bu', 'Ka', 'Ga', 'Ha', 'Sa', 'La', 'Ma', 'Na'];

export default function Home() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('features');
  const suppressScrollSpyRef = useRef(false);
  const resumeTimerRef = useRef(null);
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
    setActiveSection(id);
    suppressScrollSpyRef.current = true;
    scrollToId(id);
    window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      suppressScrollSpyRef.current = false;
    }, 700);
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

  useEffect(() => {
    const ids = sections.map((s) => s.id);
    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressScrollSpyRef.current) return;
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length > 0) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: '-40% 0px -50% 0px' }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

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
                <button
                  key={s.id}
                  type="button"
                  className={activeSection === s.id ? 'is-active' : ''}
                  onClick={() => handleNav(s.id)}
                >
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
        <div className="home-syllable-watermark" aria-hidden="true">
          {[...SYLLABLES, ...SYLLABLES].map((syllable, index) => (
            <span key={`${syllable}-${index}`}>{syllable}</span>
          ))}
        </div>
        <div className="home-shell">
          <div className="home-hero-card home-fade-in">
            <div className="home-hero-grid">
              <div className="home-hero-copy">
                <div className="home-badge-split">
                  <span className="home-badge-part home-badge-part--indigo">AI-Powered</span>
                  <span className="home-badge-part home-badge-part--warm">Dyslexia-Friendly</span>
                </div>
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
                <div className="home-phone-mockup">
                  <div className="home-phone-frame">
                    <div className="home-phone-notch" />
                    <div className="home-phone-screen">
                      <p className="home-phone-app-title">Student Dashboard</p>
                      <div className="home-phone-avatar" aria-hidden="true">🙂</div>
                      <p className="home-phone-greeting">
                        Hi, Marco!
                        <span>Grade 3</span>
                      </p>
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
                  <div className="home-floating-chip home-floating-chip--streak">
                    <FiStar aria-hidden="true" /> +2 Streak
                  </div>
                  <div className="home-floating-chip home-floating-chip--confidence">
                    <FiCheckCircle aria-hidden="true" /> Confidence: Improving
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section home-what-section" id="features">
        <div className="home-shell">
          <div className="home-what-grid">
            <div className="home-what-copy home-fade-in">
              <p className="home-section-tag">Ano ang LinawLetra?</p>
              <p className="home-lead">
                Ginawa ang LinawLetra para sa mga estudyante sa Grades 1-6 na nangangailangan ng suportang tool para sa pagbasa ng Tagalog kasabay ng dyslexia. Pinagsasama nito ang research-backed na pamamaraan at AI upang gawing malinaw, kalmado, at nakakapagpalakas-loob ang pagsasanay sa pagbasa.
              </p>
              <ul className="home-checklist">
                <li><FiCheckCircle aria-hidden="true" /> Suporta sa pagkilala ng salita at pantig sa Tagalog</li>
                <li><FiCheckCircle aria-hidden="true" /> Gabay sa pagbigkas gamit ang AI speech feedback</li>
                <li><FiCheckCircle aria-hidden="true" /> Dyslexia-friendly na interface at font</li>
                <li><FiCheckCircle aria-hidden="true" /> Progress tracking para sa mag-aaral, magulang, at guro</li>
              </ul>
            </div>
            <div className="home-what-support">
              <h2>Sumusuporta sa Paglalakbay sa Pagbasa ng Bawat Bata</h2>
              <div className="home-support-cards">
                <div className="home-support-card home-fade-in">
                  <span className="home-support-icon home-support-icon--indigo"><FiEye aria-hidden="true" /></span>
                  <h3>Accessible</h3>
                  <p>Dinisenyo gamit ang dyslexia-friendly na font, adjustable na text size, at malinaw na visuals.</p>
                </div>
                <div className="home-support-card home-fade-in">
                  <span className="home-support-icon home-support-icon--warm"><FiSliders aria-hidden="true" /></span>
                  <h3>Personalized</h3>
                  <p>Umaangkop ang AI sa bilis at pangangailangan ng bawat mag-aaral, base sa kanilang progress.</p>
                </div>
                <div className="home-support-card home-fade-in">
                  <span className="home-support-icon home-support-icon--mint"><FiHeart aria-hidden="true" /></span>
                  <h3>Supportive</h3>
                  <p>Nakakapagpalakas-loob na feedback at magiliw na gabay upang makabuo ng tiwala nang unti-unti.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section home-feature-section">
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

      <section className="home-section home-steps-section">
        <div className="home-shell">
          <div className="home-feature-head">
            <p className="home-section-tag">Paano Gumagana</p>
            <h2>Paano Gumagana ang LinawLetra</h2>
            <p className="home-lead">
              Tatlong simpleng hakbang mula sa pag-aaral hanggang sa pagbuo ng tiwala sa pagbasa.
            </p>
          </div>
          <div className="home-steps-row">
            <div className="home-step-card home-fade-in">
              <span className="home-step-number">01</span>
              <span className="home-step-icon"><FiBookOpen aria-hidden="true" /></span>
              <h3>Matuto</h3>
              <p>Galugarin ang structured na Tagalog reading lessons na nakatuon sa mga pantig at salita.</p>
            </div>
            <span className="home-step-arrow" aria-hidden="true">&rarr;</span>
            <div className="home-step-card home-fade-in">
              <span className="home-step-number">02</span>
              <span className="home-step-icon"><FiMic aria-hidden="true" /></span>
              <h3>Magsanay</h3>
              <p>Magsanay ng mga salita, pantig, at pangungusap sa sarili mong bilis.</p>
            </div>
            <span className="home-step-arrow" aria-hidden="true">&rarr;</span>
            <div className="home-step-card home-fade-in">
              <span className="home-step-number">03</span>
              <span className="home-step-icon"><FiZap aria-hidden="true" /></span>
              <h3>Kumuha ng AI Feedback</h3>
              <p>Tumanggap ng real-time na AI-assisted na pagbigkas feedback at kapaki-pakinabang na tips.</p>
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

      <section className="home-section home-audience-section">
        <div className="home-shell">
          <div className="home-feature-head">
            <p className="home-section-tag">Lumago Kasama ang LinawLetra</p>
            <h2>Maliit na Hakbang, Mas Malinaw na Pagbasa</h2>
          </div>
          <div className="home-audience-grid">
            <div className="home-mini-dashboard home-fade-in">
              <p className="home-mini-dashboard-title">Parent Dashboard</p>
              <p className="home-mini-dashboard-sub">Welcome, Parent of Marco</p>
              <div className="home-mini-dashboard-chart" aria-hidden="true">
                <span style={{ height: '40%' }} />
                <span style={{ height: '65%' }} />
                <span style={{ height: '50%' }} />
                <span style={{ height: '80%' }} />
                <span style={{ height: '72%' }} />
              </div>
              <div className="home-mini-dashboard-stats">
                <div>
                  <strong>12/18</strong>
                  <span>Aralin</span>
                </div>
                <div>
                  <strong>85%</strong>
                  <span>Bigkas</span>
                </div>
              </div>
            </div>
            <div className="home-audience-badges">
              <div className="home-audience-badge home-fade-in">
                <span className="home-audience-icon" aria-hidden="true">🇵🇭</span>
                <h3>Nakatuon sa Filipino</h3>
                <p>Ginawa partikular para sa wikang Tagalog at mga Pilipinong mag-aaral.</p>
              </div>
              <div className="home-audience-badge home-fade-in">
                <span className="home-audience-icon"><FiHeart aria-hidden="true" /></span>
                <h3>Dyslexia-Friendly</h3>
                <p>Maalalahaning disenyo na may reading accommodations para sa mga batang may dyslexia.</p>
              </div>
              <div className="home-audience-badge home-fade-in">
                <span className="home-audience-icon"><FiZap aria-hidden="true" /></span>
                <h3>May AI Support</h3>
                <p>Real-time na feedback na pinapagana ng responsableng AI para sa pagkatuto.</p>
              </div>
              <div className="home-audience-badge home-fade-in">
                <span className="home-audience-icon"><FiUsers aria-hidden="true" /></span>
                <h3>Para sa Buong Pamilya</h3>
                <p>Mga tool na dinisenyo upang isali ang magulang, tagapag-alaga, at guro.</p>
              </div>
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

      <section className="home-cta-bar">
        <div className="home-shell home-cta-bar-inner">
          <h2>Handa ka na bang subukan ang LinawLetra?</h2>
          <div className="home-cta-bar-actions">
            <button type="button" className="home-cta-bar-btn-primary" onClick={() => navigate('/register')}>
              Magsimula
            </button>
            <button type="button" className="home-cta-bar-btn-ghost" onClick={() => handleNav('features')}>
              Alamin Pa
            </button>
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
                <a href="mailto:letra4107@gmail.com">letra4107@gmail.com</a>
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

            <div className="home-footer-column">
              <h3 className="home-footer-heading">Kumonekta</h3>
              <div className="home-footer-social">
                <a href="mailto:letra4107@gmail.com" aria-label="Email LinawLetra"><FiMail aria-hidden="true" /></a>
                <a href="https://facebook.com" target="_blank" rel="noreferrer" aria-label="LinawLetra on Facebook"><FaFacebookF aria-hidden="true" /></a>
                <a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="LinawLetra on Instagram"><FaInstagram aria-hidden="true" /></a>
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
