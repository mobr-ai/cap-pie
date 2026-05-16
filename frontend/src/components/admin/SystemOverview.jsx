// src/components/admin/SystemOverview.jsx
import React from "react";

export function SystemOverview({
  t,
  systemMetrics,
  systemLoading: loading,
  systemError: error,
}) {
  const cpu = systemMetrics?.cpu;
  const mem = systemMetrics?.memory;
  const disk = systemMetrics?.disk;
  const gpus = systemMetrics?.gpu || [];

  const cpuPercent = cpu?.percent ?? 0;
  const memPercent = mem?.percent ?? 0;
  const diskPercent = disk?.percent ?? 0;

  const cpuClass =
    cpu && typeof cpuPercent === "number" && cpuPercent > 0
      ? cpuPercent > 90
        ? "status-red"
        : cpuPercent > 70
        ? "status-orange"
        : cpuPercent > 50
        ? "status-yellow"
        : "status-green"
      : "";

  const memClass =
    mem && typeof memPercent === "number"
      ? memPercent > 90
        ? "status-red"
        : memPercent > 75
        ? "status-orange"
        : memPercent > 60
        ? "status-yellow"
        : "status-green"
      : "";

  const diskClass =
    disk && typeof diskPercent === "number"
      ? diskPercent > 90
        ? "status-red"
        : diskPercent > 75
        ? "status-orange"
        : diskPercent > 60
        ? "status-yellow"
        : "status-green"
      : "";

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2 className="admin-section-title">{t("admin.systemSectionTitle")}</h2>
        <p className="admin-section-subtitle">
          {t("admin.systemSectionSubtitle")}
        </p>
      </div>

      <div className="admin-stat-grid">
        {/* CPU */}
        <div className={`admin-stat-card ${cpuClass}`}>
          <div className="admin-stat-label">{t("admin.systemStatsCpu")}</div>
          {loading && (
            <div className="admin-stat-placeholder">
              {t("admin.systemStatsLoading")}
            </div>
          )}
          {!loading && error && <div className="admin-stat-error">{error}</div>}
          {!loading && !error && cpu && (
            <>
              <div className="admin-stat-value">{cpuPercent.toFixed(0)}%</div>
              {typeof cpu.threads === "number" && (
                <div className="admin-stat-caption">
                  {t("admin.systemStatsCpuThreads", {
                    threads: cpu.threads,
                    cores: cpu.cores ?? cpu.threads,
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Memory */}
        <div className={`admin-stat-card ${memClass}`}>
          <div className="admin-stat-label">{t("admin.systemStatsMemory")}</div>
          {!loading && !error && mem ? (
            <>
              <div className="admin-stat-value">{memPercent.toFixed(0)}%</div>
              <div className="admin-stat-caption">
                {Math.round(mem.used / 1024 ** 3)} /{" "}
                {Math.round(mem.total / 1024 ** 3)} GiB
              </div>
            </>
          ) : loading ? (
            <div className="admin-stat-placeholder">
              {t("admin.systemStatsLoading")}
            </div>
          ) : error ? (
            <div className="admin-stat-error">{error}</div>
          ) : (
            <div className="admin-stat-placeholder">—</div>
          )}
        </div>

        {/* Disk */}
        <div className={`admin-stat-card ${diskClass}`}>
          <div className="admin-stat-label">{t("admin.systemStatsDisk")}</div>
          {!loading && !error && disk ? (
            <>
              <div className="admin-stat-value">{diskPercent.toFixed(0)}%</div>
              <div className="admin-stat-caption">
                {Math.round(disk.used / 1024 ** 3)} /{" "}
                {Math.round(disk.total / 1024 ** 3)} GiB
              </div>
            </>
          ) : loading ? (
            <div className="admin-stat-placeholder">
              {t("admin.systemStatsLoading")}
            </div>
          ) : error ? (
            <div className="admin-stat-error">{error}</div>
          ) : (
            <div className="admin-stat-placeholder">—</div>
          )}
        </div>

        {/* GPUs */}
        {gpus.map((g) => (
          <div key={g.index} className="admin-stat-card status-green">
            <div className="admin-stat-label">
              GPU {g.index} – {g.name}
            </div>
            <div className="admin-stat-value">{g.utilization.toFixed(0)}%</div>
            <div className="admin-stat-caption">
              {g.memory_used} / {g.memory_total} MiB (
              {g.memory_percent.toFixed(1)}%)
            </div>
            <div className="admin-stat-caption">Driver {g.driver}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
