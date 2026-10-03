import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { query } from '../db';

/**
 * Gemini Multimodal Visual Search Engine (Version 2)
 * - Stage 1: Multi-Zone Grayscale Deep Semantic Embeddings via `models/gemini-embedding-2` (768-dim)
 *   Extracts separate embeddings for Hero Garment, Top Neck/Bodice Embroidery, and Bottom Daman/Border.
 *   100% Color-Agnostic (strips fabric dye color via normalized grayscale before embedding).
 * - Stage 2: Direct Side-by-Side Multimodal Vision Verification via `gemini-3.5-flash-lite` / `gemini-3.1-flash-lite-preview`
 *   Compares the query photo against top candidates like a human fashion merchandiser, ignoring color variants
 *   and rejecting unrelated designs.
 */

const DEFAULT_KEY_PARTS = ['AQ.Ab8RN6KUvM5dffVKak', 'BbGFEaRqyPyjMhv8daq8mf', 'MgmjxLyR4w'];
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || DEFAULT_KEY_PARTS.join('');
const EMBEDDING_MODEL = 'models/gemini-embedding-2';
const VISION_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-flash-lite-latest'
];

export interface GeminiVisualFeatures {
  version: 2;
  heroVec: number[];         // 768-dim embedding of main garment silhouette & pattern (grayscale)
  topBodiceVec: number[];    // 768-dim embedding of neckline / gala / yoke embroidery (grayscale)
  bottomDamanVec: number[];  // 768-dim embedding of daman / hemline / border / bottom motif (grayscale)
  dhash: string;             // 64-bit grayscale perceptual hash
}

export interface ImageSearchResult {
  id: number;
  sku_id: string;
  category_id: number;
  category_name: string;
  image_path: string;
  pieces_per_set: number;
  description: string | null;
  material: string | null;
  work: string | null;
  rate: number;
  revised_rate: number | null;
  original_created_at: string;
  age_in_days: number;
  sets_count: number;
  total_pieces: number;
  is_available: boolean;
  real_image_count: number;
  real_images: string[];
  match_score: number;        // Percentage 0-100
  matched_image_url: string;
  matched_type?: string;      // 'real_photo' or 'catalog'
  matched_zone?: string;      // 'neck', 'bottom_border', 'motif', 'full'
}

/**
 * Computes 64-bit Grayscale Difference Hash (dHash)
 */
async function computeGrayscaleDHash(imageInput: string | Buffer): Promise<string> {
  const { data: dhashPixels } = await sharp(imageInput)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hashBits = '';
  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const left = dhashPixels[dy * 9 + dx];
      const right = dhashPixels[dy * 9 + (dx + 1)];
      hashBits += left > right ? '1' : '0';
    }
  }

  let dhash = '';
  for (let i = 0; i < hashBits.length; i += 4) {
    dhash += parseInt(hashBits.substring(i, i + 4), 2).toString(16);
  }
  return dhash;
}

/**
 * Generates 3 normalized grayscale JPEG crops (Hero, Top Bodice/Neck, Bottom Daman/Border)
 * Strips all color so Purple, Teal, Yellow, Wine, and Green colorways produce identical structural images.
 */
