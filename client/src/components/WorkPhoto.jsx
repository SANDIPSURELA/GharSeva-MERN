import { useState } from "react";
import { workPhotoPlaceholder } from "../../../shared/work-images.js";

// A failed upload/sample falls back to a neutral illustration, never another
// person's work or a portrait. Prop changes automatically allow the new URL.
export function WorkPhoto({ photo, showCaption = false, loading = "lazy" }) {
  const [failedSource, setFailedSource] = useState(null);
  const unavailable = !photo?.src || failedSource === photo.src;
  return (
    <>
      <img
        src={unavailable ? workPhotoPlaceholder : photo.src}
        alt={
          unavailable
            ? photo
              ? "Work photograph unavailable"
              : "No work photograph provided"
            : photo.alt
        }
        loading={loading}
        className={
          unavailable ? "work-photo work-photo--placeholder" : "work-photo"
        }
        onError={() => {
          if (photo?.src && failedSource !== photo.src)
            setFailedSource(photo.src);
        }}
      />
      {showCaption && (
        <span className="cover-caption work-photo-caption">
          {unavailable
            ? photo
              ? "Photo unavailable"
              : "No work photo yet"
            : photo.label}
        </span>
      )}
    </>
  );
}
