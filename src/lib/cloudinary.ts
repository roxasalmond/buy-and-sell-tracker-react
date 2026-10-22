/**
 * Photo upload to Cloudinary (unsigned preset, same account as the live app).
 * The cloud name and preset are not secrets: an unsigned preset can only add images.
 */
const CLOUD_NAME = "dxf5gsnrz";
const UPLOAD_PRESET = "unitphotos";

/** Cloudinary's free plan rejects images above 10 MB. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Returns an error message for a file that should not be uploaded, or null. */
export function photoProblem(file: File): string | null {
  if (!file.type.startsWith("image/")) return "Please choose an image file.";
  if (file.size > MAX_PHOTO_BYTES) return "The photo is larger than 10 MB. Please choose a smaller one.";
  return null;
}

/** Uploads the image and returns its https URL. Throws when the upload fails. */
export async function uploadUnitPhoto(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", UPLOAD_PRESET);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body });
  if (!response.ok) throw new Error("Failed to upload image to Cloudinary");
  const data = (await response.json()) as { secure_url?: unknown };
  if (typeof data.secure_url !== "string") throw new Error("Cloudinary did not return an image URL");
  return data.secure_url;
}
