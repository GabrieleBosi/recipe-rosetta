import { useEffect, useState } from "react";

export default function ScanViewer({ scan }: { scan: Blob }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(scan);
    setUrl(objectUrl);
    // Without this the blob stays in memory for the life of the page.
    return () => URL.revokeObjectURL(objectUrl);
  }, [scan]);

  if (!url) return <p className="note">Loading the scan…</p>;

  return (
    <div className="scans">
      <img src={url} alt="The original recipe card" />
    </div>
  );
}
