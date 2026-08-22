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
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Report
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.SupervisorAccount
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.efadro.data.model.ReportItem
import com.example.efadro.data.model.User
import com.example.efadro.data.model.UserRole
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
import com.example.efadro.ui.viewmodel.AdminViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StaffPanelScreen(
    adminViewModel: AdminViewModel,
    onBack: () -> Unit
) {
    val users by adminViewModel.users.collectAsState()
    val reports by adminViewModel.reports.collectAsState()
    val auditLogs by adminViewModel.auditLogs.collectAsState()
    val serverConfig by adminViewModel.serverConfig.collectAsState()

    var selectedTab by remember { mutableIntStateOf(0) }

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
                title = { Text("Staff Control Panel", style = MaterialTheme.typography.titleMedium) }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = DarkSurface,
                contentColor = IndigoPrimary,
                indicator = { tabPositions ->
                    TabRowDefaults.SecondaryIndicator(
                        Modifier.tabIndicatorOffset(tabPositions[selectedTab]),
                        color = IndigoPrimary
                    )
                }
            ) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Users", color = if (selectedTab == 0) Color.White else Color.Gray, fontSize = 12.sp) },
                    icon = { Icon(Icons.Default.SupervisorAccount, contentDescription = null, tint = if (selectedTab == 0) IndigoPrimary else Color.Gray, modifier = Modifier.size(18.dp)) }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Reports (${reports.count { it.status == "PENDING" }})", color = if (selectedTab == 1) Color.White else Color.Gray, fontSize = 12.sp) },
                    icon = { Icon(Icons.Default.Report, contentDescription = null, tint = if (selectedTab == 1) DangerRed else Color.Gray, modifier = Modifier.size(18.dp)) }
                )
                Tab(
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 },
                    text = { Text("Audit Log", color = if (selectedTab == 2) Color.White else Color.Gray, fontSize = 12.sp) },
                    icon = { Icon(Icons.Default.History, contentDescription = null, tint = if (selectedTab == 2) AuroraCyan else Color.Gray, modifier = Modifier.size(18.dp)) }
                )
                Tab(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    text = { Text("Server", color = if (selectedTab == 3) Color.White else Color.Gray, fontSize = 12.sp) },
                    icon = { Icon(Icons.Default.Dns, contentDescription = null, tint = if (selectedTab == 3) AuroraEmerald else Color.Gray, modifier = Modifier.size(18.dp)) }
                )
            }

            when (selectedTab) {
                0 -> UsersManagementView(users = users, adminViewModel = adminViewModel)
                1 -> ReportsQueueView(reports = reports, adminViewModel = adminViewModel)
                2 -> AuditLogView(logs = auditLogs)
                3 -> ServerConfigView(config = serverConfig, adminViewModel = adminViewModel)
            }
        }
    }
}

