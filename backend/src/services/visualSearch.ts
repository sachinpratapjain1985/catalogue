import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { query } from '../db';

/**
 * 100% Local Instant DINOv2 Multi-Crop & Multi-Zone Visual Search Engine (Version 6)
 *
 * ZERO GOOGLE API CALLS — ~100ms (0.1s) INSTANT SEARCH ON YOUR SERVER:
 * 1. Local Meta AI DINOv2 Vision Transformer (`Xenova/dinov2-small` via C++ ONNX Runtime):
 *    Runs 100% locally inside your server container with zero cloud latency and zero API quota limits.
 * 2. In-Memory RAM Vector Index (`memoryFeatureIndex`):
 *    Keeps all 4,965+ catalog and RAW photo embeddings in RAM (~40MB out of 16GB RAM) so scanning
 *    the entire database takes ~4 milliseconds.
 * 3. Multi-Crop Query Framing (`queryFull` + `queryCenter`):
 *    Automatically extracts both the Full Frame and a Center-Focused Garment Crop (stripping away
 *    showroom floor/wall/rack background clutter around phone camera shots) in ~90ms total.
 * 4. Dedicated 224x224 3-Color-Chart Indexing (`version: 6`):
 *    Every primary catalog poster is indexed across 6 zones (`full`, `hero`, `colorTop`, `colorBot`,
 *    `neck`, `daman`) at full 224x224 resolution (`fit: 'fill'`) alongside all 3,533 RAW real photos,
 *    matching any color variant, pattern, or fabric texture in ~0.1 seconds.
 */

export interface DinoMultiZoneFeatures {
  version: 5 | 6;
  full: number[];      // 384-dim L2-normalized DINOv2 embedding of full image / primary hero
  hero: number[];      // 384-dim L2-normalized DINOv2 embedding of Main Hero Model (224x224)
  colorTop: number[];  // 384-dim L2-normalized DINOv2 embedding of Top-Left Color Chart panel (224x224)
  colorBot: number[];  // 384-dim L2-normalized DINOv2 embedding of Bottom-Left Color Chart panel (224x224)
  neck: number[];      // 384-dim L2-normalized DINOv2 embedding of Neck/Bodice & fabric weave
  daman: number[];     // 384-dim L2-normalized DINOv2 embedding of Bottom Daman & fabric drape
  dhash: string;       // 64-bit Perceptual Difference Hash
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
  matched_zone?: string;      // 'neck', 'bottom_border', 'color_chart', 'full'
}

interface CachedFeatureEntry {
  itemId: number;
  imageType: 'primary' | 'real';
  imagePath: string;
  features: any;
}

// In-Memory Vector Index Cache for ~4ms full-catalog scans
const memoryFeatureIndex = new Map<string, CachedFeatureEntry>();
let isMemoryIndexLoaded = false;
let memoryIndexLoadPromise: Promise<void> | null = null;

function makeCacheKey(itemId: number, imagePath: string): string {
  return `${itemId}::${imagePath}`;
}

export function removeCachedVisualFeature(itemId: number, imagePath: string): void {
  memoryFeatureIndex.delete(makeCacheKey(itemId, imagePath));
}

async function ensureMemoryIndexLoaded(): Promise<void> {
  if (isMemoryIndexLoaded && memoryFeatureIndex.size > 0) return;
  if (memoryIndexLoadPromise) return memoryIndexLoadPromise;

  memoryIndexLoadPromise = (async () => {
    try {
      const t0 = Date.now();
      const res = await query(
        `SELECT item_id, image_type, image_path, feature_vector FROM item_image_features`
      );
      for (const row of res.rows) {
        const feat =
          typeof row.feature_vector === 'string'
            ? JSON.parse(row.feature_vector)
            : row.feature_vector;
        if (feat) {
          memoryFeatureIndex.set(makeCacheKey(row.item_id, row.image_path), {
            itemId: row.item_id,
            imageType: row.image_type,
            imagePath: row.image_path,
            features: feat
          });
        }
      }
      isMemoryIndexLoaded = true;
      console.log(
        `[Visual Search] Loaded ${memoryFeatureIndex.size} vectors into RAM cache in ${Date.now() - t0}ms`
      );
    } catch (err) {
      console.warn('[Visual Search] Failed to preload RAM vector cache:', err);
    } finally {
      memoryIndexLoadPromise = null;
    }
  })();

  return memoryIndexLoadPromise;
}

