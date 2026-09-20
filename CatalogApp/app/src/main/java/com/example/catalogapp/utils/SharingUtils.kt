package com.example.catalogapp.utils

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import androidx.core.content.FileProvider
import com.example.catalogapp.data.SKUItemDto
import com.example.catalogapp.data.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream

object SharingUtils {

    fun sanitizeDescription(desc: String?): String {
        if (desc.isNullOrBlank()) {
            return ""
        }
        val trimmed = desc.trim()
        if (trimmed.equals("DESUKA by VS FASHION Gandhi Nagar Delhi.", ignoreCase = true)) {
            return ""
        }
        return trimmed
            .replace("old stock", "", ignoreCase = true)
            .replace("new stock", "", ignoreCase = true)
            .replace("old", "", ignoreCase = true)
            .replace("new", "", ignoreCase = true)
            .trim()
    }

    /**
     * Renders a clean, light diagonal watermark in the center of the bitmap.
     */
    fun addWatermarkToBitmap(originalBitmap: Bitmap): Bitmap {
        val mutableBitmap = originalBitmap.copy(Bitmap.Config.ARGB_8888, true)
        val canvas = Canvas(mutableBitmap)
        val width = mutableBitmap.width.toFloat()
        val height = mutableBitmap.height.toFloat()

        val text = "VS FASHION (DESUKA)"
        val fontSize = (width / 12f).coerceAtLeast(32f)

        val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(60, 0, 0, 0)
            textSize = fontSize
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
            letterSpacing = 0.06f
        }

        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(125, 255, 255, 255)
            textSize = fontSize
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
            letterSpacing = 0.06f
        }

        canvas.save()
        canvas.rotate(-30f, width / 2f, height / 2f)

        // Draw shadow offset by +2px
        canvas.drawText(text, width / 2f + 2f, height / 2f + 2f, shadowPaint)
        // Draw light translucent white text
        canvas.drawText(text, width / 2f, height / 2f, textPaint)

        canvas.restore()
        return mutableBitmap
    }

    /**
     * Renders a crisp luxury rate watermark badge positioned safely below top-right brand logos.
     * Features "NEW OFFER PRICE" in gold followed by the highlighted amount in crisp white.
     */
    fun addTopRightRateBadge(originalBitmap: Bitmap, rateText: String): Bitmap {
        val mutableBitmap = originalBitmap.copy(Bitmap.Config.ARGB_8888, true)
        val canvas = Canvas(mutableBitmap)
        val width = mutableBitmap.width.toFloat()
        val height = mutableBitmap.height.toFloat()

        // 10% reduced font size for sleek elegance
        val amountFontSize = (width / 18f).coerceIn(30f, 85f)
        val labelFontSize = (amountFontSize * 0.38f).coerceIn(12f, 32f)

        val paddingHorizontal = amountFontSize * 0.55f
        val paddingVertical = amountFontSize * 0.32f
        val cornerRadius = amountFontSize * 0.32f

        // Positioned 9% from top edge so VS FASHION brand watermark remains completely unobstructed
        val marginTop = width * 0.09f
        val marginRight = width * 0.04f

        val labelText = "NEW OFFER PRICE"

        val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(251, 191, 36) // Luxury gold (#FBBF24)
            textSize = labelFontSize
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
            letterSpacing = 0.10f // Elegant luxury letter-spacing
        }

        val amountPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = amountFontSize
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
        }

        // Measure text dimensions
        val labelBounds = android.graphics.Rect()
        labelPaint.getTextBounds(labelText, 0, labelText.length, labelBounds)
        val labelWidth = labelPaint.measureText(labelText)
        val labelHeight = labelBounds.height().toFloat()

        val amountBounds = android.graphics.Rect()
        amountPaint.getTextBounds(rateText, 0, rateText.length, amountBounds)
        val amountWidth = amountPaint.measureText(rateText)
        val amountHeight = amountBounds.height().toFloat()

        val lineSpacing = labelFontSize * 0.45f
        val contentWidth = maxOf(labelWidth, amountWidth)
        val badgeWidth = contentWidth + (paddingHorizontal * 2f)
        val badgeHeight = labelHeight + lineSpacing + amountHeight + (paddingVertical * 2f)

        val right = width - marginRight
        val left = right - badgeWidth
        val top = marginTop
        val bottom = top + badgeHeight

        val badgeRect = android.graphics.RectF(left, top, right, bottom)

        // Draw soft outer shadow
        val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(100, 0, 0, 0)
            style = Paint.Style.FILL
        }
        val shadowRect = android.graphics.RectF(left + 3f, top + 4f, right + 3f, bottom + 4f)
        canvas.drawRoundRect(shadowRect, cornerRadius, cornerRadius, shadowPaint)

        // Draw stylish dark translucent background pill
        val backgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(225, 15, 17, 24)
            style = Paint.Style.FILL
        }
        canvas.drawRoundRect(badgeRect, cornerRadius, cornerRadius, backgroundPaint)

        // Draw luxury gold highlight border
        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(240, 245, 158, 11) // Gold border (#F59E0B)
            style = Paint.Style.STROKE
            strokeWidth = (amountFontSize * 0.055f).coerceAtLeast(2.5f)
        }
        canvas.drawRoundRect(badgeRect, cornerRadius, cornerRadius, borderPaint)

        val centerX = badgeRect.centerX()

        // Line 1: NEW OFFER PRICE (Gold with letter spacing)
        val labelY = top + paddingVertical + labelHeight - labelBounds.bottom
        canvas.drawText(labelText, centerX, labelY, labelPaint)

        // Line 2: Amount (Bold White)
        val amountY = top + paddingVertical + labelHeight + lineSpacing + amountHeight - amountBounds.bottom
        canvas.drawText(rateText, centerX, amountY, amountPaint)

        return mutableBitmap
    }

    /**
     * Downloads list of selected images to cache, applies on-the-fly watermark, and shares them over WhatsApp.
     */
    suspend fun downloadAndShareImages(
        context: Context,
        selectedItems: List<SKUItemDto>,
        sessionManager: SessionManager,
        shareDescription: Boolean = false,
        shareRealImages: Boolean = false,
        imagesPerItem: Int = 1,
        onProgress: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        withContext(Dispatchers.IO) {
            val client = OkHttpClient()
            val uris = ArrayList<Uri>()
            
            val cacheFolder = File(context.cacheDir, "shared_catalogs").apply {
                if (!exists()) mkdirs() else deleteRecursively(); mkdirs() // Clear old downloads
            }

            try {
                selectedItems.forEachIndexed { index, item ->
                    val progressMsg = "Processing ${item.sku_id} (${index + 1}/${selectedItems.size})..."
                    withContext(Dispatchers.Main) { onProgress(progressMsg) }

                    val allUrls = if (shareRealImages && item.real_images.isNotEmpty()) {
                        item.getFullRealImageUrls(sessionManager.getServerUrl())
                    } else {
                        listOf(item.getFullImageUrl(sessionManager.getServerUrl()))
                    }

                    val targetUrls = allUrls.take(imagesPerItem.coerceAtLeast(1))

                    targetUrls.forEachIndexed { imgIdx, imageUrl ->
                        val request = Request.Builder()
                            .url(imageUrl)
                            .header("Authorization", "Bearer ${sessionManager.getToken() ?: ""}")
                            .build()

                        val response = client.newCall(request).execute()
                        if (!response.isSuccessful) {
                            throw Exception("HTTP error code ${response.code} for ${item.sku_id}")
                        }

                        val body = response.body ?: throw Exception("Empty body for ${item.sku_id}")
                        val suffix = if (imageUrl.endsWith(".png", true)) ".png" else ".jpg"
                        val filename = if (targetUrls.size > 1) "${item.sku_id}_real_${imgIdx + 1}$suffix" else "${item.sku_id}$suffix"
                        val file = File(cacheFolder, filename)
                        val bytes = body.bytes()
                        val isRealImage = shareRealImages && item.real_images.isNotEmpty()
                        val hasRevisedRate = item.revised_rate != null && item.revised_rate > 0
                        
                        if (isRealImage) {
                            // RAW real photos: send original uncompressed high-resolution file directly with zero loss
                            FileOutputStream(file).use { out ->
                                out.write(bytes)
                            }
                        } else if (hasRevisedRate) {
                            // Catalog design images with revised rate: stamp crisp top-right rate badge at full resolution
                            val decodeOptions = BitmapFactory.Options().apply {
                                inPreferredConfig = Bitmap.Config.ARGB_8888
                                inScaled = false
                            }
                            val rawBitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, decodeOptions)
                            if (rawBitmap != null) {
                                val rateBadgeBitmap = addTopRightRateBadge(rawBitmap, "₹${item.revised_rate}")
                                FileOutputStream(file).use { out ->
                                    rateBadgeBitmap.compress(Bitmap.CompressFormat.JPEG, 100, out)
                                }
                                if (rateBadgeBitmap != rawBitmap) {
                                    rateBadgeBitmap.recycle()
                                }
                                rawBitmap.recycle()
                            } else {
                                FileOutputStream(file).use { out ->
                                    out.write(bytes)
                                }
                            }
                        } else {
                            // Standard regular catalog images: write pristine original image bytes
                            FileOutputStream(file).use { out ->
                                out.write(bytes)
                            }
                        }

                        // Get shareable Content Uri from FileProvider
                        val uri = FileProvider.getUriForFile(
                            context,
                            "com.example.catalogapp.fileprovider",
                            file
                        )
                        uris.add(uri)
                    }
                }

                if (uris.isEmpty()) {
                    withContext(Dispatchers.Main) { onError("No images were successfully cached.") }
                    return@withContext
                }

                withContext(Dispatchers.Main) { onProgress("Opening WhatsApp...") }

                // Helper to create intent configured for sharing images
                fun createShareIntent(targetPackage: String?): Intent {
                    val intent = if (uris.size == 1) {
                        Intent(Intent.ACTION_SEND).apply {
                            type = "image/*"
                            putExtra(Intent.EXTRA_STREAM, uris[0])
                            if (shareDescription) {
                                val item = selectedItems[0]
                                val desc = sanitizeDescription(item.description)
                                if (desc.isNotEmpty()) {
                                    putExtra(Intent.EXTRA_TEXT, desc)
                                }
                            }
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                    } else {
                        Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                            type = "image/*"
                            putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                            if (shareDescription) {
                                val detailsText = buildString {
                                    selectedItems.forEach { item ->
                                        val desc = sanitizeDescription(item.description)
                                        if (desc.isNotEmpty()) {
                                            append("• SKU: ${item.sku_id}: $desc\n")
                                        }
                                    }
                                }
                                if (detailsText.isNotEmpty()) {
                                    putExtra(Intent.EXTRA_TEXT, detailsText)
                                }
                            }
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                    }
                    if (targetPackage != null) {
                        intent.setPackage(targetPackage)
                    }
                    return intent
                }

                val pm = context.packageManager
                val whatsappPackages = listOf("com.whatsapp", "com.whatsapp.w4b")
                val availableIntents = ArrayList<Intent>()

                for (pkg in whatsappPackages) {
                    try {
                        pm.getPackageInfo(pkg, 0)
                        availableIntents.add(createShareIntent(pkg))
                    } catch (_: Exception) {
                        // Package not installed on device
                    }
                }

                val launchIntent = when {
                    availableIntents.isEmpty() -> {
                        // Fallback: Neither is installed -> open system chooser
                        Intent.createChooser(createShareIntent(null), "Share Catalogue via").apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                    }
                    availableIntents.size == 1 -> {
                        // Only one WhatsApp variant installed -> launch directly
                        availableIntents[0].apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                    }
                    else -> {
                        // Both WhatsApp and WhatsApp Business are installed -> show chooser with both options
                        val firstIntent = availableIntents.removeAt(0)
                        Intent.createChooser(firstIntent, "Select WhatsApp / Business").apply {
                            putExtra(Intent.EXTRA_INITIAL_INTENTS, availableIntents.toTypedArray())
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                    }
                }

                context.startActivity(launchIntent)

            } catch (e: Exception) {
                e.printStackTrace()
                withContext(Dispatchers.Main) { 
                    onError("Sharing failed: ${e.localizedMessage ?: "Unknown error"}") 
                }
            }
        }
    }
}