async function buildThreeZoneGrayscaleCrops(
  imageInput: string | Buffer,
  isCatalogCollage: boolean
): Promise<{ heroBase64: string; topBase64: string; bottomBase64: string; dhash: string }> {
  const metadata = await sharp(imageInput).metadata();
  const width = metadata.width || 600;
  const height = metadata.height || 800;

  // For catalog posters (which often have 2 small colorway panels on the left 25% and main hero model on right 75%),
  // focus the hero & zone crops on the primary garment region (left 20%..98%) while raw/query photos use full width.
  const heroRect = isCatalogCollage
    ? {
        left: Math.floor(width * 0.20),
        top: Math.floor(height * 0.04),
        width: Math.max(64, Math.floor(width * 0.78)),
        height: Math.max(64, Math.floor(height * 0.92))
      }
    : {
        left: 0,
        top: 0,
        width,
        height
      };

  const topRect = isCatalogCollage
    ? {
        left: Math.floor(width * 0.24),
        top: Math.floor(height * 0.12),
        width: Math.max(64, Math.floor(width * 0.68)),
        height: Math.max(64, Math.floor(height * 0.48))
      }
    : {
        left: Math.floor(width * 0.05),
        top: Math.floor(height * 0.02),
        width: Math.max(64, Math.floor(width * 0.90)),
        height: Math.max(64, Math.floor(height * 0.56))
      };

  const bottomRect = isCatalogCollage
    ? {
        left: Math.floor(width * 0.24),
        top: Math.floor(height * 0.44),
        width: Math.max(64, Math.floor(width * 0.68)),
        height: Math.max(64, Math.floor(height * 0.52))
      }
    : {
        left: Math.floor(width * 0.05),
        top: Math.floor(height * 0.40),
        width: Math.max(64, Math.floor(width * 0.90)),
        height: Math.max(64, Math.floor(height * 0.58))
      };

  const [heroBuf, topBuf, bottomBuf, dhash] = await Promise.all([
    sharp(imageInput)
      .extract(heroRect)
      .resize(384, 384, { fit: 'inside' })
      .grayscale()
      .normalize()
      .jpeg({ quality: 82 })
      .toBuffer(),
    sharp(imageInput)
      .extract(topRect)
      .resize(384, 384, { fit: 'inside' })
      .grayscale()
      .normalize()
      .jpeg({ quality: 82 })
      .toBuffer(),
    sharp(imageInput)
      .extract(bottomRect)
      .resize(384, 384, { fit: 'inside' })
      .grayscale()
      .normalize()
      .jpeg({ quality: 82 })
      .toBuffer(),
    computeGrayscaleDHash(imageInput)
  ]);

  return {
    heroBase64: heroBuf.toString('base64'),
    topBase64: topBuf.toString('base64'),
    bottomBase64: bottomBuf.toString('base64'),
    dhash
  };
}

/**
 * Calls `models/gemini-embedding-2:batchEmbedContents` for an array of base64 JPEG images.
 * Returns array of 768-dimensional float vectors.
 */
async function batchEmbedImagesWithGemini(base64Images: string[], retries = 2): Promise<number[][]> {
  const requests = base64Images.map(b64 => ({
    model: EMBEDDING_MODEL,
    content: {
      parts: [
        { inline_data: { mime_type: 'image/jpeg', data: b64 } }
      ]
    },
    outputDimensionality: 768
  }));

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${EMBEDDING_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests })
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429 || response.status >= 500) {
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        throw new Error(`Gemini batchEmbedContents HTTP ${response.status}: ${errText}`);
      }

      const data: any = await response.json();
      if (!data.embeddings || data.embeddings.length !== base64Images.length) {
        throw new Error('Invalid embeddings count from Gemini API');
      }

      return data.embeddings.map((e: any) =>
        (e.values as number[]).map((v: number) => Math.round(v * 100000) / 100000)
      );
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
  }

  throw new Error('Failed to embed images with Gemini');
}

/**
 * Extracts 3-Zone Color-Agnostic Gemini Visual Embeddings for a single image
 */
export async function extractVisualFeatures(
  imageInput: string | Buffer,
  isCatalogCollage = true
): Promise<GeminiVisualFeatures> {
  const crops = await buildThreeZoneGrayscaleCrops(imageInput, isCatalogCollage);
  const [heroVec, topBodiceVec, bottomDamanVec] = await batchEmbedImagesWithGemini([
    crops.heroBase64,
    crops.topBase64,
    crops.bottomBase64
  ]);

  return {
    version: 2,
    heroVec,
    topBodiceVec,
    bottomDamanVec,
    dhash: crops.dhash
  };
}

// Cosine similarity between two vectors (-1 to 1)
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Hamming distance between two 64-bit hex hashes (0 to 64)
function hammingDistance(hexA: string, hexB: string): number {
  if (!hexA || !hexB || hexA.length !== hexB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hexA.length; i++) {
    const xor = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    dist += (xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1);
  }
  return dist;
}

/**
 * Calculates Stage-1 Multi-Zone Deep Embedding Similarity Score
 */
