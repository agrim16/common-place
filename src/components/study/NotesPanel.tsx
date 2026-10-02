import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ACCEPTED_IMAGE_EXTENSIONS,
  formatBytes,
  MAX_PDF_BYTES,
  prepareNoteImage,
  readPdfAsChunks,
} from "@/lib/study";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  BookOpen,
  Check,
  FileText,
  FileUp,
  ImageIcon,
  Loader2,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type RenameKind = "note" | "photo" | "file";

/** Visible focus ring for every control in this panel. */
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background";

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Study Buddy · Notes — the student's library: written notes, photographs of
 * notebook pages and PDFs. Every action here is reachable by keyboard, every
 * icon button carries a name, and long operations announce themselves.
 */
export function NotesPanel() {
  const navigate = useNavigate();

  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [renaming, setRenaming] = useState<{ kind: RenameKind; id: string } | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [busyPhoto, setBusyPhoto] = useState<string | null>(null);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameTriggerRef = useRef<HTMLButtonElement | null>(null);

  const notes = useQuery(api.study.listNotes);
  const photos = useQuery(api.study.listNoteImages);
  const files = useQuery(api.study.listNoteFiles);

  const createNote = useMutation(api.study.createNote);
  const deleteNote = useMutation(api.study.deleteNote);
  const renameNote = useMutation(api.study.renameNote);
  const createNoteImage = useMutation(api.study.createNoteImage);
  const deleteNoteImage = useMutation(api.study.deleteNoteImage);
  const renameNoteImage = useMutation(api.study.renameNoteImage);
  const createNoteFile = useMutation(api.study.createNoteFile);
  const putNoteFileChunk = useMutation(api.study.putNoteFileChunk);
  const deleteNoteFile = useMutation(api.study.deleteNoteFile);
  const renameNoteFile = useMutation(api.study.renameNoteFile);
  const summarisePhoto = useAction(api.ai.summarizePhoto);
  const summariseFile = useAction(api.ai.summarizeFile);

  const askAbout = (kind: RenameKind, id: string) => {
    const param = kind === "note" ? "note" : kind === "photo" ? "photo" : "pdf";
    navigate(`/dashboard?tab=helper&${param}=${id}`);
  };

  const startRename = (
    kind: RenameKind,
    id: string,
    title: string,
    trigger: HTMLButtonElement,
  ) => {
    renameTriggerRef.current = trigger;
    setRenaming({ kind, id });
    setRenameValue(title);
    window.setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const cancelRename = () => {
    setRenaming(null);
    renameTriggerRef.current?.focus();
  };

  const commitRename = async () => {
    if (!renaming) return;
    const title = renameValue.trim();
    const { kind, id } = renaming;
    setRenaming(null);
    renameTriggerRef.current?.focus();
    if (!title) return;
    try {
      if (kind === "note") await renameNote({ id: id as Id<"notes">, title });
      else if (kind === "photo")
        await renameNoteImage({ id: id as Id<"noteImages">, title });
      else await renameNoteFile({ id: id as Id<"noteFiles">, title });
      setStatus(`Renamed to ${title}.`);
      toast.success("Renamed.");
    } catch (error) {
      toast.error(message(error, "Could not rename."));
    }
  };

  const handleTextFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 200_000) {
      toast.error("That file is too large — keep text notes under 200 KB.");
      return;
    }
    try {
      const text = await file.text();
      setNoteBody((prev) => (prev ? `${prev}\n\n${text}` : text));
      setNoteTitle((prev) => prev || file.name.replace(/\.[^.]+$/, ""));
      setStatus(`${file.name} loaded into the note editor.`);
      toast.success(`${file.name} loaded into the note.`);
    } catch {
      toast.error("Could not read that file — try a .txt or .md.");
    }
  };

  const handleImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 20_000_000) {
      toast.error("That image is too large — keep photos under 20 MB.");
      return;
    }
    setUploadingImage(true);
    setStatus(`Preparing ${file.name}…`);
    try {
      const { data, thumb } = await prepareNoteImage(file);
      const id = await createNoteImage({
        title: file.name.replace(/\.[^.]+$/, "") || "Photographed notes",
        mimeType: "image/jpeg",
        data,
        thumb,
      });
      setStatus(`${file.name} added. Reading the page…`);
      toast.success(`${file.name} added — reading it now…`);
      setBusyPhoto(id);
      const result = await summarisePhoto({ imageId: id });
      setStatus(`${file.name} summarised: ${result.summary.slice(0, 160)}`);
      toast.success(`“${file.name}” summarised.`, {
        description: result.summary.slice(0, 140),
      });
    } catch (error) {
      toast.error(message(error, "Could not read that image."));
    } finally {
      setBusyPhoto(null);
      setUploadingImage(false);
      setStatus("");
    }
  };

  const handlePdf = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingPdf(true);
    setStatus(`Filing ${file.name}…`);
    try {
      const { chunks, bytes } = await readPdfAsChunks(file);
      const id = await createNoteFile({
        title: file.name.replace(/\.[^.]+$/, "") || "Worksheet",
        mimeType: "application/pdf",
        bytes,
        chunkCount: chunks.length,
      });
      for (const [index, data] of chunks.entries()) {
        setStatus(
          `Filing ${file.name} — part ${index + 1} of ${chunks.length}…`,
        );
        await putNoteFileChunk({ fileId: id, index, data });
      }
      setStatus(`${file.name} filed. Reading the document…`);
      toast.success(`${file.name} filed — reading it now…`);
      setBusyFile(id);
      const result = await summariseFile({ fileId: id });
      setStatus(`${file.name} summarised: ${result.summary.slice(0, 160)}`);
      toast.success(`“${file.name}” summarised.`, {
        description: result.summary.slice(0, 140),
      });
    } catch (error) {
      toast.error(message(error, "Could not read that PDF."));
    } finally {
      setBusyFile(null);
      setUploadingPdf(false);
      setStatus("");
    }
  };

  const readPhoto = async (id: Id<"noteImages">, name: string) => {
    setBusyPhoto(id);
    setStatus(`Reading ${name}…`);
    try {
      const result = await summarisePhoto({ imageId: id });
      setStatus(`${name} summarised: ${result.summary.slice(0, 160)}`);
    } catch (error) {
      toast.error(message(error, "That page could not be summarised."));
    } finally {
      setBusyPhoto(null);
      setStatus("");
    }
  };

  const readFile = async (id: Id<"noteFiles">, name: string) => {
    setBusyFile(id);
    setStatus(`Reading ${name}…`);
    try {
      const result = await summariseFile({ fileId: id });
      setStatus(`${name} summarised: ${result.summary.slice(0, 160)}`);
    } catch (error) {
      toast.error(message(error, "That document could not be summarised."));
    } finally {
      setBusyFile(null);
      setStatus("");
    }
  };

  const saveNote = async (event: React.FormEvent<HTMLFormElement>) => {
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
      setStatus("Note filed in the library.");
      toast.success("Note filed in the library.");
    } catch (error) {
      toast.error(message(error, "Could not save."));
    } finally {
      setSavingNote(false);
    }
  };

  const isRenaming = (kind: RenameKind, id: string) =>
    renaming?.kind === kind && renaming.id === id;

  return (
    <section
      className="paper flex h-full flex-col rounded-sm p-6 sm:p-7"
      aria-labelledby="notes-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="font-archive text-[10px] text-primary">
            Study Buddy · Notes
          </span>
          <h2 id="notes-heading" className="mt-2 text-2xl font-medium">
            Your library
          </h2>
        </div>
        <p className="font-archive text-[9px] text-muted-foreground">
          {notes?.length ?? 0} written · {photos?.length ?? 0} photos ·{" "}
          {files?.length ?? 0} PDFs
        </p>
      </div>

      {/* Announcements for uploads, summaries and renames. */}
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      {/* ---------------------------- Written notes ---------------------------- */}
      <section aria-labelledby="written-notes-heading" className="mt-6">
        <h3
          id="written-notes-heading"
          className="font-archive text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          Written notes
        </h3>

        <form
          onSubmit={saveNote}
          className="mt-2.5 rounded-sm border border-dashed border-primary/50 bg-background/50 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-archive text-[10px] text-muted-foreground">
              Write it, paste it, or upload .txt / .md
            </span>
            <input
              ref={textInputRef}
              type="file"
              accept=".txt,.md,.markdown,text/plain,text/markdown"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => void handleTextFile(e)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`gap-1.5 rounded-sm ${FOCUS}`}
              onClick={() => textInputRef.current?.click()}
            >
              <FileUp className="size-3.5" />
              Choose a text file
            </Button>
          </div>

          <div className="mt-3">
            <label htmlFor="note-title" className="sr-only">
              Note title
            </label>
            <Input
              id="note-title"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Title — e.g. Physics Chapter 4"
              maxLength={120}
              className="bg-background/80"
            />
          </div>
          <div className="mt-2">
            <label htmlFor="note-body" className="sr-only">
              Note body
            </label>
            <Textarea
              id="note-body"
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Paste or write your notes here…"
              rows={4}
              maxLength={30_000}
              className="resize-y bg-background/80"
            />
          </div>

          <Button
            type="submit"
            disabled={savingNote}
            className={`mt-3 w-full gap-1.5 rounded-sm ${FOCUS}`}
          >
            {savingNote ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Filing…
              </>
            ) : (
              <>
                <BookOpen className="size-4" /> File it in the library
              </>
            )}
          </Button>
        </form>

        {notes && notes.length > 0 && (
          <ul aria-label="Your written notes" className="mt-4 divide-y divide-border/70">
            {notes.map((note) => (
              <li key={note._id} className="flex items-start gap-3 py-3">
                <Sparkles className="mt-1 size-4 shrink-0 text-border" />
                <div className="min-w-0 flex-1">
                  {isRenaming("note", note._id) ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename();
                          if (e.key === "Escape") cancelRename();
                        }}
                        maxLength={120}
                        aria-label={`Rename note ${note.title}`}
                        className={`w-full rounded-sm border border-input bg-background px-2 py-1 text-[16px] ${FOCUS}`}
                      />
                      <button
                        type="button"
                        aria-label="Save name"
                        onClick={() => void commitRename()}
                        className={`shrink-0 rounded-sm p-1 text-primary ${FOCUS}`}
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        className={`font-archive shrink-0 px-1 text-[9px] text-muted-foreground underline-offset-4 hover:underline ${FOCUS}`}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => askAbout("note", note._id)}
                      className={`block w-full truncate text-left text-[16px] font-medium hover:text-primary ${FOCUS}`}
                    >
                      {note.title}
                    </button>
                  )}
                  <p className="truncate text-sm italic text-muted-foreground">
                    {note.body.slice(0, 110)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Rename note ${note.title}`}
                      title="Rename"
                      onClick={(e) => startRename("note", note._id, note.title, e.currentTarget)}
                      className={`rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary ${FOCUS}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => askAbout("note", note._id)}
                      className={`font-archive text-[9px] text-primary underline-offset-4 hover:underline ${FOCUS}`}
                    >
                      Ask the helper about this →
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Delete note ${note.title}`}
                  title="Delete"
                  onClick={() =>
                    void deleteNote({ id: note._id }).catch((error) =>
                      toast.error(message(error, "Could not delete.")),
                    )
                  }
                  className={`shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive ${FOCUS}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {notes && notes.length === 0 && (
          <p className="mt-4 text-[15px] italic leading-7 text-muted-foreground">
            No written notes yet. The first one you file goes at the top.
          </p>
        )}
      </section>

      {/* ------------------------------ Photos ------------------------------ */}
      <section aria-labelledby="photo-notes-heading" className="mt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3
            id="photo-notes-heading"
            className="font-archive flex items-center gap-1.5 text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <ImageIcon className="size-3.5" /> Photos of your notes
          </h3>
          <input
            ref={imageInputRef}
            type="file"
            accept={`${ACCEPTED_IMAGE_EXTENSIONS},image/*`}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void handleImage(e)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadingImage}
            className={`gap-1.5 rounded-sm ${FOCUS}`}
            onClick={() => imageInputRef.current?.click()}
          >
            {uploadingImage ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileUp className="size-3.5" />
            )}
            {uploadingImage ? "Preparing…" : "Add a photo"}
          </Button>
        </div>
        <p className="font-archive mt-1.5 text-[9px] leading-5 text-muted-foreground">
          PNG, JPG, WebP, GIF, BMP or HEIC. Each page is read by the AI and
          summarised for you.
        </p>

        {photos && photos.length > 0 ? (
          <ul
            aria-label="Photos of your notes"
            className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {photos.map((photo) => (
              <li
                key={photo._id}
                className="overflow-hidden rounded-sm border border-border"
              >
                <button
                  type="button"
                  onClick={() => askAbout("photo", photo._id)}
                  className={`block w-full text-left ${FOCUS}`}
                >
                  <img
                    src={`data:image/jpeg;base64,${photo.thumb}`}
                    alt={`Photographed notes: ${photo.title}`}
                    className="h-20 w-full object-cover"
                  />
                </button>

                <div className="px-2 py-1.5">
                  {isRenaming("photo", photo._id) ? (
                    <div className="flex items-center gap-1">
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename();
                          if (e.key === "Escape") cancelRename();
                        }}
                        maxLength={120}
                        aria-label={`Rename photo ${photo.title}`}
                        className={`w-full rounded-sm border border-input bg-background px-1.5 py-1 text-[13px] ${FOCUS}`}
                      />
                      <button
                        type="button"
                        aria-label="Save name"
                        onClick={() => void commitRename()}
                        className={`shrink-0 rounded-sm p-1 text-primary ${FOCUS}`}
                      >
                        <Check className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="block truncate text-[13px]">
                      {photo.title}
                    </span>
                  )}

                  {busyPhoto === photo._id ? (
                    <span className="font-archive mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      Reading the page…
                    </span>
                  ) : photo.summary ? (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 italic text-muted-foreground">
                      {photo.summary}
                    </p>
                  ) : null}

                  <div className="mt-1.5 flex items-center gap-1 border-t border-dashed border-border/70 pt-1.5">
                    <button
                      type="button"
                      aria-label={`Rename photo ${photo.title}`}
                      title="Rename"
                      onClick={(e) =>
                        startRename("photo", photo._id, photo.title, e.currentTarget)
                      }
                      className={`rounded-sm p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary ${FOCUS}`}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Ask the helper about ${photo.title}`}
                      title="Ask the helper"
                      onClick={() => askAbout("photo", photo._id)}
                      className={`rounded-sm p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary ${FOCUS}`}
                    >
                      <BookOpen className="size-3.5" />
                    </button>
                    {!photo.summary && (
                      <button
                        type="button"
                        aria-label={`Read ${photo.title} again`}
                        title="Read this page again"
                        onClick={() => void readPhoto(photo._id, photo.title)}
                        className={`rounded-sm p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary ${FOCUS}`}
                      >
                        <Sparkles className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Delete photo ${photo.title}`}
                      title="Delete"
                      onClick={() =>
                        void deleteNoteImage({ id: photo._id }).catch((error) =>
                          toast.error(message(error, "Could not delete.")),
                        )
                      }
                      className={`rounded-sm p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive ${FOCUS}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[15px] italic leading-7 text-muted-foreground">
            No photos yet. Snap a page of your notebook — the helper reads the
            handwriting, and the quiz can be set straight from it.
          </p>
        )}
      </section>

      {/* -------------------------------- PDFs -------------------------------- */}
      <section aria-labelledby="pdf-notes-heading" className="mt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3
            id="pdf-notes-heading"
            className="font-archive flex items-center gap-1.5 text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <FileText className="size-3.5" /> PDFs · worksheets &amp; past papers
          </h3>
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void handlePdf(e)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadingPdf}
            className={`gap-1.5 rounded-sm ${FOCUS}`}
            onClick={() => pdfInputRef.current?.click()}
          >
            {uploadingPdf ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileUp className="size-3.5" />
            )}
            {uploadingPdf ? "Filing…" : `Add a PDF (max ${formatBytes(MAX_PDF_BYTES)})`}
          </Button>
        </div>

        {files && files.length > 0 ? (
          <ul aria-label="Your PDFs" className="mt-3 divide-y divide-border/70">
            {files.map((file) => (
              <li key={file._id} className="flex items-start gap-3 py-3">
                <FileText className="mt-1 size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  {isRenaming("file", file._id) ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename();
                          if (e.key === "Escape") cancelRename();
                        }}
                        maxLength={120}
                        aria-label={`Rename PDF ${file.title}`}
                        className={`w-full rounded-sm border border-input bg-background px-2 py-1 text-[16px] ${FOCUS}`}
                      />
                      <button
                        type="button"
                        aria-label="Save name"
                        onClick={() => void commitRename()}
                        className={`shrink-0 rounded-sm p-1 text-primary ${FOCUS}`}
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        className={`font-archive shrink-0 px-1 text-[9px] text-muted-foreground underline-offset-4 hover:underline ${FOCUS}`}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => askAbout("file", file._id)}
                      className={`block w-full truncate text-left text-[16px] font-medium hover:text-primary ${FOCUS}`}
                    >
                      {file.title}
                    </button>
                  )}
                  <span className="font-archive text-[9px] text-muted-foreground">
                    PDF · {formatBytes(file.bytes)}
                  </span>

                  {busyFile === file._id ? (
                    <span className="font-archive mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      Reading the document…
                    </span>
                  ) : file.summary ? (
                    <p className="mt-1 line-clamp-2 text-[13px] leading-5 italic text-muted-foreground">
                      {file.summary}
                    </p>
                  ) : null}

                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Rename PDF ${file.title}`}
                      title="Rename"
                      onClick={(e) =>
                        startRename("file", file._id, file.title, e.currentTarget)
                      }
                      className={`rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary ${FOCUS}`}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Ask the helper about ${file.title}`}
                      title="Ask the helper"
                      onClick={() => askAbout("file", file._id)}
                      className={`rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary ${FOCUS}`}
                    >
                      <BookOpen className="size-3.5" />
                    </button>
                    {!file.summary && (
                      <button
                        type="button"
                        aria-label={`Read ${file.title} again`}
                        title="Read this document again"
                        onClick={() => void readFile(file._id, file.title)}
                        className={`rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary ${FOCUS}`}
                      >
                        <Sparkles className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Delete PDF ${file.title}`}
                  title="Delete"
                  onClick={() =>
                    void deleteNoteFile({ id: file._id }).catch((error) =>
                      toast.error(message(error, "Could not delete.")),
                    )
                  }
                  className={`shrink-0 rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive ${FOCUS}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[15px] italic leading-7 text-muted-foreground">
            No PDFs yet. Upload a worksheet or past paper (up to{" "}
            {formatBytes(MAX_PDF_BYTES)}) — it is summarised on arrival.
          </p>
        )}
      </section>

      <p className="font-archive mt-auto border-t border-dashed border-border pt-4 text-[9px] leading-5 text-muted-foreground">
        Tip: every control here works with the keyboard — Tab to move, Enter to
        confirm, Escape to cancel a rename.
      </p>
    </section>
  );
}