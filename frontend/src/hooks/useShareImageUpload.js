// src/hooks/useShareImageUpload.js
import { useCallback, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useAuthRequest } from "./useAuthRequest";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB (must match backend limits)

export function useShareImageUpload() {
  const [uploadProgress, setUploadProgress] = useState(0); // 0..100
  const [error, setError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const outlet = useOutletContext() || {};
  const { session, showToast } = outlet;

  const { getAuthHeaders } = useAuthRequest({ session, showToast });

  const validateFile = useCallback((file) => {
    if (!file) return "No file";
    if (!ALLOWED_MIME.has(file.type)) {
      return "Unsupported media type (use PNG, JPEG, or WEBP).";
    }
    if (file.size > MAX_BYTES) {
      return "File too large (max 8 MB).";
    }
    return null;
  }, []);

  const uploadShareImageXHR = useCallback(
    async (file) => {
      return new Promise((resolve, reject) => {
        if (!session?.access_token) {
          reject(new Error("No auth token. Please sign in again."));
          return;
        }

        const v = validateFile(file);
        if (v) {
          reject(new Error(v));
          return;
        }

        setError(null);
        setUploadProgress(0);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/v1/share/image", true);
        xhr.timeout = 45000; // 45s

        const headers = getAuthHeaders({ includeJsonContentType: false }) || {};
        Object.entries(headers).forEach(([k, v]) => {
          if (k.toLowerCase() !== "content-type") xhr.setRequestHeader(k, v);
        });
        xhr.setRequestHeader("Accept", "application/json");

        xhr.onreadystatechange = () => {
          if (xhr.readyState !== 4) return;

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText || "{}");
              if (!json?.url) {
                reject(new Error("Upload succeeded but no url returned."));
                return;
              }
              // page_url is recommended (OG share page). If missing, we can still proceed.
              setUploadProgress(100);
              setLastResult(json);
              resolve(json);
            } catch {
              reject(new Error("Upload succeeded but response was invalid."));
            }
            return;
          }

          if (xhr.status === 413)
            reject(new Error("File too large (max 8 MB)."));
          else if (xhr.status === 415)
            reject(
              new Error("Unsupported media type (use PNG, JPEG, or WEBP).")
            );
          else if (xhr.status === 403 || xhr.status === 401)
            reject(new Error("Unauthorized. Please sign in again."));
          else if (xhr.status === 422)
            reject(new Error("Invalid form data. Please try again."));
          else reject(new Error(`Upload failed with status ${xhr.status}`));
        };

        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.onabort = () => reject(new Error("Upload aborted."));
        xhr.ontimeout = () => reject(new Error("Upload timed out."));

        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const pct = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(pct);
        };

        const form = new FormData();
        form.append("file", file, file.name);
        xhr.send(form);
      });
    },
    [session?.access_token, validateFile, getAuthHeaders]
  );

  const upload = useCallback(
    async (file) => {
      try {
        const res = await uploadShareImageXHR(file);
        return res;
      } catch (err) {
        const msg = err?.message || "Upload failed";
        setError(msg);
        return { error: msg };
      }
    },
    [uploadShareImageXHR]
  );

  const reset = useCallback(() => {
    setUploadProgress(0);
    setError(null);
    setLastResult(null);
  }, []);

  return {
    uploadProgress,
    error,
    lastResult,
    upload,
    reset,
  };
}
