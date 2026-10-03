import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { query } from '../db';

export interface RegionFeature {
  spatialGrid: number[];      // 16 cells * 6 features (RGB + HSV means)
  textureGrid: number[];      // 16 cells * 2 features (edge gradients & energy)
  colorHistogram: number[];   // 64 bins HSV histogram
  dhash: string;              // 64-bit difference hash
}

export interface MultiRegionVisualFeatures {
  full: RegionFeature;
  topNeck: RegionFeature;     // Top 55% where neckline / chest embroidery is located
  bottomDaman: RegionFeature; // Bottom 55% where border / daman / ghair work is located
  centerMotif: RegionFeature; // Center 60% fabric motif / print area
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

// Convert RGB (0-255) to HSV (H: 0-1, S: 0-1, V: 0-1)
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const diff = max - min;
  let h = 0;
  if (diff !== 0) {
    if (max === rf) {
      h = ((gf - bf) / diff) % 6;
    } else if (max === gf) {
      h = (bf - rf) / diff + 2;
    } else {
      h = (rf - gf) / diff + 4;
    }
    h = h / 6;
    if (h < 0) h += 1;
  }
  const s = max === 0 ? 0 : diff / max;
  const v = max;
  return [h, s, v];
}

/**
 * Extracts single-region visual signature
 */
async function extractSingleRegionFeature(regionSharpObj: sharp.Sharp): Promise<RegionFeature> {
  const { data: pixels, info } = await regionSharpObj
    .resize(64, 64, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  // 1. Compute 4x4 spatial grid (16 cells)
  const gridSize = 4;
  const cellWidth = Math.floor(width / gridSize);
  const cellHeight = Math.floor(height / gridSize);
  const spatialGrid: number[] = [];
  const textureGrid: number[] = [];

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      let rSum = 0, gSum = 0, bSum = 0;
      let hSum = 0, sSum = 0, vSum = 0;
      let edgeSum = 0;
      let count = 0;

      for (let cy = 0; cy < cellHeight; cy++) {
        const y = gy * cellHeight + cy;
        for (let cx = 0; cx < cellWidth; cx++) {
          const x = gx * cellWidth + cx;
          const idx = (y * width + x) * channels;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];

          rSum += r;
          gSum += g;
          bSum += b;

          const [h, s, v] = rgbToHsv(r, g, b);
          hSum += h;
          sSum += s;
          vSum += v;

          // Horizontal + vertical edge gradient
          if (x < width - 1 && y < height - 1) {
            const rightIdx = (y * width + (x + 1)) * channels;
            const downIdx = ((y + 1) * width + x) * channels;
            const lum = (r + g + b) / 3;
            const lumRight = (pixels[rightIdx] + pixels[rightIdx + 1] + pixels[rightIdx + 2]) / 3;
            const lumDown = (pixels[downIdx] + pixels[downIdx + 1] + pixels[downIdx + 2]) / 3;
            const grad = Math.abs(lum - lumRight) + Math.abs(lum - lumDown);
            edgeSum += grad;
          }

          count++;
        }
      }

      if (count > 0) {
        spatialGrid.push(
          Math.round((rSum / count) * 100) / 100 / 255,
          Math.round((gSum / count) * 100) / 100 / 255,
          Math.round((bSum / count) * 100) / 100 / 255,
          Math.round((hSum / count) * 1000) / 1000,
          Math.round((sSum / count) * 1000) / 1000,
          Math.round((vSum / count) * 1000) / 1000
        );
        textureGrid.push(
          Math.round((edgeSum / count) * 100) / 100 / 255
        );
      }
    }
  }

  // 2. Compute 64-bin HSV color histogram
  const hist = new Array(64).fill(0);
  const totalPixels = width * height;
  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const [h, s, v] = rgbToHsv(r, g, b);

    const hBin = Math.min(3, Math.floor(h * 4));
    const sBin = Math.min(3, Math.floor(s * 4));
    const vBin = Math.min(3, Math.floor(v * 4));
    const binIdx = hBin * 16 + sBin * 4 + vBin;
    hist[binIdx]++;
  }
  const colorHistogram = hist.map(v => Math.round((v / totalPixels) * 10000) / 10000);

  // 3. Compute 64-bit dHash (9x8 grayscale)
  const { data: dhashPixels } = await regionSharpObj
    .clone()
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let hashBits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = dhashPixels[y * 9 + x];
      const right = dhashPixels[y * 9 + (x + 1)];
      hashBits += left > right ? '1' : '0';
    }
  }

  let dhash = '';
  for (let i = 0; i < hashBits.length; i += 4) {
    dhash += parseInt(hashBits.substr(i, 4), 2).toString(16);
  }

  return {
    spatialGrid,
    textureGrid,
    colorHistogram,
    dhash
  };
}

