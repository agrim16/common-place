import { FlipClock } from "@/components/study/FlipClock";
import { FocusTimer } from "@/components/study/FocusTimer";
import { NotesPanel } from "@/components/study/NotesPanel";
import { ProgressPanel } from "@/components/study/ProgressPanel";
import { QuizPanel } from "@/components/study/QuizPanel";
import { RemindersPanel } from "@/components/study/RemindersPanel";
import { StudyHelperPanel, type HelperAttachment } from "@/components/study/StudyHelperPanel";
import { TimetablePanel } from "@/components/study/TimetablePanel";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  MONTHS,
  WEEKDAYS,
  formatMinutes,
  minutesOfDay,
  pad2,
  to12h,
  type Reminder,
  type TimetableEntry,
} from "@/lib/study";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "convex/react";
import {
  AlarmClock,
  Bell,
  CalendarDays,
  LogOut,
  NotebookPen,
  ScrollText,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

const DAILY_GOAL_MINUTES = 120;

/** Stable empties so `?? []` doesn't rewire hook deps every render. */
const NO_PERIODS: TimetableEntry[] = [];
const NO_REMINDERS: Reminder[] = [];

const TABS = [
  { id: "desk", label: "Desk", icon: AlarmClock },
  { id: "timetable", label: "Timetable", icon: CalendarDays },
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "quiz", label: "Quiz", icon: ScrollText },
  { id: "buddy", label: "Helper", icon: Sparkles },
  { id: "marks", label: "Marks", icon: Trophy },
] as const;

type TabId = (typeof TABS)[number]["id"];

