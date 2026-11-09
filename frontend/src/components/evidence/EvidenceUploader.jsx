import React, { useState } from "react";
import { Button } from "../common/Button.jsx";
import { Badge } from "../common/Badge.jsx";
import { calculateFileSha256 } from "../../services/cryptoUtils.js";
import { truncateHash } from "../../services/formatters.js";
import { api } from "../../services/api.js";

const CLASSIFICATIONS = [
  { value: "TECHNICAL_DOCUMENTATION", label: "Technical Documentation" },
  { value: "EVALUATION_SAMPLE", label: "Evaluation Sample" },
  { value: "FULL_DATASET", label: "Full Dataset" },
  { value: "CAD_SCHEMATICS", label: "CAD / Schematics" },
  { value: "OTHER", label: "Other Supporting Evidence" },
];

export function EvidenceUploader({ onEvidenceListChange, verifiedUploads = [] }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [classification, setClassification] = useState("TECHNICAL_DOCUMENTATION");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadError, setUploadError] = useState(null);
  const [uploads, setUploads] = useState(verifiedUploads);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadError(null);
    }
  };

  const handleUploadAndVerify = async () => {
    if (!selectedFile) return;

    try {
      setIsUploading(true);
      setUploadError(null);
      setUploadProgress("Computing client-side SHA-256 digest...");

      // 1. Client-side hash verification
      const { sha256Hex: clientHash, sizeBytes } = await calculateFileSha256(selectedFile);

      setUploadProgress("Requesting presigned upload URL from backend...");
      const contentType = selectedFile.type || "application/octet-stream";

      // 2. Request presigned upload intent
      const uploadIntent = await api.requestEvidenceUpload({
        filename: selectedFile.name,
        contentType,
        fileSize: sizeBytes,
        classification,
      });

      setUploadProgress("Uploading file to private object storage...");

      // 3. Direct upload to R2 via presigned PUT with automatic backend fallback
      let uploadSucceeded = false;
      try {
        const putRes = await fetch(uploadIntent.presignedUrl, {
          method: "PUT",
          body: selectedFile,
          headers: {
            "Content-Type": contentType,
          },
        });

        if (putRes.ok) {
          uploadSucceeded = true;
        } else {
          console.warn(`[UPLOAD] Direct R2 upload returned status ${putRes.status}, falling back to server relay`);
        }
      } catch (directErr) {
        console.warn("[UPLOAD] Direct browser-to-R2 upload failed (likely CORS preflight); switching to server relay:", directErr);
      }

      // If direct presigned upload failed or was blocked by browser CORS, upload via authenticated backend relay
      if (!uploadSucceeded) {
        setUploadProgress("Relaying upload through secure backend to storage...");
        await api.uploadEvidenceContent(uploadIntent.uploadId, selectedFile, contentType);
      }

      setUploadProgress("Finalizing and verifying streaming SHA-256 on backend...");

      // 4. Complete upload and trigger server-side byte verification
      const completeRes = await api.completeEvidenceUpload(uploadIntent.uploadId);

      const verifiedItem = {
        uploadId: uploadIntent.uploadId,
        filename: selectedFile.name,
        fileSize: sizeBytes,
        classification,
        sha256Digest: completeRes.upload.sha256Digest,
        verifiedAt: completeRes.upload.verifiedAt,
        status: completeRes.upload.status,
      };

      const updated = [...uploads, verifiedItem];
      setUploads(updated);
      if (onEvidenceListChange) {
        onEvidenceListChange(updated);
      }

      setSelectedFile(null);
      setUploadProgress("");
    } catch (err) {
      console.error("[UPLOAD] Error:", err);
      setUploadError(err.message || "Upload and verification failed");
      setUploadProgress("");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = (uploadId) => {
    const updated = uploads.filter((u) => u.uploadId !== uploadId);
    setUploads(updated);
    if (onEvidenceListChange) {
      onEvidenceListChange(updated);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Upload Box */}
      <div
        style={{
          border: "2px dashed var(--knovara-border-strong)",
          backgroundColor: "var(--knovara-surface-highlight)",
          borderRadius: "var(--radius-sm)",
          padding: "20px",
        }}
      >
        <h4 style={{ fontSize: "1rem", marginBottom: "8px" }}>Upload Supporting Evidence File</h4>
        <p style={{ fontSize: "0.8125rem", color: "var(--knovara-text-secondary)", marginBottom: "16px" }}>
          Files are transferred directly to private Cloudflare R2 storage. Their streaming SHA-256 digests
          are verified byte-for-byte and anchored in the canonical evidence manifest.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
              Select File
            </label>
            <input
              type="file"
              onChange={handleFileChange}
              disabled={isUploading}
              style={{ padding: "6px", backgroundColor: "#fff" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "4px" }}>
              Evidence Classification
            </label>
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
              disabled={isUploading}
            >
              {CLASSIFICATIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {uploadProgress && (
          <div style={{ fontSize: "0.8125rem", color: "var(--knovara-blue-primary)", marginBottom: "12px" }}>
            ⏳ {uploadProgress}
          </div>
        )}

        {uploadError && (
          <div className="knovara-alert knovara-alert-danger" style={{ marginBottom: "12px" }}>
            {uploadError}
          </div>
        )}

        <Button
          variant="primary"
          onClick={handleUploadAndVerify}
          disabled={!selectedFile || isUploading}
          isLoading={isUploading}
        >
          Upload & Verify Digest
        </Button>
      </div>

      {/* Verified Evidence List */}
      <div>
        <h5 style={{ fontSize: "0.875rem", textTransform: "uppercase", marginBottom: "8px" }}>
          Attached Verified Evidence Items ({uploads.length})
        </h5>

        {uploads.length === 0 ? (
          <div style={{ fontSize: "0.8125rem", color: "var(--knovara-text-muted)", fontStyle: "italic" }}>
            No evidence files attached yet. At least one verified evidence item is required to register.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {uploads.map((item) => (
              <div
                key={item.uploadId}
                className="flex-between"
                style={{
                  backgroundColor: "var(--knovara-surface)",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--knovara-border)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{item.filename}</div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
                    <Badge variant="blue">{item.classification}</Badge>
                    <span style={{ fontSize: "0.75rem", color: "var(--knovara-text-muted)" }}>
                      {(item.fileSize / 1024).toFixed(1)} KB
                    </span>
                    <span className="knovara-hash-badge" title={item.sha256Digest}>
                      SHA-256: {truncateHash(item.sha256Digest, 6, 6)}
                    </span>
                    <Badge variant="success">VERIFIED</Badge>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemove(item.uploadId)}
                  disabled={isUploading}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