/**
 * Extracts Multi-Zone Visual Signatures (Full, Top Neck, Bottom Daman, Center Motif)
 */
export async function extractVisualFeatures(imageInput: string | Buffer): Promise<MultiRegionVisualFeatures> {
  const metadata = await sharp(imageInput).metadata();
  const width = metadata.width || 400;
  const height = metadata.height || 600;

  // 1. Full Image Feature
  const fullFeature = await extractSingleRegionFeature(sharp(imageInput));

  // 2. Top Neck / Gala Embroidery Area (Top 55% of height)
  const topHeight = Math.floor(height * 0.55);
  const topFeature = await extractSingleRegionFeature(
    sharp(imageInput).extract({ left: 0, top: 0, width: width, height: topHeight })
  );

  // 3. Bottom Daman / Border Work Area (Bottom 55% of height)
  const bottomTop = Math.floor(height * 0.45);
  const bottomHeight = height - bottomTop;
  const bottomFeature = await extractSingleRegionFeature(
    sharp(imageInput).extract({ left: 0, top: bottomTop, width: width, height: bottomHeight })
  );

  // 4. Center Motif Pattern (Middle 60% area)
  const centerLeft = Math.floor(width * 0.20);
  const centerTop = Math.floor(height * 0.20);
  const centerWidth = Math.floor(width * 0.60);
  const centerHeight = Math.floor(height * 0.60);
  const centerFeature = await extractSingleRegionFeature(
    sharp(imageInput).extract({ left: centerLeft, top: centerTop, width: centerWidth, height: centerHeight })
  );

  return {
    full: fullFeature,
    topNeck: topFeature,
    bottomDaman: bottomFeature,
    centerMotif: centerFeature
  };
}

// Calculate Cosine Similarity between two numeric vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Calculate Histogram Intersection (0.0 to 1.0)
function histogramIntersection(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let intersection = 0;
  let totalA = 0;
  for (let i = 0; i < a.length; i++) {
    intersection += Math.min(a[i], b[i]);
    totalA += a[i];
  }
  return totalA > 0 ? intersection / totalA : 0;
}

// Calculate Hamming Distance between two hex hashes (0 to 64)
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
 * Computes similarity between two single region features
 */
function compareRegions(regA: RegionFeature, regB: RegionFeature): number {
  if (!regA || !regB) return 0;

  // 1. Spatial layout similarity
  const spatialSim = Math.max(0, cosineSimilarity(regA.spatialGrid, regB.spatialGrid));

  // 2. Color palette intersection
  const colorSim = Math.max(0, histogramIntersection(regA.colorHistogram, regB.colorHistogram));

  // 3. Texture / Embroidery density
  const textureSim = Math.max(0, cosineSimilarity(regA.textureGrid, regB.textureGrid));

  // 4. Perceptual dHash
  const hashDist = hammingDistance(regA.dhash, regB.dhash);
  const hashSim = Math.max(0, (64 - hashDist) / 64);

  let rawScore = (spatialSim * 0.35) + (colorSim * 0.40) + (textureSim * 0.15) + (hashSim * 0.10);

  if (hashDist <= 8) {
    rawScore = Math.max(rawScore, 0.90 + (8 - hashDist) * 0.0125);
  }

  return rawScore;
}

