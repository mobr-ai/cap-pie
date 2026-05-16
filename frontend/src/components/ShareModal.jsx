import "./../styles/ShareModal.css";
import React from "react";
import { Button, Modal } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";

import {
  EmailIcon,
  EmailShareButton,
  FacebookIcon,
  FacebookMessengerIcon,
  FacebookMessengerShareButton,
  FacebookShareButton,
  LineIcon,
  LineShareButton,
  RedditIcon,
  RedditShareButton,
  TelegramIcon,
  TelegramShareButton,
  TwitterShareButton,
  WhatsappIcon,
  WhatsappShareButton,
  XIcon,
} from "react-share";

import { useShareImageUpload } from "../hooks/useShareImageUpload";

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || "").split(",");
  const mime = parts[0]?.match(/:(.*?);/)?.[1] || "image/png";
  const bstr = atob(parts[1] || "");
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new Blob([u8], { type: mime });
}

function safeFilename(name) {
  return String(name || "cap-widget")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export default function ShareModal(props) {
  const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
  const { imageDataUrl, hashtags, link, title, message, ...modalProps } = props;
  const { t } = useTranslation();
  const { showToast } = useOutletContext() || {};

  const isImageMode = Boolean(imageDataUrl);
  const resolvedLink = link || API_BASE;

  const {
    upload,
    uploadProgress,
    error: uploadError,
    reset: resetUpload,
  } = useShareImageUpload();

  const [uploadedImageUrl, setUploadedImageUrl] = React.useState(null);
  const [uploadedPageUrl, setUploadedPageUrl] = React.useState(null);
  const [uploadedExpiresAt, setUploadedExpiresAt] = React.useState(null);
  const [isUploading, setIsUploading] = React.useState(false);

  // view: "preview" (image + actions) -> "grid" (social buttons)
  const [view, setView] = React.useState(isImageMode ? "preview" : "grid");

  // Reset view & upload state whenever modal is opened
  React.useEffect(() => {
    if (!modalProps.show) return;
    setView(isImageMode ? "preview" : "grid");
    setUploadedImageUrl(null);
    setUploadedPageUrl(null);
    setUploadedExpiresAt(null);
    setIsUploading(false);
    resetUpload();
  }, [modalProps.show, isImageMode, resetUpload]);

  const iconProps = { size: 50, borderRadius: 15 };

  function toAbsoluteUrl(u) {
    if (!u) return "";
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    if (u.startsWith("/")) return `${window.location.origin}${u}`;
    return `${window.location.origin}/${u}`;
  }

  const canNativeShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof File === "function";

  const canNativeShareFiles =
    canNativeShare &&
    typeof navigator.canShare === "function" &&
    (() => {
      try {
        const blob = imageDataUrl ? dataUrlToBlob(imageDataUrl) : null;
        if (!blob) return false;
        const file = new File([blob], "cap.png", { type: blob.type });
        return navigator.canShare({ files: [file] });
      } catch {
        return false;
      }
    })();

  const buildInviteLine = (title2) => {
    const safeTitle = String(title2 || title || "CAP").trim();

    const i18nText = t("dashboard.shareInvite", {
      title: safeTitle,
      defaultValue: "",
    });

    if (i18nText) return i18nText;

    return `Explore insights from this analysis on ${safeTitle}`;
  };

  const buildShareText = () => {
    const invite = buildInviteLine();
    const tags = (hashtags || []).map((tag) => `#${tag}`).join(" ");
    const shareUrl = uploadedPageUrl
      ? toAbsoluteUrl(uploadedPageUrl)
      : resolvedLink;

    // Include BOTH:
    // - shareUrl: OG share page (best for social previews)
    // - resolvedLink: your actual app page (good for people)
    // return `${invite}\n\n${shareUrl}\n\n${resolvedLink}${
    //   tags ? `\n\n${tags}` : ""
    // }`;

    return `${invite}\n\n${shareUrl}${tags ? `\n\n${tags}` : ""}`;
  };

  const copyTextToClipboard = () => {
    const msg = buildShareText();
    navigator.clipboard
      .writeText(msg)
      .then(() => showToast?.(t("copiedToClipboard"), "success"))
      .catch(() => showToast?.(t("copyFailed"), "danger"));
  };

  const copyImageToClipboard = async () => {
    try {
      if (!window.ClipboardItem) throw new Error("ClipboardItem unsupported");
      const blob = dataUrlToBlob(imageDataUrl);
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      showToast?.(t("dashboard.widgetImageCopied"), "success");
    } catch {
      showToast?.(t("dashboard.widgetImageCopyFailed"), "danger");
    }
  };

  const downloadImage = () => {
    try {
      const a = document.createElement("a");
      a.href = imageDataUrl;
      a.download = `${safeFilename(title)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      showToast?.(t("dashboard.widgetImageDownloadFailed"), "danger");
    }
  };

  // Native share is OPTIONAL and never the main path.
  const nativeShareImage = async () => {
    try {
      if (!navigator.share) throw new Error("Share API unsupported");
      const blob = dataUrlToBlob(imageDataUrl);
      const file = new File([blob], `${safeFilename(title)}.png`, {
        type: blob.type,
      });
      await navigator.share({
        title: title || "CAP",
        text: message || "",
        files: [file],
      });
    } catch {
      showToast?.(t("dashboard.widgetNativeShareFailed"), "danger");
    }
  };

  const ensureUploaded = React.useCallback(async () => {
    if (!isImageMode) return null;
    if (uploadedPageUrl) return uploadedPageUrl;
    if (!imageDataUrl) return null;

    setIsUploading(true);
    try {
      const blob = dataUrlToBlob(imageDataUrl);
      const file = new File([blob], `${safeFilename(title)}.png`, {
        type: blob.type || "image/png",
      });

      const res = await upload(file);
      if (!res || res.error) return null;

      setUploadedImageUrl(res.url || null);
      setUploadedPageUrl(res.absolute_page_url || res.page_url || null);
      setUploadedExpiresAt(res.expires_at || null);

      return res.absolute_page_url || res.page_url || res.url || null;
    } finally {
      setIsUploading(false);
    }
  }, [isImageMode, uploadedPageUrl, imageDataUrl, title, upload, resolvedLink]);

  // Step D: "Share" = transition to grid + kick off upload
  const handleShareClick = async () => {
    setView("grid");
    ensureUploaded(); // async, no await needed here
  };

  const openXIntent = () => {
    const shareUrl = uploadedPageUrl
      ? toAbsoluteUrl(uploadedPageUrl)
      : resolvedLink;
    const tags = (hashtags || []).map((tag) => `#${tag}`).join(" ");

    let header;
    if (title) {
      const cleaned = String(title).trim().replace(/"/g, "'");
      header = `Explore insights from this analysis: "${cleaned}"`;
    } else {
      header = `Explore insights from this analysis on CAP:`;
    }

    const text = `${header}\n\n${shareUrl}\n\n${tags}`.trim();
    const intentUrl = `https://x.com/intent/post?text=${encodeURIComponent(
      text
    )}`;

    window.open(intentUrl, "_blank", "noopener,noreferrer");
  };

  const shareUrlForButtons =
    isImageMode && uploadedPageUrl
      ? toAbsoluteUrl(uploadedPageUrl)
      : resolvedLink;

  const buttonProps = {
    url: shareUrlForButtons,
    windowWidth: 640,
    windowHeight: 360,
    hashtags,
    related: ["@mobrsys"],
    title: buildInviteLine(title),
    subject: "CAP",
    body: buildShareText(),
  };

  const renderShareGrid = () => {
    const disabled = isImageMode && !uploadedPageUrl;

    return (
      <div className="ShareModal-grid-wrapper">
        <div className="ShareModal-share-icon">
          <EmailShareButton {...buttonProps} disabled={disabled}>
            <EmailIcon {...iconProps} />
            <p>E-mail</p>
          </EmailShareButton>
        </div>

        <div className="ShareModal-share-icon">
          <button
            type="button"
            onClick={openXIntent}
            disabled={disabled}
            aria-disabled={disabled}
            style={{ background: "transparent", border: "none", padding: 0 }}
          >
            <XIcon {...iconProps} />
            <p>X</p>
          </button>
        </div>

        <div className="ShareModal-share-icon">
          <WhatsappShareButton {...buttonProps} disabled={disabled}>
            <WhatsappIcon {...iconProps} />
            <p>WhatsApp</p>
          </WhatsappShareButton>
        </div>

        <div className="ShareModal-share-icon">
          <TelegramShareButton {...buttonProps} disabled={disabled}>
            <TelegramIcon {...iconProps} />
            <p>Telegram</p>
          </TelegramShareButton>
        </div>

        <div className="ShareModal-share-icon">
          <FacebookShareButton {...buttonProps} disabled={disabled}>
            <FacebookIcon {...iconProps} />
            <p>Facebook</p>
          </FacebookShareButton>
        </div>

        <div className="ShareModal-share-icon">
          <FacebookMessengerShareButton {...buttonProps} disabled={disabled}>
            <FacebookMessengerIcon {...iconProps} />
            <p>Messenger</p>
          </FacebookMessengerShareButton>
        </div>

        <div className="ShareModal-share-icon">
          <RedditShareButton {...buttonProps} disabled={disabled}>
            <RedditIcon {...iconProps} />
            <p>Reddit</p>
          </RedditShareButton>
        </div>

        <div className="ShareModal-share-icon">
          <LineShareButton {...buttonProps} disabled={disabled}>
            <LineIcon {...iconProps} />
            <p>Line</p>
          </LineShareButton>
        </div>
      </div>
    );
  };

  return (
    <Modal
      {...modalProps}
      size="md"
      aria-labelledby="contained-modal-title-vcenter"
      centered
      dialogClassName="ShareModal-root"
    >
      <Modal.Header closeButton>
        <Modal.Title id="contained-modal-title-vcenter">
          {isImageMode ? t("dashboard.shareWidgetTitle") : t("shareTo")}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {isImageMode ? (
          <div
            className={`ShareModal-stage ${view === "grid" ? "is-grid" : ""}`}
          >
            <div className="ShareModal-stageInner">
              {/* Panel 1: preview */}
              <div className="ShareModal-panel ShareModal-panelPreview">
                <div className="ShareModal-imageMode">
                  <div className="ShareModal-imagePreview">
                    <img src={imageDataUrl} alt="CAP share preview" />
                  </div>

                  <div className="ShareModal-imageActions">
                    <Button
                      variant="outline-light"
                      onClick={copyImageToClipboard}
                    >
                      {t("dashboard.copyImage")}
                    </Button>

                    <Button variant="outline-light" onClick={downloadImage}>
                      {t("dashboard.downloadImage")}
                    </Button>

                    {canNativeShareFiles ? (
                      <Button
                        variant="outline-light"
                        onClick={nativeShareImage}
                      >
                        {t("dashboard.shareImage")}
                      </Button>
                    ) : null}

                    <Button variant="primary" onClick={handleShareClick}>
                      {t("dashboard.share")}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Panel 2: grid */}
              <div className="ShareModal-panel ShareModal-panelGrid">
                <div className="ShareModal-gridHeader">
                  <div>
                    <div className="ShareModal-subtitle">{t("shareTo")}</div>

                    <div className="ShareModal-linkStatus">
                      {isUploading ? (
                        <>
                          <span>{t("dashboard.creatingShareLink")}</span>
                          <span className="ShareModal-linkPct">
                            {uploadProgress}%
                          </span>
                        </>
                      ) : uploadedPageUrl ? (
                        <span>
                          {t("dashboard.shareLinkReady")}
                          {uploadedExpiresAt
                            ? ` (${t("dashboard.shareLinkExpires")} ${new Date(
                                uploadedExpiresAt
                              ).toLocaleString()})`
                            : ""}
                        </span>
                      ) : uploadError ? (
                        <span className="ShareModal-linkError">
                          {t("dashboard.shareLinkFailed")}
                        </span>
                      ) : (
                        <span>{t("dashboard.creatingShareLink")}</span>
                      )}
                    </div>

                    {uploadError && !isUploading ? (
                      <div className="ShareModal-linkRetryRow">
                        <Button
                          size="sm"
                          variant="outline-light"
                          onClick={() => ensureUploaded()}
                        >
                          {t("common.retry")}
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <Button
                    variant="outline-light"
                    size="sm"
                    onClick={() => setView("preview")}
                  >
                    {t("common.back")}
                  </Button>
                </div>

                {renderShareGrid()}
              </div>
            </div>
          </div>
        ) : (
          renderShareGrid()
        )}
      </Modal.Body>

      {(!isImageMode || view === "grid") && (
        <Modal.Footer>
          <Button variant="secondary" onClick={copyTextToClipboard}>
            {t("copyLink")}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}
