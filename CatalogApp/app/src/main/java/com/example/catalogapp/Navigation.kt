package com.example.catalogapp

import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import com.example.catalogapp.data.SessionManager
import com.example.catalogapp.ui.LoginScreen
import com.example.catalogapp.ui.SalesDashboard
import com.example.catalogapp.ui.StockistDashboard

@Composable
fun MainNavigation() {
    val context = LocalContext.current
    val sessionManager = remember { SessionManager(context) }
    
    var token by remember { mutableStateOf(sessionManager.getToken()) }
    var role by remember { mutableStateOf(sessionManager.getUserRole()) }

    if (token == null) {
        LoginScreen(
            sessionManager = sessionManager,
            onLoginSuccess = {
                token = sessionManager.getToken()
                role = sessionManager.getUserRole()
            }
        )
    } else {
        when (role) {
            "sales" -> {
                SalesDashboard(
                    sessionManager = sessionManager,
                    onLogout = {
                        sessionManager.logout()
                        token = null
                        role = null
                    }
                )
            }
            else -> {
                // Stockist or Superadmin access stockist dashboard
                StockistDashboard(
                    sessionManager = sessionManager,
                    onLogout = {
                        sessionManager.logout()
                        token = null
                        role = null
                    }
                )
            }
        }
    }
}