/**
 * Advanced Multi-Zone Match Scoring:
 * Matches query against candidate's Full, Neck, Bottom Daman, and Center Motif
 */
export function calculateMultiZoneMatchScore(
  queryFeatures: MultiRegionVisualFeatures,
  targetFeatures: any,
  isRealImage = false
): { score: number; zone: string } {
  // Support backward compatibility if target is old single feature
  const target: MultiRegionVisualFeatures = targetFeatures.full ? targetFeatures : {
    full: targetFeatures,
    topNeck: targetFeatures,
    bottomDaman: targetFeatures,
    centerMotif: targetFeatures
  };

  const comparisons: { zone: string; score: number }[] = [
    // 1. Full-to-Full
    { zone: 'full', score: compareRegions(queryFeatures.full, target.full) },
    // 2. Query Full to Target Neck (when user took full shot or close up of neck)
    { zone: 'neck', score: compareRegions(queryFeatures.full, target.topNeck) },
    // 3. Query Neck to Target Neck
    { zone: 'neck', score: compareRegions(queryFeatures.topNeck, target.topNeck) },
    // 4. Query Full to Target Bottom Daman / Border (when user took photo of border work)
    { zone: 'bottom_border', score: compareRegions(queryFeatures.full, target.bottomDaman) },
    // 5. Query Bottom to Target Bottom
    { zone: 'bottom_border', score: compareRegions(queryFeatures.bottomDaman, target.bottomDaman) },
    // 6. Query Full to Target Center Motif (fabric close-up)
    { zone: 'motif', score: compareRegions(queryFeatures.full, target.centerMotif) },
    // 7. Query Center to Target Center
    { zone: 'motif', score: compareRegions(queryFeatures.centerMotif, target.centerMotif) },
  ];

  let best = comparisons[0];
  for (const comp of comparisons) {
    if (comp.score > best.score) {
      best = comp;
    }
  }

  // Priority boost for RAW real images (since phone camera shots align closer to real photos than studio catalog cuts)
  let finalScore = best.score;
  if (isRealImage) {
    finalScore = Math.min(1.0, finalScore * 1.15); // +15% affinity boost for real photos
  }

  const scorePercentage = Math.min(100, Math.max(0, Math.round(finalScore * 100 * 10) / 10));

  return {
    score: scorePercentage,
    zone: best.zone
  };
}

/**
 * Searches catalog designs matching the captured image with multi-zone & RAW-first accuracy
 */
