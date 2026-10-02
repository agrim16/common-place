import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import { BookOpen, Loader2, Send } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type Message = { role: "you" | "helper"; text: string };

/** Which library item the Notes tab handed over, if any. */
export type HelperAttachment = {
  note?: string;
  photo?: string;
  pdf?: string;
};

const QUICK_PROMPTS = [
  "How am I doing today?",
  "What should I study next?",
  "Plan my evening",
  "Give me a revision trick",
];

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background";

/**
 * Study Buddy: a Gemini-backed helper that can see the student's day and any
 * note, note photo or PDF they point it at. The library itself lives in the
 * Notes tab.
 */
export function StudyHelperPanel({
  attachment,
}: {
  attachment?: HelperAttachment;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteId, setNoteId] = useState<Id<"notes"> | null>(
    () => (attachment?.note as Id<"notes"> | undefined) ?? null,
  );
  const [photoId, setPhotoId] = useState<Id<"noteImages"> | null>(
    () => (attachment?.photo as Id<"noteImages"> | undefined) ?? null,
  );
  const [fileId, setFileId] = useState<Id<"noteFiles"> | null>(
    () => (attachment?.pdf as Id<"noteFiles"> | undefined) ?? null,
  );
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const notes = useQuery(api.study.listNotes);
  const photos = useQuery(api.study.listNoteImages);
  const files = useQuery(api.study.listNoteFiles);
  const ask = useAction(api.ai.askStudyHelper);

  /* Arriving from the Notes tab with something selected is handled by the
     caller's `key`, which remounts this panel for a new hand-off. */

  const selectedNote = notes?.find((n) => n._id === noteId) ?? null;
  const selectedPhoto = photos?.find((p) => p._id === photoId) ?? null;
  const selectedFile = files?.find((f) => f._id === fileId) ?? null;

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
        photoIds: photoId ? [photoId] : undefined,
        fileIds: fileId ? [fileId] : undefined,
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
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <section
      className="paper flex h-full flex-col rounded-sm p-6 sm:p-7"
      aria-labelledby="helper-heading"
    >
      <span className="font-archive text-[10px] text-primary">
        Study Buddy · Helper
      </span>
      <h2 id="helper-heading" className="mt-2 text-2xl font-medium">
        Ask the study helper
      </h2>

      {/* ---------------------------- Context ---------------------------- */}
      <div className="mt-5">
        <h3 className="font-archive text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
          What should it read?
        </h3>

        {notes && notes.length > 0 && (
          <div className="mt-2">
            <label
              htmlFor="helper-note"
              className="font-archive text-[10px] text-muted-foreground"
            >
              A written note
            </label>
            <select
              id="helper-note"
              value={noteId ?? ""}
              onChange={(e) =>
                setNoteId(e.target.value ? (e.target.value as Id<"notes">) : null)
              }
              className={`mt-1 flex h-9 w-full rounded-md border border-input bg-background/80 px-3 text-sm ${FOCUS}`}
            >
              <option value="">No note — general questions</option>
              {notes.map((n) => (
                <option key={n._id} value={n._id}>
                  {n.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {photos && photos.length > 0 && (
          <div className="mt-3">
            <label
              htmlFor="helper-photo"
              className="font-archive text-[10px] text-muted-foreground"
            >
              A photo of your notes
            </label>
            <select
              id="helper-photo"
              value={photoId ?? ""}
              onChange={(e) =>
                setPhotoId(
                  e.target.value ? (e.target.value as Id<"noteImages">) : null,
                )
              }
              className={`mt-1 flex h-9 w-full rounded-md border border-input bg-background/80 px-3 text-sm ${FOCUS}`}
            >
              <option value="">No photo</option>
              {photos.map((photo) => (
                <option key={photo._id} value={photo._id}>
                  {photo.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {files && files.length > 0 && (
          <div className="mt-3">
            <label
              htmlFor="helper-pdf"
              className="font-archive text-[10px] text-muted-foreground"
            >
              One of your PDFs
            </label>
            <select
              id="helper-pdf"
              value={fileId ?? ""}
              onChange={(e) =>
                setFileId(
                  e.target.value ? (e.target.value as Id<"noteFiles">) : null,
                )
              }
              className={`mt-1 flex h-9 w-full rounded-md border border-input bg-background/80 px-3 text-sm ${FOCUS}`}
            >
              <option value="">No PDF</option>
              {files.map((file) => (
                <option key={file._id} value={file._id}>
                  {file.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* --------------------------- Transcript --------------------------- */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversation with the study helper"
        className="mt-4 max-h-72 min-h-40 overflow-y-auto rounded-sm border border-border/70 bg-[#fdfaf1] p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full min-h-32 flex-col items-start justify-center gap-3">
            <p className="text-[15px] italic leading-7 text-muted-foreground">
              The helper knows your focus minutes, timetable, open reminders and
              quiz scores — ask about your progress, your next subject, or
              anything in your library.
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void send(prompt)}
                  className={`font-archive rounded-sm border border-border bg-background/70 px-2.5 py-1.5 text-[9px] text-muted-foreground transition-colors hover:border-primary hover:text-primary ${FOCUS}`}
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
                className={message.role === "you" ? "text-right" : "text-left"}
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

      {/* ----------------------------- Composer ----------------------------- */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="mt-3"
      >
        <label htmlFor="helper-question" className="sr-only">
          Your question for the study helper
        </label>
        <div className="flex gap-2">
          <Input
            id="helper-question"
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              selectedNote
                ? `Ask about “${selectedNote.title}”…`
                : selectedPhoto
                  ? `Ask about the photo “${selectedPhoto.title}”…`
                  : selectedFile
                    ? `Ask about “${selectedFile.title}”…`
                    : "Ask about your progress, a topic, a plan…"
            }
            disabled={busy}
            maxLength={4000}
          />
          <Button
            type="submit"
            disabled={busy || !input.trim()}
            className={`gap-1.5 rounded-sm ${FOCUS}`}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-4" /> Ask
              </>
            )}
          </Button>
        </div>
      </form>

      <p className="font-archive mt-3 text-[9px] leading-5 text-muted-foreground">
        Powered by Gemini · answers use today&apos;s data
        {selectedNote ? " and the selected note" : ""}
        {selectedPhoto ? " and the selected photo" : ""}
        {selectedFile ? " and the selected PDF" : ""}
        . Keep your notes in the Notes tab.
      </p>

      <button
        type="button"
        onClick={() => {
          setNoteId(null);
          setPhotoId(null);
          setFileId(null);
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={`font-archive mt-2 self-start text-[9px] text-muted-foreground underline-offset-4 hover:underline ${FOCUS}`}
      >
        <BookOpen className="size-3" /> Clear what it&apos;s reading
      </button>
    </section>
  );
}