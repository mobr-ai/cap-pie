// src/index.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "react-bootstrap/Image";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Outlet,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import Toast from "react-bootstrap/Toast";
import ToastContainer from "react-bootstrap/ToastContainer";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/index.css";

// i18n first
import "./i18n";
import { useTranslation } from "react-i18next";

// Pages
import AuthPage from "./pages/AuthPage";
import WaitingListPage from "./pages/WaitingListPage";
import SettingsPage from "./pages/SettingsPage";
import LandingPage from "./pages/LandingPage";
import DashboardPage from "./pages/DashboardPage";
import AdminPage from "./pages/AdminPage";
import AnalysesPage from "./pages/AnalysesPage";
import UserQueryMetricsPage from "./pages/UserQueryMetricsPage";
import LoadingPage from "./pages/LoadingPage";
import WelcomePage from "./pages/WelcomePage";

// Hooks
import { useAuthRequest } from "./hooks/useAuthRequest";
import useSyncStatus from "./hooks/useSyncStatus";

// Components
import Header from "./components/Header";

const SESSION_KEY = "cap_user_session";

function canUseLocalStorage() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false;
    const k = "__cap_ls_test__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function safeGetSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeSetSession(value) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function safeRemoveSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

function getInitialSession() {
  if (!canUseLocalStorage()) return null;
  return safeGetSession();
}

function getInitialLoading() {
  try {
    const sess = canUseLocalStorage() ? safeGetSession() : null;
    const path = window.location.pathname;
    if (!sess) return false;
    // Start with loader ON for dashboard (and optionally landing)
    return path === "/dashboard";
  } catch {
    return false;
  }
}

