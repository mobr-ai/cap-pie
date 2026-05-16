// src/pages/LoadingPage.jsx
import React from "react";
import logo from "/icons/logo.svg"; // adjust if your path is different
import "../styles/LoadingPage.css";
import { useTranslation } from "react-i18next";

function LoadingPage(props) {
  const { t } = useTranslation();
  const {
    type = "spin", // "spin" | "pulse" | "orbit" | "ring"
    fullscreen = true, // if false, behaves like an inline loader
    style,
    message,
  } = props;

  const rootClass = fullscreen
    ? "LoadingPage-root LoadingPage-fullscreen"
    : "LoadingPage-root";

  const resolvedMessage = message || t("loading.default");

  const renderInner = () => {
    switch (type) {
      case "pulse":
        return (
          <div className="LoadingPage-inner">
            <div className="LoadingPage-pulse">
              <img src={logo} alt="Loading" className="LoadingPage-logo" />
              <div className="LoadingPage-pulse-glow" />
            </div>
          </div>
        );

      case "orbit":
        return (
          <div className="LoadingPage-inner">
            <div className="LoadingPage-orbit-wrapper">
              <img src={logo} alt="Loading" className="LoadingPage-logo" />
              <div className="LoadingPage-orbit-ring">
                <span className="LoadingPage-orbit-dot" />
                <span className="LoadingPage-orbit-dot" />
                <span className="LoadingPage-orbit-dot" />
                <span className="LoadingPage-orbit-dot" />
              </div>
            </div>
          </div>
        );

      case "ring":
        return (
          <div className="LoadingPage-inner">
            <div className="LoadingPage-ring">
              <img src={logo} alt="Loading" className="LoadingPage-logo" />
              <div className="LoadingPage-ring-spinner" />
            </div>
          </div>
        );

      case "spin":
      default:
        // vanilla spin
        return (
          <div className="LoadingPage-inner">
            <img
              src={logo}
              alt="Loading"
              className="LoadingPage-logo LoadingPage-spin"
            />
          </div>
        );
    }
  };

  return (
    <div className={rootClass} style={style}>
      {renderInner()}
      {resolvedMessage && (
        <div className="LoadingPage-message">{resolvedMessage}</div>
      )}
    </div>
  );
}

export default LoadingPage;
