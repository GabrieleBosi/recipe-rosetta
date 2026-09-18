// The instructions that turn a photo of a handwritten card into a modern,
// cookable recipe. Kept apart from the transport code so it is easy to tune.

export const SYSTEM_INSTRUCTION = `
You read photographs of handwritten family recipe cards and rewrite them as
precise, modern, cookable recipes.

How to read the card:
- Transcribe what is written, exactly as written, before you interpret it.
- Keep the original spelling, dialect words, and abbreviations in the
  transcription. Mark what you cannot read as [illegible].
- Do not invent text that is not on the card.

How to translate the recipe:
- Give every ingredient a gram or millilitre quantity. Keep the original
  measure next to it, because the family will recognise it.
- Convert vague measures ("a teacup of flour", "butter the size of an egg")
  to the usual modern equivalent, and say in the notes that you did so.
- Give oven temperatures in Celsius, with the Fahrenheit value in brackets.
  Convert old descriptive settings ("a slow oven", "gas mark 4").
- Give a time for each step that needs one.
- Replace ingredients that are no longer sold with a modern substitute.
  Explain each substitution.
- Where the card gives no quantity, no time, or no temperature, use the usual
  value for that kind of dish, and record the choice as an assumption.

Family context:
- You are given answers from the family about who cooked this and how. Use
  them. They are more reliable than your general knowledge.
- Where an answer is missing and it changes the result, write an open question.
  Ask about the cook, the occasion, the equipment, and the expected look,
  smell, or texture. Keep each question short and answerable.
- You may be shown the questions already on file. Any of those that is still
  worth asking, repeat word for word, exactly as written. Do not reword it and
  do not ask the same thing in other words. Add a question only for something
  the list does not already cover.

Write plain, direct English. Do not add commentary outside the JSON fields.
`.trim();

export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "Recipe name, from the card if given." },
    transcription: {
      type: "STRING",
      description: "Verbatim reading of the handwriting, line by line.",
    },
    attributed_to: {
      type: "STRING",
      description: "Person named on the card, or an empty string.",
    },
    servings: { type: "STRING" },
    total_time_minutes: { type: "NUMBER" },
    ingredients: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          item: { type: "STRING" },
          quantity_metric: { type: "STRING", description: "e.g. 240 g" },
          quantity_original: { type: "STRING", description: "As on the card." },
          note: { type: "STRING" },
        },
        required: ["item", "quantity_metric"],
      },
    },
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          instruction: { type: "STRING" },
          time_minutes: { type: "NUMBER" },
          temperature_c: { type: "NUMBER" },
        },
        required: ["instruction"],
      },
    },
    substitutions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          original: { type: "STRING" },
          modern: { type: "STRING" },
          reason: { type: "STRING" },
        },
        required: ["original", "modern", "reason"],
      },
    },
    assumptions: {
      type: "ARRAY",
      description: "Choices you made that the card does not state.",
      items: { type: "STRING" },
    },
    open_questions: {
      type: "ARRAY",
      description: "Questions for the family, most useful first. At most six.",
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          rationale: { type: "STRING", description: "Which gap this closes." },
        },
        required: ["question", "rationale"],
      },
    },
    confidence: {
      type: "STRING",
      description: "How readable the card was: high, medium, or low.",
    },
  },
  required: ["title", "transcription", "ingredients", "steps", "confidence"],
} as const;

export interface RecipeContext {
  title?: string | null;
  attributedTo?: string | null;
  sourceNote?: string | null;
  answers: { question: string; answer: string }[];
  /** Questions already stored and still unanswered. */
  openQuestions: string[];
}

export function buildPrompt(context: RecipeContext): string {
  const lines: string[] = [
    "Read the attached photograph(s) of one handwritten recipe card and return the JSON object.",
  ];

  const given: string[] = [];
  if (context.title) given.push(`Working title: ${context.title}`);
  if (context.attributedTo) given.push(`Whose recipe it was: ${context.attributedTo}`);
  if (context.sourceNote) given.push(`Where the card came from: ${context.sourceNote}`);

  if (given.length > 0) {
    lines.push("", "What the family already told us:", ...given.map((g) => `- ${g}`));
  }

  if (context.answers.length > 0) {
    lines.push("", "Answers from the family interview:");
    for (const entry of context.answers) {
      lines.push(`- Q: ${entry.question}`, `  A: ${entry.answer}`);
    }
    lines.push(
      "",
      "Use these answers. Do not ask them again. Ask only what is still open.",
    );
  } else {
    lines.push(
      "",
      "The family has not answered any questions yet. List the questions that",
      "would most improve this recipe in open_questions.",
    );
  }

  if (context.openQuestions.length > 0) {
    lines.push("", "Questions already on file, still unanswered:");
    for (const question of context.openQuestions) lines.push(`- ${question}`);
    lines.push(
      "",
      "Return each of these that is still worth asking word for word.",
      "Add a question only for something they do not already cover.",
    );
  }

  return lines.join("\n");
}
