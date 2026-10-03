import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { query } from '../db';

/**
 * Color-Agnostic Region Feature Descriptor:
 * Focuses purely on embroidery geometry, stitch textures, neckline/border contours,
 * and work density layout. 100% immune to fabric color variations (e.g. Yellow vs Teal vs Wine).
 */
export interface RegionFeature {
  hog: number[];         // 128-dim Normalized HOG (16 cells * 8 angular orientation bins)
  lbp: number[];         // 64-dim Normalized LBP (4 quadrants * 16 texture bins)
  edgeDensity: number[]; // 16-dim Spatial Work/Embroidery Energy Grid
  dhash: string;         // 64-bit Grayscale Structural Difference Hash
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

/**
 * Maps 8-bit LBP code (0-255) to 16 uniform texture bins
 */
function getUniformLbpBin(lbpCode: number): number {
  // Count bit transitions (0->1 and 1->0) in circular 8-bit integer
  let transitions = 0;
  for (let i = 0; i < 8; i++) {
    const bitA = (lbpCode >> i) & 1;
    const bitB = (lbpCode >> ((i + 1) % 8)) & 1;
    if (bitA !== bitB) transitions++;
  }
  // If uniform pattern (transitions <= 2), map to bins 0-14 by 1-bits count, else bin 15 (non-uniform/complex noise)
  if (transitions <= 2) {
    let ones = 0;
    for (let i = 0; i < 8; i++) {
      if ((lbpCode >> i) & 1) ones++;
    }
    return ones; // 0 to 8
  }
  return 9 + (lbpCode % 7); // 9 to 15
}

/**
 * Extracts Color-Agnostic Structural Pattern Signature (HOG + LBP + Edge Energy + dHash)
 */
async function extractSingleRegionFeature(regionSharpObj: sharp.Sharp): Promise<RegionFeature> {
  // 1. Convert to normalized grayscale 64x64 buffer (1 channel, 4096 bytes)
  const { data: pixels, info } = await regionSharpObj
    .resize(64, 64, { fit: 'fill' })
    .grayscale()
    .normalize() // Stretch luminance histogram for maximum contrast invariance
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;

  // Initialize feature containers
  const gridSize = 4;
  const cellWidth = Math.floor(width / gridSize);   // 16 px
  const cellHeight = Math.floor(height / gridSize); // 16 px
  const numBins = 8; // 8 angular bins (0 to PI, unsigned 0 to 180 degrees)
  
  const hogRaw = new Array(gridSize * gridSize * numBins).fill(0);
  const edgeDensityRaw = new Array(gridSize * gridSize).fill(0);
  const lbpRaw = new Array(4 * 16).fill(0); // 4 quadrants * 16 bins

  // Process interior pixels (1 to width-2, 1 to height-2)
  for (let y = 1; y < height - 1; y++) {
    const gy = Math.min(gridSize - 1, Math.floor(y / cellHeight));
    const quadY = y < height / 2 ? 0 : 1;

    for (let x = 1; x < width - 1; x++) {
      const gx = Math.min(gridSize - 1, Math.floor(x / cellWidth));
      const quadX = x < width / 2 ? 0 : 1;
      const quadIdx = quadY * 2 + quadX;
      const cellIdx = gy * gridSize + gx;

      const idx = y * width + x;
      const center = pixels[idx];

      // 1. Sobel/Central Gradient calculation for HOG
      const dx = pixels[idx + 1] - pixels[idx - 1];
      const dy = pixels[(y + 1) * width + x] - pixels[(y - 1) * width + x];
      const magnitude = Math.sqrt(dx * dx + dy * dy);

      if (magnitude > 0) {
        // Angle in [0, PI) unsigned
        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += Math.PI;
        const bin = Math.min(numBins - 1, Math.floor((angle / Math.PI) * numBins));
        hogRaw[cellIdx * numBins + bin] += magnitude;
        edgeDensityRaw[cellIdx] += magnitude;
      }

      // 2. Local Binary Pattern (LBP) calculation
      let lbpCode = 0;
      if (pixels[(y - 1) * width + (x - 1)] >= center) lbpCode |= 1;
      if (pixels[(y - 1) * width + x] >= center) lbpCode |= 2;
      if (pixels[(y - 1) * width + (x + 1)] >= center) lbpCode |= 4;
      if (pixels[y * width + (x + 1)] >= center) lbpCode |= 8;
      if (pixels[(y + 1) * width + (x + 1)] >= center) lbpCode |= 16;
      if (pixels[(y + 1) * width + x] >= center) lbpCode |= 32;
      if (pixels[(y + 1) * width + (x - 1)] >= center) lbpCode |= 64;
      if (pixels[y * width + (x - 1)] >= center) lbpCode |= 128;

      const lbpBin = getUniformLbpBin(lbpCode);
      lbpRaw[quadIdx * 16 + lbpBin]++;
    }
  }

  // L2-Normalize HOG vector
  let hogNorm = 0;
  for (let i = 0; i < hogRaw.length; i++) hogNorm += hogRaw[i] * hogRaw[i];
  const hogSqrt = Math.sqrt(hogNorm) || 1;
  const hog = hogRaw.map(v => Math.round((v / hogSqrt) * 10000) / 10000);

  // L2-Normalize LBP vector
  let lbpNorm = 0;
  for (let i = 0; i < lbpRaw.length; i++) lbpNorm += lbpRaw[i] * lbpRaw[i];
  const lbpSqrt = Math.sqrt(lbpNorm) || 1;
  const lbp = lbpRaw.map(v => Math.round((v / lbpSqrt) * 10000) / 10000);

  // L2-Normalize Edge Density vector
  let edgeNorm = 0;
  for (let i = 0; i < edgeDensityRaw.length; i++) edgeNorm += edgeDensityRaw[i] * edgeDensityRaw[i];
  const edgeSqrt = Math.sqrt(edgeNorm) || 1;
  const edgeDensity = edgeDensityRaw.map(v => Math.round((v / edgeSqrt) * 10000) / 10000);

  // 3. 64-bit Grayscale Difference Hash (dHash on 9x8)
  const { data: dhashPixels } = await regionSharpObj
    .clone()
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
    dhash += parseInt(hashBits.substr(i, 4), 2).toString(16);
  }