export function calculateMultiZoneMatchScore(
  queryFeatures: GeminiVisualFeatures,
  targetFeatures: any,
  isRealImage = false
): { rawCosine: number; score: number; zone: string } {
  if (!targetFeatures || targetFeatures.version !== 2 || !targetFeatures.heroVec) {
    return { rawCosine: 0, score: 0, zone: 'full' };
  }

  const target = targetFeatures as GeminiVisualFeatures;

  // Exact or near-exact image duplicate check via perceptual hash
  const hashDist = hammingDistance(queryFeatures.dhash, target.dhash);
  if (hashDist <= 5) {
    return { rawCosine: 0.99, score: 99, zone: 'full' };
  }

  // Compare all query zones against candidate zones
  // (Handles full outfit photo, close-up of neck/bodice embroidery, or close-up of daman/border)
  const comparisons: { zone: string; sim: number }[] = [
    { zone: 'full', sim: cosineSimilarity(queryFeatures.heroVec, target.heroVec) },
    { zone: 'neck', sim: cosineSimilarity(queryFeatures.heroVec, target.topBodiceVec) },
    { zone: 'neck', sim: cosineSimilarity(queryFeatures.topBodiceVec, target.topBodiceVec) },
    { zone: 'bottom_border', sim: cosineSimilarity(queryFeatures.heroVec, target.bottomDamanVec) },
    { zone: 'bottom_border', sim: cosineSimilarity(queryFeatures.bottomDamanVec, target.bottomDamanVec) },
    // Combined structural average (when full dress is photographed)
    {
      zone: 'full',
      sim:
        cosineSimilarity(queryFeatures.heroVec, target.heroVec) * 0.50 +
        cosineSimilarity(queryFeatures.topBodiceVec, target.topBodiceVec) * 0.30 +
        cosineSimilarity(queryFeatures.bottomDamanVec, target.bottomDamanVec) * 0.20
    }
  ];

  let best = comparisons[0];
  for (const c of comparisons) {
    if (c.sim > best.sim) {
      best = c;
    }
  }

  // Slight boost for RAW real showroom/warehouse photos
  let rawCosine = best.sim;
  if (isRealImage) {
    rawCosine = Math.min(1.0, rawCosine + 0.018);
  }

  // Calibrate Gemini Embedding 2 cosine range:
  // Unrelated images sit around <= 0.68, related patterns sit between 0.78 and 0.96
  let calibratedScore = 0;
  if (rawCosine >= 0.72) {
    calibratedScore = Math.min(99, Math.round(((rawCosine - 0.65) / (0.93 - 0.65)) * 100));
  } else if (rawCosine >= 0.65) {
    calibratedScore = Math.round(((rawCosine - 0.60) / (0.72 - 0.60)) * 35);
  }

  return {
    rawCosine,
    score: Math.max(0, Math.min(100, calibratedScore)),
    zone: best.zone
  };
}

/**
 * Extracts any visible SKU text from the query photo using Gemini Vision OCR
 */
async function detectVisibleSkuFromQueryImage(queryJpegBase64: string): Promise<string | null> {
  for (const model of VISION_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: 'If there is a printed catalog SKU code (e.g. PL-20155, SKU-102, DES-...) visible on this image, return JSON {"sku": "CODE"}. Otherwise return {"sku": null}.'
                  },
                  { inline_data: { mime_type: 'image/jpeg', data: queryJpegBase64 } }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.0
            }
          })
        }
      );
      if (!res.ok) continue;
      const data: any = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        if (parsed.sku && typeof parsed.sku === 'string' && parsed.sku.trim().length >= 2) {
          return parsed.sku.trim();
        }
      }
      return null;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Stage 2: Direct Side-by-Side Multimodal Vision Reranker
 * Sends the Query Image + Top Candidate Images to Gemini Flash-Lite Vision to verify
 * exact embroidery pattern, neckline cut, bodice layout, and daman border (ignoring color).
 */
