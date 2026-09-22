// Shapes shared by the Netlify function and the UI.

export interface Ingredient {
  item: string;
  /** Modern measure, e.g. "240 g". */
  quantity_metric: string;
  /** What the card said, e.g. "1 teacup". */
  quantity_original?: string;
  note?: string;
}

export interface Step {
  instruction: string;
  time_minutes?: number;
  temperature_c?: number;
}

export interface Substitution {
  original: string;
  modern: string;
  reason: string;
}

export interface TranslatedRecipe {
  title?: string;
  attributed_to?: string;
  servings?: string;
  total_time_minutes?: number;
  ingredients?: Ingredient[];
  steps?: Step[];
  substitutions?: Substitution[];
  assumptions?: string[];
  confidence?: string;
}

export interface OpenQuestion {
  question: string;
  rationale: string;
}

export type RecipeStatus = "translating" | "translated" | "failed";

/**
 * One card. This is the whole record: the scan, what the handwriting says, and
 * the modern recipe. It lives in this browser's IndexedDB and nowhere else.
 */
export interface Recipe {
  id: string;
  title: string | null;
  attributedTo: string | null;
  sourceNote: string | null;
  status: RecipeStatus;
  errorMessage: string | null;
  createdAt: string;
  /** The downscaled photograph, held as a blob. */
  scan: Blob;
  scanMimeType: string;
  transcription: string | null;
  translated: TranslatedRecipe | null;
  openQuestions: OpenQuestion[];
  model: string | null;
}
