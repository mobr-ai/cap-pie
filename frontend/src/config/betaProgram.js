// src/config/betaProgram.js

function envEnabled(name, fallback = true) {
  const raw = import.meta.env[name];

  if (raw === undefined || raw === null || raw === "") {
    return !!fallback;
  }

  const value = String(raw).trim().toLowerCase();

  return !["0", "false", "no", "off", "disabled"].includes(value);
}

export const BETA_PROGRAM_ENABLED = envEnabled(
  "VITE_CAP_BETA_PROGRAM_ENABLED",
  true,
);

export const BETA_ADMIN_TAB_ENABLED = envEnabled(
  "VITE_CAP_BETA_ADMIN_TAB_ENABLED",
  BETA_PROGRAM_ENABLED,
);
