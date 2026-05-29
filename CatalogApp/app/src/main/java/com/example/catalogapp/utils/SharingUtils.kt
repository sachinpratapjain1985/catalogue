package com.example.catalogapp.utils

import android.content.Context
import android.content.Intent
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
import java.io.InputStream

object SharingUtils {

    private fun sanitizeDescription(desc: String?): String {
        if (desc.isNullOrBlank()) {
            return "DESUKA by VS FASHION Gandhi Nagar Delhi."
        }
        return desc
            .replace("old stock", "", ignoreCase = true)
            .replace("new stock", "", ignoreCase = true)
            .replace("old", "", ignoreCase = true)
            .replace("new", "", ignoreCase = true)
            .trim()
            .ifBlank { "DESUKA by VS FASHION Gandhi Nagar Delhi." }
    }

    /**
     * Downloads list of selected images to cache and shares them over WhatsApp.
     */
    suspend fun downloadAndShareImages(
        context: Context,
        selectedItems: List<SKUItemDto>,
        sessionManager: SessionManager,
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
                    val progressMsg = "Downloading ${item.sku_id} (${index + 1}/${selectedItems.size})..."
                    withContext(Dispatchers.Main) { onProgress(progressMsg) }

                    val imageUrl = item.getFullImageUrl(sessionManager.getServerUrl())
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
                    val file = File(cacheFolder, "${item.sku_id}$suffix")
                    
                    val inputStream: InputStream = body.byteStream()
                    val outputStream = FileOutputStream(file)
                    
                    inputStream.use { input ->
                        outputStream.use { output ->
                            input.copyTo(output)
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

                if (uris.isEmpty()) {
                    withContext(Dispatchers.Main) { onError("No images were successfully cached.") }
                    return@withContext
                }

                withContext(Dispatchers.Main) { onProgress("Opening WhatsApp...") }

                // Create share intent targeting WhatsApp specifically or generic chooser targeting it
                val shareIntent = if (uris.size == 1) {
                    val item = selectedItems[0]
                    val detailsText = buildString {
                        append("Design SKU: ${item.sku_id}\n")
                        append("Rate: ₹${item.rate}\n")
                        if (!item.material.isNullOrBlank()) {
                            append("Material: ${item.material}\n")
                        }
                        val desc = sanitizeDescription(item.description)
                        append("Description: $desc\n")
                        append("Pack Details: ${item.pieces_per_set} pieces per set\n")
                        append("Available: Yes\n\n")
                        append("Shared via Desuka Catalog")
                    }

                    Intent(Intent.ACTION_SEND).apply {
                        type = "image/*"
                        putExtra(Intent.EXTRA_STREAM, uris[0])
                        putExtra(Intent.EXTRA_TEXT, detailsText)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                } else {
                    val detailsText = buildString {
                        append("Designs from Desuka Catalogue:\n\n")
                        selectedItems.forEach { item ->
                            append("• SKU: ${item.sku_id}\n")
                            append("  Rate: ₹${item.rate}\n")
                            if (!item.material.isNullOrBlank()) {
                                append("  Material: ${item.material}\n")
                            }
                            val desc = sanitizeDescription(item.description)
                            append("  Description: $desc\n")
                            append("  Pack details: ${item.pieces_per_set} pc/set\n\n")
                        }
                        append("Shared via Desuka Catalog")
                    }

                    Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                        type = "image/*"
                        putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                        putExtra(Intent.EXTRA_TEXT, detailsText)
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
