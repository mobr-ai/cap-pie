// src/components/landing/UserAvatar.jsx
import React, { memo, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartLine, faCube } from "@fortawesome/free-solid-svg-icons";

export const USER_AVATAR_SETTINGS_KEY = "chat_user_avatar";
export const USER_AVATAR_LOCAL_STORAGE_KEY = "cap.chatUserAvatar";

export const USER_AVATAR_OPTIONS = [
  {
    value: "image",
    labelKey: "settingsChatAvatar.options.image.label",
    descriptionKey: "settingsChatAvatar.options.image.description",
  },
  {
    value: "emoji:user",
    labelKey: "settingsChatAvatar.options.emojiUser.label",
    descriptionKey: "settingsChatAvatar.options.emojiUser.description",
  },
  {
    value: "emoji:sparkles",
    labelKey: "settingsChatAvatar.options.emojiSparkles.label",
    descriptionKey: "settingsChatAvatar.options.emojiSparkles.description",
  },
  {
    value: "emoji:rocket",
    labelKey: "settingsChatAvatar.options.emojiRocket.label",
    descriptionKey: "settingsChatAvatar.options.emojiRocket.description",
  },
  {
    value: "icon:cube",
    labelKey: "settingsChatAvatar.options.iconCube.label",
    descriptionKey: "settingsChatAvatar.options.iconCube.description",
  },
  {
    value: "icon:chart",
    labelKey: "settingsChatAvatar.options.iconChart.label",
    descriptionKey: "settingsChatAvatar.options.iconChart.description",
  },
  {
    value: "none",
    labelKey: "settingsChatAvatar.options.none.label",
    descriptionKey: "settingsChatAvatar.options.none.description",
  },
];

const DEFAULT_USER_EMOJI = "\uD83D\uDC64"; // 👤

const EMOJI_BY_VALUE = {
  "emoji:user": DEFAULT_USER_EMOJI,
  "emoji:sparkles": "✨",
  "emoji:rocket": "🚀",
};

const ICON_BY_VALUE = {
  "icon:cube": faCube,
  "icon:chart": faChartLine,
};

const VALID_VALUES = new Set(USER_AVATAR_OPTIONS.map((option) => option.value));

function normalizePreference(value) {
  const key = String(value || "").trim();

  // Legacy "auto" now behaves as Profile photo.
  if (!key || key === "auto") return "image";

  return VALID_VALUES.has(key) ? key : "image";
}

export function safeParseUserSettings(settings) {
  if (!settings) return {};
  if (typeof settings === "object") return settings;

  try {
    return JSON.parse(settings);
  } catch {
    return {};
  }
}

function cleanUrl(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function getUserAvatarImage(user) {
  const settings = safeParseUserSettings(user?.settings);

  // Supported CAP user shape only:
  // - settings.avatar: uploaded/custom avatar stored by CAP settings flow
  // - user.avatar: avatar returned by backend, including Google OAuth avatar
  return cleanUrl(settings.avatar) || cleanUrl(user?.avatar);
}

export function getUserChatAvatarPreference(user) {
  const settings = safeParseUserSettings(user?.settings);
  const rawSettingsValue = settings[USER_AVATAR_SETTINGS_KEY];

  if (rawSettingsValue && rawSettingsValue !== "auto") {
    return normalizePreference(rawSettingsValue);
  }

  try {
    const stored = window.localStorage.getItem(USER_AVATAR_LOCAL_STORAGE_KEY);
    if (stored && stored !== "auto") return normalizePreference(stored);
  } catch {
    // localStorage can be unavailable in strict privacy contexts.
  }

  return "image";
}

export function resolveUserAvatar(user, preference) {
  const selected = normalizePreference(
    preference || getUserChatAvatarPreference(user),
  );

  if (selected === "none") {
    return { kind: "none", preference: selected };
  }

  if (selected === "image") {
    const imageUrl = getUserAvatarImage(user);

    if (imageUrl) {
      return {
        kind: "image",
        src: imageUrl,
        preference: selected,
      };
    }

    return {
      kind: "emoji",
      value: DEFAULT_USER_EMOJI,
      preference: selected,
      fallback: true,
    };
  }

  if (selected.startsWith("emoji:")) {
    return {
      kind: "emoji",
      value: EMOJI_BY_VALUE[selected] || DEFAULT_USER_EMOJI,
      preference: selected,
    };
  }

  if (selected.startsWith("icon:")) {
    return {
      kind: "icon",
      icon: ICON_BY_VALUE[selected] || faCube,
      preference: selected,
    };
  }

  return {
    kind: "emoji",
    value: DEFAULT_USER_EMOJI,
    preference: "image",
  };
}

const UserAvatar = memo(function UserAvatar({
  user,
  preference,
  resolved,
  variant = "chat",
  className = "",
  label = "User avatar",
}) {
  const avatar = resolved || resolveUserAvatar(user, preference);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatar?.src]);

  if (!avatar || avatar.kind === "none") return null;

  const classes = [
    "cap-user-avatar",
    `cap-user-avatar--${variant}`,
    `cap-user-avatar--${avatar.kind}`,
    avatar.fallback ? "is-fallback" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const shouldRenderImage = avatar.kind === "image" && avatar.src && !imageFailed;

  return (
    <span className={classes} role="img" aria-label={label}>
      {shouldRenderImage ? (
        <img
          className="cap-user-avatar__img"
          src={avatar.src}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : avatar.kind === "icon" ? (
        <FontAwesomeIcon
          icon={avatar.icon || faCube}
          className="cap-user-avatar__icon"
          aria-hidden="true"
        />
      ) : (
        <span className="cap-user-avatar__emoji" aria-hidden="true">
          {avatar.value || DEFAULT_USER_EMOJI}
        </span>
      )}
    </span>
  );
});

export default UserAvatar;
