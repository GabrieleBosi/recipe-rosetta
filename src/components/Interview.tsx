import { useMemo, useState } from "react";

import { saveAnswers, translateRecipe } from "../lib/api";
import type { InterviewAnswer, InterviewQuestion } from "../lib/types";

interface Props {
  recipeId: string;
  userId: string;
  questions: InterviewQuestion[];
  answers: InterviewAnswer[];
  /** Reload the recipe once a new translation exists. */
  onTranslated: () => Promise<void> | void;
}

/**
 * What the card does not say.
 *
 * Gemini writes these questions when the handwriting leaves something open.
 * The answers go back into the prompt on the next translation, so the family's
 * memory decides what the card could not.
 */
export default function Interview({
  recipeId,
  userId,
  questions,
  answers,
  onTranslated,
}: Props) {
  const answerByQuestion = useMemo(() => {
    const map = new Map<string, string>();
    for (const answer of answers) map.set(answer.question_id, answer.answer);
    return map;
  }, [answers]);

  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, answerByQuestion.get(q.id) ?? ""]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answeredCount = questions.filter(
    (question) => (drafts[question.id] ?? "").trim().length > 0,
  ).length;

  // Only re-translate when an answer actually changed, so the button does not
  // spend a Gemini call saying the same thing twice.
  const changed = questions.some((question) => {
    const draft = (drafts[question.id] ?? "").trim();
    return draft.length > 0 && draft !== (answerByQuestion.get(question.id) ?? "");
  });

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await saveAnswers(
        recipeId,
        userId,
        questions.map((question) => ({
          questionId: question.id,
          answer: drafts[question.id] ?? "",
        })),
      );
      await translateRecipe(recipeId);
      await onTranslated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  if (questions.length === 0) return null;

  return (
    <section className="panel">
      <h3>What the card does not say</h3>
      <p className="note">
        Answer what you remember. Anything you leave blank stays a guess in the
        translation. {answeredCount} of {questions.length} answered.
      </p>

      <ul className="questions">
        {questions.map((question) => {
          const saved = answerByQuestion.get(question.id);
          return (
            <li key={question.id}>
              <label htmlFor={`q-${question.id}`} className="question-label">
                {question.question}
              </label>
              {question.rationale && <p className="note">{question.rationale}</p>}
              <textarea
                id={`q-${question.id}`}
                rows={2}
                placeholder="I remember that…"
                value={drafts[question.id] ?? ""}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [question.id]: event.target.value,
                  }))
                }
              />
              {saved && <p className="answered">Answered</p>}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="primary"
        onClick={onSubmit}
        disabled={busy || !changed}
      >
        {busy ? "Translating again…" : "Use these answers and translate again"}
      </button>

      {!changed && !busy && (
        <p className="note">
          Add or change an answer to translate again.
        </p>
      )}
      {busy && (
        <p className="note">This takes about half a minute. Keep the tab open.</p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
