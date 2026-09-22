// Photographs go straight from the browser to a Netlify function, so their size
// is our problem now. A phone picture can be several megabytes, and base64
// inflates it by a third before it is even sent.
//
// Shrinking here keeps the request small and costs nothing in readability: a
// recipe card is legible far below the resolution a modern camera produces.

const MAX_EDGE = 1600;
const QUALITY = 0.82;

export interface PreparedScan {
  blob: Blob;
  mimeType: string;
}

export async function prepareScan(file: File): Promise<PreparedScan> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Chiefly HEIC from an iPhone, which most browsers cannot decode.
    throw new Error(
      "This browser cannot read that image. Save the photograph as JPEG or " +
        "PNG and try again.",
    );
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser would not give us a canvas.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) throw new Error("The photograph could not be prepared.");

  return { blob, mimeType: "image/jpeg" };
}

/** Base64 without the data-URL prefix, which is what Gemini wants. */
export function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("The photograph could not be read."));
    reader.readAsDataURL(blob);
  });
}
