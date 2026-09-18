import type { Translation } from "../lib/types";

function formatMinutes(minutes?: number): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function toFahrenheit(celsius: number): number {
  return Math.round((celsius * 9) / 5 + 32);
}

export default function TranslatedRecipeView({
  translation,
}: {
  translation: Translation;
}) {
  const recipe = translation.translated ?? {};
  const totalTime = formatMinutes(recipe.total_time_minutes);

  return (
    <article className="translated">
      <header>
        <h3>{recipe.title ?? "Translated recipe"}</h3>
        <p className="meta">
          {recipe.servings && <span>{recipe.servings}</span>}
          {totalTime && <span>{totalTime}</span>}
          {recipe.confidence && (
            <span>Reading confidence: {recipe.confidence}</span>
          )}
        </p>
      </header>

      {recipe.ingredients && recipe.ingredients.length > 0 && (
        <section>
          <h4>Ingredients</h4>
          <ul className="ingredients">
            {recipe.ingredients.map((ingredient, index) => (
              <li key={index}>
                <span className="quantity">{ingredient.quantity_metric}</span>
                <span className="item">{ingredient.item}</span>
                {ingredient.quantity_original && (
                  <span className="original">
                    card: {ingredient.quantity_original}
                  </span>
                )}
                {ingredient.note && <span className="note">{ingredient.note}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {recipe.steps && recipe.steps.length > 0 && (
        <section>
          <h4>Method</h4>
          <ol className="steps">
            {recipe.steps.map((step, index) => {
              const time = formatMinutes(step.time_minutes);
              return (
                <li key={index}>
                  <p>{step.instruction}</p>
                  {(time || step.temperature_c) && (
                    <p className="step-meta">
                      {time && <span>{time}</span>}
                      {step.temperature_c && (
                        <span>
                          {step.temperature_c} °C ({toFahrenheit(step.temperature_c)} °F)
                        </span>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {recipe.substitutions && recipe.substitutions.length > 0 && (
        <section>
          <h4>Substitutions</h4>
          <ul className="substitutions">
            {recipe.substitutions.map((substitution, index) => (
              <li key={index}>
                <strong>{substitution.original}</strong> → {substitution.modern}
                <span className="note">{substitution.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recipe.assumptions && recipe.assumptions.length > 0 && (
        <section>
          <h4>Assumptions</h4>
          <ul className="assumptions">
            {recipe.assumptions.map((assumption, index) => (
              <li key={index}>{assumption}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className="meta">
        Version {translation.version}
        {translation.model && ` · ${translation.model}`}
      </footer>
    </article>
  );
}
