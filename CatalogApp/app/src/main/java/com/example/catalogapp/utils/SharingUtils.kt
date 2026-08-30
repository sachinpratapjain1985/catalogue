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
                        val rawBitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        
                        if (rawBitmap != null) {
                            val watermarkedBitmap = addWatermarkToBitmap(rawBitmap)
                            FileOutputStream(file).use { out ->
                                watermarkedBitmap.compress(Bitmap.CompressFormat.JPEG, 100, out)
                            }
                            if (watermarkedBitmap != rawBitmap) {
                                rawBitmap.recycle()
                            }
                            watermarkedBitmap.recycle()
                        } else {
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

                // Create share intent targeting WhatsApp specifically or generic chooser targeting it
                val shareIntent = if (uris.size == 1) {
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

                // Direct package specification targeting WhatsApp (com.whatsapp)
                shareIntent.setPackage("com.whatsapp")
                
                // Fallback: If WhatsApp is not installed, open system chooser
                val chooserIntent = Intent.createChooser(shareIntent, "Share Catalogue via").apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }

                context.startActivity(chooserIntent)

            } catch (e: Exception) {
                e.printStackTrace()
                withContext(Dispatchers.Main) { 
                    onError("Sharing failed: ${e.localizedMessage ?: "Unknown error"}") 
                }
            }
        }
    }
}
