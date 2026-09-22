import { Link } from "react-router-dom";

import type { Recipe } from "../lib/types";

const STATUS_LABEL: Record<Recipe["status"], string> = {
  translating: "Reading…",
  translated: "Translated",
  failed: "Failed",
};

export default function RecipeList({ recipes }: { recipes: Recipe[] }) {
  return (
    <section className="panel">
      <h2>Your cards</h2>
      {recipes.length === 0
        ? <p className="note">Nothing here yet. Add your first card above.</p>
        : (
          <ul className="recipe-list">
            {recipes.map((recipe) => (
              <li key={recipe.id}>
                <Link to={`/recipe/${recipe.id}`}>
                  <span className="recipe-title">
                    {recipe.title ?? "Untitled card"}
                  </span>
                  {recipe.attributedTo && (
                    <span className="recipe-attribution">{recipe.attributedTo}</span>
                  )}
                  <span className={`badge badge-${recipe.status}`}>
                    {STATUS_LABEL[recipe.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
