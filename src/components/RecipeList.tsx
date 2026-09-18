import { Link } from "react-router-dom";

import type { Recipe } from "../lib/types";

const STATUS_LABEL: Record<Recipe["status"], string> = {
  uploaded: "Not translated yet",
  processing: "Reading…",
  translated: "Translated",
  failed: "Failed",
};

export default function RecipeList({ recipes }: { recipes: Recipe[] }) {
  if (recipes.length === 0) {
    return (
      <section className="panel">
        <h2>Your cards</h2>
        <p className="note">Nothing here yet. Add your first card above.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Your cards</h2>
      <ul className="recipe-list">
        {recipes.map((recipe) => (
          <li key={recipe.id}>
            <Link to={`/recipe/${recipe.id}`}>
              <span className="recipe-title">{recipe.title ?? "Untitled card"}</span>
              {recipe.attributed_to && (
                <span className="recipe-attribution">{recipe.attributed_to}</span>
              )}
              <span className={`badge badge-${recipe.status}`}>
                {STATUS_LABEL[recipe.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
