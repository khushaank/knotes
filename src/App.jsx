import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

const navItems = [
    ['/', 'Home'],
    ['/chess', 'Chess'],
    ['/cube-lab', 'Cube Lab'],
    ['/creator-room', 'Creator Room'],
    ['/minecraft', 'Minecraft'],
    ['/about', 'About']
];

function App() {
    const location = useLocation();

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [location.pathname]);

    return (
        <div className="site-shell">
            <Navbar />
            <main className="page-transition" key={location.pathname}>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/home" element={<Home />} />
                    <Route path="/chess" element={<Chess />} />
                    <Route path="/cube-lab" element={<CubeLab />} />
                    <Route path="/creator-room" element={<CreatorRoom />} />
                    <Route path="/dashboard" element={<CreatorRoom />} />
                    <Route path="/minecraft" element={<Minecraft />} />
                    <Route path="/about" element={<About />} />
                    <Route path="*" element={<Home />} />
                </Routes>
            </main>
            <Footer />
        </div>
    );
}

function Navbar() {
    const [open, setOpen] = useState(false);

    return (
        <header className="navbar">
            <a className="brand" href="/" aria-label="Lakshya Gupta home">
                <span className="brand-mark">LG</span>
                <span>
                    <strong>Lakshya Gupta</strong>
                    <small>Strategic Pixel Minimalism</small>
                </span>
            </a>

            <nav className="desktop-nav" aria-label="Primary navigation">
                {navItems.map(([to, label]) => (
                    <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
                        {label}
                    </NavLink>
                ))}
            </nav>

            <button className="menu-toggle" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
                <span />
                <span />
            </button>

            <div className={`mobile-panel ${open ? 'open' : ''}`}>
                {navItems.map(([to, label]) => (
                    <NavLink key={to} to={to} onClick={() => setOpen(false)}>
                        {label}
                    </NavLink>
                ))}
            </div>
        </header>
    );
}

function SectionLabel({ eyebrow, title, text }) {
    return (
        <div className="section-label fade-up">
            <p>{eyebrow}</p>
            <h2>{title}</h2>
            {text && <span>{text}</span>}
        </div>
    );
}

function PageHeader({ eyebrow, title, text, children }) {
    return (
        <section className="page-header">
            <div className="page-header-copy fade-up">
                <p className="eyebrow">{eyebrow}</p>
                <h1>{title}</h1>
                <p>{text}</p>
            </div>
            {children}
        </section>
    );
}

function FeatureCard({ title, text, meta, tone = 'blue' }) {
    return (
        <article className={`feature-card ${tone} fade-up`}>
            <span>{meta}</span>
            <h3>{title}</h3>
            <p>{text}</p>
        </article>
    );
}

function PlaceholderCard({ title, label, text }) {
    return (
        <article className="placeholder-card fade-up">
            <div className="placeholder-frame">
                <span>{label}</span>
            </div>
            <h3>{title}</h3>
            <p>{text}</p>
        </article>
    );
}

