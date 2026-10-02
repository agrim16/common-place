import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  WEEKDAYS,
  WEEKDAY_SHORT,
  minutesOfDay,
  to12h,
  type TimetableEntry,
} from "@/lib/study";

export function TimetablePanel({
  entries,
  now,
}: {
  entries: TimetableEntry[];
  now: number;
}) {
  const todayIdx = new Date(now).getDay();
  const [day, setDay] = useState(todayIdx);
  const [adding, setAdding] = useState(false);

  const createEntry = useMutation(api.study.createTimetableEntry);
  const deleteEntry = useMutation(api.study.deleteTimetableEntry);

  const nowMinutes = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const dayEntries = entries
    .filter((e) => e.day === day)
    .sort((a, b) => minutesOfDay(a.startTime) - minutesOfDay(b.startTime));

  const currentEntry =
    day === todayIdx
      ? dayEntries.find(
          (e) =>
            minutesOfDay(e.startTime) <= nowMinutes &&
            minutesOfDay(e.endTime) > nowMinutes,
        )
      : undefined;
  const nextEntry =
    day === todayIdx
      ? dayEntries.find((e) => minutesOfDay(e.startTime) > nowMinutes)
      : undefined;

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const subject = String(form.get("subject") ?? "").trim();
    const note = String(form.get("note") ?? "").trim();
    const startTime = String(form.get("startTime") ?? "");
    const endTime = String(form.get("endTime") ?? "");
    const formDay = Number(form.get("day"));

    if (!subject) {
      toast.error("Name the subject first.");
      return;
    }
    if (startTime >= endTime) {
      toast.error("A period must end after it begins.");
      return;
    }
    try {
      await createEntry({
        day: formDay,
        subject,
        note: note || undefined,
        startTime,
        endTime,
      });
      setAdding(false);
      toast.success(`${subject} added to ${WEEKDAYS[formDay]}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    }
  };

  const handleDelete = async (
    id: Id<"timetableEntries">,
    subject: string,
  ) => {
    try {
      await deleteEntry({ id });
      toast(`${subject} crossed off.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete.");
    }
  };

  return (
    <section className="paper rounded-sm p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="font-archive text-[10px] text-primary">
            Entry 01 · Timetable
          </span>
          <h2 className="mt-2 text-2xl font-medium">The week&apos;s periods</h2>
        </div>
        <Button
          type="button"
          variant={adding ? "ghost" : "outline"}
          size="sm"
          className="gap-1.5 rounded-sm"
          onClick={() => setAdding((a) => !a)}
        >
          {adding ? (
            <>
              <X className="size-4" /> Cancel
            </>
          ) : (
            <>
              <Plus className="size-4" /> Add period
            </>
          )}
        </Button>
      </div>

      {/* Day picker */}
      <div className="mt-5 flex gap-1.5 overflow-x-auto pb-1">
        {WEEKDAY_SHORT.map((short, idx) => (
          <button
            key={short}
            type="button"
            onClick={() => setDay(idx)}
            className={`font-archive shrink-0 rounded-sm border px-3.5 py-2 text-[10px] transition-colors ${
              idx === day
                ? "border-primary bg-primary text-primary-foreground"
                : idx === todayIdx
                  ? "border-dashed border-primary/60 text-primary hover:bg-primary/10"
                  : "border-border text-muted-foreground hover:text-foreground"
            }`}
            title={WEEKDAYS[idx]}
          >
            {short}
            {idx === todayIdx ? " ·" : ""}
          </button>
        ))}
      </div>

      {/* Add form */}
      {adding && (
        <form
          onSubmit={handleCreate}
          className="mt-5 grid gap-3 rounded-sm border border-dashed border-primary/50 bg-background/50 p-4 sm:grid-cols-2"
        >
          <label className="block sm:col-span-2">
            <span className="font-archive text-[10px] text-muted-foreground">
              Subject
            </span>
            <Input
              name="subject"
              placeholder="e.g. Mathematics"
              maxLength={80}
              required
              className="mt-1 bg-background/80"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="font-archive text-[10px] text-muted-foreground">
              Note (optional)
            </span>
            <Input
              name="note"
              placeholder="e.g. Chapter 4 — Trigonometry"
              maxLength={140}
              className="mt-1 bg-background/80"
            />
          </label>
          <label className="block">
            <span className="font-archive text-[10px] text-muted-foreground">
              Starts
            </span>
            <Input
              type="time"
              name="startTime"
              defaultValue="16:00"
              required
              className="mt-1 bg-background/80"
            />
          </label>
          <label className="block">
            <span className="font-archive text-[10px] text-muted-foreground">
              Ends
            </span>
            <Input
              type="time"
              name="endTime"
              defaultValue="17:00"
              required
              className="mt-1 bg-background/80"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="font-archive text-[10px] text-muted-foreground">
              Day
            </span>
            <select
              name="day"
              defaultValue={day}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background/80 px-3 text-sm"
            >
              {WEEKDAYS.map((name, idx) => (
                <option key={name} value={idx}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" className="sm:col-span-2 rounded-sm">
            Write it in the book
          </Button>
        </form>
      )}

      {/* The day, ruled */}
      <div className="mt-6">
        {dayEntries.length === 0 ? (
          <div className="ruled rounded-sm border border-border/70 bg-[#fdfaf1] py-6 pl-12 pr-4">
            <div className="flex h-32 items-start pt-3">
              <p className="text-[15px] italic text-muted-foreground">
                {WEEKDAYS[day]} is a clean page — add the first period above.
              </p>
            </div>
          </div>
        ) : (
          <ul className="ruled rounded-sm border border-border/70 bg-[#fdfaf1] pl-12 pr-3">
            {dayEntries.map((entry) => {
              const isCurrent = currentEntry?._id === entry._id;
              const isNext = nextEntry?._id === entry._id;
              return (
                <li
                  key={entry._id}
                  className={`group relative flex min-h-12 items-center justify-between gap-3 border-b border-border/40 py-2 last:border-b-0 ${
                    isCurrent ? "bg-primary/8" : ""
                  }`}
                >
                  <span
                    className={`absolute -left-9 top-1/2 size-1.5 -translate-y-1/2 rounded-full ${
                      isCurrent ? "bg-primary" : "bg-border"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-archive text-[10px] text-primary">
                        {to12h(entry.startTime)} – {to12h(entry.endTime)}
                      </span>
                      <span className="truncate text-[17px] font-medium">
                        {entry.subject}
                      </span>
                      {isCurrent && (
                        <span className="stamp rotate-[-3deg] text-[8px]">
                          Now
                        </span>
                      )}
                      {isNext && !isCurrent && (
                        <span className="font-archive text-[9px] text-muted-foreground">
                          Next
                        </span>
                      )}
                    </div>
                    {entry.note && (
                      <p className="truncate text-sm italic text-muted-foreground">
                        {entry.note}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete ${entry.subject}`}
                    onClick={() => handleDelete(entry._id, entry.subject)}
                    className="shrink-0 rounded-sm p-2 text-muted-foreground opacity-0 transition-all hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