  return {
    hog,
    lbp,
    edgeDensity,
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
 * Computes Color-Agnostic Similarity between two single region features:
 * - 50% HOG Gradient Orientation (Embroidery lines, neckline arc, border curves)
 * - 25% LBP Texture (Zari/Sequin/Thread stitch texture)
 * - 15% Edge Density (Spatial distribution of work)
 * - 10% Grayscale Structural Hash
 */
function compareRegions(regA: RegionFeature, regB: RegionFeature): number {
  if (!regA || !regB) return 0;

  // Support backward compatibility if candidate feature has legacy format
  if (!regA.hog || !regB.hog) {
    const legacyA: any = regA;
    const legacyB: any = regB;
    const spatialSim = Math.max(0, cosineSimilarity(legacyA.spatialGrid || [], legacyB.spatialGrid || []));
    const textureSim = Math.max(0, cosineSimilarity(legacyA.textureGrid || [], legacyB.textureGrid || []));
    return (spatialSim * 0.5) + (textureSim * 0.5);
  }

  // 1. HOG Orientation Similarity (Embroidery and outline geometry)
  const hogSim = Math.max(0, cosineSimilarity(regA.hog, regB.hog));

  // 2. LBP Texture Density (Stitch and fabric texture)
  const lbpSim = Math.max(0, cosineSimilarity(regA.lbp, regB.lbp));

  // 3. Edge Spatial Energy (Work concentration)
  const edgeSim = Math.max(0, cosineSimilarity(regA.edgeDensity, regB.edgeDensity));

  // 4. Perceptual Grayscale Hash
  const hashDist = hammingDistance(regA.dhash, regB.dhash);
  const hashSim = Math.max(0, (64 - hashDist) / 64);

  let rawScore = (hogSim * 0.50) + (lbpSim * 0.25) + (edgeSim * 0.15) + (hashSim * 0.10);

  // Perceptual boost for tight structural hashes
  if (hashDist <= 6) {
    rawScore = Math.max(rawScore, 0.92 + (6 - hashDist) * 0.013);
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
    // 4. Query Neck to Target Full
    { zone: 'neck', score: compareRegions(queryFeatures.topNeck, target.full) },
    // 5. Query Full to Target Bottom Daman / Border (when user took photo of border work)
    { zone: 'bottom_border', score: compareRegions(queryFeatures.full, target.bottomDaman) },
    // 6. Query Bottom to Target Bottom
    { zone: 'bottom_border', score: compareRegions(queryFeatures.bottomDaman, target.bottomDaman) },
    // 7. Query Bottom to Target Full
    { zone: 'bottom_border', score: compareRegions(queryFeatures.bottomDaman, target.full) },
    // 8. Query Full to Target Center Motif (fabric close-up)
    { zone: 'motif', score: compareRegions(queryFeatures.full, target.centerMotif) },
    // 9. Query Center to Target Center
    { zone: 'motif', score: compareRegions(queryFeatures.centerMotif, target.centerMotif) },
  ];

  let best = comparisons[0];
  for (const comp of comparisons) {
    if (comp.score > best.score) {
      best = comp;
    }
  }

  // Priority boost for RAW real images (since showroom snaps align closer to warehouse RAW photos)
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
 * Searches catalog designs matching the captured image with color-agnostic pattern matching
 */
export async function searchCatalogByImage(
  queryImageBuffer: Buffer,
  userId?: number,
  role?: string,
  minConfidence = 30,
  limit = 25
): Promise<ImageSearchResult[]> {
  // 1. Extract query color-agnostic multi-zone features
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

  // 3. Compute best match score per item across all its colorways (catalog & RAW photos)
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
 * Indexes or updates the color-agnostic multi-zone visual features of a specific item image
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
  console.log('[Visual Index] Starting Color-Agnostic HOG/LBP visual feature sync...');

  let totalIndexed = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // 1. Index / upgrade real RAW images first (High priority for multi-colorways)
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

    console.log(`[Visual Index] Color-Agnostic HOG/LBP sync finished: ${totalIndexed} indexed, ${skipped} skipped, ${errors} errors.`);
  } catch (err) {
    console.error('[Visual Index] Catalog visual feature sync error:', err);
  }

  return { totalIndexed, skipped, errors };
}
