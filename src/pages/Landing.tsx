import { motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  Clock,
  Feather,
  Sparkles,
  Timer,
  Trophy,
} from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: [0.22, 0.61, 0.36, 1] as const },
};

const pillars = [
  {
    no: "01",
    icon: CalendarDays,
    title: "A timetable that knows the bells",
    body: "Lay out your week once — subject, period, hour. The desk tells you which period you're sitting in now and which one comes next, so the day never runs away from you.",
  },
  {
    no: "02",
    icon: Timer,
    title: "A focus timer with manners",
    body: "Pomodoro focus, speed revision, short and long breaks. When the sand runs out a soft chime rings and reminds you to switch subjects — no shouting, no streak guilt.",
  },
  {
    no: "03",
    icon: Bell,
    title: "Reminders in the margin",
    body: "Assignments, revisions, and a gentle nudge to touch grass. Tick them off where you wrote them; today's list stays folded into today's page.",
  },
  {
    no: "04",
    icon: Trophy,
    title: "XP, levels & the scoreboard",
    body: "Every focused minute earns a point. Ranks climb from Freshman to Headmaster, and the weekly scoreboard orders the room by minutes actually studied — no streak guilt.",
  },
  {
    no: "05",
    icon: Sparkles,
    title: "A helper that has read your notes",
    body: "Upload your notes and ask the Gemini-backed study helper anything — your progress today, what to study next, or a trick to remember the page.",
  },
  {
    no: "06",
    icon: Clock,
    title: "The flip clock",
    body: "A split-flap station clock in the corner of the desk, flipping the seconds away in typewriter digits. A small thing — but the desk feels alive.",
  },
];

const dayExample = [
  { time: "07:30", label: "Period I — Mathematics", tag: "Timetable" },
  { time: "16:00", label: "Speed revision — 15 min, Chemistry", tag: "Timer" },
  { time: "17:00", label: "Touch grass — twenty minutes outside", tag: "Reminder" },
  { time: "19:00", label: "Focus block — Physics, 25 × 4", tag: "Timer" },
];