@Composable
private fun UsersManagementView(
    users: List<User>,
    adminViewModel: AdminViewModel
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        items(users) { user ->
            var roleMenuExpanded by remember { mutableStateOf(false) }

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(IndigoPrimary),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(user.username.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(user.displayName, color = Color.White, fontWeight = FontWeight.Bold)
                            Spacer(modifier = Modifier.width(6.dp))
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(Color(0x336366F1))
                                    .clickable { roleMenuExpanded = true }
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(user.role.name, color = AuroraCyan, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                            DropdownMenu(
                                expanded = roleMenuExpanded,
                                onDismissRequest = { roleMenuExpanded = false },
                                modifier = Modifier.background(DarkSurface)
                            ) {
                                UserRole.values().forEach { r ->
                                    DropdownMenuItem(
                                        text = { Text(r.name, color = Color.White) },
                                        onClick = {
                                            adminViewModel.setRole(user.id, r)
                                            roleMenuExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                        Text("@${user.username}", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                    }

                    // Actions: Mute / Ban
                    IconButton(onClick = { adminViewModel.setMuted(user.id, !user.isMuted) }) {
                        Icon(
                            imageVector = if (user.isMuted) Icons.Default.MicOff else Icons.Default.VolumeUp,
                            contentDescription = "Mute",
                            tint = if (user.isMuted) DangerRed else Color.LightGray
                        )
                    }

                    IconButton(onClick = { adminViewModel.setBanned(user.id, !user.isBanned) }) {
                        Icon(
                            imageVector = Icons.Default.Block,
                            contentDescription = "Ban",
                            tint = if (user.isBanned) DangerRed else Color.LightGray
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ReportsQueueView(
    reports: List<ReportItem>,
    adminViewModel: AdminViewModel
) {
    if (reports.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No pending reports in queue 🎉", color = Color.Gray)
        }
    } else {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(reports) { item ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = DarkSurface),
                    border = androidx.compose.foundation.BorderStroke(1.dp, if (item.status == "PENDING") DangerRed.copy(alpha = 0.5f) else DarkBorder)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Reported by ${item.reporterUsername}", color = AuroraCyan, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelSmall)
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(if (item.status == "PENDING") DangerRed.copy(alpha = 0.2f) else AuroraEmerald.copy(alpha = 0.2f))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(item.status, color = if (item.status == "PENDING") DangerRed else AuroraEmerald, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        Spacer(modifier = Modifier.height(6.dp))

                        Text("Target: @${item.targetUsername}", color = Color.White, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                        Text("Content: \"${item.messageSnippet}\"", color = Color.LightGray, style = MaterialTheme.typography.bodySmall)
                        Text("Reason: ${item.reason}", color = Color.Gray, style = MaterialTheme.typography.labelSmall)

                        if (item.status == "PENDING") {
                            Spacer(modifier = Modifier.height(10.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.End,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Button(
                                    onClick = { adminViewModel.resolveReport(item.id, "DISMISSED") },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF334155)),
                                    shape = RoundedCornerShape(6.dp)
                                ) {
                                    Text("Dismiss", fontSize = 12.sp)
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                Button(
                                    onClick = { adminViewModel.resolveReport(item.id, "RESOLVED") },
                                    colors = ButtonDefaults.buttonColors(containerColor = AuroraEmerald),
                                    shape = RoundedCornerShape(6.dp)
                                ) {
                                    Text("Resolve & Ban", color = Color.Black, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AuditLogView(logs: List<com.example.efadro.data.model.AuditLogItem>) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(logs) { log ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Security, contentDescription = null, tint = AuroraCyan, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "${log.actor} ${log.action} ${log.target}",
                            color = Color.White,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = SimpleDateFormat("MMM d, HH:mm:ss", Locale.getDefault()).format(Date(log.timestamp)),
                            color = Color.Gray,
                            style = MaterialTheme.typography.labelSmall,
                            fontSize = 10.sp
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ServerConfigView(
    config: com.example.efadro.data.model.ServerConfig?,
    adminViewModel: AdminViewModel
) {
    var serverName by remember(config) { mutableStateOf(config?.serverName ?: "Efadro Official Node") }
    var allowReg by remember(config) { mutableStateOf(config?.registrationEnabled ?: true) }
    var gateRequired by remember(config) { mutableStateOf(config?.serverPassword?.isNotEmpty() ?: false) }
    var turnstileRequired by remember(config) { mutableStateOf(config?.turnstileEnabled ?: false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Server Identity & Access Control", color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = serverName,
                        onValueChange = { serverName = it },
                        label = { Text("Server Display Name") },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = IndigoPrimary,
                            unfocusedBorderColor = DarkBorder,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        )
                    )

                    Spacer(modifier = Modifier.height(14.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Open User Registration", color = Color.White)
                            Text("Allow anyone to create an account", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                        }
                        Switch(
                            checked = allowReg,
                            onCheckedChange = { allowReg = it },
                            colors = SwitchDefaults.colors(checkedThumbColor = AuroraEmerald, checkedTrackColor = IndigoPrimary)
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Server Gate Password", color = Color.White)
                            Text("Require password to access API", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                        }
                        Switch(
                            checked = gateRequired,
                            onCheckedChange = { gateRequired = it },
                            colors = SwitchDefaults.colors(checkedThumbColor = AuroraEmerald, checkedTrackColor = IndigoPrimary)
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Cloudflare Turnstile Captcha", color = Color.White)
                            Text("Protect against automated bot signups", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                        }
                        Switch(
                            checked = turnstileRequired,
                            onCheckedChange = { turnstileRequired = it },
                            colors = SwitchDefaults.colors(checkedThumbColor = AuroraEmerald, checkedTrackColor = IndigoPrimary)
                        )
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Button(
                        onClick = {
                            if (config != null) {
                                adminViewModel.updateConfig(
                                    config.copy(
                                        serverName = serverName,
                                        registrationEnabled = allowReg,
                                        turnstileEnabled = turnstileRequired
                                    )
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary)
                    ) {
                        Text("Save Server Configuration")
                    }
                }
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface),
                border = androidx.compose.foundation.BorderStroke(1.dp, DarkBorder)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Cryptographic Key Rotation", color = Color.White, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(6.dp))
                    Text("Rotate server JWT secret key. Invalidates all active sessions.", color = Color.Gray, style = MaterialTheme.typography.bodySmall)

                    Spacer(modifier = Modifier.height(12.dp))

                    Button(
                        onClick = { adminViewModel.rotateJwtSecret() },
                        colors = ButtonDefaults.buttonColors(containerColor = DangerRed.copy(alpha = 0.25f)),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null, tint = DangerRed)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Rotate JWT Secret Key", color = DangerRed, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