// Preserve native ES module dynamic import in CommonJS TypeScript builds
const dynamicImport = new Function('specifier', 'return import(specifier)');

let dinoExtractorInstance: any = null;
let dinoRawImageClass: any = null;
let dinoInitPromise: Promise<{ extractor: any; RawImage: any }> | null = null;

async function getDinoPipeline(): Promise<{ extractor: any; RawImage: any }> {
  if (dinoExtractorInstance && dinoRawImageClass) {
    return { extractor: dinoExtractorInstance, RawImage: dinoRawImageClass };
  }
  if (dinoInitPromise) {
    return dinoInitPromise;
  }

  dinoInitPromise = (async () => {
    const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
    const cacheDir = path.join(uploadDir, '.dinov2_cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const transformers = await dynamicImport('@xenova/transformers');
    transformers.env.cacheDir = cacheDir;
    transformers.env.allowLocalModels = true;

    console.log('[DINOv2] Loading Meta AI Xenova/dinov2-small Vision Transformer...');
    const t0 = Date.now();
    const extractor = await transformers.pipeline('image-feature-extraction', 'Xenova/dinov2-small', {
      quantized: true
    });
    console.log(`[DINOv2] Model ready in ${Date.now() - t0}ms (cache: ${cacheDir})`);

    dinoExtractorInstance = extractor;
    dinoRawImageClass = transformers.RawImage;
    return { extractor, RawImage: transformers.RawImage };
  })();

  return dinoInitPromise;
}

function l2NormalizeFloatArray(arr: Float32Array | number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) sumSq += arr[i] * arr[i];
  const norm = Math.sqrt(sumSq) || 1;
  const out = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    out[i] = Math.round((arr[i] / norm) * 10000) / 10000;
  }
  return out;
}

/**
 * Resolves database image paths (both `/uploads/xyz.jpg` and `/uploads/real/real_xyz.jpg`)
 * to their actual physical file path on disk.
 */
function resolveUploadFilePath(uploadDir: string, dbImagePath: string): string {
  const cleanRel = dbImagePath.replace(/^\/?uploads\/?/, '');
  const candidate1 = path.join(uploadDir, cleanRel);
  if (fs.existsSync(candidate1)) return candidate1;

  const base = path.basename(dbImagePath);
  const candidate2 = path.join(uploadDir, base);
  if (fs.existsSync(candidate2)) return candidate2;

  const candidate3 = path.join(uploadDir, 'real', base);
  if (fs.existsSync(candidate3)) return candidate3;

  return candidate1;
}

/**
 * Pools `full`, `colorTop`, `colorBot`, `neck`, and `daman` embeddings from a single 224x224 DINOv2 (257x384) output tensor
 */
function poolSingleGarmentDino(rawData: Float32Array | number[]): {
  full: number[];
  colorTop: number[];
  colorBot: number[];
  neck: number[];
  daman: number[];
} {
  const dim = 384;
  const clsVec = new Float32Array(dim);
  const meanAll = new Float32Array(dim);
  const colorTopVec = new Float32Array(dim);
  const colorBotVec = new Float32Array(dim);
  const neckVec = new Float32Array(dim);
  const damanVec = new Float32Array(dim);

  for (let d = 0; d < dim; d++) {
    clsVec[d] = rawData[d];
  }

  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      const tokenIdx = 1 + r * 16 + c;
      const offset = tokenIdx * dim;
      const inColorTop = r >= 0 && r <= 7 && c >= 0 && c <= 4;
      const inColorBot = r >= 8 && r <= 15 && c >= 0 && c <= 4;
      const inNeck = r >= 1 && r <= 8 && c >= 2 && c <= 13;
      const inDaman = r >= 7 && r <= 15 && c >= 2 && c <= 13;

      for (let d = 0; d < dim; d++) {
        const val = rawData[offset + d];
        meanAll[d] += val;
        if (inColorTop) colorTopVec[d] += val;
        if (inColorBot) colorBotVec[d] += val;
        if (inNeck) neckVec[d] += val;
        if (inDaman) damanVec[d] += val;
      }
    }
  }

  const clsNorm = l2NormalizeFloatArray(clsVec);
  const meanNorm = l2NormalizeFloatArray(meanAll);
  const combinedFull = new Float32Array(dim);
  for (let d = 0; d < dim; d++) {
    combinedFull[d] = clsNorm[d] * 0.5 + meanNorm[d] * 0.5;
  }

  return {
    full: l2NormalizeFloatArray(combinedFull),
    colorTop: l2NormalizeFloatArray(colorTopVec),
    colorBot: l2NormalizeFloatArray(colorBotVec),
    neck: l2NormalizeFloatArray(neckVec),
    daman: l2NormalizeFloatArray(damanVec)
  };
}

