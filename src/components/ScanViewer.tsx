import { useEffect, useState } from "react";

import { signedScanUrl } from "../lib/api";
import type { RecipeImage } from "../lib/types";

export default function ScanViewer({ images }: { images: RecipeImage[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all(images.map((image) => signedScanUrl(image.storage_path)))
      .then((signed) => {
        if (active) setUrls(signed);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      });
    return () => {
      active = false;
    };
  }, [images]);

  if (error) return <p className="error">{error}</p>;
  if (urls.length === 0) return <p className="note">Loading the scan…</p>;

  return (
    <div className="scans">
      {urls.map((url, index) => (
        <img key={url} src={url} alt={`Original recipe card, page ${index + 1}`} />
      ))}
    </div>
  );
}
