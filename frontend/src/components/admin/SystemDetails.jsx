// src/components/admin/SystemDetails.jsx
import React from "react";

function usageClass(percent) {
  if (percent == null) return "";
  if (percent > 90) return "status-red";
  if (percent > 75) return "status-orange";
  if (percent > 60) return "status-yellow";
  return "status-green";
}

export function SystemDetails({
  t,
  systemMetrics,
  systemLoading: loading,
  systemError: error,
}) {
  const cpu = systemMetrics?.cpu;
  const mem = systemMetrics?.memory;
  const rootDisk = systemMetrics?.disk;
  const disks = systemMetrics?.disks || [];
  const load = systemMetrics?.load_avg || {};
  const gpus = systemMetrics?.gpu || [];

  const cpuPercent = cpu?.percent ?? null;
  const memPercent = mem?.percent ?? null;
  const rootDiskPercent = rootDisk?.percent ?? null;

  return (
    <>
      {/* High-level node metrics */}
      <section className="admin-section">
        <div className="admin-section-header">
          <h2 className="admin-section-title">
            {t("admin.systemDetailsTitle")}
          </h2>
          <p className="admin-section-subtitle">
            {t("admin.systemDetailsSubtitle")}
          </p>
        </div>

        <div className="admin-stat-grid">
          {/* CPU + load average */}
          <div
            className={`admin-stat-card ${
              cpuPercent != null ? usageClass(cpuPercent) : ""
            }`}
          >
            <div className="admin-stat-label">{t("admin.systemStatsCpu")}</div>
            {loading && (
              <div className="admin-stat-placeholder">
                {t("admin.systemStatsLoading")}
              </div>
            )}
            {!loading && error && (
              <div className="admin-stat-error">{error}</div>
            )}
            {!loading && !error && cpu && (
              <>
                <div className="admin-stat-value">{cpuPercent.toFixed(0)}%</div>
                <div className="admin-stat-caption">
                  {t("admin.systemStatsCpuThreads", {
                    threads: cpu.threads,
                    cores: cpu.cores ?? cpu.threads,
                  })}
                </div>
                {(load["1m"] != null ||
                  load["5m"] != null ||
                  load["15m"] != null) && (
                  <div className="admin-stat-caption">
                    {t("admin.systemStatsCpuLoad", {
                      load1: load["1m"]?.toFixed(2) ?? "—",
                      load5: load["5m"]?.toFixed(2) ?? "—",
                      load15: load["15m"]?.toFixed(2) ?? "—",
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Memory */}
          <div
            className={`admin-stat-card ${
              memPercent != null ? usageClass(memPercent) : ""
            }`}
          >
            <div className="admin-stat-label">
              {t("admin.systemStatsMemory")}
            </div>
            {loading && (
              <div className="admin-stat-placeholder">
                {t("admin.systemStatsLoading")}
              </div>
            )}
            {!loading && error && (
              <div className="admin-stat-error">{error}</div>
            )}
            {!loading && !error && mem && (
              <>
                <div className="admin-stat-value">{memPercent.toFixed(0)}%</div>
                <div className="admin-stat-caption">
                  {Math.round(mem.used / 1024 ** 3)} /{" "}
                  {Math.round(mem.total / 1024 ** 3)} GiB
                </div>
              </>
            )}
          </div>

          {/* Root disk (/) */}
          <div
            className={`admin-stat-card ${
              rootDiskPercent != null ? usageClass(rootDiskPercent) : ""
            }`}
          >
            <div className="admin-stat-label">
              {t("admin.systemStatsDiskRoot")}
            </div>
            {loading && (
              <div className="admin-stat-placeholder">
                {t("admin.systemStatsLoading")}
              </div>
            )}
            {!loading && error && (
              <div className="admin-stat-error">{error}</div>
            )}
            {!loading && !error && rootDisk && (
              <>
                <div className="admin-stat-value">
                  {rootDiskPercent.toFixed(0)}%
                </div>
                <div className="admin-stat-caption">
                  {Math.round(rootDisk.used / 1024 ** 3)} /{" "}
                  {Math.round(rootDisk.total / 1024 ** 3)} GiB
                </div>
                <div className="admin-stat-caption">
                  {t("admin.systemStatsDiskMount", {
                    mount: rootDisk.mount ?? "/",
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Disks & filesystems */}
      <section className="admin-section">
        <div className="admin-section-header">
          <h2 className="admin-section-title">{t("admin.systemDisksTitle")}</h2>
          <p className="admin-section-subtitle">
            {t("admin.systemDisksSubtitle")}
          </p>
        </div>

        <div className="admin-table-wrapper table-responsive">
          <table className="table table-sm table-dark table-striped align-middle admin-users-table admin-disks-table">
            <thead>
              <tr>
                <th scope="col">{t("admin.systemDisksColDevice")}</th>
                <th scope="col">{t("admin.systemDisksColMount")}</th>
                <th scope="col">{t("admin.systemDisksColFs")}</th>
                <th scope="col">{t("admin.systemDisksColUsed")}</th>
                <th scope="col">{t("admin.systemDisksColTotal")}</th>
                <th scope="col">{t("admin.systemDisksColUsage")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6}>{t("admin.systemStatsLoading")}</td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td colSpan={6} className="admin-stat-error">
                    {error}
                  </td>
                </tr>
              )}
              {!loading && !error && disks.length === 0 && (
                <tr>
                  <td colSpan={6}>{t("admin.systemDisksEmpty")}</td>
                </tr>
              )}
              {!loading &&
                !error &&
                disks.map((d) => {
                  const percent = d.percent ?? 0;
                  return (
                    <tr key={`${d.device}-${d.mountpoint}`}>
                      <td>{d.device}</td>
                      <td>{d.mountpoint}</td>
                      <td>{d.fstype || "—"}</td>
                      <td>{Math.round(d.used / 1024 ** 3)} GiB</td>
                      <td>{Math.round(d.total / 1024 ** 3)} GiB</td>
                      <td className={usageClass(percent)}>
                        {percent.toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* GPUs list (more detailed than overview) */}
      {gpus && gpus.length > 0 && (
        <section className="admin-section">
          <div className="admin-section-header">
            <h2 className="admin-section-title">
              {t("admin.systemGpusTitle")}
            </h2>
            <p className="admin-section-subtitle">
              {t("admin.systemGpusSubtitle")}
            </p>
          </div>

          <div className="admin-stat-grid">
            {gpus.map((g) => (
              <div
                key={g.index}
                className={`admin-stat-card ${usageClass(g.utilization)}`}
              >
                <div className="admin-stat-label">
                  GPU {g.index} – {g.name}
                </div>
                <div className="admin-stat-value">
                  {g.utilization.toFixed(0)}%
                </div>
                <div className="admin-stat-caption">
                  {g.memory_used} / {g.memory_total} MiB (
                  {g.memory_percent.toFixed(1)}%)
                </div>
                <div className="admin-stat-caption">Driver {g.driver}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
