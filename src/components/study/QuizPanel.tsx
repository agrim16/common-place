import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { Check, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Question = {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 20;
const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

/** Stable empty so `?? []` doesn't rewire hook deps every render. */
const NO_ATTEMPTS: {
  _id: Id<"quizAttempts">;
  topic: string;
  total: number;
  correct: number;
  createdAt: number;
}[] = [];

/**
 * Study Buddy · Quiz — Gemini writes a multiple-choice quiz on any topic (or
 * from one of the student's own notes), answers are checked as they go, and
 * the finished mark is filed in the record.
 */
export function QuizPanel() {
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState<number>(5);

  /** Any number the student likes, clamped to what one paper can hold. */
  const questionCount = Math.min(
    Math.max(Number.isFinite(count) ? Math.trunc(count) : MIN_QUESTIONS, MIN_QUESTIONS),
    MAX_QUESTIONS,
  );
  const [noteId, setNoteId] = useState<Id<"notes"> | null>(null);
  const [busy, setBusy] = useState(false);

  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [quizTopic, setQuizTopic] = useState("");
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [finished, setFinished] = useState(false);

  const notes = useQuery(api.study.listNotes);
  const attempts = useQuery(api.study.listQuizAttempts) ?? NO_ATTEMPTS;
  const generate = useAction(api.ai.generateQuiz);
  const record = useMutation(api.study.recordQuizAttempt);

  /** Guards the "file the score once" effect. */
  const filedRun = useRef("");

  const question = questions?.[index] ?? null;
  const total = questions?.length ?? 0;

  const correctCount = useMemo(() => {
    if (!questions) return 0;
    return answers.reduce<number>(
      (sum, answer, i) =>
        sum + (answer !== null && answer === questions[i]?.answerIndex ? 1 : 0),
      0,
    );
  }, [answers, questions]);

  useEffect(() => {
    if (!finished || !questions) return;
    if (filedRun.current === quizTopic + total) return;
    filedRun.current = quizTopic + total;
    void record({
      topic: quizTopic,
      total: questions.length,
      correct: correctCount,
    }).catch(() => toast.error("That mark could not be filed."));
  }, [finished, questions, quizTopic, total, correctCount, record]);

  const startQuiz = async () => {
    const trimmed = topic.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const result = await generate({
        topic: trimmed,
        count: questionCount,
        noteId: noteId ?? undefined,
      });
      setQuestions(result.questions);
      setQuizTopic(result.topic);
      setIndex(0);
      setPicked(null);
      setAnswers(result.questions.map(() => null));
      setFinished(false);
      filedRun.current = "";
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The quiz could not be set.",
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setQuestions(null);
    setPicked(null);
    setFinished(false);
  };

  const choose = (optionIndex: number) => {
    if (picked !== null || !questions) return;
    setPicked(optionIndex);
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = optionIndex;
      return next;
    });
  };

  const advance = () => {
    if (!questions) return;
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }
    setFinished(true);
  };

  /* ----------------------------- Setting the paper ----------------------------- */
  if (!questions) {
    return (
      <section className="paper flex h-full flex-col rounded-sm p-6 sm:p-7">
        <span className="font-archive text-[10px] text-primary">
          Study Buddy · Quiz
        </span>
        <h2 className="mt-2 text-2xl font-medium">Be quizzed on anything</h2>
        <p className="mt-2 text-[15px] italic leading-7 text-muted-foreground">
          Name a topic and the examiner will set a fresh multiple-choice paper
          for you — or point it at one of your own notes and it will question
          you on that instead.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="quiz-topic"
              className="font-archive text-[10px] text-muted-foreground"
            >
              Topic
            </label>
            <Input
              id="quiz-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void startQuiz();
              }}
              placeholder="e.g. Photosynthesis, or the French Revolution"
              maxLength={200}
              disabled={busy}
              className="mt-1 bg-background/80"
            />
          </div>

          {notes && notes.length > 0 && (
            <div>
              <label
                htmlFor="quiz-note"
                className="font-archive text-[10px] text-muted-foreground"
              >
                Question it from
              </label>
              <select
                id="quiz-note"
                value={noteId ?? ""}
                onChange={(e) =>
                  setNoteId(
                    e.target.value ? (e.target.value as Id<"notes">) : null,
                  )
                }
                disabled={busy}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background/80 px-3 text-sm"
              >
                <option value="">The examiner's own knowledge</option>
                {notes.map((note) => (
                  <option key={note._id} value={note._id}>
                    Your note: {note.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label
              htmlFor="quiz-count"
              className="font-archive text-[10px] text-muted-foreground"
            >
              How many questions
            </label>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                id="quiz-count"
                type="number"
                inputMode="numeric"
                min={MIN_QUESTIONS}
                max={MAX_QUESTIONS}
                step={1}
                value={count}
                disabled={busy}
                onChange={(e) => setCount(Number(e.target.value))}
                className="h-9 w-20 rounded-md border border-input bg-background/80 px-3 text-sm"
              />
              <span className="font-archive text-[9px] leading-5 text-muted-foreground">
                Any amount, up to {MAX_QUESTIONS} in one paper.
              </span>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => void startQuiz()}
            disabled={busy || !topic.trim()}
            className="w-full gap-1.5 rounded-sm"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Setting the paper…
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Set the {questionCount}-question quiz
              </>
            )}
          </Button>
        </div>

        {attempts.length > 0 && (
          <div className="mt-6 border-t border-dashed border-border pt-4">
            <span className="font-archive text-[10px] text-muted-foreground">
              Past papers
            </span>
            <ul className="mt-2 divide-y divide-border/70">
              {attempts.map((attempt) => (
                <li
                  key={attempt._id}
                  className="flex items-baseline justify-between gap-3 py-2"
                >
                  <span className="truncate text-[15px]">{attempt.topic}</span>
                  <span className="font-archive shrink-0 text-[10px] text-muted-foreground">
                    {attempt.correct}/{attempt.total}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    );
  }

  /* ------------------------------ The mark ------------------------------ */
  if (finished) {
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const verdict =
      pct >= 80
        ? "Distinction work."
        : pct >= 50
          ? "Solid. Read the misses once more."
          : "Worth another paper on this topic.";
    const missed = questions
      .map((q, i) => ({ q, picked: answers[i] }))
      .filter((entry) => entry.picked !== entry.q.answerIndex);

    return (
      <section className="paper flex h-full flex-col rounded-sm p-6 sm:p-7">
        <span className="font-archive text-[10px] text-primary">
          Study Buddy · Marked
        </span>
        <h2 className="mt-2 text-2xl font-medium">{quizTopic}</h2>

        <div className="mt-5 rounded-sm border border-border bg-secondary/50 p-5 text-center">
          <span className="font-archive text-[10px] text-muted-foreground">
            Mark
          </span>
          <p className="font-mono mt-2 text-4xl font-bold">
            {correctCount}
            <span className="text-2xl text-muted-foreground">/{total}</span>
          </p>
          <p className="font-archive mt-1 text-[10px] text-muted-foreground">
            {pct}%
          </p>
          <p className="mt-3 text-[15px] italic leading-7 text-foreground/80">
            {verdict}
          </p>
        </div>

        {missed.length > 0 && (
          <ul className="mt-5 divide-y divide-border/70">
            {missed.map(({ q, picked: answer }, i) => (
              <li key={i} className="py-3">
                <p className="text-[15px] font-medium">{q.prompt}</p>
                <p className="mt-1 text-sm text-destructive">
                  Your answer:{" "}
                  {answer === null ? "—" : q.options[answer]}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Answer: {q.options[q.answerIndex]}
                </p>
                {q.explanation && (
                  <p className="mt-1 text-[15px] italic leading-7 text-foreground/75">
                    {q.explanation}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <Button
          type="button"
          onClick={reset}
          className="mt-6 w-full gap-1.5 rounded-sm"
        >
          <RotateCcw className="size-4" /> Another paper
        </Button>
      </section>
    );
  }

  /* ------------------------------ A question ------------------------------ */
  if (!question) return null;

  const correct = picked === question.answerIndex;
  const showResult = picked !== null;

  return (
    <section className="paper flex h-full flex-col rounded-sm p-6 sm:p-7">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-archive text-[10px] text-primary">
          Study Buddy · Quiz
        </span>
        <span className="font-archive text-[9px] text-muted-foreground">
          Question {index + 1} of {total}
        </span>
      </div>

      <Progress
        value={((index + (showResult ? 1 : 0)) / total) * 100}
        className="mt-3 h-1.5"
        aria-label="Quiz progress"
      />

      <p className="font-archive mt-2 text-[10px] italic text-muted-foreground">
        {quizTopic}
      </p>

      <h2 className="mt-3 text-xl leading-8 sm:text-2xl">{question.prompt}</h2>

      <ul className="mt-5 space-y-2">
        {question.options.map((option, optionIndex) => {
          const isAnswer = optionIndex === question.answerIndex;
          const isPicked = optionIndex === picked;
          const tone = !showResult
            ? "border-border bg-background/70 hover:border-primary hover:bg-background"
            : isAnswer
              ? "border-primary bg-primary/15 text-foreground"
              : isPicked
                ? "border-destructive/60 bg-destructive/10 text-foreground"
                : "border-border/60 bg-background/40 text-muted-foreground";

          return (
            <li key={optionIndex}>
              <button
                type="button"
                disabled={showResult}
                onClick={() => choose(optionIndex)}
                className={`flex w-full items-start gap-3 rounded-sm border px-3.5 py-3 text-left text-[15px] leading-6 transition-colors ${tone}`}
              >
                <span className="font-mono mt-0.5 shrink-0 text-xs">
                  {LETTERS[optionIndex] ?? optionIndex + 1}
                </span>
                <span className="flex-1">{option}</span>
                {showResult && isAnswer && (
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                )}
                {showResult && isPicked && !isAnswer && (
                  <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {showResult && (
        <p
          className={`mt-4 text-[15px] italic leading-7 ${
            correct ? "text-primary" : "text-destructive"
          }`}
        >
          {correct ? "Correct. " : "Not this time. "}
          {question.explanation}
        </p>
      )}

      <div className="mt-auto flex items-center gap-3 pt-6">
        {showResult ? (
          <>
            <Button
              type="button"
              onClick={advance}
              className="w-full gap-1.5 rounded-sm"
            >
              {index + 1 < total ? "Next question" : "See the mark"}
            </Button>
            <button
              type="button"
              onClick={reset}
              className="font-archive shrink-0 text-[9px] text-muted-foreground underline-offset-4 hover:underline"
            >
              Abandon
            </button>
          </>
        ) : (
          <p className="font-archive text-[9px] leading-5 text-muted-foreground">
            Pick an answer to see the explanation.
          </p>
        )}
      </div>
    </section>
  );
}