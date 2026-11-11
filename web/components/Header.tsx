import React from "react";
import Link from "next/link";
import type { HealthResponse } from "../lib/api";

interface HeaderProps {
  health: HealthResponse | null;
  healthError: boolean;
}

export const Header: React.FC<HeaderProps> = ({ health, healthError }) => {
  return (
    <header className="site-header" role="banner">
      <div className="container header-content">
        <Link href="/" className="logo-group" aria-label="PolyFind Home">
          <div className="logo-badge" aria-hidden="true">PF</div>
          <div>
            <h1 className="logo-title">PolyFind</h1>
            <span className="logo-subtitle">Adaptive Multi-Store Retrieval</span>
          </div>
        </Link>

        <div className="header-status">
          {healthError ? (
            <div className="health-badge error" role="status" title="API unreachable. Check backend.">
              <span className="health-dot" aria-hidden="true" />
              <span>API Offline</span>
            </div>
          ) : health ? (
            <div
              className={`health-badge ${health.status === "ok" ? "" : "warning"}`}
              role="status"
              title={`PolyFind API v${health.version} - Status: ${health.status}`}
            >
              <span className="health-dot" aria-hidden="true" />
              <span>API Ready</span>
            </div>
          ) : (
            <div className="health-badge" role="status">
              <span className="health-dot" aria-hidden="true" />
              <span>Checking API...</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
