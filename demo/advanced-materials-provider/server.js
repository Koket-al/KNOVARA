import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PROVIDER_PORT) || 5050;
const EXPECTED_API_KEY = process.env.PROVIDER_SECRET_KEY || "demo_adv_materials_secret_2026";

// Authentic materials database sourced from MMPDS-01, ASM Handbook, and NASA reports
export const MATERIALS_DATABASE = [
  {
    materialId: "AL-7075-T6",
    name: "Aluminum 7075-T6",
    category: "Aluminum Alloys",
    densityGcm3: 2.81,
    tensileStrengthMpa: 572,
    yieldStrengthMpa: 503,
    elasticModulusGpa: 71.7,
    corrosionResistance: "moderate",
    standardReference: "MMPDS-01 Section 3.2.6 (Design Values)",
    engineeringNotes: "Primary airframe structural alloy; high strength-to-weight ratio, susceptible to stress-corrosion cracking in marine environments without anodizing.",
  },
  {
    materialId: "AL-6061-T6",
    name: "Aluminum 6061-T6",
    category: "Aluminum Alloys",
    densityGcm3: 2.70,
    tensileStrengthMpa: 310,
    yieldStrengthMpa: 276,
    elasticModulusGpa: 68.9,
    corrosionResistance: "high",
    standardReference: "ASM Handbook Vol 2: Properties and Selection: Nonferrous Alloys",
    engineeringNotes: "Excellent general-purpose aerospace alloy with superior atmospheric and saltwater corrosion resistance; highly machinable and weldable.",
  },
  {
    materialId: "TI-6AL-4V-GR5",
    name: "Titanium Ti-6Al-4V (Grade 5, Annealed)",
    category: "Titanium Alloys",
    densityGcm3: 4.43,
    tensileStrengthMpa: 950,
    yieldStrengthMpa: 880,
    elasticModulusGpa: 113.8,
    corrosionResistance: "excellent",
    standardReference: "MMPDS-01 Section 5.3.1 (A-Basis Values)",
    engineeringNotes: "Benchmark aerospace workhorse for high-stress bracketry and nacelle fittings. Immune to saltwater, chlorides, and atmospheric corrosion up to 400°C.",
  },
  {
    materialId: "INCONEL-718",
    name: "Inconel 718 (Precipitation Hardened)",
    category: "Nickel Superalloys",
    densityGcm3: 8.19,
    tensileStrengthMpa: 1375,
    yieldStrengthMpa: 1100,
    elasticModulusGpa: 200.0,
    corrosionResistance: "excellent",
    standardReference: "MMPDS-01 Section 6.3.2 (High-Temperature Nickel-Base Alloys)",
    engineeringNotes: "High-density extreme-environment superalloy; retains exceptional yield and creep-rupture strength up to 700°C; outstanding pitting resistance.",
  },
  {
    materialId: "SS-316L",
    name: "Stainless Steel 316L (Cold Finished)",
    category: "Austenitic Stainless Steels",
    densityGcm3: 8.00,
    tensileStrengthMpa: 620,
    yieldStrengthMpa: 310,
    elasticModulusGpa: 193.0,
    corrosionResistance: "excellent",
    standardReference: "ASM Handbook Vol 1: Properties and Selection: Irons, Steels",
    engineeringNotes: "Molybdenum-bearing austenitic steel offering superior chloride pitting resistance; non-magnetic and widely used in marine and chemical robotics.",
  },
  {
    materialId: "CFRP-T300-QUASI",
    name: "Carbon Fiber Epoxy Composite (T300, Quasi-Isotropic)",
    category: "Polymer Matrix Composites",
    densityGcm3: 1.55,
    tensileStrengthMpa: 720,
    yieldStrengthMpa: 650,
    elasticModulusGpa: 48.0,
    corrosionResistance: "excellent",
    standardReference: "NASA-CR-4734 / Composite Materials Handbook CMH-17-2G",
    engineeringNotes: "Ultralight structural composite. Zero electrochemical corrosion; requires galvanic isolation if in direct contact with aluminum in marine environments.",
  },
  {
    materialId: "PEEK-CF30",
    name: "PEEK 30% Carbon Fiber Reinforced",
    category: "High-Performance Thermoplastics",
    densityGcm3: 1.40,
    tensileStrengthMpa: 240,
    yieldStrengthMpa: 215,
    elasticModulusGpa: 13.0,
    corrosionResistance: "excellent",
    standardReference: "ASTM D638 / ISO 527 Polymer Engineering Standards",
    engineeringNotes: "Engineered thermoplastic; extremely chemical-resistant, hydrophobic, lightweight alternative for non-structural or moderate-load drone brackets.",
  },
];

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Health check
  if (method === "GET" && pathname === "/health") {
    return sendJson(res, 200, {
      status: "healthy",
      provider: "Advanced Materials Research",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  }

  // OpenAPI spec
  if (method === "GET" && pathname === "/v1/openapi.json") {
    try {
      const specPath = path.join(__dirname, "openapi.json");
      const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
      return sendJson(res, 200, spec);
    } catch (_err) {
      return sendJson(res, 500, { error: "Failed to read OpenAPI spec" });
    }
  }

  // Material recommendations
  if (pathname === "/v1/materials/recommendations") {
    if (method !== "POST") {
      return sendJson(res, 405, { error: "Method Not Allowed" });
    }

    // Authenticate header
    const apiKey = req.headers["x-provider-api-key"];
    if (!apiKey) {
      return sendJson(res, 401, {
        error: "ERR_UNAUTHORIZED: Missing required 'x-provider-api-key' header",
      });
    }

    if (apiKey !== EXPECTED_API_KEY) {
      return sendJson(res, 403, {
        error: "ERR_FORBIDDEN: Invalid provider API key",
      });
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      let parsed = {};
      if (body) {
        try {
          parsed = JSON.parse(body);
        } catch (_e) {
          return sendJson(res, 400, { error: "Invalid JSON body" });
        }
      }

      const {
        application,
        maximumDensity,
        minimumTensileStrengthMpa,
        corrosionResistance,
      } = parsed;

      const maxDensity = maximumDensity !== undefined ? Number(maximumDensity) : Infinity;
      const minStrength = minimumTensileStrengthMpa !== undefined ? Number(minimumTensileStrengthMpa) : 0;
      const targetCorrosion = (corrosionResistance || "").toLowerCase();

      const corrosionRank = {
        moderate: 1,
        high: 2,
        excellent: 3,
      };

      const minCorrosionLevel = corrosionRank[targetCorrosion] || 0;

      const matching = MATERIALS_DATABASE.filter((mat) => {
        if (mat.densityGcm3 > maxDensity) return false;
        if (mat.tensileStrengthMpa < minStrength) return false;
        if (minCorrosionLevel > 0) {
          const matLevel = corrosionRank[mat.corrosionResistance] || 0;
          if (matLevel < minCorrosionLevel) return false;
        }
        return true;
      });

      const ranked = matching.map((mat) => {
        const specificStrength = mat.tensileStrengthMpa / mat.densityGcm3;
        const score = Math.min(0.99, Math.max(0.5, specificStrength / 500));
        return {
          ...mat,
          suitabilityScore: Number(score.toFixed(3)),
        };
      });

      ranked.sort((a, b) => b.suitabilityScore - a.suitabilityScore);

      return sendJson(res, 200, {
        application: application || "unspecified structural component",
        count: ranked.length,
        recommendations: ranked,
        disclaimer:
          "Data sourced from authoritative materials engineering references (MMPDS-01, ASM Handbook, NASA-CR-4734). Properties represent nominal/design allowables. Experimental qualification and environmental coupon testing required prior to flight-critical or load-bearing production use.",
      });
    });
    return;
  }

  // 404 for other routes
  return sendJson(res, 404, { error: "Not Found" });
}

export function createDemoServer() {
  return http.createServer(handleRequest);
}

// Auto-run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createDemoServer();
  server.listen(PORT, () => {
    console.log(`[Advanced Materials Provider] Running at http://localhost:${PORT}`);
  });
}

export default handleRequest;
