import { pad2 } from "@/lib/study";
import { Fragment } from "react";

/**
 * A split-flap station clock: walnut board, parchment flaps, each digit
 * flipping as it changes. Driven by the dashboard's 1-second clock.
 */
export function FlipClock({ now }: { now: number }) {
  const date = new Date(now);
  const digits = `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(
    date.getSeconds(),
  )}`.split("");

  return (
    <section className="paper rounded-sm p-5">
      <div className="flex items-center justify-between">
        <span className="font-archive text-[10px] text-primary">
          The flip clock
        </span>
        <span className="font-archive text-[9px] text-muted-foreground">
          {date.getHours() < 12 ? "Morning" : "Evening"} ·{" "}
          {date.getHours() < 12 ? "AM" : "PM"}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-center gap-1.5">
        <span className="sr-only">{date.toLocaleTimeString()}</span>
        {digits.map((char, index) => (
          <Fragment key={index}>
            {index > 0 && index % 2 === 0 && (
              <span className="font-mono text-xl font-bold text-primary/70">
                :
              </span>
            )}
            <span
              key={`${index}-${char}`}
              className="flip-digit"
              aria-hidden
            >
              {char}
            </span>
          </Fragment>
        ))}
      </div>
      <p className="font-archive mt-4 text-center text-[9px] text-muted-foreground">
        {date.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </p>
    </section>
  );
}
