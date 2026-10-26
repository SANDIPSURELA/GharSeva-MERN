import { createWorker } from "tesseract.js";
import english from "@tesseract.js-data/eng";
import sharp from "sharp";
import { fail } from "./domain.js";
let occupied = false;
export async function prepareIdentityImage(file) {
  if (!file || !file.buffer?.length)
    fail(400, "Upload the required document image.");
  try {
    const image = sharp(file.buffer, {
      limitInputPixels: 12000000,
      failOn: "error",
    });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format) || (meta.pages || 1) > 1)
      fail(400, "Use a single JPG, PNG or WebP image.");
    if (meta.width < 500 || meta.height < 300)
      fail(400, "The image is too small. Use at least 500 × 300 pixels.");
    // Decode and re-encode; uploaded metadata and active formats are never retained.
    return await image
      .rotate()
      .resize({
        width: 1800,
        height: 1400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch (e) {
    if (e.status) throw e;
    fail(
      400,
      "This image is damaged or too large to decode. Use a clear JPG, PNG or WebP.",
    );
  }
}
export async function readIdentityImages(front, back) {
  if (occupied)
    fail(503, "The document reader is busy. Please try again shortly.");
  occupied = true;
  let worker,
    timer,
    stopped = false;
  try {
    const read = async () => {
      worker = await createWorker("eng", 1, {
        langPath: english.langPath,
        gzip: true,
        cacheMethod: "none",
        logger: () => {},
        errorHandler: () => {},
      });
      if (stopped) {
        await worker.terminate();
        throw new Error("OCR request ended.");
      }
      const a = await worker.recognize(front),
        b = back ? await worker.recognize(back) : null;
      return {
        frontText: a.data.text,
        backText: b?.data.text || "",
        confidence: a.data.confidence,
      };
    };
    return await Promise.race([
      read(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Object.assign(
                new Error(
                  "The document reader timed out. Try a clearer image.",
                ),
                { status: 503 },
              ),
            ),
          40000,
        );
      }),
    ]);
  } finally {
    stopped = true;
    clearTimeout(timer);
    if (worker) await worker.terminate().catch(() => {});
    occupied = false;
  }
}
