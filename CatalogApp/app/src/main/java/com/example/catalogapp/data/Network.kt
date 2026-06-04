package com.example.catalogapp.data

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*

// API Data Transfer Models
data class LoginRequest(
    val username: String,
    val password: String,
    val deviceUuid: String,
    val deviceName: String
)

data class LoginResponse(
    val token: String,
    val user: UserDto
)

data class UserDto(
    val id: Int,
    val username: String,
    val role: String,
    val can_edit_rates: Boolean = false
)

data class CategoryDto(
    val id: Int,
    val name: String,
    val sku_count: Int,
    val active_count: Int = 0,
    val os_count: Int = 0
)

data class SKUItemDto(
    val id: Int,
    val sku_id: String,
    val category_id: Int,
    val image_path: String,
    val pieces_per_set: Int,
    val description: String?,
    val material: String?,
    val sets_count: Int,
    val total_pieces: Int,
    val is_available: Boolean,
    val rate: Int = 0,
    val original_created_at: String? = null,
    val age_in_days: Int? = null
) {
    // Helper to get full Image URL
    fun getFullImageUrl(baseUrl: String): String {
        return if (image_path.startsWith("http")) {
            image_path
        } else {
            val formattedBase = if (baseUrl.endsWith("/")) baseUrl.dropLast(1) else baseUrl
            val formattedPath = if (image_path.startsWith("/")) image_path else "/$image_path"
            "$formattedBase$formattedPath"
        }
    }

    // Helper to get compressed WebP/JPEG thumbnail URL for grid optimization
    fun getThumbnailImageUrl(baseUrl: String): String {
        val originalUrl = getFullImageUrl(baseUrl)
        val lastDotIndex = originalUrl.lastIndexOf('.')
        return if (lastDotIndex != -1 && !originalUrl.contains("-thumb.")) {
            originalUrl.substring(0, lastDotIndex) + "-thumb" + originalUrl.substring(lastDotIndex)
        } else {
            originalUrl
        }
    }
}

data class StockUpdateRequest(
    val setsCount: Int?,
    val isAvailable: Boolean?,
    val rate: Int? = null
)

data class StockUpdateResponse(
    val item_id: Int,
    val sets_count: Int,
    val total_pieces: Int,
    val is_available: Boolean,
    val rate: Int? = null,
    val updated_by: Int
)

// Retrofit API Service Interface
interface CatalogApiService {
    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @GET("api/catalog/categories")
    suspend fun getCategories(): List<CategoryDto>

    @GET("api/catalog/categories/{id}/items")
    suspend fun getCategoryItems(
        @Path("id") categoryId: Int,
        @Query("page") page: Int? = null,
        @Query("limit") limit: Int? = null,
        @Query("search") search: String? = null
    ): List<SKUItemDto>

    @POST("api/catalog/items/{id}/stock")
    suspend fun updateStock(
        @Path("id") itemId: Int,
        @Body request: StockUpdateRequest
    ): StockUpdateResponse
}

// Network Client Provider
object NetworkClient {
    // Replace with actual backend deployment address
    var baseUrl = "https://catalog.desukafashion.com/"
        set(value) {
            field = value
            retrofitInstance = null
        }

    private var retrofitInstance: Retrofit? = null

    fun getApiService(sessionManager: SessionManager): CatalogApiService {
        if (retrofitInstance == null) {
            val loggingInterceptor = HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            }

            val okHttpClient = OkHttpClient.Builder()
                .addInterceptor(loggingInterceptor)
                .addInterceptor { chain ->
                    val original = chain.request()
                    val requestBuilder = original.newBuilder()
                        .header("Content-Type", "application/json")
                    
                    // Inject authorization token if present
                    sessionManager.getToken()?.let {
                        requestBuilder.header("Authorization", "Bearer $it")
                    }

                    // Inject active role header if present
                    sessionManager.getActiveRole()?.let {
                        requestBuilder.header("x-active-role", it)
                    }

                    // Inject device ID header
                    requestBuilder.header("x-device-uuid", sessionManager.getDeviceUuid())

                    val request = requestBuilder.build()
                    chain.proceed(request)
                }
                .build()

            retrofitInstance = Retrofit.Builder()
                .baseUrl(baseUrl)
                .client(okHttpClient)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
        }

        return retrofitInstance!!.create(CatalogApiService::class.java)
    }
}
