/**
 * Client-side image compression utility using HTML Canvas.
 * Compresses image files to max 2048px on longest edge at 0.85 quality.
 * Non-image files (PDF, DOCX, etc.) are returned untouched.
 */
export async function compressImageIfNeeded(file, maxDimension = 2048, quality = 0.85) {
  if (!file || !file.type || !file.type.startsWith("image/")) {
    return file;
  }

  // Skip SVG or tiny images (< 200KB)
  if (file.type.includes("svg") || file.size < 200 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width <= maxDimension && height <= maxDimension) {
        if (file.size <= 1024 * 1024) {
          resolve(file);
          return;
        }
      }

      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
          } else {
            const compressedFile = new File([blob], file.name, {
              type: mimeType,
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          }
        },
        mimeType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}
