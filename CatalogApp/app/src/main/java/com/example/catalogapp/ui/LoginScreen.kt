package com.example.catalogapp.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.catalogapp.data.LoginRequest
import com.example.catalogapp.data.NetworkClient
import com.example.catalogapp.data.SessionManager
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    sessionManager: SessionManager,
    onLoginSuccess: () -> Unit
) {
    val coroutineScope = rememberCoroutineScope()
    
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var serverUrl by remember { mutableStateOf(sessionManager.getServerUrl()) }
    
    var errorMsg by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var isSettingsOpen by remember { mutableStateOf(false) }
    
    val deviceUuid = sessionManager.getDeviceUuid()
    val deviceName = sessionManager.getDeviceName()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // App Identity Header
        Text(
            text = "DESUKA FASHION",
            fontSize = 32.sp,
            fontWeight = FontWeight.ExtraBold,
            color = MaterialTheme.colorScheme.primary,
            letterSpacing = 1.sp
        )
        Text(
            text = "Catalog Inventory Management",
            fontSize = 14.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 32.dp)
        )

        // Login Card Panel
        Card(
            modifier = Modifier.fillMaxWidth(),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "Operator Login",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Bold
                )

                // Username field
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it },
                    label = { Text("Username") },
                    leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                // Password field
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                if (errorMsg.isNotEmpty()) {
                    Text(
                        text = errorMsg,
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Button(
                    onClick = {
                        if (username.isBlank() || password.isBlank()) {
                            errorMsg = "Please fill in all fields"
                            return@Button
                        }
                        isLoading = true
                        errorMsg = ""
                        
                        coroutineScope.launch {
                            try {
                                // Save base URL just in case modified
                                sessionManager.setServerUrl(serverUrl)
                                
                                val apiService = NetworkClient.getApiService(sessionManager)
                                val response = apiService.login(
                                    LoginRequest(
                                        username = username.trim(),
                                        password = password,
                                        deviceUuid = deviceUuid,
                                        deviceName = deviceName
                                    )
                                )
                                
                                // Save session
                                sessionManager.saveToken(response.token)
                                sessionManager.saveUser(
                                    response.user.id,
                                    response.user.username,
                                    response.user.role
                                )
                                
                                onLoginSuccess()
                            } catch (e: retrofit2.HttpException) {
                                val errorBody = e.response()?.errorBody()?.string()
                                if (errorBody != null && errorBody.contains("device_pending")) {
                                    errorMsg = "Device pending admin authorization. Please check in with your supervisor."
                                } else if (errorBody != null && errorBody.contains("disabled")) {
                                    errorMsg = "Your account has been disabled."
                                } else {
                                    errorMsg = "Invalid username or password credentials."
                                }
                            } catch (e: Exception) {
                                errorMsg = "Unable to connect. Check server settings or connection."
                            } finally {
                                isLoading = false
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isLoading
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary)
                    } else {
                        Text("Connect Session")
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Device Security Status Footer
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(bottom = 12.dp)
        ) {
            Icon(Icons.Default.Info, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = "Device Whitelist UUID: ${deviceUuid.take(12)}...",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        // Settings Toggle for changing server IP address
        TextButton(onClick = { isSettingsOpen = !isSettingsOpen }) {
            Icon(Icons.Default.Settings, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(4.dp))
            Text("Connection Settings", fontSize = 13.sp)
        }

        if (isSettingsOpen) {
            OutlinedTextField(
                value = serverUrl,
                onValueChange = { serverUrl = it },
                label = { Text("Server URL API Endpoint") },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp)
            )
        }
    }
}

