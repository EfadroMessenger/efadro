package com.example.efadro.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.efadro.data.model.UserRole
import com.example.efadro.data.network.WsConnectionStatus
import com.example.efadro.ui.theme.AuroraCyan
import com.example.efadro.ui.theme.AuroraEmerald
import com.example.efadro.ui.theme.AuroraPurple
import com.example.efadro.ui.theme.DangerRed
import com.example.efadro.ui.theme.DarkBg
import com.example.efadro.ui.theme.DarkBorder
import com.example.efadro.ui.theme.DarkSurface
import com.example.efadro.ui.theme.DarkSurfaceVariant
import com.example.efadro.ui.theme.E2eeGold
import com.example.efadro.ui.theme.IndigoPrimary
import com.example.efadro.ui.theme.OnlineGreen
import com.example.efadro.ui.viewmodel.AuthViewModel
import com.example.efadro.ui.viewmodel.SettingsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    settingsViewModel: SettingsViewModel,
    authViewModel: AuthViewModel,
    onBack: () -> Unit,
    onNavigateTo2FaSetup: () -> Unit,
    onNavigateToStaff: () -> Unit,
    onLogout: () -> Unit
) {
    val currentUser by settingsViewModel.currentUser.collectAsState()
    val blockedUsers by settingsViewModel.blockedUsers.collectAsState()
    val serverUrl by settingsViewModel.serverUrl.collectAsState()
    val serverHealth by settingsViewModel.serverHealth.collectAsState()
    val serverPingMs by settingsViewModel.serverPingMs.collectAsState()
    val connectionStatus by settingsViewModel.connectionStatus.collectAsState()

    var isEditingProfile by remember { mutableStateOf(false) }
    var displayNameInput by remember { mutableStateOf(currentUser?.displayName ?: "") }
    var bioInput by remember { mutableStateOf(currentUser?.bio ?: "") }

    var isEditingServer by remember { mutableStateOf(false) }
    var serverUrlInput by remember { mutableStateOf(serverUrl) }

    Scaffold(
        containerColor = DarkBg,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = DarkSurface,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                ),
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                title = { Text("Settings & Privacy", style = MaterialTheme.typography.titleMedium) }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Spacer(modifier = Modifier.height(4.dp))
                // Profile Card
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(54.dp)
                                    .clip(CircleShape)
                                    .background(IndigoPrimary),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = currentUser?.displayName?.take(1)?.uppercase() ?: "U",
                                    color = Color.White,
                                    fontSize = 22.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            Spacer(modifier = Modifier.width(14.dp))

                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = currentUser?.displayName ?: "User",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                                Text(
                                    text = "@${currentUser?.username} · ${currentUser?.role}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color.Gray
                                )
                            }

                            IconButton(onClick = { isEditingProfile = !isEditingProfile }) {
                                Icon(Icons.Default.Edit, contentDescription = "Edit", tint = IndigoPrimary)
                            }
                        }

                        if (isEditingProfile) {
                            Spacer(modifier = Modifier.height(12.dp))
                            OutlinedTextField(
                                value = displayNameInput,
                                onValueChange = { displayNameInput = it },
                                label = { Text("Display Name") },
                                modifier = Modifier.fillMaxWidth(),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = IndigoPrimary,
                                    unfocusedBorderColor = DarkBorder,
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White
                                )
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedTextField(
                                value = bioInput,
                                onValueChange = { bioInput = it },
                                label = { Text("Bio") },
                                modifier = Modifier.fillMaxWidth(),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = IndigoPrimary,
                                    unfocusedBorderColor = DarkBorder,
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White
                                )
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            Button(
                                onClick = {
                                    settingsViewModel.updateProfile(displayNameInput, bioInput)
                                    isEditingProfile = false
                                },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary)
                            ) {
                                Text("Save Profile")
                            }
                        } else {
                            if (!currentUser?.bio.isNullOrBlank()) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(currentUser?.bio ?: "", color = Color.LightGray, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }

            // Real Server Connection Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Dns, contentDescription = null, tint = AuroraEmerald)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Efadro Server Node", color = Color.White, fontWeight = FontWeight.Bold)
                            }
                            IconButton(onClick = { settingsViewModel.testConnection() }) {
                                Icon(Icons.Default.Refresh, contentDescription = "Ping Test", tint = AuroraCyan)
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color(0xFF0F172A))
                                .border(1.dp, Color(0xFF334155), RoundedCornerShape(8.dp))
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = serverUrl,
                                    color = Color.White,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(8.dp)
                                            .clip(CircleShape)
                                            .background(
                                                when (connectionStatus) {
                                                    WsConnectionStatus.AUTHENTICATED,
                                                    WsConnectionStatus.CONNECTED -> OnlineGreen
                                                    WsConnectionStatus.CONNECTING -> E2eeGold
                                                    WsConnectionStatus.DISCONNECTED -> Color.Gray
                                                }
                                            )
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = when (connectionStatus) {
                                            WsConnectionStatus.AUTHENTICATED -> "Authenticated · Real-time WebSocket Active"
                                            WsConnectionStatus.CONNECTED -> "Connected to Node"
                                            WsConnectionStatus.CONNECTING -> "Connecting to Node..."
                                            WsConnectionStatus.DISCONNECTED -> "Offline · Local Storage Cache Mode"
                                        },
                                        color = if (connectionStatus == WsConnectionStatus.AUTHENTICATED) AuroraEmerald else Color.LightGray,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontSize = 11.sp
                                    )
                                }
                            }

                            if (serverPingMs != null) {
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(AuroraEmerald.copy(alpha = 0.15f))
                                        .padding(horizontal = 8.dp, vertical = 4.dp)
                                ) {
                                    Text(
                                        text = "${serverPingMs}ms",
                                        color = AuroraEmerald,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 11.sp
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        if (isEditingServer) {
                            OutlinedTextField(
                                value = serverUrlInput,
                                onValueChange = { serverUrlInput = it },
                                label = { Text("Custom Server URL") },
                                placeholder = { Text("https://efadro.network or http://10.0.2.2:3000") },
                                modifier = Modifier.fillMaxWidth(),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = IndigoPrimary,
                                    unfocusedBorderColor = DarkBorder,
                                    focusedTextColor = Color.White,
                                    unfocusedTextColor = Color.White
                                )
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.End
                            ) {
                                Button(
                                    onClick = { isEditingServer = false },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155))
                                ) {
                                    Text("Cancel")
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                Button(
                                    onClick = {
                                        settingsViewModel.updateServerUrl(serverUrlInput)
                                        isEditingServer = false
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary)
                                ) {
                                    Text("Connect")
                                }
                            }
                        } else {
                            Button(
                                onClick = {
                                    serverUrlInput = serverUrl
                                    isEditingServer = true
                                },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1E293B)),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Icon(Icons.Default.Edit, contentDescription = null, tint = AuroraCyan, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Switch Server / Change Node", color = AuroraCyan)
                            }
                        }
                    }
                }
            }

            // Security & 2FA Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Security, contentDescription = null, tint = AuroraEmerald)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Security & 2-Factor Auth", color = Color.White, fontWeight = FontWeight.Bold)
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("TOTP Authenticator", color = Color.White, style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    if (currentUser?.has2Fa == true) "Active · 8 Backup Codes" else "Disabled",
                                    color = if (currentUser?.has2Fa == true) AuroraEmerald else Color.Gray,
                                    style = MaterialTheme.typography.labelSmall
                                )
                            }
                            Button(
                                onClick = onNavigateTo2FaSetup,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (currentUser?.has2Fa == true) Color(0xFF334155) else AuroraEmerald
                                )
                            ) {
                                Text(
                                    if (currentUser?.has2Fa == true) "Manage" else "Enable",
                                    color = if (currentUser?.has2Fa == true) Color.White else Color.Black
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        // Device E2EE Fingerprint
                        Text("Device E2EE Key Fingerprint", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = currentUser?.e2eePublicKey ?: "SHA256:ECDH-P256-EFADRO-SECURE",
                            fontFamily = FontFamily.Monospace,
                            color = AuroraCyan,
                            fontSize = 11.sp
                        )
                    }
                }
            }

            // Staff Panel Access (if Role is Owner, Admin, or Moderator)
            if (currentUser?.role != null && currentUser?.role != UserRole.USER) {
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onNavigateToStaff() },
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1B4B)),
                        border = androidx.compose.foundation.BorderStroke(1.dp, E2eeGold)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Shield, contentDescription = null, tint = E2eeGold, modifier = Modifier.size(28.dp))
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Staff Administration Panel", color = Color.White, fontWeight = FontWeight.Bold)
                                Text("Manage users, moderation queue & server settings", color = Color.LightGray, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }
            }

            // Blocked Users Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Block, contentDescription = null, tint = DangerRed)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Blocked Users (${blockedUsers.size})", color = Color.White, fontWeight = FontWeight.Bold)
                        }

                        if (blockedUsers.isEmpty()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("No blocked users", color = Color.Gray, style = MaterialTheme.typography.bodySmall)
                        } else {
                            blockedUsers.forEach { user ->
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text("@${user.username}", color = Color.White, style = MaterialTheme.typography.bodyMedium)
                                    Button(
                                        onClick = { settingsViewModel.unblockUser(user.id) },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155))
                                    ) {
                                        Text("Unblock", fontSize = 11.sp)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Logout Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Button(
                            onClick = {
                                authViewModel.logout()
                                onLogout()
                            },
                            modifier = Modifier.fillMaxWidth().testTag("logout_button"),
                            colors = ButtonDefaults.buttonColors(containerColor = DangerRed.copy(alpha = 0.25f)),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, tint = DangerRed)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Log Out", color = DangerRed, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }
}
