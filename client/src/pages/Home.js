import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

export default function Home() {
  const navigate = useNavigate();
  const [activeAudience, setActiveAudience] = useState('learner');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setProgress(72), 350);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const revealItems = document.querySelectorAll('.home-reveal');

    if (!('IntersectionObserver' in window)) {
      revealItems.forEach((item) => item.classList.add('is-visible'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -70px 0px' }
    );

    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  const scrollToId = (id) => {
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const features = [
    {
      icon: '\u{1F4DA}',
      tone: 'primary',
      title: 'Structured Reading Lessons',
      description: 'Step-by-step lessons from pantig to salita to pangungusap. Each lesson builds on the last, so progress is always forward.',
    },
    {
      icon: '\u{1F524}',
      tone: 'purple',
      title: 'Dyslexia-Friendly Fonts',
      description: 'Clean, well-spaced typography specifically chosen to reduce letter confusion for learners with dyslexia.',
    },
    {
      icon: '\u{1F3AF}',
      tone: 'success',
      title: 'Instant Feedback',
      description: 'Learners get clear, encouraging feedback after every activity - no red marks, just gentle guidance toward the right answer.',
    },
    {
      icon: '\u{1F4CA}',
      tone: 'warning',
      title: 'Progress Tracking',
      description: 'Parents and teachers see exactly where each learner is - which lessons are done, which need review, and what comes next.',
    },
    {
      icon: '\u{1F50A}',
      tone: 'primary',
      title: 'Audio Support',
      description: 'Every word and sentence can be read aloud in clear Filipino pronunciation, helping learners connect sound to text.',
    },
    {
      icon: '\u{1F4DD}',
      tone: 'purple',
      title: 'Teacher Assignments',
      description: 'Teachers can assign specific lessons to individual students and track completion - perfect for blended learning setups.',
    },
  ];

  const audiences = {
    learner: {
      label: 'Mga Estudyante',
      title: 'Learning to read just got easier.',
      description: 'Short lessons, friendly design, and encouragement make reading feel achievable for every child.',
      bullets: [
        'Bite-sized lessons that do not overwhelm',
        'Audio playback for every word',
        'Streaks and progress that learners can understand',
        'Works on phone, tablet, or computer',
      ],
      rows: [
        ['Pantig Recognition', 88, 'success'],
        ['Salita Fluency', 64, 'warning'],
        ['Reading Comprehension', 45, 'danger'],
      ],
    },
    teacher: {
      label: 'Mga Guro',
      title: 'Manage your class, lesson by lesson.',
      description: 'Assign lessons, monitor progress, and identify students who need extra support.',
      bullets: [
        'Assign lessons to students or classes',
        'See who is on track and who needs help',
        'Prepare reports for parent-teacher conversations',
        'Support structured Filipino reading practice',
      ],
      rows: [
        ['Class average', 72, 'success'],
        ['Lessons completed', 58, 'warning'],
        ['Students needing support', 18, 'danger'],
      ],
    },
    parent: {
      label: 'Mga Magulang',
      title: "Stay close to your child's learning.",
      description: 'See daily activity, celebrate wins, and know where your child needs support.',
      bullets: [
        'Simple progress reports',
        'Streak alerts for shared celebration',
        'Tips for helping at home',
        'Safe, focused, and child-friendly',
      ],
      rows: [
        ['Weekly goal', 80, 'success'],
        ['Days active this week', 60, 'warning'],
        ['New words learned', 70, 'danger'],
      ],
    },
  };

  const steps = [
    ['01', '\u{1F464}', 'Create a profile', 'Sign up for free and set up a learner profile. No personal info required to start.'],
    ['02', '\u{1F4CB}', 'Take a quick check', 'A short placement activity helps us find the right starting point - not too easy, not too hard.'],
    ['03', '\u{1F4D6}', 'Start reading', 'Listen, read, and practice with guided lessons made for steady Tagalog literacy growth.'],
    ['04', '\u{1F31F}', 'Grow with confidence', 'Track progress, celebrate wins, and keep moving toward the next reading milestone.'],
  ];

  const active = audiences[activeAudience];

  return (
    <div className="home">
      <nav className="home-nav-shell" aria-label="Home navigation">
        <button className="home-brand" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <img className="home-logo-img" src="/logo.png" alt="LinawLetra logo" />
          <span>
            <strong>LinawLetra</strong>
            <small>Tagalog literacy support</small>
          </span>
        </button>

        <div className="home-nav-links">
          <button type="button" className="home-btn home-btn-ghost" onClick={() => scrollToId('features')}>
            Features
          </button>
          <button type="button" className="home-btn home-btn-ghost" onClick={() => scrollToId('how')}>
            How it works
          </button>
          <button type="button" className="home-btn home-btn-ghost" onClick={() => navigate('/login')}>
            Login
          </button>
          <button type="button" className="home-btn home-btn-primary" onClick={() => navigate('/register')}>
            Magsimula na
          </button>
        </div>
      </nav>

      <main>
        <section className="home-hero">
          <div className="home-hero-copy home-reveal is-visible">
            <div className="home-badge">
              <span />
              Dyslexia-friendly reading support
            </div>
            <h1>
              Malinaw na pagbabasa para sa bawat <span>batang Pilipino.</span>
            </h1>
            <p className="home-hero-desc">
              LinawLetra helps Filipino learners read and write Tagalog with confidence.
              Built for children with dyslexia, and useful for teachers and parents too.
            </p>
            <div className="home-hero-cta">
              <button type="button" className="home-btn home-btn-primary home-btn-large" onClick={() => navigate('/register')}>
                Start for free
              </button>
              <span className="home-note">No credit card needed</span>
            </div>
          </div>

          <aside className="home-progress-card home-reveal is-visible" aria-label="Progress summary preview">
            <div className="home-card-header">
              <div>
                <p>Progress Summary</p>
                <h2>This week's progress</h2>
              </div>
              <strong>{progress}%</strong>
            </div>
            <div className="home-progress-track">
              <div className="home-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="home-stats-grid">
              <div>
                <strong>6</strong>
                <span>Lessons done</span>
              </div>
              <div>
                <strong>8</strong>
                <span>Assigned</span>
              </div>
              <div>
                <strong>3</strong>
                <span>Day streak</span>
              </div>
            </div>
            <div className="home-next-lesson">
              <div className="home-lesson-icon">B</div>
              <div>
                <p>Next up</p>
                <strong>Pantig at Salita - Level 3</strong>
              </div>
              <button type="button" aria-label="Start lesson" onClick={() => navigate('/register')}>
                Play
              </button>
            </div>
          </aside>
        </section>

        <section className="home-section" id="features">
          <p className="home-eyebrow home-reveal">What we offer</p>
          <h2 className="home-reveal">Everything a learner needs to succeed in Tagalog</h2>
          <p className="home-section-desc home-reveal">
            Designed around clear reading practice: structured lessons, supportive feedback,
            and progress that families and teachers can understand.
          </p>
          <div className="home-features-grid">
            {features.map((feature, index) => (
              <article className="home-feature-card home-reveal" style={{ '--reveal-delay': `${index * 80}ms` }} key={feature.title}>
                <div className={`home-feature-icon home-feature-icon-${feature.tone}`}>{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-audience home-reveal" id="audience">
          <div className="home-audience-inner">
            <p className="home-eyebrow">Built for everyone</p>
            <h2>Who uses LinawLetra?</h2>
            <p className="home-section-desc">
              Whether you are learning, teaching, or parenting, LinawLetra gives you a focused place to support reading.
            </p>

            <div className="home-tabs" role="tablist" aria-label="Audience tabs">
              {Object.entries(audiences).map(([key, item]) => (
                <button
                  key={key}
                  type="button"
                  className={activeAudience === key ? 'active' : ''}
                  onClick={() => setActiveAudience(key)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="home-tab-panel">
              <div>
                <h3>{active.title}</h3>
                <p>{active.description}</p>
                <ul>
                  {active.bullets.map((bullet) => (
                    <li key={bullet}>
                      <span>{'\u2713'}</span>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="home-visual-panel">
                {active.rows.map(([label, value, tone]) => (
                  <div className="home-visual-row" key={label}>
                    <span className={`home-dot home-dot-${tone}`} />
                    <div>
                      <p>{label}</p>
                      <div className="home-mini-track">
                        <span className={`home-mini-fill home-mini-fill-${tone}`} style={{ width: `${value}%` }} />
                      </div>
                    </div>
                    <strong>{value}%</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="home-section" id="how">
          <p className="home-eyebrow home-reveal">Simple to start</p>
          <h2 className="home-reveal">Up and reading in 4 easy steps</h2>
          <p className="home-section-desc home-reveal">No setup hassle. Create an account and move straight into reading practice.</p>
          <div className="home-steps-grid">
            {steps.map(([number, emoji, title, copy], index) => (
              <article className="home-step-card home-reveal" style={{ '--reveal-delay': `${index * 90}ms` }} key={number}>
                <span className="home-step-number">{number}</span>
                <div className="home-step-icon" aria-hidden="true">{emoji}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-cta home-reveal">
          <div>
            <h2>Ready to help a child read with confidence?</h2>
            <p>Join Filipino families and teachers using LinawLetra.</p>
          </div>
          <button type="button" onClick={() => navigate('/register')}>
            Get started
          </button>
        </section>
      </main>

      <footer className="home-footer">
        <div>
          <strong>LinawLetra</strong>
          <span>2026 - Tagalog literacy for every Filipino child.</span>
        </div>
        <div>
          <a href="mailto:linawletra@gmail.com">Contact</a>
          <button type="button" onClick={() => navigate('/login')}>Login</button>
        </div>
      </footer>
    </div>
  );
}
