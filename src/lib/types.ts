// Shapes shared by the database, the Edge Function, and the UI.
// The `translated` column of public.translations holds a TranslatedRecipe.

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

export type RecipeStatus = "uploaded" | "processing" | "translated" | "failed";

export interface Recipe {
  id: string;
  family_id: string;
  created_by: string | null;
  title: string | null;
  attributed_to: string | null;
  source_note: string | null;
  status: RecipeStatus;
  error_message: string | null;
  is_public: boolean;
  share_slug: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeImage {
  id: string;
  recipe_id: string;
  storage_path: string;
  position: number;
  mime_type: string | null;
  byte_size: number | null;
  created_at: string;
}

export interface Translation {
  id: string;
  recipe_id: string;
  version: number;
  transcription: string | null;
  translated: TranslatedRecipe;
  notes: string | null;
  model: string | null;
  created_at: string;
}

export interface InterviewQuestion {
  id: string;
  recipe_id: string;
  question: string;
  rationale: string | null;
  position: number;
  created_at: string;
}

export interface Family {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}
