import { Link, Route, Routes } from "react-router-dom";

import Library from "./pages/Library";
import RecipePage from "./pages/RecipePage";

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="wordmark-link">
          <h1 className="wordmark">Recipe Rosetta</h1>
        </Link>
        <span className="note">Your cards stay in this browser</span>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/recipe/:recipeId" element={<RecipePage />} />
          <Route
            path="*"
            element={<p className="note">That page does not exist.</p>}
          />
        </Routes>
      </main>
    </div>
  );
}