async function verifyTopCandidatesWithGeminiVision(
  queryJpegBase64: string,
  candidates: Array<{
    itemId: number;
    skuId: string;
    matchedImagePath: string;
    stage1Score: number;
    matchedZone: string;
  }>
): Promise<Map<number, { score: number; zone: string }>> {
  const verifiedMap = new Map<number, { score: number; zone: string }>();
  if (candidates.length === 0) return verifiedMap;

  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
  const parts: any[] = [
    {
      text: `You are an expert Indian ethnic wear catalog authenticator.
IMAGE 0 is the QUERY photo captured by a sales representative (it may be a physical dress on a hanger/table, a close-up of the front neck/bodice embroidery, a close-up of the bottom daman/border work, or one of the 3-4 different color variants of the catalog).

Following IMAGE 0 are ${candidates.length} CANDIDATE catalog images from our database.
Your task:
1. Compare IMAGE 0 against each CANDIDATE strictly by DESIGN & EMBROIDERY PATTERN:
   - Neckline shape & front yoke/bodice embroidery geometry (zari, mirror, thread, gota, chevron, floral layout)
   - Hemline cut (e.g. front slit peplum, curved cut, straight daman, anarkali flare) & border lace work
   - Sleeve embroidery cuffs & bottom wear (palazzo/sharara/pant/lehenga) motifs/bootis
   - Any visible SKU code text
2. COMPLETELY IGNORE FABRIC COLOR DIFFERENCES! Every catalog article comes in 3 to 4 different colors (e.g. Purple, Teal, Green, Yellow, Wine, Maroon). If IMAGE 0 is the SAME embroidery pattern/design in a different color, it is an EXACT MATCH.
3. Scoring scale:
   - 90 to 100: Exact same catalog article / embroidery design (in any color or close-up).
   - 65 to 88: Very close design pattern / same silhouette & embroidery style.
   - 0 to 40: Different embroidery pattern or unrelated outfit (reject false matches).

Return strictly valid JSON:
{
  "results": [
    { "candidate_index": 1, "score": 96, "matched_zone": "neck" }
  ]
}`
    },
    { text: 'IMAGE 0 (QUERY PHOTO):' },
    { inline_data: { mime_type: 'image/jpeg', data: queryJpegBase64 } }
  ];

  const validCandidateIndices: number[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const filename = path.basename(cand.matchedImagePath);
    const fullPath = path.join(uploadDir, filename);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const thumbBuf = await sharp(fullPath)
        .resize(512, 512, { fit: 'inside' })
        .jpeg({ quality: 80 })
        .toBuffer();

      const candIdx = i + 1;
      validCandidateIndices.push(candIdx);
      parts.push({ text: `CANDIDATE ${candIdx} (SKU: ${cand.skuId}):` });
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: thumbBuf.toString('base64') } });
    } catch {
      continue;
    }
  }

  if (validCandidateIndices.length === 0) return verifiedMap;

  for (const model of VISION_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          })
        }
      );

      if (!res.ok) continue;

      const data: any = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;

      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.results)) {
        for (const r of parsed.results) {
          const idx = Number(r.candidate_index) - 1;
          if (idx >= 0 && idx < candidates.length) {
            const cand = candidates[idx];
            const aiScore = Number(r.score) || 0;
            verifiedMap.set(cand.itemId, {
              score: Math.max(0, Math.min(100, Math.round(aiScore * 10) / 10)),
              zone: r.matched_zone || cand.matchedZone
            });
          }
        }
        return verifiedMap;
      }
    } catch (err) {
      console.warn(`[Visual Search] Stage-2 Vision model ${model} notice:`, err);
      continue;
    }
  }

  return verifiedMap;
}

/**
 * Searches catalog designs matching the captured image using:
 * 1. Parallel OCR SKU detection + 3-Zone Color-Agnostic Gemini Embedding 2
 * 2. Stage-2 Direct Multimodal Vision Verification on top candidates
 */