export async function searchCatalogByImage(
  queryImageBuffer: Buffer,
  userId?: number,
  role?: string,
  minConfidence = 35,
  limit = 25
): Promise<ImageSearchResult[]> {
  // 1. Extract query multi-zone features
  const queryFeat = await extractVisualFeatures(queryImageBuffer);

  // 2. Load all indexed catalog image features from database
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

  const featuresRes = await query(queryStr, params);

  // 3. Compute best match score per item across all its images (catalog & RAW photos)
  const itemBestMatch = new Map<number, { score: number; matchedImagePath: string; matchedType: string; matchedZone: string; row: any }>();

  for (const row of featuresRes.rows) {
    const targetFeat = typeof row.feature_vector === 'string' 
      ? JSON.parse(row.feature_vector) 
      : row.feature_vector;

    if (!targetFeat) continue;

    const isRealImage = row.image_type === 'real';
    const { score, zone } = calculateMultiZoneMatchScore(queryFeat, targetFeat, isRealImage);

    if (score >= minConfidence) {
      const existing = itemBestMatch.get(row.item_id);
      if (!existing || score > existing.score) {
        itemBestMatch.set(row.item_id, {
          score,
          matchedImagePath: row.image_path,
          matchedType: isRealImage ? 'real_photo' : 'catalog',
          matchedZone: zone,
          row
        });
      }
    }
  }

  // 4. Sort by best score descending
  const sortedMatches = Array.from(itemBestMatch.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (sortedMatches.length === 0) {
    return [];
  }

  // 5. Fetch all real photos for top matches
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
 * Indexes or updates the multi-zone visual features of a specific item image
 */
export async function indexItemImage(itemId: number, imagePath: string, imageType: 'primary' | 'real' = 'primary'): Promise<void> {
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
  const filename = path.basename(imagePath);
  const fullPath = path.join(uploadDir, filename);

  if (!fs.existsSync(fullPath)) {
    console.warn(`[Visual Index] Cannot index image, file not found: ${fullPath}`);
    return;
  }

  try {
    const features = await extractVisualFeatures(fullPath);
    await query(
      `INSERT INTO item_image_features (item_id, image_type, image_path, feature_vector, dhash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (item_id, image_path) 
       DO UPDATE SET feature_vector = EXCLUDED.feature_vector, dhash = EXCLUDED.dhash, created_at = CURRENT_TIMESTAMP`,
      [itemId, imageType, imagePath, JSON.stringify(features), features.full.dhash]
    );
  } catch (err) {
    console.error(`[Visual Index] Failed to index visual features for item ${itemId} (${imagePath}):`, err);
  }
}

/**
 * Background batch indexing / upgrade of all items and real images in catalog
 */
export async function syncAllCatalogVisualFeatures(forceReindex = false): Promise<{ totalIndexed: number; skipped: number; errors: number }> {
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
  console.log('[Visual Index] Starting multi-zone catalog visual feature sync...');

  let totalIndexed = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // 1. Index / upgrade real RAW images first (High priority)
    const realRes = await query(`
      SELECT r.id, r.item_id, r.watermarked_path as image_path 
      FROM item_real_images r
      ${forceReindex ? '' : `LEFT JOIN item_image_features f ON f.item_id = r.item_id AND f.image_path = r.watermarked_path WHERE f.id IS NULL`}
    `);

    console.log(`[Visual Index] Processing ${realRes.rows.length} RAW real images...`);

    for (const r of realRes.rows) {
      const filename = path.basename(r.image_path);
      const fullPath = path.join(uploadDir, filename);
      if (!fs.existsSync(fullPath)) {
        skipped++;
        continue;
      }
      try {
        const features = await extractVisualFeatures(fullPath);
        await query(
          `INSERT INTO item_image_features (item_id, image_type, image_path, feature_vector, dhash)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (item_id, image_path) 
           DO UPDATE SET feature_vector = EXCLUDED.feature_vector, dhash = EXCLUDED.dhash, created_at = CURRENT_TIMESTAMP`,
          [r.item_id, 'real', r.image_path, JSON.stringify(features), features.full.dhash]
        );
        totalIndexed++;
      } catch (e) {
        errors++;
      }
    }

    // 2. Index primary catalog images
    const itemsRes = await query(`
      SELECT i.id, i.sku_id, i.image_path 
      FROM items i
      ${forceReindex ? '' : `LEFT JOIN item_image_features f ON f.item_id = i.id AND f.image_path = i.image_path WHERE f.id IS NULL`}
    `);

    console.log(`[Visual Index] Processing ${itemsRes.rows.length} primary catalog images...`);

    for (const item of itemsRes.rows) {
      const filename = path.basename(item.image_path);
      const fullPath = path.join(uploadDir, filename);
      if (!fs.existsSync(fullPath)) {
        skipped++;
        continue;
      }
      try {
        const features = await extractVisualFeatures(fullPath);
        await query(
          `INSERT INTO item_image_features (item_id, image_type, image_path, feature_vector, dhash)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (item_id, image_path) 
           DO UPDATE SET feature_vector = EXCLUDED.feature_vector, dhash = EXCLUDED.dhash, created_at = CURRENT_TIMESTAMP`,
          [item.id, 'primary', item.image_path, JSON.stringify(features), features.full.dhash]
        );
        totalIndexed++;
      } catch (e) {
        errors++;
      }
    }

    console.log(`[Visual Index] Multi-zone sync finished: ${totalIndexed} indexed, ${skipped} skipped, ${errors} errors.`);
  } catch (err) {
    console.error('[Visual Index] Catalog visual feature sync error:', err);
  }

  return { totalIndexed, skipped, errors };
}