// ---------------------------
// Layout wrapper
// ---------------------------
function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(getInitialLoading);
  const [session, setSession] = useState(getInitialSession);

  const [sidebarIsOpen, setSidebarOpen] = useState(false);

  const storageWorksRef = useRef(canUseLocalStorage());
  const storageWarnedRef = useRef(false);

  // --- Toasts ---------------------------------------------------------------
  const [toast, setToast] = useState({
    show: false,
    message: "",
    variant: "secondary",
    onClick: null,
  });

  const showToast = useCallback(
    (message, variant = "secondary", options = {}) => {
      setToast({
        show: true,
        message,
        variant,
        onClick: options.onClick || null,
      });
    },
    [],
  );

  const warnStorageOnce = useCallback(() => {
    if (storageWarnedRef.current) return;
    storageWarnedRef.current = true;

    showToast(
      `${t("errors.storageRequired.title")}\n${t("errors.storageRequired.body")}`,
      "danger",
    );
  }, [showToast, t]);

  const persistSessionOrWarn = useCallback(
    (value) => {
      // If we already know storage doesn't work, warn once and stop trying.
      if (!storageWorksRef.current) {
        warnStorageOnce();
        return false;
      }

      const ok = safeSetSession(value);
      if (!ok) {
        storageWorksRef.current = false;
        warnStorageOnce();
      }
      return ok;
    },
    [warnStorageOnce],
  );

  const clearSessionOrWarn = useCallback(() => {
    if (!storageWorksRef.current) {
      warnStorageOnce();
      return false;
    }

    const ok = safeRemoveSession();
    if (!ok) {
      storageWorksRef.current = false;
      warnStorageOnce();
    }
    return ok;
  }, [warnStorageOnce]);

  // --- Auth & Session -------------------------------------------------------
  const handleLogin = useCallback(
    (userObj) => {
      // Always set state, even if persistence fails.
      setSession(userObj);

      // Best-effort persistence + user feedback if it fails.
      persistSessionOrWarn(userObj);

      const from = (location.state && location.state.from) || "/";
      navigate(from, { replace: true });
    },
    [location.state, navigate, persistSessionOrWarn],
  );

  const handleLogout = useCallback(() => {
    // Best-effort clear + warning if blocked.
    clearSessionOrWarn();

    setSession(null);
    setSidebarOpen(false);
    navigate("/login", { replace: true });
  }, [navigate, clearSessionOrWarn]);

  // --- Authenticated fetch wrapper -----------------------------------------
  const { authFetch } = useAuthRequest({ session, showToast, handleLogout });

  // --- CAP status polling (health + sync)
  const { healthOnline, capBlock, cardanoBlock, syncStatus, syncPct, syncLag } =
    useSyncStatus(session ? authFetch : null);

  const setUser = useCallback(
    (next) => {
      setSession((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;

        // Only attempt to persist if there's a session object; still ok to persist null.
        const ok = persistSessionOrWarn(resolved);
        if (!ok) {
          // Keep state updated in-memory regardless.
        }

        return resolved;
      });
    },
    [persistSessionOrWarn],
  );

  const outletContext = useMemo(
    () => ({
      session,
      user: session,
      setUser: setUser,
      handleLogout,
      handleLogin,
      showToast,
      setLoading,
      loading,
      healthOnline,
      capBlock,
      cardanoBlock,
      syncStatus,
      syncPct,
      syncLag,
    }),
    [
      session,
      showToast,
      handleLogout,
      handleLogin,
      setUser,
      loading,
      healthOnline,
      capBlock,
      cardanoBlock,
      syncStatus,
      syncPct,
      syncLag,
    ],
  );

  // --- Enforce allowed routes when not logged in ---------------------------
  useEffect(() => {
    const allowlist = new Set(["/login", "/signup", "/welcome"]);
    if (!session && !allowlist.has(location.pathname)) {
      setSidebarOpen(false);
      navigate("/login", {
        replace: true,
        state: { from: location.pathname },
      });
    }
  }, [session, location.pathname, navigate]);

  // --- Prevent logged-in users from visiting auth pages ---------------------
  useEffect(() => {
    if (!session) return;

    const authPages = new Set(["/login", "/signup", "/welcome"]);
    if (authPages.has(location.pathname)) {
      setSidebarOpen(false);
      navigate("/", { replace: true });
    }
  }, [session, location.pathname, navigate]);

  // Optional: if storage is blocked, warn once early (helps users understand “won’t stay logged in after refresh”)
  useEffect(() => {
    if (!storageWorksRef.current) warnStorageOnce();
  }, [warnStorageOnce]);

  return (
    <div id="outer-container">
      {/* Header is part of the page wrap so it shifts with content */}
      <div id="page-wrap">
        <Header
          user={session}
          handleLogout={handleLogout}
          capBlock={capBlock}
          cardanoBlock={cardanoBlock}
          syncStatus={syncStatus}
          syncLag={syncLag}
          syncPct={syncPct}
          healthOnline={healthOnline}
          sidebarIsOpen={sidebarIsOpen}
          setSidebarOpen={setSidebarOpen}
          authFetch={authFetch}
        />
        {loading && (
          <LoadingPage
            type="ring" // try "spin", "pulse", "orbit", "ring"
            fullscreen={true}
            message={t("loading.workspace")}
          />
        )}

        <ToastContainer
          position="bottom-end"
          containerPosition="fixed"
          className="p-3"
          style={{ zIndex: 9999 }}
        >
          <Toast
            bg={toast.variant}
            onClose={() => setToast((prev) => ({ ...prev, show: false }))}
            show={toast.show}
            delay={6000}
            autohide
            onClick={toast.onClick || undefined}
            style={{ cursor: toast.onClick ? "pointer" : "default" }}
          >
            <Toast.Body className="text-white">
              {toast.message.split("\n").map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </Toast.Body>
          </Toast>
        </ToastContainer>

        <Outlet context={outletContext} />
      </div>
    </div>
  );
}

// ---------------------------
// App Router
// ---------------------------
function AppRouter() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/conversations/:conversationId"
              element={<LandingPage />}
            />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/analyses" element={<AnalysesPage />} />
            <Route
              path="/admin/users/:userId/queries"
              element={<UserQueryMetricsPage />}
            />
            <Route
              path="/admin/conversations/:conversationId"
              element={<LandingPage />}
            />

            {/* <Route path="/login" element={<AuthPage type="login" />} /> */}
            <Route path="/login" element={<WelcomePage type="login" />} />
            <Route path="/welcome" element={<WelcomePage type="login" />} />
            <Route path="/signup" element={<WaitingListPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

// ---------------------------
// 404 Page
// ---------------------------
function NotFound() {
  return (
    <div className="container py-5">
      <Image className="Auth-logo" src="./icons/logo.png" alt="CAP logo" />

      <h3 className="mb-3">Page not found</h3>
      <p>
        The page you’re looking for doesn’t exist. Go to{" "}
        <a href="/login">Login</a> or <a href="/signup">Sign up</a>.
      </p>
    </div>
  );
}

// ---------------------------
// Mount
// ---------------------------
createRoot(document.getElementById("root")).render(<AppRouter />);