async function runDinoOnRgbBuffer(
  rgbPixels: Buffer,
  channels: number,
  extractor: any,
  RawImage: any
): Promise<{
  full: number[];
  colorTop: number[];
  colorBot: number[];
  neck: number[];
  daman: number[];
}> {
  const rgbBuffer = new Uint8Array(224 * 224 * 3);
  if (channels === 3) {
    rgbBuffer.set(rgbPixels);
  } else {
    for (let i = 0; i < 224 * 224; i++) {
      rgbBuffer[i * 3] = rgbPixels[i * channels];
      rgbBuffer[i * 3 + 1] = rgbPixels[i * channels + (channels > 1 ? 1 : 0)];
      rgbBuffer[i * 3 + 2] = rgbPixels[i * channels + (channels > 2 ? 2 : 0)];
    }
  }
  const rawImg = new RawImage(rgbBuffer, 224, 224, 3);
  const dinoOut = await extractor(rawImg);
  return poolSingleGarmentDino(dinoOut.data);
}

function computeBlockDHash(rgbPixels: Buffer, ch: number): string {
  const gridAvg: number[][] = [];
  for (let ry = 0; ry < 8; ry++) {
    const rowAvg: number[] = [];
    const y0 = Math.floor((ry * 224) / 8);
    const y1 = Math.floor(((ry + 1) * 224) / 8);
    for (let rx = 0; rx < 9; rx++) {
      const x0 = Math.floor((rx * 224) / 9);
      const x1 = Math.floor(((rx + 1) * 224) / 9);
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * 224 + x) * ch;
          const lum =
            ch >= 3
              ? 0.299 * rgbPixels[idx] + 0.587 * rgbPixels[idx + 1] + 0.114 * rgbPixels[idx + 2]
              : rgbPixels[idx];
          sum += lum;
          count++;
        }
      }
      rowAvg.push(count > 0 ? sum / count : 0);
    }
    gridAvg.push(rowAvg);
  }

  let hashBits = '';
  for (let ry = 0; ry < 8; ry++) {
    for (let rx = 0; rx < 8; rx++) {
      hashBits += gridAvg[ry][rx] > gridAvg[ry][rx + 1] ? '1' : '0';
    }
  }
  let dhash = '';
  for (let i = 0; i < 64; i += 4) {
    dhash += parseInt(hashBits.substring(i, i + 4), 2).toString(16);
  }
  return dhash;
}

/**
 * Extracts high-accuracy sRGB DINOv2 Embeddings (`full`, `hero`, `colorTop`, `colorBot`, `neck`, `daman`)
 * - Uses `{ fit: 'fill' }` so top necklines and bottom daman borders are NEVER cropped off.
 * - For primary catalog collages (`isCatalogCollage = true`), extracts dedicated full-resolution
 *   224x224 crops for the Right Hero Model (`hero`), Top-Left Color Chart panel (`colorTop`),
 *   and Bottom-Left Color Chart panel (`colorBot`).
 * - For live search queries & RAW real photos (`isCatalogCollage = false`), runs a single ~45ms pass.
 */