function greetingFor(hours: number): string {
  if (hours < 12) return "Good morning";
  if (hours < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /* Deep links: /dashboard?tab=notes, and ?tab=helper&note=<id> from the library.
     The URL is the single source of truth for which panel is open. */
  const requestedTab = searchParams.get("tab");
  const tab: TabId =
    TABS.find((t) => t.id === requestedTab)?.id ?? "desk";
  const attachment: HelperAttachment = useMemo(
    () => ({
      note: searchParams.get("note") ?? undefined,
      photo: searchParams.get("photo") ?? undefined,
      pdf: searchParams.get("pdf") ?? undefined,
    }),
    [searchParams],
  );

  const [now, setNow] = useState(() => Date.now());
  const [midnight] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  });

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const timetable = useQuery(api.study.listTimetable) ?? NO_PERIODS;
  const reminders = useQuery(api.study.listReminders) ?? NO_REMINDERS;
  const focus = useQuery(api.study.focusSummary, { since: midnight });

  const today = useMemo(() => new Date(now), [now]);
  const todayIdx = today.getDay();
  const nowMinutes = today.getHours() * 60 + today.getMinutes();

  const todayPeriods = useMemo(
    () =>
      timetable
        .filter((e) => e.day === todayIdx)
        .sort((a, b) => minutesOfDay(a.startTime) - minutesOfDay(b.startTime)),
    [timetable, todayIdx],
  );
  const currentPeriod = todayPeriods.find(
    (e) =>
      minutesOfDay(e.startTime) <= nowMinutes &&
      minutesOfDay(e.endTime) > nowMinutes,
  );
  const nextPeriod = todayPeriods.find(
    (e) => minutesOfDay(e.startTime) > nowMinutes,
  );
  const subjects = useMemo(
    () => [...new Set(timetable.map((e) => e.subject))],
    [timetable],
  );
  const openReminders = reminders.filter((r) => !r.done).length;
  const minutesStudied = focus?.minutes ?? 0;
  const sessions = focus?.sessions ?? 0;

  /* Bells: fire toasts for starting periods and due reminders. */
  const firedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const hm = `${pad2(today.getHours())}:${pad2(today.getMinutes())}`;

    for (const entry of todayPeriods) {
      if (entry.startTime !== hm) continue;
      const key = `period-${entry._id}-${hm}`;
      if (firedRef.current.has(key)) continue;
      firedRef.current.add(key);
      toast(`Now: ${entry.subject}`, {
        description:
          entry.note ?? `${to12h(entry.startTime)} – ${to12h(entry.endTime)}`,
      });
    }

    for (const reminder of reminders) {
      if (reminder.done) continue;
      const key = `reminder-${reminder._id}`;
      if (firedRef.current.has(key)) continue;
      if (reminder.time > now || now - reminder.time > 90_000) continue;
      firedRef.current.add(key);
      toast(reminder.title, {
        description: `Due now · ${to12h(
          `${pad2(new Date(reminder.time).getHours())}:${pad2(
            new Date(reminder.time).getMinutes(),
          )}`,
        )}`,
      });
    }
  }, [now, today, todayPeriods, reminders]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const selectTab = (next: TabId) => {
    setSearchParams(next === "desk" ? {} : { tab: next }, { replace: true });
    window.scrollTo({ top: 0 });
  };

  const firstName = user?.name?.split(" ")[0];
  const dateLine = `${WEEKDAYS[todayIdx]}, ${today.getDate()} ${
    MONTHS[today.getMonth()]
  } ${today.getFullYear()}`;

  return (
    <main className="min-h-screen pb-32">
      {/* Masthead */}
      <header className="border-b-4 border-double border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-lg flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-baseline gap-2.5">
            <a href="/" className="font-display text-lg font-semibold tracking-tight">
              Commonplace
            </a>
            <span className="font-archive hidden text-[9px] text-muted-foreground sm:inline">
              Study almanac
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-archive text-[9px] text-muted-foreground">
              {dateLine}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-sm"
              onClick={handleSignOut}
            >
              <LogOut className="size-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* App column — one panel at a time */}
      <div className="mx-auto w-full max-w-lg px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {tab === "desk" && (
              <>
                {/* Greeting */}
                <section className="pb-6 pt-8">
                  <span className="font-archive text-[10px] text-primary">
                    Today&apos;s page · {dateLine}
                  </span>
                  <h1 className="mt-2.5 text-3xl font-medium leading-tight sm:text-4xl">
                    {greetingFor(today.getHours())}
                    {firstName ? (
                      <>
                        , <span className="italic text-primary">{firstName}</span>
                      </>
                    ) : null}
                    .
                  </h1>
                  <p className="mt-2.5 text-[17px] leading-7 text-foreground/75">
                    {currentPeriod
                      ? `You are in ${currentPeriod.subject} — bell at ${to12h(currentPeriod.endTime)}.`
                      : nextPeriod
                        ? `Free until ${to12h(nextPeriod.startTime)}, when ${nextPeriod.subject} begins.`
                        : "The day is yours. Start a session, or set the week's periods."}
                  </p>
                </section>

                <div className="flex flex-col gap-5">
                  <FocusTimer subjects={subjects} />
                  <FlipClock now={now} />

                  {/* Today's totals */}
                  <section className="paper rounded-sm p-6">
                    <span className="font-archive text-[10px] text-primary">
                      Today&apos;s totals
                    </span>
                    <h2 className="mt-2 text-2xl font-medium">Kept so far</h2>

                    <div className="mt-5">
                      <div className="flex items-end justify-between">
                        <span className="font-mono text-4xl font-bold">
                          {minutesStudied}
                        </span>
                        <span className="font-archive text-[10px] text-muted-foreground">
                          min · {sessions} session{sessions === 1 ? "" : "s"}
                        </span>
                      </div>
                      <Progress
                        value={Math.min(
                          100,
                          (minutesStudied / DAILY_GOAL_MINUTES) * 100,
                        )}
                        className="mt-3 h-2"
                        aria-label="Progress toward the daily focus goal"
                      />
                      <p className="font-archive mt-2 text-[9px] text-muted-foreground">
                        Goal {formatMinutes(DAILY_GOAL_MINUTES)} of focus
                      </p>
                    </div>

                    <dl className="mt-5 space-y-4 border-t border-dashed border-border pt-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="font-archive text-[10px] text-muted-foreground">
                          Periods today
                        </dt>
                        <dd className="text-[17px]">{todayPeriods.length}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="font-archive text-[10px] text-muted-foreground">
                          Open reminders
                        </dt>
                        <dd className="text-[17px]">{openReminders}</dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="font-archive text-[10px] text-muted-foreground">
                          On the desk now
                        </dt>
                        <dd className="truncate text-[17px] italic">
                          {currentPeriod?.subject ?? "Nothing scheduled"}
                        </dd>
                      </div>
                    </dl>
                  </section>
                </div>
              </>
            )}

            {tab === "timetable" && (
              <div className="pt-6">
                <TimetablePanel entries={timetable} now={now} />
              </div>
            )}
            {tab === "reminders" && (
              <div className="pt-6">
                <RemindersPanel reminders={reminders} now={now} />
              </div>
            )}
            {tab === "notes" && (
              <div className="pt-6">
                <NotesPanel />
              </div>
            )}
            {tab === "quiz" && (
              <div className="pt-6">
                <QuizPanel />
              </div>
            )}
            {tab === "buddy" && (
              <div className="pt-6">
                <StudyHelperPanel
                  key={`${attachment.note ?? ""}|${attachment.photo ?? ""}|${attachment.pdf ?? ""}`}
                  attachment={attachment}
                />
              </div>
            )}
            {tab === "marks" && (
              <div className="pt-6">
                <ProgressPanel />
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <footer className="mt-10 border-t border-border pt-5 text-center">
          <p className="font-archive text-[9px] leading-5 text-muted-foreground">
            Commonplace · Study Buddy — timetable, focus timer, reminders, notes
            library, AI quizzes, XP &amp; scoreboard, study helper.
          </p>
        </footer>
      </div>

      {/* Bottom tab bar — filed-folder tabs */}
      <nav
        aria-label="Study desk sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t-4 border-double border-border bg-background/95 backdrop-blur"
      >
        <div className="mx-auto flex w-full max-w-lg items-end justify-between gap-1 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectTab(id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-1 rounded-t-md border px-1 pb-2 pt-2.5 transition-colors",
                  active
                    ? "border-border border-b-0 bg-card text-primary shadow-[0_-6px_12px_-10px_rgba(58,38,18,0.8)]"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" />
                <span className="font-archive text-[8px] tracking-[0.06em]">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
