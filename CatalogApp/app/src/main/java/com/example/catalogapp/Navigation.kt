package com.example.catalogapp

import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import com.example.catalogapp.data.SessionManager
import com.example.catalogapp.ui.LoginScreen
import com.example.catalogapp.ui.RoleSelectionScreen
import com.example.catalogapp.ui.SalesDashboard
import com.example.catalogapp.ui.StockistDashboard

@Composable
fun MainNavigation() {
    val context = LocalContext.current
    val sessionManager = remember { SessionManager(context) }
    
    var token by remember { mutableStateOf(sessionManager.getToken()) }
    var role by remember { mutableStateOf(sessionManager.getUserRole()) }
    var activeRole by remember { mutableStateOf(sessionManager.getActiveRole()) }

    if (token == null) {
        LoginScreen(
            sessionManager = sessionManager,
            onLoginSuccess = {
                token = sessionManager.getToken()
                role = sessionManager.getUserRole()
                activeRole = sessionManager.getActiveRole()
            }
        )
    } else {
        // Check if user has dual-access rights ("both" or "manager")
        if ((role == "both" || role == "manager") && activeRole == null) {
            RoleSelectionScreen(
                onRoleSelected = { selectedRole ->
                    sessionManager.saveActiveRole(selectedRole)
                    activeRole = selectedRole
                },
                onLogout = {
                    sessionManager.logout()
                    token = null
                    role = null
                    activeRole = null
                }
            )
        } else {
            // Determine active display mode
            val displayRole = if (role == "both" || role == "manager") activeRole else role
            
            when (displayRole) {
                "sales" -> {
                    SalesDashboard(
                        sessionManager = sessionManager,
                        onLogout = {
                            sessionManager.logout()
                            token = null
                            role = null
                            activeRole = null
                        },
                        onSwitchMode = {
                            if (role == "both" || role == "manager") {
                                val nextRole = "stockist"
                                sessionManager.saveActiveRole(nextRole)
                                activeRole = nextRole
                            }
                        }
                    )
                }
                else -> {
                    // Stockist, Superadmin, or active Stockist mode
                    StockistDashboard(
                        sessionManager = sessionManager,
                        onLogout = {
                            sessionManager.logout()
                            token = null
                            role = null
                            activeRole = null
                        },
                        onSwitchMode = {
                            if (role == "both" || role == "manager") {
                                val nextRole = "sales"
                                sessionManager.saveActiveRole(nextRole)
                                activeRole = nextRole
                            }
                        }
                    )
                }
            }
        }
    }
}
