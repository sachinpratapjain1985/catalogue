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
     * Renders a crisp white rate watermark badge highlighted in the top right corner of the bitmap.
     */
    fun addTopRightRateBadge(originalBitmap: Bitmap, rateText: String): Bitmap {
        val mutableBitmap = originalBitmap.copy(Bitmap.Config.ARGB_8888, true)
        val canvas = Canvas(mutableBitmap)
        val width = mutableBitmap.width.toFloat()
        val height = mutableBitmap.height.toFloat()

        // Responsive font size based on image width
        val fontSize = (width / 16f).coerceIn(36f, 100f)
        val paddingHorizontal = fontSize * 0.55f
        val paddingVertical = fontSize * 0.3f
        val cornerRadius = fontSize * 0.35f
        val margin = width * 0.04f // 4% margin from top and right edges

        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            textSize = fontSize
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            textAlign = Paint.Align.CENTER
        }

        // Measure text dimensions
        val textBounds = android.graphics.Rect()
        textPaint.getTextBounds(rateText, 0, rateText.length, textBounds)
        val textWidth = textPaint.measureText(rateText)
        val textHeight = textBounds.height().toFloat()

        val badgeWidth = textWidth + (paddingHorizontal * 2f)
        val badgeHeight = textHeight + (paddingVertical * 2f)

        val right = width - margin
        val left = right - badgeWidth
        val top = margin
        val bottom = top + badgeHeight

        val badgeRect = android.graphics.RectF(left, top, right, bottom)

        // Draw soft outer shadow
        val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(90, 0, 0, 0)
            style = Paint.Style.FILL
        }
        val shadowRect = android.graphics.RectF(left + 3f, top + 3f, right + 3f, bottom + 3f)
        canvas.drawRoundRect(shadowRect, cornerRadius, cornerRadius, shadowPaint)

        // Draw stylish dark translucent background pill for high contrast
        val backgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(210, 18, 20, 28)
            style = Paint.Style.FILL
        }
        canvas.drawRoundRect(badgeRect, cornerRadius, cornerRadius, backgroundPaint)

        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(230, 245, 158, 11) // Highlight gold border
            style = Paint.Style.STROKE
            strokeWidth = (fontSize * 0.06f).coerceAtLeast(2.5f)
        }
        canvas.drawRoundRect(badgeRect, cornerRadius, cornerRadius, borderPaint)

        // Draw bold crisp white text centered in the badge
        val textX = badgeRect.centerX()
        val textY = badgeRect.centerY() + (textHeight / 2f) - textBounds.bottom
        canvas.drawText(rateText, textX, textY, textPaint)

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
                        
                        if (isRealImage || hasRevisedRate) {
                            val rawBitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                            if (rawBitmap != null) {
                                var processedBitmap = rawBitmap
                                
                                if (isRealImage) {
                                    val wmBitmap = addWatermarkToBitmap(processedBitmap)
                                    if (processedBitmap != rawBitmap && processedBitmap != wmBitmap) {
                                        processedBitmap.recycle()
                                    }
                                    processedBitmap = wmBitmap
                                }

                                if (hasRevisedRate) {
                                    val rateBadgeBitmap = addTopRightRateBadge(processedBitmap, "₹${item.revised_rate}")
                                    if (processedBitmap != rawBitmap && processedBitmap != rateBadgeBitmap) {
                                        processedBitmap.recycle()
                                    }
                                    processedBitmap = rateBadgeBitmap
                                }

                                FileOutputStream(file).use { out ->
                                    processedBitmap.compress(Bitmap.CompressFormat.JPEG, 100, out)
                                }
                                if (processedBitmap != rawBitmap) {
                                    processedBitmap.recycle()
                                }
                                rawBitmap.recycle()
                            } else {
                                FileOutputStream(file).use { out ->
                                    out.write(bytes)
                                }
                            }
                        } else {
                            // Standard catalog images with no revised rate saved pristine
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