export default function Landing() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col"
    >
      {/* Masthead */}
      <header className="sticky top-0 z-40 border-b-4 border-double border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5">
          <a href="/" className="group flex items-baseline gap-2.5">
            <span className="font-display text-xl font-semibold tracking-tight">
              Commonplace
            </span>
            <span className="font-archive hidden text-[10px] text-muted-foreground sm:inline">
              Est. for students
            </span>
          </a>
          <nav className="flex items-center gap-1.5 sm:gap-3">
            <a
              href="#inside"
              className="font-archive hidden px-2 py-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              What's inside
            </a>
            <a
              href="#day"
              className="font-archive hidden px-2 py-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              A day
            </a>
            <a
              href="/auth"
              className="font-archive rounded-sm border border-border px-3 py-2 text-[11px] text-foreground transition-colors hover:bg-secondary"
            >
              Sign in
            </a>
            <a
              href="/auth?returnTo=%2Fdashboard"
              className="font-archive rounded-sm bg-primary px-3.5 py-2 text-[11px] text-primary-foreground transition-transform hover:-translate-y-px"
            >
              Open your desk
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pb-24 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pt-24">
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <span className="stamp inline-block -rotate-2 text-[10px]">
              Vol. I · No. 1
            </span>
            <h1 className="mt-7 text-5xl font-medium leading-[1.04] sm:text-6xl">
              Your study day,
              <span className="block italic text-primary">kept properly.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-foreground/80">
              Commonplace is a study desk for students — a ruled page that holds
              your week, a timer that rings the bell, a margin for every
              reminder, XP for every focused minute, and a study helper that
              has read your notes. Version one does those things, quietly.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a
                href="/auth?returnTo=%2Fdashboard"
                className="group inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-3.5 text-primary-foreground shadow-[0_12px_24px_-18px_rgba(58,38,18,0.9)] transition-transform hover:-translate-y-0.5"
              >
                <span className="font-archive text-xs">
                  Begin your commonplace book
                </span>
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </a>
              <a
                href="#inside"
                className="font-archive border-b border-border pb-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                Read the contents
              </a>
            </div>
            <p className="font-archive mt-8 text-[10px] leading-5 text-muted-foreground">
              Timetable · Focus timer · Reminders · XP &amp; scoreboard · Study
              helper · Flip clock — done properly, nothing else.
            </p>
          </motion.div>

          {/* Specimen: a page from the book */}
          <motion.div
            initial={{ opacity: 0, y: 36, rotate: -3 }}
            animate={{ opacity: 1, y: 0, rotate: -1.4 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 0.61, 0.36, 1] }}
            className="relative mx-auto w-full max-w-md"
          >
            <div className="paper vignette rounded-sm px-6 py-7">
              <div className="mb-5 flex items-center justify-between">
                <span className="font-archive text-[10px] text-muted-foreground">
                  Monday · 2 October
                </span>
                <span className="stamp rotate-2 text-[9px]">On the desk</span>
              </div>

              <div className="ruled rounded-sm border border-border/70 bg-[#fdfaf1] pl-12 pr-4 py-1">
                {[
                  { t: "07:30", s: "Mathematics", n: "Period I" },
                  { t: "16:00", s: "Chemistry", n: "Revision · 15 min" },
                  { t: "19:00", s: "Physics", n: "Focus · 25 min" },
                ].map((row) => (
                  <div
                    key={row.t}
                    className="relative flex h-8 items-center justify-between"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="font-archive text-[10px] text-primary">
                        {row.t}
                      </span>
                      <span className="text-[15px] leading-none">{row.s}</span>
                    </div>
                    <span className="font-archive text-[9px] text-muted-foreground">
                      {row.n}
                    </span>
                    <span className="absolute -left-10 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-primary/70" />
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between rounded-sm border border-border bg-secondary/60 px-4 py-3">
                <div>
                  <p className="font-archive text-[9px] text-muted-foreground">
                    Focus · Physics
                  </p>
                  <p className="font-mono text-3xl font-bold tracking-widest text-foreground">
                    24:59
                  </p>
                </div>
                <div className="text-right">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
                    <div className="h-full w-2/3 bg-primary" />
                  </div>
                  <p className="font-archive mt-2 text-[9px] text-muted-foreground">
                    Bell at 25:00
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3 border-t border-dashed border-border pt-4">
                <span className="flex size-4 items-center justify-center rounded-[3px] border border-primary bg-primary text-primary-foreground">
                  <Check className="size-3" />
                </span>
                <span className="text-sm text-foreground/85">
                  Touch grass — twenty minutes outside
                </span>
              </div>
            </div>

            <div className="absolute -bottom-5 -left-5 hidden rotate-[-8deg] border border-primary/50 bg-background/80 px-3 py-2 sm:block">
              <Feather className="size-4 text-primary" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Contents — exactly version one */}
      <section id="inside" className="border-y-4 border-double border-border bg-secondary/50 py-20">
        <div className="mx-auto w-full max-w-6xl px-5">
          <motion.div {...fadeUp} className="max-w-2xl">
            <span className="font-archive text-[10px] text-primary">
              Contents · Version 1
            </span>
            <h2 className="mt-4 text-4xl font-medium sm:text-[2.75rem]">
              Six entries. Nothing pencilled in the margins.
            </h2>
            <p className="mt-4 text-lg leading-8 text-foreground/75">
              The first version exists for one reason: to help students study.
              Everything from the notebook that isn't on this list waits its
              turn.
            </p>
          </motion.div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {pillars.map((p, i) => (
              <motion.article
                key={p.no}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.1 }}
                className="paper group relative flex flex-col rounded-sm p-7 transition-transform hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.no}
                  </span>
                  <p.icon className="size-5 text-primary" />
                </div>
                <h3 className="mt-6 text-xl font-medium leading-snug">
                  {p.title}
                </h3>
                <p className="mt-3 text-[15px] leading-7 text-foreground/75">
                  {p.body}
                </p>
                <span className="mt-6 block h-px w-full bg-border transition-colors group-hover:bg-primary/50" />
                <span className="font-archive mt-3 text-[9px] text-muted-foreground">
                  Included in v1
                </span>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* A day at the desk — worked example */}
      <section id="day" className="py-20">
        <div className="mx-auto grid w-full max-w-6xl items-start gap-12 px-5 lg:grid-cols-[0.9fr_1.1fr]">
          <motion.div {...fadeUp}>
            <span className="font-archive text-[10px] text-primary">
              Exhibit A
            </span>
            <h2 className="mt-4 text-4xl font-medium">
              One ordinary Tuesday,
              <span className="italic"> kept in the book.</span>
            </h2>
            <p className="mt-4 max-w-md text-lg leading-8 text-foreground/75">
              No dashboards to configure, no streaks to defend. You write the
              day once; the desk keeps time with you and folds the page away at
              midnight.
            </p>
            <div className="ornament mt-8">
              <span className="text-xs">❖</span>
            </div>
          </motion.div>

          <motion.div {...fadeUp} className="paper rounded-sm p-7">
            <ul className="divide-y divide-border">
              {dayExample.map((item) => (
                <li
                  key={item.time}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div className="flex items-baseline gap-5">
                    <span className="font-archive w-12 shrink-0 text-[11px] text-primary">
                      {item.time}
                    </span>
                    <span className="text-[17px] leading-snug">{item.label}</span>
                  </div>
                  <span className="font-archive hidden shrink-0 border border-border px-2 py-1 text-[9px] text-muted-foreground sm:inline">
                    {item.tag}
                  </span>
                </li>
              ))}
            </ul>
            <p className="font-archive mt-5 border-t border-dashed border-border pt-4 text-[10px] leading-5 text-muted-foreground">
              Logged: 3 focus sessions · 100 minutes · +100 XP · 2 reminders
              cleared
            </p>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t-4 border-double border-border bg-[#241d14] py-20 text-[#f0e6d2]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-5 text-center">
          <motion.div {...fadeUp}>
            <span className="font-archive text-[10px] text-[#c9a97a]">
              Admission free · One page per student
            </span>
            <h2 className="mt-5 max-w-2xl text-4xl font-medium sm:text-5xl">
              Open the book at a clean page.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-[#f0e6d2]/75">
              Sign in with Google or your email, set Tuesday&apos;s timetable,
              and run your first focus session before the kettle boils.
            </p>
            <a
              href="/auth?returnTo=%2Fdashboard"
              className="group mt-9 inline-flex items-center gap-2 rounded-sm bg-[#e8d7b4] px-7 py-4 text-[#241d14] transition-transform hover:-translate-y-0.5"
            >
              <span className="font-archive text-xs">Open your desk</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* Colophon */}
      <footer className="py-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 sm:flex-row">
          <span className="font-display text-lg">Commonplace</span>
          <p className="font-archive text-center text-[10px] leading-5 text-muted-foreground">
            Set in Fraunces &amp; EB Garamond · Ruled paper, iron-gall ink
          </p>
          <p className="font-archive text-[10px] text-muted-foreground">
            © 2026 · For students
          </p>
        </div>
      </footer>
    </motion.div>
  );
}
