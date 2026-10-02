import { Progress } from "@/components/ui/progress";
import { api } from "@/convex/_generated/api";
import { levelForXp, romanNumeral } from "@/lib/study";
import { useQuery } from "convex/react";
import { useMemo } from "react";

/** XP, levels and the weekly scoreboard — the Study Buddy marks. */
export function ProgressPanel() {
  const progress = useQuery(api.study.progress);

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 6);
    return d.getTime();
  }, []);
  const board = useQuery(api.study.scoreboard, { since: weekStart });

  const xp = progress?.xp ?? 0;
  const rank = levelForXp(xp);
  const rows = board?.rows ?? [];
  const me = board?.me ?? null;

  return (
    <section className="paper flex h-full flex-col rounded-sm p-6 sm:p-7">
      <span className="font-archive text-[10px] text-primary">
        Study Buddy · XP &amp; scoreboard
      </span>

      {/* Level card */}
      <div className="mt-4 rounded-sm border border-border bg-secondary/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-archive text-[9px] text-muted-foreground">
              Rank
            </p>
            <p className="font-display text-3xl font-semibold leading-none">
              {romanNumeral(rank.level)}
              <span className="ml-2 text-base font-medium italic text-primary">
                {rank.title}
              </span>
            </p>
          </div>
          <span className="stamp rotate-2 text-[9px]">{xp} XP</span>
        </div>
        <Progress
          value={rank.progress}
          className="mt-4 h-2"
          aria-label="Progress toward the next level"
        />
        <p className="font-archive mt-2 text-[9px] text-muted-foreground">
          {rank.into} / {rank.span} XP to level {rank.level + 1} · 1 XP per
          focused minute
        </p>
      </div>

      {/* Scoreboard */}
      <div className="mt-6 flex items-baseline justify-between">
        <h3 className="text-lg font-medium">This week&apos;s scoreboard</h3>
        <span className="font-archive text-[9px] text-muted-foreground">
          7 days
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-[15px] italic leading-7 text-muted-foreground">
          The board is blank — finish a focus session and your name goes up
          first.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-border/70">
          {rows.map((row) => (
            <li
              key={row.userId}
              className={`flex items-center justify-between gap-3 py-2.5 ${
                row.isMe ? "rounded-sm bg-primary/8 px-2 -mx-2" : ""
              }`}
            >
              <div className="flex min-w-0 items-baseline gap-3">
                <span className="font-mono w-6 shrink-0 text-xs text-muted-foreground">
                  {row.rank}.
                </span>
                <span
                  className={`truncate text-[16px] ${
                    row.isMe ? "font-medium text-primary" : ""
                  }`}
                >
                  {row.isMe ? `${row.name} (you)` : row.name}
                </span>
              </div>
              <span className="font-archive shrink-0 text-[10px] text-muted-foreground">
                {row.minutes} min
              </span>
            </li>
          ))}
        </ol>
      )}

      {me && me.rank > rows.length && (
        <div className="mt-3 flex items-center justify-between rounded-sm border border-dashed border-primary/50 px-3 py-2">
          <span className="truncate text-[15px]">
            {me.rank}. {me.name} (you)
          </span>
          <span className="font-archive text-[10px] text-muted-foreground">
            {me.minutes} min
          </span>
        </div>
      )}

      <p className="font-archive mt-auto border-t border-dashed border-border pt-4 text-[9px] leading-5 text-muted-foreground">
        Scoreboard ranks focused minutes logged this week — no streak guilt,
        just the record.
      </p>
    </section>
  );
}
