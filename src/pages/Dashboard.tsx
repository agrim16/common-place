import { FocusTimer } from "@/components/study/FocusTimer";
import { RemindersPanel } from "@/components/study/RemindersPanel";
import { TimetablePanel } from "@/components/study/TimetablePanel";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import {
  MONTHS,
  WEEKDAYS,
  formatMinutes,
  minutesOfDay,
  pad2,
  to12h,
} from "@/lib/study";
import { useQuery } from "convex/react";
import { LogOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const DAILY_GOAL_MINUTES = 120;

function greetingFor(hours: number): string {
  if (hours < 12) return "Good morning";
  if (hours < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

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

  const timetable = useQuery(api.study.listTimetable) ?? [];
  const reminders = useQuery(api.study.listReminders) ?? [];
  const focus = useQuery(api.study.focusSummary, { since: midnight });

  const today = new Date(now);
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
        description: entry.note ?? `${to12h(entry.startTime)} – ${to12h(entry.endTime)}`,
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

  const firstName = user?.name?.split(" ")[0];
  const dateLine = `${WEEKDAYS[todayIdx]}, ${today.getDate()} ${
    MONTHS[today.getMonth()]
  } ${today.getFullYear()}`;

  return (
    <main className="min-h-screen pb-16">
      {/* Masthead */}
      <header className="border-b-4 border-double border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-baseline gap-3">
            <a href="/" className="font-display text-xl font-semibold tracking-tight">
              Commonplace
            </a>
            <span className="font-archive hidden text-[10px] text-muted-foreground sm:inline">
              The student&apos;s study almanac
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-archive hidden text-[10px] text-muted-foreground sm:inline">
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

      <div className="mx-auto w-full max-w-6xl px-5">
        {/* Greeting */}
        <section className="flex flex-wrap items-end justify-between gap-4 pb-8 pt-10">
          <div>
            <span className="font-archive text-[10px] text-primary">
              Today&apos;s page · {dateLine}
            </span>
            <h1 className="mt-3 text-4xl font-medium sm:text-5xl">
              {greetingFor(today.getHours())}
              {firstName ? (
                <>
                  , <span className="italic text-primary">{firstName}</span>
                </>
              ) : null}
              .
            </h1>
            <p className="mt-3 max-w-xl text-lg leading-8 text-foreground/75">
              {currentPeriod
                ? `You are in ${currentPeriod.subject} right now — the bell rings at ${to12h(currentPeriod.endTime)}.`
                : nextPeriod
                  ? `Free until ${to12h(nextPeriod.startTime)}, when ${nextPeriod.subject} begins.`
                  : "The day is yours. Start a session, or set the week's periods."}
            </p>
          </div>
          <span className="stamp rotate-[-4deg] text-[10px]">
            Open · v1
          </span>
        </section>

        {/* Desk grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <FocusTimer subjects={subjects} />
          </div>

          {/* Today's totals */}
          <section className="paper rounded-sm p-6 sm:p-7">
            <span className="font-archive text-[10px] text-primary">
              Today&apos;s totals
            </span>
            <h2 className="mt-2 text-2xl font-medium">Kept so far</h2>

            <div className="mt-6">
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

            <dl className="mt-6 space-y-4 border-t border-dashed border-border pt-5">
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

          <div className="lg:col-span-2">
            <TimetablePanel entries={timetable} now={now} />
          </div>
          <RemindersPanel reminders={reminders} now={now} />
        </div>

        <footer className="mt-12 border-t border-border pt-6 text-center sm:text-left">
          <p className="font-archive text-[10px] leading-5 text-muted-foreground">
            Commonplace · Version 1 — timetable, focus timer, reminders. More of
            the notebook stays in the drawer until these are perfect.
          </p>
        </footer>
      </div>
    </main>
  );
}