function PixelVisual({ compact = false }) {
    const squares = Array.from({ length: compact ? 18 : 36 });
    return (
        <div className={`pixel-visual ${compact ? 'compact' : ''}`} aria-hidden="true">
            {!compact && <img src="/brand-visual.svg" alt="" className="brand-visual" />}
            <div className="board-orbit">
                <div className="chess-plane" />
                <div className="cube-stack">
                    {squares.map((_, index) => (
                        <i key={index} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function Home() {
    const tags = ['National Chess Player', 'Cube Solver', 'Minecraft Creator', 'Class 8', 'Strategic Mind'];

    return (
        <>
            <section className="hero">
                <div className="hero-copy fade-up">
                    <p className="eyebrow">Lakshya Gupta</p>
                    <h1>Chess vision, cube logic, and creator energy in one sharp personal brand.</h1>
                    <p>
                        Class 8 student. National chess player. Chess award winner. Rubik's cube solver.
                        Minecraft YouTube creator. Pro Minecraft player.
                    </p>
                    <div className="tag-cloud">
                        {tags.map(tag => <span key={tag}>{tag}</span>)}
                    </div>
                    <div className="hero-actions">
                        <a href="#worlds" className="magnetic primary">Explore My World</a>
                        <NavLink to="/creator-room" className="magnetic secondary">Watch My Content</NavLink>
                    </div>
                </div>
                <PixelVisual />
            </section>

            <section id="worlds" className="content-band">
                <SectionLabel
                    eyebrow="Personal system"
                    title="Four worlds, one strategic brain."
                    text="Each side of Lakshya's identity gets its own designed space, built to be easy to update later."
                />
                <div className="feature-grid">
                    <FeatureCard meta="01 / Board" title="Chess" text="A competitive space for awards, strategy notes, tournament memories, and certificate placeholders." />
                    <FeatureCard meta="02 / Logic" title="Cube Lab" text="A clean lab for algorithms, tricks, beginner tips, patterns, and future tutorials." tone="green" />
                    <FeatureCard meta="03 / Studio" title="Creator Room" text="A dashboard-style room for latest videos, upload notes, archive cards, and future ideas." tone="graphite" />
                    <FeatureCard meta="04 / Blocks" title="Minecraft" text="A premium gaming page for PvP skill, gameplay content, tips, and creator highlights." tone="mint" />
                </div>
            </section>
        </>
    );
}

function Chess() {
    return (
        <>
            <PageHeader
                eyebrow="Chess"
                title="Strategy under pressure."
                text="Lakshya's chess identity is built around focus, patience, calculation, and a competitive mindset."
            >
                <PixelVisual compact />
            </PageHeader>

            <section className="content-band dark-slab">
                <SectionLabel
                    eyebrow="Tournament identity"
                    title="National chess player. Award-winning competitor."
                    text="A premium structure for real achievements without inventing names or numbers."
                />
                <div className="achievement-grid">
                    <PlaceholderCard title="Tournament Result" label="Add tournament name here" text="Use this card for a real tournament result, rank, venue, or memory." />
                    <PlaceholderCard title="Award Moment" label="Add award photo here" text="A polished space for a medal, trophy, or stage photo." />
                    <PlaceholderCard title="Certificate Archive" label="Add certificate here" text="Keep certificates organized without making the page feel crowded." />
                </div>
            </section>

            <section className="strategy-strip">
                {['Opening discipline', 'Calculation', 'Patience', 'Focus', 'Endgame control'].map(item => (
                    <span key={item}>{item}</span>
                ))}
            </section>
        </>
    );
}

function CubeLab() {
    const cards = [
        ['Cube Tricks', 'Add trick title here', 'Short notes for memorable cube moves and visual patterns.'],
        ['Algorithms', 'Add algorithm here', 'A clean place to save notation, cases, and method notes.'],
        ['Beginner Tips', 'First solve note', 'Simple guidance for new cubers, written in Lakshya’s voice later.'],
        ['Speed Solving Notes', 'Add timing method here', 'Record practice ideas without fake personal records.'],
        ['Pattern Recognition', 'Add pattern case here', 'Group cube cases by color logic and recognition cues.'],
        ['My Cube Collection', 'Add cube model here', 'A premium archive for real cubes and photos.']
    ];

    return (
        <>
            <PageHeader
                eyebrow="Cube Lab"
                title="Color logic, algorithms, and fast pattern thinking."
                text="A learning lab for cube tricks, methods, tutorials, and solving tips."
            >
                <div className="cube-art" aria-hidden="true">
                    {Array.from({ length: 27 }).map((_, index) => <i key={index} />)}
                </div>
            </PageHeader>
            <section className="content-band">
                <div className="lab-grid">
                    {cards.map(([meta, title, text]) => (
                        <FeatureCard key={meta} meta={meta} title={title} text={text} tone="green" />
                    ))}
                </div>
                <div className="coming-soon fade-up">
                    <span>Tutorials Coming Soon</span>
                    <p>Designed so new cube posts can be added later as clean cards, not messy updates.</p>
                </div>
            </section>
        </>
    );
}

function CreatorRoom() {
    const updates = [
        ['Latest Video', 'Paste latest video link here', 'Use this slot when a new upload is ready.'],
        ["Today's Upload", 'Today I launched a new YouTube video.', 'A clean announcement card for current activity.'],
        ['Video Updates', 'New Minecraft short is live.', 'Short update notes can sit here without needing fake data.'],
        ['Upcoming Ideas', 'Next video idea coming soon.', 'Keep future concepts organized before they become videos.']
    ];

    return (
        <>
            <PageHeader
                eyebrow="Creator Room"
                title="A polished launch room for videos, updates, and Minecraft shorts."
                text="Dashboard energy, but personal and minimal. No fake links, views, or subscriber numbers."
            >
                <div className="creator-console fade-up">
                    <div className="console-top">
                        <span>Creator board</span>
                        <i />
                    </div>
                    <div className="video-placeholder">Add thumbnail here</div>
                    <div className="console-lines">
                        <span />
                        <span />
                        <span />
                    </div>
                </div>
            </PageHeader>
            <section className="dashboard-layout">
                <div className="dashboard-main">
                    {updates.map(([title, label, text]) => (
                        <PlaceholderCard key={title} title={title} label={label} text={text} />
                    ))}
                </div>
                <aside className="archive-panel fade-up">
                    <p className="eyebrow">Old Video Directory</p>
                    {['Add old video here', 'Add old video here', 'Add old video here'].map((item, index) => (
                        <div className="archive-row" key={`${item}-${index}`}>
                            <span>0{index + 1}</span>
                            <strong>{item}</strong>
                            <small>Add date</small>
                        </div>
                    ))}
                </aside>
            </section>
        </>
    );
}

function Minecraft() {
    return (
        <>
            <PageHeader
                eyebrow="Minecraft"
                title="Clean gaming energy with PvP focus."
                text="Lakshya creates Minecraft gaming content, plays at a pro level, and shares gameplay, tips, and creator highlights."
            >
                <div className="minecraft-stack" aria-hidden="true">
                    {Array.from({ length: 16 }).map((_, index) => <i key={index} />)}
                </div>
            </PageHeader>
            <section className="content-band">
                <div className="feature-grid">
                    <FeatureCard meta="PvP Skills" title="Fast reads, clean decisions" text="A page section for duels, movement, timing, and clutch moments." tone="graphite" />
                    <FeatureCard meta="Minecraft Content" title="Gameplay with structure" text="A place to feature new videos, shorts, and content categories." tone="mint" />
                    <FeatureCard meta="Favorite Modes" title="Add mode here" text="Keep mode preferences editable without inventing details." tone="green" />
                    <FeatureCard meta="Tips & Tricks" title="Add tip here" text="Short, useful Minecraft notes that can grow over time." />
                </div>
            </section>
        </>
    );
}

function About() {
    return (
        <>
            <PageHeader
                eyebrow="About"
                title="A student building skill across boards, cubes, and blocks."
                text="Lakshya Gupta is a Class 8 student who balances academics, national-level chess, cube solving, Minecraft, and content creation."
            >
                <div className="about-note fade-up">
                    <span>Class 8</span>
                    <span>National chess player</span>
                    <span>Cube solver</span>
                    <span>Minecraft creator</span>
                </div>
            </PageHeader>
            <section className="about-body fade-up">
                <p>
                    This site is designed as a personal brand system: calm, sharp, and easy to update as real
                    achievements, videos, cube tutorials, and Minecraft highlights are added.
                </p>
                <a href="mailto:lakshyagupta652@gmail.com">lakshyagupta652@gmail.com</a>
            </section>
        </>
    );
}

function Footer() {
    return (
        <footer className="footer">
            <span>Built for Lakshya Gupta</span>
            <a href="mailto:lakshyagupta652@gmail.com">lakshyagupta652@gmail.com</a>
        </footer>
    );
}

export default App;
