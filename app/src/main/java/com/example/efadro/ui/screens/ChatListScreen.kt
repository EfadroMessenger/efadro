package com.example.efadro.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.efadro.R
import com.example.efadro.data.local.PrepopulatedData
import com.example.efadro.data.model.Chat
import com.example.efadro.data.model.ChatType
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
import com.example.efadro.ui.theme.IndigoLight
import com.example.efadro.ui.theme.IndigoPrimary
import com.example.efadro.ui.theme.OnlineGreen
import com.example.efadro.ui.viewmodel.ChatViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun ChatListScreen(
    chatViewModel: ChatViewModel,
    onNavigateToChat: (chatId: String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToStaff: () -> Unit
) {
    val currentUser by chatViewModel.currentUser.collectAsState()
    val allChats by chatViewModel.allChats.collectAsState()
    val searchQuery by chatViewModel.searchQuery.collectAsState()
    val globalSearchResults by chatViewModel.globalSearchResults.collectAsState()
    val connectionStatus by chatViewModel.connectionStatus.collectAsState()
    val serverPingMs by chatViewModel.serverPingMs.collectAsState()
    val activeTypingMap by chatViewModel.activeTypingMap.collectAsState()

    var selectedFilter by remember { mutableStateOf("All") }
    var isArchivedExpanded by remember { mutableStateOf(false) }

    // Dialog & sheet states
    var showNewChatSheet by remember { mutableStateOf(false) }
    var showCreateGroupDialog by remember { mutableStateOf(false) }
    var showJoinInviteDialog by remember { mutableStateOf(false) }
    var selectedChatForMenu by remember { mutableStateOf<Chat?>(null) }

    val filteredChats = allChats.filter { chat ->
        val matchesFilter = when (selectedFilter) {
            "Direct" -> chat.type == ChatType.DM && !chat.isArchived
            "Groups" -> chat.type == ChatType.GROUP && !chat.isArchived
            "Archived" -> chat.isArchived
            else -> !chat.isArchived
        }
        val matchesSearch = if (searchQuery.isBlank()) true else {
            chat.name.contains(searchQuery, ignoreCase = true) ||
            chat.lastMessageText.contains(searchQuery, ignoreCase = true)
        }
        matchesFilter && matchesSearch
    }

    val archivedChats = allChats.filter { it.isArchived }

    Scaffold(
        containerColor = DarkBg,
        topBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DarkSurface)
                    .padding(horizontal = 16.dp, vertical = 10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    // Brand title
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Image(
                            painter = painterResource(id = R.drawable.ic_efadro_logo),
                            contentDescription = null,
                            modifier = Modifier.size(32.dp).clip(CircleShape)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "efadro",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = Color.White,
                                letterSpacing = 0.5.sp
                            )
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                val statusDotColor = when (connectionStatus) {
                                    com.example.efadro.data.network.WsConnectionStatus.AUTHENTICATED,
                                    com.example.efadro.data.network.WsConnectionStatus.CONNECTED -> OnlineGreen
                                    com.example.efadro.data.network.WsConnectionStatus.CONNECTING -> E2eeGold
                                    com.example.efadro.data.network.WsConnectionStatus.DISCONNECTED -> Color.Gray
                                }
                                Box(modifier = Modifier.size(6.dp).clip(CircleShape).background(statusDotColor))
                                Spacer(modifier = Modifier.width(4.dp))
                                val statusText = when (connectionStatus) {
                                    com.example.efadro.data.network.WsConnectionStatus.AUTHENTICATED -> if (serverPingMs != null) "Connected · ${serverPingMs}ms" else "Connected"
                                    com.example.efadro.data.network.WsConnectionStatus.CONNECTED -> "Handshake..."
                                    com.example.efadro.data.network.WsConnectionStatus.CONNECTING -> "Connecting..."
                                    com.example.efadro.data.network.WsConnectionStatus.DISCONNECTED -> "Offline Mode"
                                }
                                Text(
                                    text = statusText,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontSize = 10.sp,
                                    color = if (connectionStatus == com.example.efadro.data.network.WsConnectionStatus.AUTHENTICATED) AuroraEmerald else Color.LightGray
                                )
                            }
                        }
                    }

                    // Actions: Staff panel (if Staff), Settings, Profile avatar
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (currentUser?.role != null && currentUser?.role != UserRole.USER) {
                            IconButton(
                                onClick = onNavigateToStaff,
                                modifier = Modifier.testTag("staff_panel_button")
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Shield,
                                    contentDescription = "Staff Panel",
                                    tint = E2eeGold
                                )
                            }
                        }

                        IconButton(
                            onClick = onNavigateToSettings,
                            modifier = Modifier.testTag("settings_button")
                        ) {
                            Icon(
                                imageVector = Icons.Default.Settings,
                                contentDescription = "Settings",
                                tint = Color.LightGray
                            )
                        }

                        Spacer(modifier = Modifier.width(4.dp))

                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(IndigoPrimary)
                                .border(1.5.dp, AuroraEmerald, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = currentUser?.displayName?.take(1)?.uppercase() ?: "U",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // Search Bar
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { chatViewModel.onSearchQueryChange(it) },
                    placeholder = { Text("Search chats & messages...", color = Color.Gray, fontSize = 14.sp) },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = Color.Gray) },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { chatViewModel.onSearchQueryChange("") }) {
                                Icon(Icons.Default.Clear, contentDescription = "Clear", tint = Color.Gray)
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = DarkSurfaceVariant,
                        unfocusedContainerColor = DarkSurfaceVariant,
                        focusedBorderColor = IndigoPrimary,
                        unfocusedBorderColor = Color.Transparent,
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    )
                )

                Spacer(modifier = Modifier.height(8.dp))

                // Filter tabs
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    listOf("All", "Direct", "Groups", "Archived").forEach { filter ->
                        val isSelected = selectedFilter == filter
                        FilterChip(
                            selected = isSelected,
                            onClick = { selectedFilter = filter },
                            label = { Text(filter, fontSize = 12.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = IndigoPrimary,
                                selectedLabelColor = Color.White,
                                containerColor = DarkSurfaceVariant,
                                labelColor = Color.LightGray
                            ),
                            border = null,
                            shape = RoundedCornerShape(16.dp)
                        )
                    }
                }
            }
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showNewChatSheet = true },
                containerColor = IndigoPrimary,
                contentColor = Color.White,
                shape = CircleShape,
                modifier = Modifier.testTag("new_chat_fab")
            ) {
                Icon(Icons.Default.Edit, contentDescription = "New Chat")
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Global Message Search Results
            if (globalSearchResults.isNotEmpty()) {
                item {
                    Text(
                        text = "Global Message Hits (${globalSearchResults.size})",
                        style = MaterialTheme.typography.labelSmall,
                        color = AuroraCyan,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                }
                items(globalSearchResults) { msg ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .combinedClickable(
                                onClick = { onNavigateToChat(msg.chatId) }
                            )
                            .background(Color(0xFF141E30))
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Search, contentDescription = null, tint = AuroraCyan, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(10.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "${msg.senderName}: ${msg.content}",
                                color = Color.White,
                                style = MaterialTheme.typography.bodyMedium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                text = SimpleDateFormat("MMM d, HH:mm", Locale.getDefault()).format(Date(msg.timestamp)),
                                color = Color.Gray,
                                style = MaterialTheme.typography.labelSmall,
                                fontSize = 10.sp
                            )
                        }
                    }
                }
            }

            // Primary Chat list
            items(filteredChats, key = { it.id }) { chat ->
                ChatRowItem(
                    chat = chat,
                    activeTypingUser = activeTypingMap[chat.id],
                    onClick = { onNavigateToChat(chat.id) },
                    onLongClick = { selectedChatForMenu = chat }
                )
            }

            // Archived section toggle if in "All" filter and archived chats exist
            if (selectedFilter == "All" && archivedChats.isNotEmpty()) {
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .combinedClickable(onClick = { isArchivedExpanded = !isArchivedExpanded })
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Archive, contentDescription = null, tint = Color.Gray, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = "Archived Chats (${archivedChats.size})",
                            color = Color.LightGray,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f)
                        )
                        Icon(
                            imageVector = if (isArchivedExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                            contentDescription = null,
                            tint = Color.Gray
                        )
                    }
                }

                if (isArchivedExpanded) {
                    items(archivedChats, key = { "archived_${it.id}" }) { chat ->
                        ChatRowItem(
                            chat = chat,
                            onClick = { onNavigateToChat(chat.id) },
                            onLongClick = { selectedChatForMenu = chat }
                        )
                    }
                }
            }

            item {
                Spacer(modifier = Modifier.height(80.dp))
            }
        }
    }

    // Context Menu Sheet for selected chat
    selectedChatForMenu?.let { chat ->
        ModalBottomSheet(
            onDismissRequest = { selectedChatForMenu = null },
            containerColor = DarkSurface,
            sheetState = rememberModalBottomSheetState()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Text(
                    text = chat.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(onClick = {
                            chatViewModel.togglePinChat(chat.id, chat.isPinned)
                            selectedChatForMenu = null
                        })
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.PushPin, contentDescription = null, tint = IndigoLight)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(if (chat.isPinned) "Unpin Chat" else "Pin to Top", color = Color.White)
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(onClick = {
                            chatViewModel.toggleMuteChat(chat.id, chat.isMuted)
                            selectedChatForMenu = null
                        })
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.NotificationsOff, contentDescription = null, tint = AuroraPurple)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(if (chat.isMuted) "Unmute Chat" else "Mute Notifications", color = Color.White)
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(onClick = {
                            chatViewModel.toggleArchiveChat(chat.id, chat.isArchived)
                            selectedChatForMenu = null
                        })
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Archive, contentDescription = null, tint = AuroraCyan)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(if (chat.isArchived) "Unarchive Chat" else "Archive Chat", color = Color.White)
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(onClick = {
                            chatViewModel.deleteChat(chat.id)
                            selectedChatForMenu = null
                        })
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Delete, contentDescription = null, tint = DangerRed)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("Delete Chat", color = DangerRed)
                }
            }
        }
    }

    // New Chat Action Sheet
    if (showNewChatSheet) {
        ModalBottomSheet(
            onDismissRequest = { showNewChatSheet = false },
            containerColor = DarkSurface
        ) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Text(
                    text = "New Conversation",
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Start Direct Message
                Text(
                    text = "START DIRECT MESSAGE",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.Gray,
                    modifier = Modifier.padding(vertical = 4.dp)
                )

                PrepopulatedData.defaultUsers.filter { it.id != currentUser?.id }.forEach { user ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .combinedClickable(onClick = {
                                showNewChatSheet = false
                                chatViewModel.createDm(user) { chatId ->
                                    onNavigateToChat(chatId)
                                }
                            })
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(38.dp)
                                .clip(CircleShape)
                                .background(IndigoPrimary),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(user.username.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(user.displayName, color = Color.White, fontWeight = FontWeight.SemiBold)
                            Text("@${user.username} · ${user.role}", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                        }
                        Icon(Icons.Default.Lock, contentDescription = "E2EE", tint = E2eeGold, modifier = Modifier.size(16.dp))
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Create Group Option
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(onClick = {
                            showNewChatSheet = false
                            showCreateGroupDialog = true
                        })
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(AuroraEmerald),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Group, contentDescription = null, tint = Color.Black)
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text("Create Group Chat", color = Color.White, fontWeight = FontWeight.SemiBold)
                        Text("Invite team members, polls, and announcements", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                    }
                }

                // Join by Invite Link Option
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(onClick = {
                            showNewChatSheet = false
                            showJoinInviteDialog = true
                        })
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(AuroraPurple),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Link, contentDescription = null, tint = Color.White)
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text("Join via Invite Link", color = Color.White, fontWeight = FontWeight.SemiBold)
                        Text("Paste a group invite link or token", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }

    // Create Group Dialog
    if (showCreateGroupDialog) {
        var groupName by remember { mutableStateOf("") }
        var groupDesc by remember { mutableStateOf("") }

        AlertDialog(
            onDismissRequest = { showCreateGroupDialog = false },
            containerColor = DarkSurface,
            title = { Text("Create Group", color = Color.White) },
            text = {
                Column {
                    OutlinedTextField(
                        value = groupName,
                        onValueChange = { groupName = it },
                        label = { Text("Group Name") },
                        placeholder = { Text("e.g. Architecture Discussion") },
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
                        value = groupDesc,
                        onValueChange = { groupDesc = it },
                        label = { Text("Description") },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = IndigoPrimary,
                            unfocusedBorderColor = DarkBorder,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        )
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (groupName.isNotBlank()) {
                            chatViewModel.createGroup(groupName, groupDesc) { chatId ->
                                showCreateGroupDialog = false
                                onNavigateToChat(chatId)
                            }
                        }
                    },
                    enabled = groupName.isNotBlank(),
                    colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary)
                ) {
                    Text("Create")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCreateGroupDialog = false }) {
                    Text("Cancel", color = Color.Gray)
                }
            }
        )
    }

    // Join by Invite Dialog
    if (showJoinInviteDialog) {
        var inviteToken by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showJoinInviteDialog = false },
            containerColor = DarkSurface,
            title = { Text("Join Group", color = Color.White) },
            text = {
                OutlinedTextField(
                    value = inviteToken,
                    onValueChange = { inviteToken = it },
                    label = { Text("Invite Token or Link") },
                    placeholder = { Text("efd_dev_invite_9832") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = IndigoPrimary,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    )
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showJoinInviteDialog = false
                        onNavigateToChat("chat_dev_group")
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = IndigoPrimary)
                ) {
                    Text("Join")
                }
            },
            dismissButton = {
                TextButton(onClick = { showJoinInviteDialog = false }) {
                    Text("Cancel", color = Color.Gray)
                }
            }
        )
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun ChatRowItem(
    chat: Chat,
    activeTypingUser: String? = null,
    onClick: () -> Unit,
    onLongClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .combinedClickable(
                onClick = onClick,
                onLongClick = onLongClick
            )
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Chat Avatar with Badge
        Box(
            modifier = Modifier.size(50.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(
                        when (chat.type) {
                            ChatType.SAVED -> AuroraPurple
                            ChatType.GROUP -> AuroraEmerald
                            ChatType.DM -> IndigoPrimary
                        }
                    ),
                contentAlignment = Alignment.Center
            ) {
                if (chat.type == ChatType.SAVED) {
                    Icon(Icons.Default.Bookmark, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
                } else if (chat.type == ChatType.GROUP) {
                    Icon(Icons.Default.Group, contentDescription = null, tint = Color.Black, modifier = Modifier.size(24.dp))
                } else {
                    Text(
                        text = chat.name.take(1).uppercase(),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                }
            }

            // Online indicator or E2EE badge
            if (chat.isE2ee) {
                Box(
                    modifier = Modifier
                        .size(16.dp)
                        .clip(CircleShape)
                        .background(DarkSurface)
                        .align(Alignment.BottomEnd),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Lock, contentDescription = "E2EE", tint = E2eeGold, modifier = Modifier.size(11.dp))
                }
            }
        }

        Spacer(modifier = Modifier.width(12.dp))

        // Chat Info
        Column(modifier = Modifier.weight(1f)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                    Text(
                        text = chat.name,
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (chat.isPinned) {
                        Spacer(modifier = Modifier.width(4.dp))
                        Icon(Icons.Default.PushPin, contentDescription = "Pinned", tint = IndigoLight, modifier = Modifier.size(14.dp))
                    }
                    if (chat.isMuted) {
                        Spacer(modifier = Modifier.width(4.dp))
                        Icon(Icons.Default.NotificationsOff, contentDescription = "Muted", tint = Color.Gray, modifier = Modifier.size(14.dp))
                    }
                }

                val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(chat.lastMessageTime))
                Text(
                    text = timeStr,
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.Gray,
                    fontSize = 11.sp
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (activeTypingUser != null) {
                    Text(
                        text = "✍️ $activeTypingUser is typing...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = AuroraCyan,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                } else {
                    Text(
                        text = chat.lastMessageText,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (chat.unreadCount > 0) Color.White else Color(0xFF94A3B8),
                        fontWeight = if (chat.unreadCount > 0) FontWeight.Medium else FontWeight.Normal,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (chat.unreadMentions > 0) {
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(AuroraCyan)
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = "@${chat.unreadMentions}",
                                color = Color.Black,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(modifier = Modifier.width(4.dp))
                    }

                    if (chat.unreadCount > 0) {
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(if (chat.isMuted) Color.Gray else IndigoPrimary)
                                .padding(horizontal = 7.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = chat.unreadCount.toString(),
                                color = Color.White,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }
    }
}
