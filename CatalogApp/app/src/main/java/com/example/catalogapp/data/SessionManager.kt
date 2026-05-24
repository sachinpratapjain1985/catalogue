package com.example.catalogapp.data

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import java.util.UUID

class SessionManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("catalog_prefs", Context.MODE_PRIVATE)

    companion object {
        private const val KEY_TOKEN = "jwt_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_USERNAME = "username"
        private const val KEY_ROLE = "role"
        private const val KEY_DEVICE_UUID = "device_uuid"
        private const val KEY_SERVER_URL = "server_url"
    }

    init {
        // Ensure device UUID is generated on first install
        if (getDeviceUuid().isEmpty()) {
            val newUuid = UUID.randomUUID().toString()
            prefs.edit().putString(KEY_DEVICE_UUID, newUuid).apply()
        }
    }

    // Server Config
    fun getServerUrl(): String {
        return prefs.getString(KEY_SERVER_URL, "http://10.0.2.2:5000/") ?: "http://10.0.2.2:5000/"
    }

    fun setServerUrl(url: String) {
        var formattedUrl = url.trim()
        if (!formattedUrl.endsWith("/")) {
            formattedUrl += "/"
        }
        prefs.edit().putString(KEY_SERVER_URL, formattedUrl).apply()
        NetworkClient.baseUrl = formattedUrl
    }

    // Token
    fun saveToken(token: String) {
        prefs.edit().putString(KEY_TOKEN, token).apply()
    }

    fun getToken(): String? {
        return prefs.getString(KEY_TOKEN, null)
    }

    // Device identity
    fun getDeviceUuid(): String {
        return prefs.getString(KEY_DEVICE_UUID, "") ?: ""
    }

    fun getDeviceName(): String {
        val manufacturer = Build.MANUFACTURER
        val model = Build.MODEL
        return if (model.startsWith(manufacturer)) {
            model.replaceFirstChar { it.uppercase() }
        } else {
            "${manufacturer.replaceFirstChar { it.uppercase() }} $model"
        }
    }

    // User details
    fun saveUser(id: Int, username: String, role: String) {
        prefs.edit().apply {
            putInt(KEY_USER_ID, id)
            putString(KEY_USERNAME, username)
            putString(KEY_ROLE, role)
        }.apply()
    }

    fun getUserRole(): String? {
        return prefs.getString(KEY_ROLE, null)
    }

    fun getUsername(): String? {
        return prefs.getString(KEY_USERNAME, null)
    }

    fun logout() {
        prefs.edit().apply {
            remove(KEY_TOKEN)
            remove(KEY_USER_ID)
            remove(KEY_USERNAME)
            remove(KEY_ROLE)
        }.apply()
    }
}