export async function extractVisualFeatures(
  imageInput: string | Buffer,
  isCatalogCollage = false
): Promise<DinoMultiZoneFeatures> {
  const { extractor, RawImage } = await getDinoPipeline();

  const orientedBuf = await sharp(imageInput)
    .rotate()
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .toColorspace('srgb')
    .jpeg({ quality: 92 })
    .toBuffer();

  const meta = await sharp(orientedBuf).metadata();
  const w = meta.width || 600;
  const h = meta.height || 800;

  const { data: fullRgb, info: fullInfo } = await sharp(orientedBuf)
    .resize(224, 224, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const dhash = computeBlockDHash(fullRgb, fullInfo.channels || 3);
  const fullZones = await runDinoOnRgbBuffer(fullRgb, fullInfo.channels || 3, extractor, RawImage);

  if (!isCatalogCollage || w < 200 || h < 200) {
    return {
      version: 5,
      full: fullZones.full,
      hero: fullZones.full,
      colorTop: fullZones.colorTop,
      colorBot: fullZones.colorBot,
      neck: fullZones.neck,
      daman: fullZones.daman,
      dhash
    };
  }

  // Primary catalog poster: extract dedicated 224x224 embeddings for Hero + Top-Left Color Panel + Bottom-Left Color Panel
  const heroRect = {
    left: Math.floor(w * 0.25),
    top: Math.floor(h * 0.02),
    width: Math.max(32, Math.floor(w * 0.73)),
    height: Math.max(32, Math.floor(h * 0.96))
  };
  const topChartRect = {
    left: Math.floor(w * 0.01),
    top: Math.floor(h * 0.02),
    width: Math.max(32, Math.floor(w * 0.27)),
    height: Math.max(32, Math.floor(h * 0.47))
  };
  const botChartRect = {
    left: Math.floor(w * 0.01),
    top: Math.floor(h * 0.50),
    width: Math.max(32, Math.floor(w * 0.27)),
    height: Math.max(32, Math.floor(h * 0.47))
  };

  const [heroBuf, topBuf, botBuf] = await Promise.all([
    sharp(orientedBuf).extract(heroRect).resize(224, 224, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true }),
    sharp(orientedBuf).extract(topChartRect).resize(224, 224, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true }),
    sharp(orientedBuf).extract(botChartRect).resize(224, 224, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
  ]);

  const heroZones = await runDinoOnRgbBuffer(heroBuf.data, heroBuf.info.channels || 3, extractor, RawImage);
  const topZones = await runDinoOnRgbBuffer(topBuf.data, topBuf.info.channels || 3, extractor, RawImage);
  const botZones = await runDinoOnRgbBuffer(botBuf.data, botBuf.info.channels || 3, extractor, RawImage);

  return {
    version: 6,
    full: fullZones.full,
    hero: heroZones.full,
    colorTop: topZones.full,
    colorBot: botZones.full,
    neck: heroZones.neck,
    daman: heroZones.daman,
    dhash
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

function hammingDistance(hexA: string, hexB: string): number {
  if (!hexA || !hexB || hexA.length !== hexB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hexA.length; i++) {
    const xor = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    dist += (xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1);
  }
  return dist;
}

function calibrateDinoSimilarity(cosSim: number): number {
  if (cosSim <= 0.25) return Math.max(0, cosSim * 0.8);
  const mapped = 0.25 + (cosSim - 0.25) * 1.18;
  return Math.min(0.99, Math.max(0, mapped));
}

/**
 * Computes Multi-Zone DINOv2 Score (supports v6, v5, and v4 vectors in ~0.001ms per item)
 */
export function calculateMultiZoneMatchScore(
  queryFeatures: DinoMultiZoneFeatures,
  targetFeatures: any,
  isRealImage = false
): { rawScore: number; score: number; zone: string } {
  if (!targetFeatures || !Array.isArray(targetFeatures.full)) {
    return { rawScore: 0, score: 0, zone: 'full' };
  }

  const fullSim = cosineSimilarity(queryFeatures.full, targetFeatures.full);
  const heroSim = targetFeatures.hero
    ? Math.max(
        cosineSimilarity(queryFeatures.full, targetFeatures.hero),
        cosineSimilarity(queryFeatures.hero, targetFeatures.hero)
      )
    : fullSim;

  const colorChartSim =
    targetFeatures.colorTop && targetFeatures.colorBot
      ? Math.max(
          cosineSimilarity(queryFeatures.full, targetFeatures.colorTop),
          cosineSimilarity(queryFeatures.full, targetFeatures.colorBot)
        )
      : 0;

  const neckSim = targetFeatures.neck
    ? Math.max(
        cosineSimilarity(queryFeatures.neck, targetFeatures.neck),
        cosineSimilarity(queryFeatures.full, targetFeatures.neck)
      )
    : 0;

  const damanSim = targetFeatures.daman
    ? Math.max(
        cosineSimilarity(queryFeatures.daman, targetFeatures.daman),
        cosineSimilarity(queryFeatures.full, targetFeatures.daman)
      )
    : 0;

  const combined = Math.max(fullSim, heroSim) * 0.55 + neckSim * 0.25 + damanSim * 0.20;

  let bestCos = Math.max(fullSim, heroSim, combined);
  let bestZone = 'full';

  if (colorChartSim > bestCos) {
    bestCos = colorChartSim;
    bestZone = 'color_chart';
  }
  if (neckSim * 0.96 > bestCos) {
    bestCos = neckSim * 0.96;
    bestZone = 'neck';
  }
  if (damanSim * 0.96 > bestCos) {
    bestCos = damanSim * 0.96;
    bestZone = 'bottom_border';
  }

  let calibrated = calibrateDinoSimilarity(bestCos);

  if (bestCos >= 0.65 && targetFeatures.dhash) {
    const hashDist = hammingDistance(queryFeatures.dhash, targetFeatures.dhash);
    if (hashDist <= 5) {
      calibrated = Math.max(calibrated, 0.95 + (5 - hashDist) * 0.008);
    }
  }

  if (isRealImage) {
    calibrated = Math.min(0.99, calibrated * 1.03);
  }

  return {
    rawScore: calibrated,
    score: Math.min(100, Math.max(0, Math.round(calibrated * 100 * 10) / 10)),
    zone: bestZone
  };
}

/**
 * 100% Local Instant Visual Search Pipeline (~90ms - 140ms total, ZERO Google API wait):
 * 1. Normalizes query image and extracts BOTH Full-Frame (`queryFull`) and Center-Garment (`queryCenter`)
 *    DINOv2 embeddings locally (~90ms total) so background clutter around phone camera shots is ignored.
 * 2. Scans all 4,965+ indexed catalog & RAW vectors in RAM (~5ms) across all 6 zones
 *    (`full`, `hero`, `colorTop`, `colorBot`, `neck`, `daman`).
 * 3. Applies Multi-Photo Consensus Boost when multiple photos (e.g. Catalog Poster + RAW real photo)
 *    of the same SKU match the query image.
 */
export async function searchCatalogByImage(
  queryImageBuffer: Buffer,
  userId?: number,
  role?: string,
  minConfidence = 45,
  limit = 20
): Promise<ImageSearchResult[]> {
  const searchStartMs = Date.now();

  const orientedQueryBuf = await sharp(queryImageBuffer)
    .rotate()
    .flatten({ background: '#ffffff' })
    .removeAlpha()
    .toColorspace('srgb')
    .jpeg({ quality: 90 })
    .toBuffer();

  const qMeta = await sharp(orientedQueryBuf).metadata();
  const qw = qMeta.width || 600;
  const qh = qMeta.height || 800;

  // Create Center-Focused Garment Crop (trims outer 14% showroom wall/floor/rack clutter on phone shots)
  const centerCropBuf =
    qw >= 160 && qh >= 160
      ? await sharp(orientedQueryBuf)
          .extract({
            left: Math.floor(qw * 0.13),
            top: Math.floor(qh * 0.10),
            width: Math.max(64, Math.floor(qw * 0.74)),
            height: Math.max(64, Math.floor(qh * 0.80))
          })
          .jpeg({ quality: 90 })
          .toBuffer()
      : orientedQueryBuf;

  const [queryFullFeat, queryCenterFeat] = await Promise.all([
    extractVisualFeatures(orientedQueryBuf, false),
    extractVisualFeatures(centerCropBuf, false),
    ensureMemoryIndexLoaded()
  ]);

  // Scan all 4,965+ vectors in RAM (~5ms) using both Full-Frame and Center-Focused Query embeddings
  const itemMatches = new Map<
    number,
    {
      rawScore: number;
      secondBestRaw: number;
      hitCount: number;
      score: number;
      matchedImagePath: string;
      matchedType: string;
      matchedZone: string;
    }
  >();

  for (const entry of memoryFeatureIndex.values()) {
    const isRealImage = entry.imageType === 'real';
    const matchFull = calculateMultiZoneMatchScore(queryFullFeat, entry.features, isRealImage);
    const matchCenter = calculateMultiZoneMatchScore(queryCenterFeat, entry.features, isRealImage);

    const best = matchCenter.rawScore > matchFull.rawScore ? matchCenter : matchFull;

    if (best.score > 0) {
      const existing = itemMatches.get(entry.itemId);
      if (!existing) {
        itemMatches.set(entry.itemId, {
          rawScore: best.rawScore,
          secondBestRaw: 0,
          hitCount: best.rawScore >= 0.58 ? 1 : 0,
          score: best.score,
          matchedImagePath: entry.imagePath,
          matchedType: isRealImage ? 'real_photo' : 'catalog',
          matchedZone: best.zone
        });
      } else {
        if (best.rawScore >= 0.58) {
          existing.hitCount += 1;
        }
        if (best.rawScore > existing.rawScore) {
          existing.secondBestRaw = existing.rawScore;
          existing.rawScore = best.rawScore;
          existing.score = best.score;
          existing.matchedImagePath = entry.imagePath;
          existing.matchedType = isRealImage ? 'real_photo' : 'catalog';
          existing.matchedZone = best.zone;
        } else if (best.rawScore > existing.secondBestRaw) {
          existing.secondBestRaw = best.rawScore;
        }
      }
    }
  }

  // Apply Multi-Photo Consensus Boost (when both catalog poster + RAW photo(s) of the same SKU match!)
  for (const m of itemMatches.values()) {
    if (m.hitCount >= 2 && m.secondBestRaw >= 0.58) {
      const bonus = Math.min(0.05, m.hitCount * 0.015);
      m.rawScore = Math.min(0.995, m.rawScore + bonus);
      m.score = Math.min(99.5, Math.round(m.rawScore * 100 * 10) / 10);
    }
  }

  const finalThreshold = Math.max(52, minConfidence);
  const topCandidates = Array.from(itemMatches.entries())
    .filter(([, m]) => m.score >= finalThreshold)
    .sort((a, b) => b[1].rawScore - a[1].rawScore)
    .slice(0, Math.max(limit * 2, 30));

  if (topCandidates.length === 0) {
    console.log(`[Visual Search] ${Date.now() - searchStartMs}ms (100% Local DINOv2) | Matches: none above ${finalThreshold}%`);
    return [];
  }

  const candidateItemIds = topCandidates.map(([itemId]) => itemId);

  let metaQueryStr = `
    SELECT i.id as item_id, i.sku_id, i.category_id, i.image_path as primary_image_path, i.pieces_per_set,
           i.description, i.material, i.work, i.rate, i.revised_rate, i.original_created_at,
           c.name as category_name,
           (CURRENT_DATE - DATE(i.original_created_at)) as age_in_days,
           s.sets_count, s.total_pieces, s.is_available,
           COALESCE(ri.real_count, 0) as real_image_count
    FROM items i
    JOIN categories c ON c.id = i.category_id
    JOIN stock s ON s.item_id = i.id
    LEFT JOIN (
        SELECT item_id, CAST(COUNT(*) AS INTEGER) as real_count 
        FROM item_real_images 
        GROUP BY item_id
    ) ri ON ri.item_id = i.id
    WHERE i.id = ANY($1)
  `;

  const metaParams: any[] = [candidateItemIds];
  let paramIdx = 1;

  if (role !== 'superadmin' && userId) {
    paramIdx++;
    metaQueryStr += ` AND i.category_id IN (SELECT category_id FROM user_categories WHERE user_id = $${paramIdx})`;
    metaParams.push(userId);
  }
  if (role === 'sales') {
    metaQueryStr += ` AND s.is_available = TRUE`;
  }

  const metaRes = await query(metaQueryStr, metaParams);
  const itemMetaMap = new Map<number, any>();
  for (const r of metaRes.rows) {
    itemMetaMap.set(r.item_id, r);
  }

  const sortedMatches: Array<{
    score: number;
    matchedImagePath: string;
    matchedType: string;
    matchedZone: string;
    row: any;
  }> = [];

  for (const [itemId, m] of topCandidates) {
    const row = itemMetaMap.get(itemId);
    if (!row) continue;
    sortedMatches.push({
      score: m.score,
      matchedImagePath: m.matchedImagePath,
      matchedType: m.matchedType,
      matchedZone: m.matchedZone,
      row
    });
    if (sortedMatches.length >= limit) break;
  }

  console.log(
    `[Visual Search] ${Date.now() - searchStartMs}ms (100% Local DINOv2, 0 Cloud Calls) | Top5: ${
      sortedMatches
        .slice(0, 5)
        .map(m => `${m.row.sku_id}(${m.score}%/${m.matchedZone})`)
        .join(', ') || 'none'
    }`
  );

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
 * Indexes a single item image using DINOv2 and updates the In-Memory RAM Cache immediately
 */
export async function indexItemImage(
  itemId: number,
  imagePath: string,
  imageType: 'primary' | 'real' = 'primary'
): Promise<void> {
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
  const fullPath = resolveUploadFilePath(uploadDir, imagePath);

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
    memoryFeatureIndex.set(makeCacheKey(itemId, imagePath), {
      itemId,
      imageType,
      imagePath,
      features
    });
  } catch (err) {
    console.error(`[Visual Index] Failed to index DINOv2 features for item ${itemId} (${imagePath}):`, err);
  }
}

let isSyncRunning = false;

/**
 * High-Accuracy DINOv2 Indexing (Version 6 for Primary Collages, Version 5 for RAW Photos)
 * - Loads all existing vectors into the In-Memory RAM Cache immediately at startup so search is fast right away.
 * - Upgrades Primary Catalog Posters (`1,432` images) to `version: 6` (dedicated 224x224 Hero + Color Chart crops)
 *   and indexes any missing RAW photos (`f.id IS NULL`), without needlessly re-indexing already-indexed RAW photos!
 */
export async function syncAllCatalogVisualFeatures(
  forceReindex = false
): Promise<{ totalIndexed: number; skipped: number; errors: number }> {
  if (isSyncRunning) {
    console.log('[Visual Index] DINOv2 sync already in progress, skipping duplicate trigger.');
    return { totalIndexed: 0, skipped: 0, errors: 0 };
  }

  isSyncRunning = true;
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');
  console.log('[Visual Index] Starting v6 100% Local DINOv2 (Dedicated 224x224 Color-Chart & Fabric) sync...');

  let totalIndexed = 0;
  let skipped = 0;
  let errors = 0;

  try {
    await Promise.all([getDinoPipeline(), ensureMemoryIndexLoaded()]);

    // 1. Any RAW photos that are missing from `item_image_features`
    const missingRealRes = await query(`
      SELECT r.item_id, r.watermarked_path as image_path, 'real' as image_type
      FROM item_real_images r
      LEFT JOIN item_image_features f ON f.item_id = r.item_id AND f.image_path = r.watermarked_path
      ${forceReindex ? '' : `WHERE f.id IS NULL OR f.feature_vector->>'version' NOT IN ('4', '5', '6')`}
      ORDER BY r.id DESC
    `);

    // 2. Upgrade the 1,432 primary catalog posters to Version 6 (dedicated 224x224 Hero + Top-Left + Bottom-Left Color Chart crops)
    const itemsRes = await query(`
      SELECT i.id as item_id, i.image_path, 'primary' as image_type
      FROM items i
      JOIN stock s ON s.item_id = i.id
      LEFT JOIN item_image_features f ON f.item_id = i.id AND f.image_path = i.image_path
      ${forceReindex ? '' : `WHERE f.id IS NULL OR f.feature_vector->>'version' IS DISTINCT FROM '6'`}
      ORDER BY s.is_available DESC, i.id DESC
    `);

    const queue = [...missingRealRes.rows, ...itemsRes.rows];
    console.log(
      `[Visual Index] Processing ${queue.length} images (${missingRealRes.rows.length} missing RAW + ${itemsRes.rows.length} primary catalog collages)...`
    );

    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      const fullPath = resolveUploadFilePath(uploadDir, entry.image_path);

      if (!fs.existsSync(fullPath)) {
        skipped++;
        continue;
      }

      try {
        const isCatalogCollage = entry.image_type === 'primary';
        const features = await extractVisualFeatures(fullPath, isCatalogCollage);
        await query(
          `INSERT INTO item_image_features (item_id, image_type, image_path, feature_vector, dhash)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (item_id, image_path) 
           DO UPDATE SET feature_vector = EXCLUDED.feature_vector, dhash = EXCLUDED.dhash, created_at = CURRENT_TIMESTAMP`,
          [entry.item_id, entry.image_type, entry.image_path, JSON.stringify(features), features.dhash]
        );
        memoryFeatureIndex.set(makeCacheKey(entry.item_id, entry.image_path), {
          itemId: entry.item_id,
          imageType: entry.image_type,
          imagePath: entry.image_path,
          features
        });
        totalIndexed++;

        if (totalIndexed % 100 === 0 || i === queue.length - 1) {
          console.log(`[Visual Index] v6 DINOv2 Progress: ${totalIndexed}/${queue.length} images indexed...`);
        }
      } catch (e) {
        errors++;
      }
    }

    console.log(`[Visual Index] v6 DINOv2 sync finished: ${totalIndexed} indexed, ${skipped} skipped, ${errors} errors.`);
  } catch (err) {
    console.error('[Visual Index] DINOv2 visual feature sync error:', err);
  } finally {
    isSyncRunning = false;
  }

  return { totalIndexed, skipped, errors };
}
