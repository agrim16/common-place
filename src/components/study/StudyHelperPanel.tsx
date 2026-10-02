import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  BookOpen,
  FileUp,
  Loader2,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type Message = { role: "you" | "helper"; text: string };

const QUICK_PROMPTS = [
  "How am I doing today?",
  "What should I study next?",
  "Plan my evening",
  "Give me a revision trick",
];

/**
 * Study Buddy: a Gemini-backed helper that can see the student's day, plus
 * the note library it can be pointed at ("upload your notes").
 */
export function StudyHelperPanel() {
  const [tab, setTab] = useState<"ask" | "notes">("ask");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteId, setNoteId] = useState<Id<"notes"> | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  // Notes tab state
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const notes = useQuery(api.study.listNotes);
  const ask = useAction(api.ai.askStudyHelper);
  const createNote = useMutation(api.study.createNote);
  const removeNote = useMutation(api.study.deleteNote);

  const selectedNote = notes?.find((n) => n._id === noteId) ?? null;

  const send = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || busy) return;
    setInput("");
    const history = messages.map((m) => ({
      role: (m.role === "you" ? "user" : "model") as "user" | "model",
      text: m.text,
    }));
    setMessages((prev) => [...prev, { role: "you", text: question }]);
    setBusy(true);
    try {
      const result = await ask({
        question,
        noteId: noteId ?? undefined,
        history,
      });
      setMessages((prev) => [...prev, { role: "helper", text: result.answer }]);
      window.setTimeout(
        () => listEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        60,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The helper could not answer.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 200_000) {
      toast.error("That file is too large — keep notes under 200 KB.");
      return;
    }
    try {
      const text = await file.text();
      setNoteBody((prev) => (prev ? `${prev}\n\n${text}` : text));
      setNoteTitle((prev) => prev || file.name.replace(/\.[^.]+$/, ""));
      toast.success(`${file.name} loaded into the note.`);
    } catch {
      toast.error("Could not read that file — try a .txt or .md.");
    }
    event.target.value = "";
  };

  const handleSaveNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!noteTitle.trim() || !noteBody.trim()) {
      toast.error("A note needs a title and some words.");
      return;
    }
    setSavingNote(true);
    try {
      await createNote({ title: noteTitle.trim(), body: noteBody.trim() });
      setNoteTitle("");
      setNoteBody("");
      toast.success("Note filed in the library.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <section className="paper flex h-full flex-col rounded-sm p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="font-archive text-[10px] text-primary">
            Study Buddy · Helper
          </span>
          <h2 className="mt-2 text-2xl font-medium">Ask the study helper</h2>
        </div>
        <div className="flex gap-1.5">
          {(["ask", "notes"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`font-archive rounded-sm border px-3 py-2 text-[10px] transition-colors ${
                tab === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "ask" ? "Ask" : `Notes${notes?.length ? ` (${notes.length})` : ""}`}
            </button>
          ))}
        </div>
      </div>

      {tab === "ask" ? (
        <div className="mt-5 flex flex-1 flex-col">
          {/* Context selector */}
          {notes && notes.length > 0 && (
            <label className="block">
              <span className="font-archive text-[10px] text-muted-foreground">
                Use a note as context
              </span>
              <select
                value={noteId ?? ""}
                onChange={(e) =>
                  setNoteId(
                    e.target.value ? (e.target.value as Id<"notes">) : null,
                  )
                }
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background/80 px-3 text-sm"
              >
                <option value="">No note — general questions</option>
                {notes.map((n) => (
                  <option key={n._id} value={n._id}>
                    {n.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Transcript */}
          <div className="mt-4 max-h-72 min-h-40 overflow-y-auto rounded-sm border border-border/70 bg-[#fdfaf1] p-4">
            {messages.length === 0 ? (
              <div className="flex h-full min-h-32 flex-col items-start justify-center gap-3">
                <p className="text-[15px] italic leading-7 text-muted-foreground">
                  The helper knows your focus minutes, timetable and open
                  reminders — ask about your progress, your next subject, or
                  anything in your notes.
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void send(prompt)}
                      className="font-archive rounded-sm border border-border bg-background/70 px-2.5 py-1.5 text-[9px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="space-y-3">
                {messages.map((message, index) => (
                  <li
                    key={index}
                    className={
                      message.role === "you" ? "text-right" : "text-left"
                    }
                  >
                    <span
                      className={`font-archive text-[9px] ${
                        message.role === "you"
                          ? "text-muted-foreground"
                          : "text-primary"
                      }`}
                    >
                      {message.role === "you" ? "You" : "Helper"}
                    </span>
                    <p
                      className={`whitespace-pre-wrap text-[15px] leading-7 ${
                        message.role === "you"
                          ? "text-foreground/80"
                          : "text-foreground"
                      }`}
                    >
                      {message.text}
                    </p>
                  </li>
                ))}
                {busy && (
                  <li className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    <span className="font-archive text-[9px]">
                      Consulting the helper…
                    </span>
                  </li>
                )}
                <div ref={listEndRef} />
              </ul>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="mt-3 flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                selectedNote
                  ? `Ask about “${selectedNote.title}”…`
                  : "Ask about your progress, a topic, a plan…"
              }
              disabled={busy}
              maxLength={4000}
            />
            <Button
              type="submit"
              disabled={busy || !input.trim()}
              className="gap-1.5 rounded-sm"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Send className="size-4" /> Ask
                </>
              )}
            </Button>
          </form>
          <p className="font-archive mt-3 text-[9px] leading-5 text-muted-foreground">
            Powered by Gemini · answers use today&apos;s data
            {selectedNote ? " and the selected note" : ""}
          </p>
        </div>
      ) : (
        /* ------------------------------ Notes tab ------------------------------ */
        <div className="mt-5">
          <form
            onSubmit={handleSaveNote}
            className="rounded-sm border border-dashed border-primary/50 bg-background/50 p-4"
          >
            <div className="flex items-center justify-between">
              <span className="font-archive text-[10px] text-muted-foreground">
                Upload or paste notes
              </span>
              <label className="font-archive inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-[9px] text-foreground transition-colors hover:border-primary hover:text-primary">
                <FileUp className="size-3.5" />
                Upload .txt / .md
                <input
                  type="file"
                  accept=".txt,.md,.markdown,text/plain,text/markdown"
                  className="hidden"
                  onChange={(e) => void handleFile(e)}
                />
              </label>
            </div>
            <Input
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Title — e.g. Physics Chapter 4"
              maxLength={120}
              className="mt-3 bg-background/80"
            />
            <Textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Paste or write your notes here…"
              rows={5}
              maxLength={30_000}
              className="mt-2 resize-y bg-background/80"
            />
            <Button
              type="submit"
              disabled={savingNote}
              className="mt-3 w-full gap-1.5 rounded-sm"
            >
              {savingNote ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <BookOpen className="size-4" /> File it in the library
                </>
              )}
            </Button>
          </form>

          {notes && notes.length > 0 && (
            <ul className="mt-4 divide-y divide-border/70">
              {notes.map((note) => (
                <li key={note._id} className="group flex items-start gap-3 py-3">
                  <Sparkles
                    className={`mt-1 size-4 shrink-0 ${
                      noteId === note._id ? "text-primary" : "text-border"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-medium">
                      {note.title}
                    </p>
                    <p className="truncate text-sm italic text-muted-foreground">
                      {note.body.slice(0, 90)}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setNoteId(note._id);
                        setTab("ask");
                        toast(`Now asking about “${note.title}”.`);
                      }}
                      className="font-archive mt-1.5 text-[9px] text-primary underline-offset-4 hover:underline"
                    >
                      Ask the helper about this →
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete note"
                    onClick={() =>
                      void removeNote({ id: note._id }).catch((error) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Could not delete.",
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
          {notes && notes.length === 0 && (
            <p className="mt-4 text-[15px] italic leading-7 text-muted-foreground">
              No notes yet. Upload a chapter or paste your own — the helper can
              then answer from them.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
