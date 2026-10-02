import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const MODES = [
  {
    id: "focus",
    label: "Focus",
    minutes: 25,
    kind: "focus",
    hint: "Deep work — one subject only.",
  },
  {
    id: "revision",
    label: "Speed revision",
    minutes: 15,
    kind: "focus",
    hint: "A quick recall pass over what you studied.",
  },
  {
    id: "short",
    label: "Short break",
    minutes: 5,
    kind: "break",
    hint: "Stand up, water, look out of the window.",
  },
  {
    id: "long",
    label: "Long break",
    minutes: 15,
    kind: "break",
    hint: "A proper walk. The desk will wait.",
  },
] as const;

type Mode = (typeof MODES)[number];

/** Two-note desk bell when a session ends. */
function chime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const start = ctx.currentTime;
    [880, 659].forEach((freq, i) => {
      const at = start + i * 0.28;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 1.2);
    });
    window.setTimeout(() => void ctx.close(), 2500);
  } catch {
    /* audio unavailable — the toast still carries the message */
  }
}

const RADIUS = 96;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function FocusTimer({ subjects }: { subjects: string[] }) {
  const [modeId, setModeId] = useState<string>("focus");
  const mode = (MODES.find((m) => m.id === modeId) ?? MODES[0]) as Mode;
  const total = mode.minutes * 60;
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(false);
  const [subject, setSubject] = useState("");
  const startedAtRef = useRef<number | null>(null);
  const remainingRef = useRef(total);
  const logSession = useMutation(api.study.logFocusSession);

  const setClock = (value: number) => {
    remainingRef.current = value;
    setRemaining(value);
  };

  /** Switch presets: stop, reset the clock to the new length. */
  const selectMode = (next: Mode) => {
    setModeId(next.id);
    setRunning(false);
    setClock(next.minutes * 60);
    startedAtRef.current = null;
  };

  // Tick down while running; ring the bell at zero.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const next = remainingRef.current - 1;
      if (next > 0) {
        setClock(next);
        return;
      }
      setClock(0);
      setRunning(false);
      chime();
      const plannedStart =
        startedAtRef.current ?? Date.now() - mode.minutes * 60_000;
      startedAtRef.current = null;
      if (mode.kind === "focus") {
        void logSession({
          subject: subject.trim() || undefined,
          minutes: mode.minutes,
          mode: mode.id,
          startedAt: plannedStart,
        });
        toast.success(`${mode.minutes} minutes in the book`, {
          description: subject.trim()
            ? `${subject.trim()} — done. Switch subjects, or rest.`
            : "Done. Switch subjects, or rest.",
        });
      } else {
        toast("Break's over", {
          description: "Back to the desk — pick the next subject.",
        });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, mode, subject, logSession]);

  const progress = remaining / total;
  const mm = Math.floor(Math.max(remaining, 0) / 60);
  const ss = Math.max(remaining, 0) % 60;

  const toggle = () => {
    if (remaining <= 0) {
      // Finished — begin a fresh session.
      startedAtRef.current = Date.now();
      setClock(total);
      setRunning(true);
      return;
    }
    if (!running && remaining === total) {
      startedAtRef.current = Date.now();
    }
    setRunning((r) => !r);
  };

  const reset = () => {
    setRunning(false);
    setClock(total);
    startedAtRef.current = null;
  };

  return (
    <section className="paper relative overflow-hidden rounded-sm p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="font-archive text-[10px] text-primary">
            Entry 02 · Focus timer
          </span>
          <h2 className="mt-2 text-2xl font-medium">Ring the bell</h2>
        </div>
        <span className="stamp rotate-2 text-[9px]">
          {running ? "Running" : "At rest"}
        </span>
      </div>

      {/* Presets */}
      <div className="mt-6 flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => selectMode(m)}
            className={`font-archive rounded-sm border px-3 py-2 text-[10px] transition-colors ${
              m.id === modeId
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background/60 text-muted-foreground hover:border-primary/60 hover:text-foreground"
            }`}
          >
            {m.label} · {m.minutes}′
          </button>
        ))}
      </div>

      <div className="mt-8 grid items-center gap-8 sm:grid-cols-[auto_1fr]">
        {/* Dial */}
        <div className="relative mx-auto size-56">
          <svg viewBox="0 0 220 220" className="size-full -rotate-90">
            <circle
              cx="110"
              cy="110"
              r={RADIUS}
              fill="none"
              stroke="var(--border)"
              strokeWidth="10"
            />
            <circle
              cx="110"
              cy="110"
              r={RADIUS}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
              style={{ transition: "stroke-dashoffset 0.9s linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-archive text-[9px] text-muted-foreground">
              {mode.label}
            </span>
            <span className="font-mono text-5xl font-bold tracking-wider">
              {mm}:{String(ss).padStart(2, "0")}
            </span>
            <span className="mt-1 text-sm italic text-muted-foreground">
              {subject.trim() || "no subject set"}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-5">
          <p className="text-[15px] leading-7 text-foreground/75">{mode.hint}</p>

          <label className="block">
            <span className="font-archive text-[10px] text-muted-foreground">
              Subject on the desk
            </span>
            <Input
              list="study-subjects"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Physics"
              className="mt-1.5 bg-background/70"
            />
            <datalist id="study-subjects">
              {subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={toggle}
              className="gap-2 rounded-sm"
              size="lg"
            >
              {running ? (
                <>
                  <Pause className="size-4" /> Pause
                </>
              ) : (
                <>
                  <Play className="size-4" />{" "}
                  {remaining === total ? "Start session" : "Resume"}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={reset}
              className="gap-2 rounded-sm"
              size="lg"
            >
              <RotateCcw className="size-4" /> Reset
            </Button>
          </div>

          <p className="font-archive text-[9px] leading-5 text-muted-foreground">
            Finished sessions are written to today&apos;s page automatically ·
            Bell rings with a soft chime
          </p>
        </div>
      </div>
    </section>
  );
}
