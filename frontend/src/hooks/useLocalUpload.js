// src/hooks/useLocalUpload.js
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useAuthRequest } from "./useAuthRequest";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export function useLocalUpload() {
  const [uploadProgress, setUploadProgress] = useState({}); // { [fileName]: 0..100 }
  const [errors, setErrors] = useState({}); // { [fileName]: "message" }
  const [files, setFiles] = useState([]); // last files attempted

  // Pull BOTH user and session from the outlet context
  const outlet = useOutletContext() || {};
  const { user, session, showToast } = outlet;

  // IMPORTANT: do NOT pass the user object as overrides here.
  // Use the existing outlet session (or pass { session } explicitly if you prefer).
  const { getAuthHeaders } = useAuthRequest({ session, showToast });

  function validateFile(file) {
    if (!ALLOWED_MIME.has(file.type)) {
      return "Unsupported media type (use PNG, JPEG, or WEBP).";
    }
    if (file.size > MAX_BYTES) {
      return "File too large (max 2 MB).";
    }
    return null;
  }

  // Single-file avatar upload to on-prem backend via XHR (keeps progress events)
  async function uploadAvatarXHR(file, userId) {
    return new Promise((resolve, reject) => {
      if (!session?.access_token) {
        reject(new Error("No auth token. Please sign in again."));
        return;
      }

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/v1/user/${userId}/avatar`, true);
      xhr.timeout = 30000; // 30s

      // Auth-only headers (never set Content-Type with FormData)
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
            resolve({ url: json.url || `/api/v1/user/${userId}/avatar` });
          } catch {
            resolve({ url: `/api/v1/user/${userId}/avatar` });
          }
        } else if (xhr.status === 413) {
          reject(new Error("File too large (max 2 MB)."));
        } else if (xhr.status === 415) {
          reject(new Error("Unsupported media type (use PNG, JPEG, or WEBP)."));
        } else if (xhr.status === 403 || xhr.status === 401) {
          reject(new Error("Unauthorized. Please sign in again."));
        } else if (xhr.status === 422) {
          reject(new Error("Invalid form data. Please try again."));
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload."));
      xhr.onabort = () => reject(new Error("Upload aborted."));
      xhr.ontimeout = () => reject(new Error("Upload timed out."));

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setUploadProgress((prev) => ({ ...prev, [file.name]: pct }));
        }
      };

      const form = new FormData();
      form.append("file", file, file.name);
      xhr.send(form);
    });
  }

  async function handleUploads(newFiles) {
    if (!user?.id) throw new Error("User not logged");

    const list = Array.from(newFiles || []);
    setFiles((prev) => prev.concat(list));

    const results = await Promise.all(
      list.map(async (file) => {
        // reset progress + clear old error for this file
        setUploadProgress((prev) => ({ ...prev, [file.name]: 0 }));
        setErrors((prev) => {
          const { [file.name]: _ignored, ...rest } = prev;
          return rest;
        });

        const v = validateFile(file);
        if (v) {
          setErrors((prev) => ({ ...prev, [file.name]: v }));
          return { error: v, name: file.name };
        }

        try {
          const res = await uploadAvatarXHR(file, user.id);
          setUploadProgress((prev) => ({ ...prev, [file.name]: 100 }));
          return {
            url: res.url || `/api/v1/user/${user.id}/avatar`,
            name: file.name,
            size: file.size,
            type: file.type,
          };
        } catch (err) {
          const msg = err?.message || "Upload failed";
          setErrors((prev) => ({ ...prev, [file.name]: msg }));
          return { error: msg, name: file.name };
        }
      })
    );

    return results;
  }

  const resetErrors = () => setErrors({});
  const clearProgress = () => setUploadProgress({});

  return {
    uploadProgress,
    errors,
    handleUploads,
    hash: files, // keeping your existing API
    resetErrors,
    clearProgress,
  };
}
