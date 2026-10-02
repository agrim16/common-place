import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { pad2, to12h, type Reminder } from "@/lib/study";

function describeWhen(timestamp: number, now: number): string {
  const date = new Date(timestamp);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(timestamp);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (diffDays <= 0) return `Today · ${to12h(clock)}`;
  if (diffDays === 1) return `Tomorrow · ${to12h(clock)}`;
  return `${date.getDate()}/${date.getMonth() + 1} · ${to12h(clock)}`;
}

export function RemindersPanel({
  reminders,
  now,
}: {
  reminders: Reminder[];
  now: number;
}) {
  const [adding, setAdding] = useState(false);
  const addReminder = useMutation(api.study.addReminder);
  const setDone = useMutation(api.study.setReminderDone);
  const deleteReminder = useMutation(api.study.deleteReminder);

  const sorted = [...reminders].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.time - b.time;
  });
  const openCount = reminders.filter((r) => !r.done).length;

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const time = String(form.get("time") ?? "");
    if (!title) {
      toast.error("Write the reminder first.");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      toast.error("Pick a time.");
      return;
    }
    const [h, m] = time.split(":").map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    if (target.getTime() <= now) target.setDate(target.getDate() + 1);

    try {
      await addReminder({ title, time: target.getTime() });
      setAdding(false);
      toast.success("Added to the margin.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    }
  };

  return (
    <section className="paper rounded-sm p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="font-archive text-[10px] text-primary">
            Entry 03 · Reminders
          </span>
          <h2 className="mt-2 text-2xl font-medium">In the margin</h2>
        </div>
        <Button
          type="button"
          variant={adding ? "ghost" : "outline"}
          size="sm"
          className="gap-1.5 rounded-sm"
          onClick={() => setAdding((a) => !a)}
        >
          <Plus className="size-4" /> {adding ? "Close" : "Add"}
        </Button>
      </div>

      {adding && (
        <form
          onSubmit={handleCreate}
          className="mt-5 grid gap-3 rounded-sm border border-dashed border-primary/50 bg-background/50 p-4"
        >
          <label className="block">
            <span className="font-archive text-[10px] text-muted-foreground">
              What must not be forgotten
            </span>
            <Input
              name="title"
              placeholder="e.g. Revise Chapter 4 before Friday"
              maxLength={140}
              required
              className="mt-1 bg-background/80"
            />
          </label>
          <label className="block">
            <span className="font-archive text-[10px] text-muted-foreground">
              Time
            </span>
            <Input
              type="time"
              name="time"
              defaultValue="17:00"
              required
              className="mt-1 bg-background/80"
            />
          </label>
          <p className="font-archive text-[9px] text-muted-foreground">
            Past times are kept for tomorrow
          </p>
          <Button type="submit" className="rounded-sm">
            Write it in the margin
          </Button>
        </form>
      )}

      {sorted.length === 0 ? (
        <div className="mt-6 rounded-sm border border-dashed border-border bg-background/40 px-4 py-8 text-center">
          <p className="text-[15px] italic text-muted-foreground">
            Nothing to remember yet. That is either peace, or trouble.
          </p>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-border/70">
          {sorted.map((reminder) => (
            <li key={reminder._id} className="group flex items-start gap-3 py-3">
              <Checkbox
                checked={reminder.done}
                onCheckedChange={(checked) =>
                  void setDone({ id: reminder._id, done: checked === true })
                }
                className="mt-1 rounded-[3px] data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                aria-label={`Mark ${reminder.title} as done`}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-[16px] leading-snug ${
                    reminder.done
                      ? "text-muted-foreground line-through decoration-primary/60"
                      : "text-foreground"
                  }`}
                >
                  {reminder.title}
                </p>
                <p className="font-archive mt-1 text-[9px] text-muted-foreground">
                  {describeWhen(reminder.time, now)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Delete reminder"
                onClick={() =>
                  void deleteReminder({ id: reminder._id }).catch((error) =>
                    toast.error(
                      error instanceof Error ? error.message : "Could not delete.",
                    ),
                  )
                }
                className="shrink-0 rounded-sm p-1.5 text-muted-foreground opacity-0 transition-all hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {reminders.length > 0 && (
        <p className="font-archive mt-4 border-t border-dashed border-border pt-4 text-[9px] text-muted-foreground">
          {openCount} open · {reminders.length - openCount} cleared
        </p>
      )}
    </section>
  );
}