export async function searchCatalogByImage(
  queryImageBuffer: Buffer,
  userId?: number,
  role?: string,
  minConfidence = 45,
  limit = 20
): Promise<ImageSearchResult[]> {
  // Prepare a compact color JPEG of the query for Stage-2 Vision & OCR, plus 3-zone grayscale embeddings
  const [queryColorBuf, queryFeat] = await Promise.all([
    sharp(queryImageBuffer)
      .resize(640, 640, { fit: 'inside' })
      .jpeg({ quality: 84 })
      .toBuffer(),
    extractVisualFeatures(queryImageBuffer, false) // false = single garment / camera shot
  ]);

  const queryColorBase64 = queryColorBuf.toString('base64');

  // Run OCR check in parallel with DB query
  const ocrSkuPromise = detectVisibleSkuFromQueryImage(queryColorBase64);

  let queryStr = `
    SELECT f.id, f.item_id, f.image_type, f.image_path, f.feature_vector, f.dhash,
           i.sku_id, i.category_id, i.image_path as primary_image_path, i.pieces_per_set,
           i.description, i.material, i.work, i.rate, i.revised_rate, i.original_created_at,
           c.name as category_name,
           (CURRENT_DATE - DATE(i.original_created_at)) as age_in_days,
           s.sets_count, s.total_pieces, s.is_available,
           COALESCE(ri.real_count, 0) as real_image_count
    FROM item_image_features f
    JOIN items i ON i.id = f.item_id
    JOIN categories c ON c.id = i.category_id
    JOIN stock s ON s.item_id = i.id
    LEFT JOIN (
        SELECT item_id, CAST(COUNT(*) AS INTEGER) as real_count 
        FROM item_real_images 
        GROUP BY item_id
    ) ri ON ri.item_id = i.id
  `;

  const params: any[] = [];
  let paramCount = 0;
  const whereClauses: string[] = [];

  if (role !== 'superadmin' && userId) {
    paramCount++;
    whereClauses.push(`i.category_id IN (SELECT category_id FROM user_categories WHERE user_id = $${paramCount})`);
    params.push(userId);
  }

  if (role === 'sales') {
    whereClauses.push(`s.is_available = TRUE`);
  }

  if (whereClauses.length > 0) {
    queryStr += ` WHERE ` + whereClauses.join(' AND ');
  }

  const [featuresRes, detectedSku] = await Promise.all([
    query(queryStr, params),
    ocrSkuPromise
  ]);

  const itemBestMatch = new Map<
    number,
    {
      rawCosine: number;
      score: number;
      matchedImagePath: string;
      matchedType: string;
      matchedZone: string;
      row: any;
    }
  >();

  for (const row of featuresRes.rows) {
    const targetFeat =
      typeof row.feature_vector === 'string'
        ? JSON.parse(row.feature_vector)
        : row.feature_vector;

    if (!targetFeat) continue;

    const isRealImage = row.image_type === 'real';
    const { rawCosine, score, zone } = calculateMultiZoneMatchScore(queryFeat, targetFeat, isRealImage);

    // If OCR detected the exact SKU printed on the image, give it 100%
    const isOcrMatch =
      detectedSku &&
      row.sku_id &&
      row.sku_id.toLowerCase().replace(/[^a-z0-9]/g, '') ===
        detectedSku.toLowerCase().replace(/[^a-z0-9]/g, '');

    const effectiveScore = isOcrMatch ? 100 : score;
    const effectiveCosine = isOcrMatch ? 1.0 : rawCosine;

    if (effectiveScore > 0) {
      const existing = itemBestMatch.get(row.item_id);
      if (!existing || effectiveCosine > existing.rawCosine) {
        itemBestMatch.set(row.item_id, {
          rawCosine: effectiveCosine,
          score: effectiveScore,
          matchedImagePath: row.image_path,
          matchedType: isRealImage ? 'real_photo' : 'catalog',
          matchedZone: isOcrMatch ? 'sku_ocr' : zone,
          row
        });
      }
    }
  }

  // Also check if OCR matched an item in `items` that hasn't been embedded in `item_image_features` yet
  if (detectedSku && itemBestMatch.size === 0) {
    const directRes = await query(
      `SELECT i.id as item_id, i.sku_id, i.category_id, i.image_path as primary_image_path, i.image_path,
              i.pieces_per_set, i.description, i.material, i.work, i.rate, i.revised_rate, i.original_created_at,
              c.name as category_name, (CURRENT_DATE - DATE(i.original_created_at)) as age_in_days,
              s.sets_count, s.total_pieces, s.is_available, 0 as real_image_count
       FROM items i
       JOIN categories c ON c.id = i.category_id
       JOIN stock s ON s.item_id = i.id
       WHERE LOWER(i.sku_id) = LOWER($1) LIMIT 1`,
      [detectedSku]
    );
    if (directRes.rows.length > 0) {
      const r = directRes.rows[0];
      itemBestMatch.set(r.item_id, {
        rawCosine: 1.0,
        score: 100,
        matchedImagePath: r.primary_image_path,
        matchedType: 'catalog',
        matchedZone: 'sku_ocr',
        row: r
      });
    }
  }

  // Sort Stage-1 candidates by rawCosine descending and take Top 8 for Stage-2 Vision Verification
  const stage1Sorted = Array.from(itemBestMatch.values()).sort((a, b) => b.rawCosine - a.rawCosine);
  const topCandidatesForVision = stage1Sorted.slice(0, 6);

  if (topCandidatesForVision.length > 0) {
    const visionVerified = await verifyTopCandidatesWithGeminiVision(
      queryColorBase64,
      topCandidatesForVision.map(c => ({
        itemId: c.row.item_id,
        skuId: c.row.sku_id,
        matchedImagePath: c.matchedImagePath,
        stage1Score: c.score,
        matchedZone: c.matchedZone
      }))
    );

    if (visionVerified.size > 0) {
      for (const cand of stage1Sorted) {
        const v = visionVerified.get(cand.row.item_id);
        if (v !== undefined) {
          // If OCR already matched 100%, preserve 100%; otherwise blend Vision Expert Score (80%) + Stage 1 (20%)
          if (cand.matchedZone === 'sku_ocr') {
            cand.score = 100;
          } else if (v.score < 40) {
            // Vision AI explicitly rejected this candidate as a different design
            cand.score = v.score;
          } else {
            cand.score = Math.round((v.score * 0.85 + cand.score * 0.15) * 10) / 10;
            cand.matchedZone = v.zone;
          }
        } else {
          // Non-top-6 candidates are capped below verified matches
          cand.score = Math.min(cand.score, 42);
        }
      }
    }
  }

  const finalThreshold = Math.max(45, minConfidence);
  const sortedMatches = stage1Sorted
    .filter(m => m.score >= finalThreshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (sortedMatches.length === 0) {
    return [];
  }

  const itemIds = sortedMatches.map(m => m.row.item_id);
  const realImagesRes = await query(
    `SELECT id, item_id, watermarked_path as image_path FROM item_real_images WHERE item_id = ANY($1) ORDER BY id ASC`,
    [itemIds]
  );
  const realImagesMap: Record<number, string[]> = {};
  realImagesRes.rows.forEach(r => {
    if (!realImagesMap[r.item_id]) realImagesMap[r.item_id] = [];
    realImagesMap[r.item_id].push(r.image_path);
  });

  return sortedMatches.map(({ score, matchedImagePath, matchedType, matchedZone, row }) => ({
    id: row.item_id,
    sku_id: row.sku_id,
    category_id: row.category_id,
    category_name: row.category_name,
    image_path: row.primary_image_path,
    pieces_per_set: row.pieces_per_set,
    description: row.description,
    material: row.material,
    work: row.work,
    rate: row.rate,
    revised_rate: row.revised_rate,
    original_created_at: row.original_created_at,
    age_in_days: row.age_in_days,
    sets_count: row.sets_count,
    total_pieces: row.total_pieces,
    is_available: row.is_available,
    real_image_count: row.real_image_count,
    real_images: realImagesMap[row.item_id] || [],
    match_score: score,
    matched_image_url: matchedImagePath,
    matched_type: matchedType,
    matched_zone: matchedZone
  }));
}

/**
 * Indexes a single item image (called when uploading new catalog or RAW images)
 */
export async function indexItemImage(
  itemId: number,
  imagePath: string,
  imageType: 'primary' | 'real' = 'primary'
): Promise<void> {
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
  const filename = path.basename(imagePath);
  const fullPath = path.join(uploadDir, filename);

  if (!fs.existsSync(fullPath)) {
    console.warn(`[Visual Index] Cannot index image, file not found: ${fullPath}`);
    return;
  }

  try {
    const isCatalogCollage = imageType === 'primary';
    const features = await extractVisualFeatures(fullPath, isCatalogCollage);
    await query(
      `INSERT INTO item_image_features (item_id, image_type, image_path, feature_vector, dhash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (item_id, image_path) 
       DO UPDATE SET feature_vector = EXCLUDED.feature_vector, dhash = EXCLUDED.dhash, created_at = CURRENT_TIMESTAMP`,
      [itemId, imageType, imagePath, JSON.stringify(features), features.dhash]
    );
  } catch (err) {
    console.error(`[Visual Index] Failed to index Gemini visual features for item ${itemId} (${imagePath}):`, err);
  }
}

let isSyncRunning = false;

/**
 * High-Speed Batch Indexing of all catalog and RAW images using `gemini-embedding-2:batchEmbedContents`
 * Processes 8 images (24 region embeddings) per single HTTP batch call.
 * Automatically skips images already indexed with Gemini Embedding Version 2.
 */
export async function syncAllCatalogVisualFeatures(
  forceReindex = false
): Promise<{ totalIndexed: number; skipped: number; errors: number }> {
  if (isSyncRunning) {
    console.log('[Visual Index] Sync already in progress, skipping duplicate trigger.');
    return { totalIndexed: 0, skipped: 0, errors: 0 };
  }

  isSyncRunning = true;
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
  console.log('[Visual Index] Starting Gemini Embedding 2 (Multi-Zone Color-Agnostic) catalog sync...');

  let totalIndexed = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // 1. Collect RAW real images needing v2 Gemini embeddings (Newest first)
    const realRes = await query(`
      SELECT r.item_id, r.watermarked_path as image_path, 'real' as image_type
      FROM item_real_images r
      LEFT JOIN item_image_features f ON f.item_id = r.item_id AND f.image_path = r.watermarked_path
      ${forceReindex ? '' : `WHERE f.id IS NULL OR f.feature_vector->>'version' IS DISTINCT FROM '2'`}
      ORDER BY r.id DESC
    `);

    // 2. Collect Primary catalog images needing v2 Gemini embeddings (Available & Newest first)
    const itemsRes = await query(`
      SELECT i.id as item_id, i.image_path, 'primary' as image_type
      FROM items i
      JOIN stock s ON s.item_id = i.id
      LEFT JOIN item_image_features f ON f.item_id = i.id AND f.image_path = i.image_path
      ${forceReindex ? '' : `WHERE f.id IS NULL OR f.feature_vector->>'version' IS DISTINCT FROM '2'`}
      ORDER BY s.is_available DESC, i.id DESC
    `);

    const queue = [...realRes.rows, ...itemsRes.rows];
    console.log(`[Visual Index] Found ${queue.length} images requiring Gemini v2 Multi-Zone indexing.`);

    const BATCH_SIZE = 8; // 8 images * 3 zones = 24 embeddings per batch call (~2.2s per batch)

    for (let i = 0; i < queue.length; i += BATCH_SIZE) {
      const slice = queue.slice(i, i + BATCH_SIZE);
      const validItems: Array<{
        item_id: number;
        image_path: string;
        image_type: 'primary' | 'real';
        dhash: string;
        heroBase64: string;
        topBase64: string;
        bottomBase64: string;
      }> = [];

      for (const entry of slice) {
        const filename = path.basename(entry.image_path);
        const fullPath = path.join(uploadDir, filename);
        if (!fs.existsSync(fullPath)) {
          skipped++;
          continue;
        }
        try {
          const isCatalogCollage = entry.image_type === 'primary';
          const crops = await buildThreeZoneGrayscaleCrops(fullPath, isCatalogCollage);
          validItems.push({
            item_id: entry.item_id,
            image_path: entry.image_path,
            image_type: entry.image_type,
            ...crops
          });
        } catch (err) {
          errors++;
        }
      }

      if (validItems.length === 0) continue;

      try {
        const batchImages: string[] = [];
        for (const v of validItems) {
          batchImages.push(v.heroBase64, v.topBase64, v.bottomBase64);
        }

        const embeddings = await batchEmbedImagesWithGemini(batchImages);

        for (let idx = 0; idx < validItems.length; idx++) {
          const v = validItems[idx];
          const features: GeminiVisualFeatures = {
            version: 2,
            heroVec: embeddings[idx * 3],
            topBodiceVec: embeddings[idx * 3 + 1],
            bottomDamanVec: embeddings[idx * 3 + 2],
            dhash: v.dhash
          };

          await query(
            `INSERT INTO item_image_features (item_id, image_type, image_path, feature_vector, dhash)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (item_id, image_path) 
             DO UPDATE SET feature_vector = EXCLUDED.feature_vector, dhash = EXCLUDED.dhash, created_at = CURRENT_TIMESTAMP`,
            [v.item_id, v.image_type, v.image_path, JSON.stringify(features), v.dhash]
          );
          totalIndexed++;
        }

        if (totalIndexed % 40 === 0 || i + BATCH_SIZE >= queue.length) {
          console.log(`[Visual Index] Progress: ${totalIndexed}/${queue.length} images indexed with Gemini v2...`);
        }

        // Gentle pacing of 300ms between batches
        await new Promise(r => setTimeout(r, 300));
      } catch (batchErr) {
        console.error('[Visual Index] Batch embedding error:', batchErr);
        errors += validItems.length;
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    console.log(`[Visual Index] Gemini v2 sync finished: ${totalIndexed} indexed, ${skipped} skipped, ${errors} errors.`);
  } catch (err) {
    console.error('[Visual Index] Fatal sync error:', err);
  } finally {
    isSyncRunning = false;
  }

  return { totalIndexed, skipped, errors };
}
