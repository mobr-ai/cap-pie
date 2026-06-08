// src/components/admin/AdminDataConsole.jsx
import React, { useMemo, useState } from "react";

const MODES = ["sparql", "graphs", "cache"];

function JsonViewer({ value }) {
  if (!value) return null;
  return (
    <pre className="admin-data-console-json">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Field({ id, label, children, help, compact = false }) {
  return (
    <div className={`admin-data-console-field ${compact ? "is-compact" : ""}`}>
      <label htmlFor={id} className="admin-data-console-label">
        {label}
      </label>
      {children}
      {help && <div className="admin-data-console-help">{help}</div>}
    </div>
  );
}

function ActionButton({
  children,
  loading,
  disabled,
  className = "btn-outline-secondary",
  loadingLabel,
  ...props
}) {
  return (
    <button
      type="button"
      className={`btn btn-sm ${className} admin-data-console-action`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? loadingLabel || "Running…" : children}
    </button>
  );
}

function ModeButton({ mode, activeMode, setActiveMode, t }) {
  const active = mode === activeMode;
  return (
    <button
      type="button"
      className={`admin-data-console-mode ${active ? "is-active" : ""}`}
      onClick={() => setActiveMode(mode)}
    >
      <span className="admin-data-console-mode-label">
        {t(`admin.dataConsoleMode${mode[0].toUpperCase()}${mode.slice(1)}`)}
      </span>
    </button>
  );
}

function getResultErrorMessage(result, fallbackError) {
  return (
    fallbackError ||
    result?.error ||
    result?.data?.error ||
    result?.data?.detail ||
    result?.data?.message ||
    null
  );
}

function isDependencyUnavailable(message) {
  const value = String(message || "").toLowerCase();
  return (
    value.includes("redis") ||
    value.includes("qlever") ||
    value.includes("name or service not known") ||
    value.includes("connection refused") ||
    value.includes("failed to connect") ||
    value.includes("connecting to")
  );
}

function InlineFeedback({ t, dataConsole }) {
  const hasResult = Boolean(dataConsole.result);
  const resultError = getResultErrorMessage(dataConsole.result, dataConsole.error);
  const isError = Boolean(resultError || dataConsole.result?.error);
  const dependencyUnavailable = isDependencyUnavailable(resultError);

  const timestamp = dataConsole.result?.at
    ? new Date(dataConsole.result.at).toLocaleTimeString()
    : null;

  if (!hasResult && !resultError && !dataConsole.longRunningKey) {
    return (
      <div className="admin-data-console-feedback is-idle">
        {t("admin.dataConsoleInlineIdle")}
      </div>
    );
  }

  if (dataConsole.longRunningKey && !hasResult) {
    return (
      <div className="admin-data-console-feedback is-running">
        {t("admin.dataConsoleInlineRunning", {
          action: dataConsole.longRunningKey,
        })}
      </div>
    );
  }

  return (
    <div
      className={`admin-data-console-feedback ${
        isError ? "is-error" : "is-success"
      } ${dependencyUnavailable ? "is-dependency" : ""}`}
    >
      <div className="admin-data-console-feedback-main">
        <span>
          {isError
            ? dependencyUnavailable
              ? t("admin.dataConsoleInlineDependency")
              : t("admin.dataConsoleInlineError")
            : t("admin.dataConsoleInlineSuccess")}
        </span>
        {timestamp && (
          <span className="admin-data-console-feedback-time">
            {timestamp}
          </span>
        )}
      </div>

      {resultError && (
        <div className="admin-data-console-feedback-detail">
          {resultError}
        </div>
      )}

      {hasResult && !isError && (
        <details className="admin-data-console-result-details">
          <summary>{t("admin.dataConsoleShowRawResult")}</summary>
          <JsonViewer value={dataConsole.result?.data || dataConsole.result} />
        </details>
      )}
    </div>
  );
}

export function AdminDataConsole({ t, dataConsole }) {
  const [activeMode, setActiveMode] = useState("cache");

  const [sparql, setSparql] = useState("SELECT * WHERE { ?s ?p ?o } LIMIT 25");
  const [queryType, setQueryType] = useState("SELECT");

  const [readGraphUri, setReadGraphUri] = useState("");

  const [graphUri, setGraphUri] = useState("");
  const [turtleData, setTurtleData] = useState("");
  const [insertData, setInsertData] = useState("");
  const [deleteData, setDeleteData] = useState("");
  const [prefixes, setPrefixes] = useState("{}");

  const [filePath, setFilePath] = useState("");
  const [ttl, setTtl] = useState("");
  const [uploadFile, setUploadFile] = useState(null);

  const loading = dataConsole.loadingKey;

  const activeSubtitle = useMemo(() => {
    if (activeMode === "sparql") return t("admin.dataConsoleSparqlSubtitle");
    if (activeMode === "graphs") return t("admin.dataConsoleGraphUnifiedSubtitle");
    return t("admin.dataConsoleCacheSubtitle");
  }, [activeMode, t]);

  const runDeleteGraph = () => {
    if (!graphUri.trim()) return;
    if (!window.confirm(t("admin.dataConsoleConfirmDeleteGraph", { graphUri }))) return;
    dataConsole.deleteGraph(graphUri);
  };

  const runClearCache = () => {
    if (!window.confirm(t("admin.dataConsoleConfirmClearCache"))) return;
    dataConsole.clearCache();
  };

  return (
    <div className="admin-data-console">
      <section className="admin-section admin-data-console-shell">
        <div className="admin-data-console-main-head">
          <div>
            <h2 className="admin-section-title">{t("admin.dataConsoleTitle")}</h2>
            <p className="admin-section-subtitle">{t("admin.dataConsoleSubtitle")}</p>
          </div>

          <div className="admin-data-console-modes" role="tablist">
            {MODES.map((mode) => (
              <ModeButton
                key={mode}
                mode={mode}
                activeMode={activeMode}
                setActiveMode={setActiveMode}
                t={t}
              />
            ))}
          </div>
        </div>

        <div className="admin-data-console-workarea">
            <div className="admin-data-console-panel-head">
              <div>
                <div className="admin-data-console-kicker">
                  {t("admin.dataConsoleActiveOperation")}
                </div>
                <h3 className="admin-data-console-panel-title">
                  {t(`admin.dataConsoleMode${activeMode[0].toUpperCase()}${activeMode.slice(1)}`)}
                </h3>
                <p className="admin-data-console-panel-subtitle">
                  {activeSubtitle}
                </p>
              </div>
            </div>

            {activeMode === "sparql" && (
              <div className="admin-data-console-mode-panel">
                <div className="admin-data-console-inline-grid is-tight">
                  <Field id="admin-query-type" label={t("admin.dataConsoleQueryType")} compact>
                    <select
                      id="admin-query-type"
                    data-swipe-tabs-disabled="true"
                      className="form-select form-select-sm admin-data-console-input"
                      value={queryType}
                      onChange={(e) => setQueryType(e.target.value)}
                    >
                      <option value="SELECT">SELECT</option>
                      <option value="ASK">ASK</option>
                      <option value="CONSTRUCT">CONSTRUCT</option>
                      <option value="DESCRIBE">DESCRIBE</option>
                    </select>
                  </Field>
                </div>

                <Field id="admin-sparql" label={t("admin.dataConsoleSparqlLabel")}>
                  <textarea
                    id="admin-sparql"
                    data-swipe-tabs-disabled="true"
                    className="form-control admin-data-console-textarea admin-data-console-mono"
                    rows={12}
                    value={sparql}
                    onChange={(e) => setSparql(e.target.value)}
                  />
                </Field>

                <div className="admin-data-console-actions">
                  <ActionButton
                    className="btn-outline-info"
                    loading={loading === "sparql"}
                    disabled={!sparql.trim()}
                    onClick={() => dataConsole.executeSparql(sparql, queryType)}
                  >
                    {t("admin.dataConsoleExecute")}
                  </ActionButton>
                </div>
              </div>
            )}

            {activeMode === "graphs" && (
              <div className="admin-data-console-mode-panel">
                <div className="admin-data-console-subpanel">
                  <div className="admin-data-console-subpanel-title">
                    {t("admin.dataConsoleGraphReadTitle")}
                  </div>

                  <div className="admin-data-console-inline-action">
                    <Field id="admin-read-graph-uri" label={t("admin.dataConsoleGraphUri")}>
                      <input
                        id="admin-read-graph-uri"
                    data-swipe-tabs-disabled="true"
                        className="form-control form-control-sm admin-data-console-input"
                        value={readGraphUri}
                        onChange={(e) => setReadGraphUri(e.target.value)}
                        placeholder="https://example.org/graph"
                      />
                    </Field>

                    <ActionButton
                      className="btn-outline-info"
                      loading={loading === "graphRead"}
                      disabled={!readGraphUri.trim()}
                      onClick={() => dataConsole.readGraph(readGraphUri)}
                    >
                      {t("admin.dataConsoleRead")}
                    </ActionButton>
                  </div>
                </div>

                <div className="admin-data-console-subpanel">
                  <div className="admin-data-console-subpanel-title">
                    {t("admin.dataConsoleGraphWriteTitle")}
                  </div>

                  <Field id="admin-graph-uri" label={t("admin.dataConsoleGraphUri")}>
                    <input
                      id="admin-graph-uri"
                    data-swipe-tabs-disabled="true"
                      className="form-control form-control-sm admin-data-console-input"
                      value={graphUri}
                      onChange={(e) => setGraphUri(e.target.value)}
                      placeholder="https://example.org/graph"
                    />
                  </Field>

                  <Field id="admin-turtle-data" label={t("admin.dataConsoleTurtleData")}>
                    <textarea
                      id="admin-turtle-data"
                    data-swipe-tabs-disabled="true"
                      className="form-control admin-data-console-textarea admin-data-console-mono"
                      rows={5}
                      value={turtleData}
                      onChange={(e) => setTurtleData(e.target.value)}
                    />
                  </Field>

                  <div className="admin-data-console-actions">
                    <ActionButton
                      className="btn-outline-success"
                      loading={loading === "graphCreate"}
                      disabled={!graphUri.trim() || !turtleData.trim()}
                      onClick={() => dataConsole.createGraph(graphUri, turtleData)}
                    >
                      {t("admin.dataConsoleCreateGraph")}
                    </ActionButton>
                  </div>

                  <div className="admin-data-console-inline-grid">
                    <Field id="admin-insert-data" label={t("admin.dataConsoleInsertData")}>
                      <textarea
                        id="admin-insert-data"
                    data-swipe-tabs-disabled="true"
                        className="form-control admin-data-console-textarea admin-data-console-mono"
                        rows={5}
                        value={insertData}
                        onChange={(e) => setInsertData(e.target.value)}
                      />
                    </Field>

                    <Field id="admin-delete-data" label={t("admin.dataConsoleDeleteData")}>
                      <textarea
                        id="admin-delete-data"
                    data-swipe-tabs-disabled="true"
                        className="form-control admin-data-console-textarea admin-data-console-mono"
                        rows={5}
                        value={deleteData}
                        onChange={(e) => setDeleteData(e.target.value)}
                      />
                    </Field>
                  </div>

                  <Field
                    id="admin-prefixes"
                    label={t("admin.dataConsolePrefixes")}
                    help={t("admin.dataConsolePrefixesHelp")}
                  >
                    <textarea
                      id="admin-prefixes"
                    data-swipe-tabs-disabled="true"
                      className="form-control admin-data-console-textarea admin-data-console-mono"
                      rows={2}
                      value={prefixes}
                      onChange={(e) => setPrefixes(e.target.value)}
                    />
                  </Field>

                  <div className="admin-data-console-actions">
                    <ActionButton
                      className="btn-outline-warning"
                      loading={loading === "graphUpdate"}
                      disabled={!graphUri.trim() || (!insertData.trim() && !deleteData.trim())}
                      onClick={() => dataConsole.updateGraph(graphUri, insertData, deleteData, prefixes)}
                    >
                      {t("admin.dataConsoleUpdateGraph")}
                    </ActionButton>

                    <ActionButton
                      className="btn-outline-danger"
                      loading={loading === "graphDelete"}
                      disabled={!graphUri.trim()}
                      onClick={runDeleteGraph}
                    >
                      {t("admin.dataConsoleDeleteGraph")}
                    </ActionButton>
                  </div>
                </div>
              </div>
            )}

            {activeMode === "cache" && (
              <div className="admin-data-console-mode-panel">
                <div className="admin-data-console-command-strip">
                  <ActionButton
                    className="btn-outline-info"
                    loading={loading === "cacheInfo"}
                    onClick={dataConsole.cacheInfo}
                  >
                    {t("admin.dataConsoleCacheInfo")}
                  </ActionButton>

                  <ActionButton
                    className="btn-outline-info"
                    loading={loading === "nlCacheInfo"}
                    onClick={dataConsole.nlCacheInfo}
                  >
                    {t("admin.dataConsoleNlCacheInfo")}
                  </ActionButton>

                  <ActionButton
                    className="btn-outline-danger"
                    loading={loading === "cacheClear"}
                    onClick={runClearCache}
                  >
                    {t("admin.dataConsoleClearCache")}
                  </ActionButton>
                </div>

                <div className="admin-data-console-subpanel">
                  <div className="admin-data-console-subpanel-title">
                    {t("admin.dataConsolePrecacheServerTitle")}
                  </div>

                  <div className="admin-data-console-inline-grid">
                    <Field id="admin-precache-path" label={t("admin.dataConsolePrecachePath")}>
                      <input
                        id="admin-precache-path"
                    data-swipe-tabs-disabled="true"
                        className="form-control form-control-sm admin-data-console-input"
                        value={filePath}
                        onChange={(e) => setFilePath(e.target.value)}
                        placeholder="/opt/cap/query_mappings.txt"
                      />
                    </Field>

                    <Field id="admin-cache-ttl" label={t("admin.dataConsoleTtl")}>
                      <input
                        id="admin-cache-ttl"
                    data-swipe-tabs-disabled="true"
                        type="number"
                        min="1"
                        className="form-control form-control-sm admin-data-console-input"
                        value={ttl}
                        onChange={(e) => setTtl(e.target.value)}
                        placeholder={t("admin.dataConsoleTtlPlaceholder")}
                      />
                    </Field>
                  </div>

                  <div className="admin-data-console-actions">
                    <ActionButton
                      className="btn-outline-success"
                      loading={loading === "precacheFile"}
                      loadingLabel={t("admin.dataConsoleRunning")}
                      disabled={!filePath.trim()}
                      onClick={() => dataConsole.precacheFromFile(filePath, ttl)}
                    >
                      {t("admin.dataConsolePrecacheFile")}
                    </ActionButton>
                  </div>
                </div>

                <div className="admin-data-console-subpanel">
                  <div className="admin-data-console-subpanel-title">
                    {t("admin.dataConsolePrecacheUploadTitle")}
                  </div>

                  <div className="admin-data-console-inline-action">
                    <Field id="admin-precache-upload" label={t("admin.dataConsolePrecacheUpload")}>
                      <input
                        id="admin-precache-upload"
                    data-swipe-tabs-disabled="true"
                        type="file"
                        className="form-control form-control-sm admin-data-console-input"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      />
                    </Field>

                    <ActionButton
                      className="btn-outline-success"
                      loading={loading === "precacheUpload"}
                      loadingLabel={t("admin.dataConsoleUploading")}
                      disabled={!uploadFile}
                      onClick={() => dataConsole.precacheUpload(uploadFile, ttl)}
                    >
                      {t("admin.dataConsolePrecacheUploadButton")}
                    </ActionButton>
                  </div>
                </div>
              </div>
            )}
          <InlineFeedback t={t} dataConsole={dataConsole} />
        </div>
      </section>
    </div>
  );
}
