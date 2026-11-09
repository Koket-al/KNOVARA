import React, { useState, useEffect, useCallback } from "react";
import { Card } from "../components/common/Card.jsx";
import { Button } from "../components/common/Button.jsx";
import { Badge } from "../components/common/Badge.jsx";
import { LoadingSpinner } from "../components/common/LoadingSpinner.jsx";
import { ErrorAlert } from "../components/common/ErrorAlert.jsx";
import { formatDate, truncateHash } from "../services/formatters.js";
import { api } from "../services/api.js";

const CATEGORIES = [
  "",
  "COMPUTER_SCIENCE",
  "IMMUNOLOGY",
  "BIOTECHNOLOGY",
  "PHYSICS",
  "CHEMISTRY",
  "ENGINEERING",
  "MEDICINE",
  "OTHER",
];

export function DiscoveriesPage({ onNavigate }) {
  const [discoveries, setDiscoveries] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 1 });
  const [category, setCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchDiscoveries = useCallback(async (page = 1) => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.getDiscoveries({
        page,
        limit: 12,
        category,
        q: debouncedQuery,
        sort,
      });
      setDiscoveries(res.discoveries || []);
      setPagination(res.pagination || { page: 1, limit: 12, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || "Failed to load discoveries");
    } finally {
      setIsLoading(false);
    }
  }, [category, debouncedQuery, sort]);

  useEffect(() => {
    fetchDiscoveries(1);
  }, [fetchDiscoveries]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Page Header */}
      <div className="flex-between" style={{ flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "2rem" }}>Public Discovery Catalog</h1>
          <p style={{ color: "var(--knovara-text-secondary)", fontSize: "0.875rem", marginTop: "4px" }}>
            Browse registered discoveries and cryptographic rights passports anchored on NEAR Testnet.
          </p>
        </div>

        <Button variant="primary" onClick={() => onNavigate("/register")}>
          + Register New Discovery
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="knovara-card"
        style={{
          padding: "16px",
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gap: "12px",
          alignItems: "center",
        }}
      >
        <input
          type="search"
          placeholder="Search by title, description, or discovery ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.filter(Boolean).map((cat) => (
            <option key={cat} value={cat}>
              {cat.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Sort: Newest First</option>
          <option value="oldest">Sort: Oldest First</option>
        </select>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* Discovery List */}
      {isLoading ? (
        <LoadingSpinner message="Querying public registered discoveries..." />
      ) : discoveries.length === 0 ? (
        <div
          className="knovara-card"
          style={{
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--knovara-text-muted)",
          }}
        >
          <h3 style={{ fontSize: "1.1rem", marginBottom: "8px" }}>No Discoveries Found</h3>
          <p style={{ fontSize: "0.875rem", maxWidth: "480px", margin: "0 auto 16px auto" }}>
            No registered discoveries match your current filter parameters. Be the first to anchor a new technical
            discovery.
          </p>
          <Button variant="primary" size="sm" onClick={() => onNavigate("/register")}>
            Register a Discovery
          </Button>
        </div>
      ) : (
        <div className="knovara-grid-3">
          {discoveries.map((disc) => (
            <Card
              key={disc.discovery_id}
              interactive
              style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}
            >
              <div>
                <div className="flex-between" style={{ marginBottom: "8px" }}>
                  <Badge variant="blue">{disc.public_metadata?.category || "DISCOVERY"}</Badge>
                  <span style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>
                    {formatDate(disc.registered_at || disc.created_at)}
                  </span>
                </div>

                <h3
                  style={{
                    fontSize: "1.1rem",
                    marginBottom: "8px",
                    lineHeight: 1.3,
                    wordBreak: "break-word",
                  }}
                >
                  {disc.public_metadata?.title || disc.discovery_id}
                </h3>

                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--knovara-text-secondary)",
                    lineHeight: 1.5,
                    marginBottom: "16px",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {disc.public_metadata?.description || "No public summary provided."}
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.75rem", marginBottom: "16px" }}>
                  <div>
                    <span style={{ color: "var(--knovara-text-muted)" }}>Discovery ID: </span>
                    <code>{truncateHash(disc.discovery_id, 10, 6)}</code>
                  </div>
                  <div>
                    <span style={{ color: "var(--knovara-text-muted)" }}>Token ID: </span>
                    <code>{truncateHash(disc.token_id, 10, 6)}</code>
                  </div>
                  <div>
                    <span style={{ color: "var(--knovara-text-muted)" }}>Controller: </span>
                    <code>{disc.rights_controller_id}</code>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", borderTop: "1px solid var(--knovara-border)", paddingTop: "12px" }}>
                <Button
                  variant="primary"
                  size="sm"
                  style={{ flex: 1 }}
                  onClick={() => onNavigate(`/discoveries/${encodeURIComponent(disc.discovery_id)}`)}
                >
                  View Discovery
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigate(`/discoveries/${encodeURIComponent(disc.discovery_id)}/passport`)}
                >
                  Passport
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex-between" style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--knovara-border)" }}>
          <Button
            variant="secondary"
            size="sm"
            disabled={pagination.page <= 1 || isLoading}
            onClick={() => fetchDiscoveries(pagination.page - 1)}
          >
            &larr; Previous Page
          </Button>

          <span style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)" }}>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} Total)
          </span>

          <Button
            variant="secondary"
            size="sm"
            disabled={pagination.page >= pagination.totalPages || isLoading}
            onClick={() => fetchDiscoveries(pagination.page + 1)}
          >
            Next Page &rarr;
          </Button>
        </div>
      )}
    </div>
  );
}
