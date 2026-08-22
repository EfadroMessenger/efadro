package com.example.efadro.ui.screens

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.EmojiEmotions
import androidx.compose.material.icons.filled.Forward
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.Poll
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Reply
import androidx.compose.material.icons.filled.Report
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.efadro.data.model.Chat
import com.example.efadro.data.model.ChatType
import com.example.efadro.data.model.Message
import com.example.efadro.data.model.MessageKind
import com.example.efadro.data.model.UserRole
import com.example.efadro.ui.components.CreatePollDialog
import com.example.efadro.ui.components.E2eeSafetyCodeDialog
import com.example.efadro.ui.components.ForwardMessageDialog
import com.example.efadro.ui.components.MarkdownText
import com.example.efadro.ui.components.PollCard
import com.example.efadro.ui.components.QuickEmojis
import com.example.efadro.ui.components.QuickReactionPicker
import com.example.efadro.ui.components.ReactionChipsRow
import com.example.efadro.ui.components.VoicePlayer
import com.example.efadro.ui.components.VoiceRecorderDialog
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
import com.example.efadro.ui.theme.ReceivedBubbleBg
import com.example.efadro.ui.theme.ReceivedBubbleText
import com.example.efadro.ui.theme.SentBubbleBg
import com.example.efadro.ui.theme.SentBubbleText
import com.example.efadro.ui.theme.SystemBubbleBg
import com.example.efadro.ui.viewmodel.ChatViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun ChatRoomScreen(
    chatId: String,
    chatViewModel: ChatViewModel,
    onBack: () -> Unit,
    onNavigateToCall: (chatId: String, peerName: String, isVideo: Boolean) -> Unit,
    onNavigateToGroupDetails: (chatId: String) -> Unit,
    onNavigateToUserProfile: (userId: String) -> Unit
) {
    val chat by chatViewModel.getChatById(chatId).collectAsState(initial = null)
    val messages by chatViewModel.getMessagesForChat(chatId).collectAsState(initial = emptyList())
    val currentUser by chatViewModel.currentUser.collectAsState()
    val allChats by chatViewModel.allChats.collectAsState()
    val activeTypingMap by chatViewModel.activeTypingMap.collectAsState()
    val connectionStatus by chatViewModel.connectionStatus.collectAsState()
    val serverPingMs by chatViewModel.serverPingMs.collectAsState()
    val typingUser = activeTypingMap[chatId]

    val clipboardManager = LocalClipboardManager.current
    val listState = rememberLazyListState()

    var inputText by remember { mutableStateOf("") }
    var replyingToMessage by remember { mutableStateOf<Message?>(null) }
    var selectedMessageForMenu by remember { mutableStateOf<Message?>(null) }
    var editingMessage by remember { mutableStateOf<Message?>(null) }

    // Dialog flags
    var showSafetyCodeDialog by remember { mutableStateOf(false) }
    var showVoiceRecorderDialog by remember { mutableStateOf(false) }
    var showCreatePollDialog by remember { mutableStateOf(false) }
    var showForwardDialog by remember { mutableStateOf(false) }
    var messageToForward by remember { mutableStateOf<Message?>(null) }
    var showAttachmentsSheet by remember { mutableStateOf(false) }
    var showInChatSearch by remember { mutableStateOf(false) }
    var inChatSearchQuery by remember { mutableStateOf("") }
    var showOptionsMenu by remember { mutableStateOf(false) }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    val displayMessages = if (inChatSearchQuery.isBlank()) messages else {
        messages.filter { it.content.contains(inChatSearchQuery, ignoreCase = true) }
    }

    Scaffold(
        containerColor = DarkBg,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = DarkSurface,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White,
                    actionIconContentColor = Color.White
                ),
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                title = {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .combinedClickable(onClick = {
                                if (chat?.type == ChatType.GROUP) {
                                    onNavigateToGroupDetails(chatId)
                                } else if (chat?.peerUserId != null) {
                                    onNavigateToUserProfile(chat?.peerUserId!!)
                                }
                            }),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Avatar
                        Box(
                            modifier = Modifier
                                .size(38.dp)
                                .clip(CircleShape)
                                .background(
                                    when (chat?.type) {
                                        ChatType.SAVED -> AuroraPurple
                                        ChatType.GROUP -> AuroraEmerald
                                        else -> IndigoPrimary
                                    }
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = chat?.name?.take(1)?.uppercase() ?: "C",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp
                            )
                        }

                        Spacer(modifier = Modifier.width(10.dp))

                        Column(modifier = Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = chat?.name ?: "Chat",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                if (chat?.isE2ee == true) {
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(Color(0x33FBBF24))
                                            .combinedClickable { showSafetyCodeDialog = true }
                                            .padding(horizontal = 4.dp, vertical = 1.dp)
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(Icons.Default.Lock, contentDescription = null, tint = E2eeGold, modifier = Modifier.size(10.dp))
                                            Spacer(modifier = Modifier.width(2.dp))
                                            Text("E2EE", color = E2eeGold, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }
                            val subtitleText = when {
                                typingUser != null -> "✍️ $typingUser is typing..."
                                chat?.type == ChatType.SAVED -> "Cloud notepad"
                                chat?.type == ChatType.GROUP -> "${chat?.membersCount ?: 2} members · WebRTC ready"
                                else -> if (serverPingMs != null) "Online · ${serverPingMs}ms latency" else "Online · WebRTC ready"
                            }
                            val subtitleColor = when {
                                typingUser != null -> AuroraCyan
                                chat?.type == ChatType.DM -> OnlineGreen
                                else -> Color.Gray
                            }
                            Text(
                                text = subtitleText,
                                style = MaterialTheme.typography.labelSmall,
                                color = subtitleColor,
                                fontSize = 11.sp
                            )
                        }
                    }
                },
                actions = {
                    // 1:1 Voice Call Button
                    if (chat?.type == ChatType.DM) {
                        IconButton(
                            onClick = {
                                onNavigateToCall(chatId, chat?.name ?: "User", false)
                            },
                            modifier = Modifier.testTag("voice_call_button")
                        ) {
                            Icon(Icons.Default.Call, contentDescription = "Voice Call", tint = AuroraEmerald)
                        }

                        IconButton(
                            onClick = {
                                onNavigateToCall(chatId, chat?.name ?: "User", true)
                            },
                            modifier = Modifier.testTag("video_call_button")
                        ) {
                            Icon(Icons.Default.Videocam, contentDescription = "Video Call", tint = AuroraCyan)
                        }
                    }

                    IconButton(onClick = { showInChatSearch = !showInChatSearch }) {
                        Icon(Icons.Default.Search, contentDescription = "Search in chat", tint = Color.LightGray)
                    }

                    Box {
                        IconButton(onClick = { showOptionsMenu = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Options", tint = Color.LightGray)
                        }
                        DropdownMenu(
                            expanded = showOptionsMenu,
                            onDismissRequest = { showOptionsMenu = false },
                            modifier = Modifier.background(DarkSurface)
                        ) {
                            DropdownMenuItem(
                                text = { Text(if (chat?.isPinned == true) "Unpin Chat" else "Pin Chat", color = Color.White) },
                                onClick = {
                                    chat?.let { chatViewModel.togglePinChat(it.id, it.isPinned) }
                                    showOptionsMenu = false
                                },
                                leadingIcon = { Icon(Icons.Default.PushPin, contentDescription = null, tint = IndigoLight) }
                            )
                            DropdownMenuItem(
                                text = { Text(if (chat?.isMuted == true) "Unmute Chat" else "Mute Chat", color = Color.White) },
                                onClick = {
                                    chat?.let { chatViewModel.toggleMuteChat(it.id, it.isMuted) }
                                    showOptionsMenu = false
                                },
                                leadingIcon = { Icon(Icons.Default.NotificationsOff, contentDescription = null, tint = AuroraPurple) }
                            )
                            if (chat?.isE2ee == true) {
                                DropdownMenuItem(
                                    text = { Text("Encryption Info & Safety Code", color = Color.White) },
                                    onClick = {
                                        showSafetyCodeDialog = true
                                        showOptionsMenu = false
                                    },
                                    leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null, tint = E2eeGold) }
                                )
                            }
                            if (chat?.type == ChatType.GROUP) {
                                DropdownMenuItem(
                                    text = { Text("Group Settings & Invites", color = Color.White) },
                                    onClick = {
                                        showOptionsMenu = false
                                        onNavigateToGroupDetails(chatId)
                                    },
                                    leadingIcon = { Icon(Icons.Default.Edit, contentDescription = null, tint = AuroraEmerald) }
                                )
                            }
                        }
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
        ) {
            // Pinned message banner
            val pinnedMsg = messages.find { it.isPinned }
            if (pinnedMsg != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF1E1B4B))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.PushPin, contentDescription = null, tint = IndigoLight, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Pinned Message", color = IndigoLight, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        Text(pinnedMsg.content, color = Color.White, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    IconButton(
                        onClick = { chatViewModel.pinMessage(chatId, pinnedMsg.id, false) },
                        modifier = Modifier.size(24.dp)
                    ) {
                        Icon(Icons.Default.Close, contentDescription = "Unpin", tint = Color.Gray, modifier = Modifier.size(14.dp))
                    }
                }
            }

            // In-chat search banner
            if (showInChatSearch) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(DarkSurfaceVariant)
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Search, contentDescription = null, tint = Color.Gray, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    TextField(
                        value = inChatSearchQuery,
                        onValueChange = { inChatSearchQuery = it },
                        placeholder = { Text("Find in this chat...", color = Color.Gray, fontSize = 13.sp) },
                        modifier = Modifier.weight(1f),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = Color.Transparent,
                            unfocusedContainerColor = Color.Transparent,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        )
                    )
                    Text("${displayMessages.size} matches", color = AuroraCyan, style = MaterialTheme.typography.labelSmall)
                    IconButton(onClick = {
                        showInChatSearch = false
                        inChatSearchQuery = ""
                    }) {
                        Icon(Icons.Default.Close, contentDescription = "Close search", tint = Color.Gray)
                    }
                }
            }

            // Message stream
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp),
                state = listState,
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                item {
                    Spacer(modifier = Modifier.height(8.dp))
                }

                items(displayMessages, key = { it.id }) { msg ->
                    val isMe = msg.senderId == currentUser?.id

                    if (msg.kind == MessageKind.SYSTEM) {
                        // Centered system row
                        Box(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(SystemBubbleBg)
                                    .padding(horizontal = 12.dp, vertical = 4.dp)
                            ) {
                                MarkdownText(
                                    text = msg.content,
                                    color = Color(0xFFCBD5E1),
                                    fontSize = 12f
                                )
                            }
                        }
                    } else {
                        // Regular message bubble
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalAlignment = if (isMe) Alignment.End else Alignment.Start
                        ) {
                            Box(
                                modifier = Modifier
                                    .widthIn(max = 310.dp)
                                    .clip(
                                        RoundedCornerShape(
                                            topStart = 16.dp,
                                            topEnd = 16.dp,
                                            bottomStart = if (isMe) 16.dp else 4.dp,
                                            bottomEnd = if (isMe) 4.dp else 16.dp
                                        )
                                    )
                                    .background(if (isMe) SentBubbleBg else ReceivedBubbleBg)
                                    .combinedClickable(
                                        onClick = {},
                                        onLongClick = { selectedMessageForMenu = msg }
                                    )
                                    .padding(horizontal = 12.dp, vertical = 8.dp)
                            ) {
                                Column {
                                    // Group chat sender label
                                    if (!isMe && chat?.type == ChatType.GROUP) {
                                        Text(
                                            text = msg.senderName,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = AuroraCyan,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(bottom = 2.dp)
                                        )
                                    }

                                    // Forwarded banner
                                    if (msg.isForwarded) {
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            modifier = Modifier.padding(bottom = 4.dp)
                                        ) {
                                            Icon(Icons.Default.Forward, contentDescription = null, tint = IndigoLight, modifier = Modifier.size(12.dp))
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text(
                                                text = "Forwarded from ${msg.forwardOrigin ?: "User"}",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = IndigoLight,
                                                fontSize = 11.sp
                                            )
                                        }
                                    }

                                    // Reply quote preview
                                    if (msg.replyToText != null) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .clip(RoundedCornerShape(4.dp))
                                                .background(Color(0x33000000))
                                                .border(2.dp, IndigoLight, RoundedCornerShape(4.dp))
                                                .padding(horizontal = 8.dp, vertical = 4.dp)
                                        ) {
                                            Column {
                                                Text(
                                                    text = msg.replyToSender ?: "Reply",
                                                    color = AuroraEmerald,
                                                    style = MaterialTheme.typography.labelSmall,
                                                    fontWeight = FontWeight.Bold
                                                )
                                                Text(
                                                    text = msg.replyToText,
                                                    color = Color.LightGray,
                                                    style = MaterialTheme.typography.bodySmall,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }
                                        }
                                        Spacer(modifier = Modifier.height(4.dp))
                                    }

                                    // Render content by Kind
                                    when (msg.kind) {
                                        MessageKind.VOICE -> {
                                            VoicePlayer(
                                                durationSec = msg.voiceDurationSec,
                                                isSentByMe = isMe
                                            )
                                        }
                                        MessageKind.POLL -> {
                                            PollCard(
                                                question = msg.pollQuestion ?: msg.content,
                                                options = msg.pollOptions,
                                                currentUserId = currentUser?.id ?: "",
                                                onVote = { optionId ->
                                                    chatViewModel.votePoll(msg.id, optionId)
                                                }
                                            )
                                        }
                                        MessageKind.CALL_LOG -> {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Icon(
                                                    imageVector = if (msg.isVideoCall) Icons.Default.Videocam else if (msg.isMissedCall) Icons.Default.CallEnd else Icons.Default.Call,
                                                    contentDescription = null,
                                                    tint = if (msg.isMissedCall) DangerRed else AuroraEmerald,
                                                    modifier = Modifier.size(18.dp)
                                                )
                                                Spacer(modifier = Modifier.width(6.dp))
                                                Text(
                                                    text = msg.content,
                                                    color = Color.White,
                                                    style = MaterialTheme.typography.bodyMedium,
                                                    fontWeight = FontWeight.SemiBold
                                                )
                                            }
                                        }
                                        MessageKind.IMAGE -> {
                                            Box(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .height(140.dp)
                                                    .clip(RoundedCornerShape(8.dp))
                                                    .background(Color(0xFF1E1B4B)),
                                                contentAlignment = Alignment.Center
                                            ) {
                                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                                    Icon(Icons.Default.Image, contentDescription = null, tint = AuroraEmerald, modifier = Modifier.size(36.dp))
                                                    Text(msg.fileName ?: "Photo attachment", color = Color.White, style = MaterialTheme.typography.labelSmall)
                                                    Text("🔒 AES-256 encrypted file", color = AuroraCyan, fontSize = 10.sp)
                                                }
                                            }
                                        }
                                        MessageKind.FILE -> {
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .clip(RoundedCornerShape(8.dp))
                                                    .background(Color(0x33000000))
                                                    .padding(8.dp),
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Icon(Icons.Default.InsertDriveFile, contentDescription = null, tint = AuroraCyan, modifier = Modifier.size(24.dp))
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Column(modifier = Modifier.weight(1f)) {
                                                    Text(msg.fileName ?: "Document", color = Color.White, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                                                    Text(msg.fileSize ?: "1.4 MB", color = Color.LightGray, style = MaterialTheme.typography.labelSmall)
                                                }
                                            }
                                        }
                                        else -> {
                                            MarkdownText(
                                                text = msg.content,
                                                color = if (isMe) SentBubbleText else ReceivedBubbleText
                                            )
                                        }
                                    }

                                    // Timestamp and Read Receipts
                                    Row(
                                        modifier = Modifier.align(Alignment.End).padding(top = 2.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        val timeStr = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(msg.timestamp))
                                        Text(
                                            text = timeStr,
                                            style = MaterialTheme.typography.labelSmall,
                                            fontSize = 10.sp,
                                            color = if (isMe) Color.White.copy(alpha = 0.7f) else Color.Gray
                                        )
                                        if (isMe) {
                                            Spacer(modifier = Modifier.width(3.dp))
                                            Icon(
                                                imageVector = if (msg.isRead) Icons.Default.DoneAll else Icons.Default.Check,
                                                contentDescription = if (msg.isRead) "Seen" else "Sent",
                                                tint = if (msg.isRead) AuroraCyan else Color.White.copy(alpha = 0.7f),
                                                modifier = Modifier.size(12.dp)
                                            )
                                        }
                                    }
                                }
                            }

                            // Reaction Chips Row
                            ReactionChipsRow(
                                reactions = msg.reactions,
                                currentUserId = currentUser?.id ?: "",
                                onToggleReaction = { emoji ->
                                    chatViewModel.toggleReaction(msg.id, emoji)
                                }
                            )
                        }
                    }
                }

                item {
                    Spacer(modifier = Modifier.height(10.dp))
                }
            }

            // Active Typing Banner
            AnimatedVisibility(visible = typingUser != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF0F172A))
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(modifier = Modifier.size(6.dp).clip(CircleShape).background(AuroraCyan))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "$typingUser is typing...",
                        color = AuroraCyan,
                        style = MaterialTheme.typography.labelSmall,
                        fontSize = 11.sp
                    )
                }
            }

            // Replying banner
            if (replyingToMessage != null) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(DarkSurfaceVariant)
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Reply, contentDescription = null, tint = IndigoPrimary, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Replying to ${replyingToMessage?.senderName}", color = IndigoPrimary, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        Text(replyingToMessage?.content ?: "", color = Color.LightGray, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    IconButton(onClick = { replyingToMessage = null }) {
                        Icon(Icons.Default.Close, contentDescription = "Cancel", tint = Color.Gray, modifier = Modifier.size(16.dp))
                    }
                }
            }

            // Markdown Formatting Toolbar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DarkSurface)
                    .padding(horizontal = 12.dp, vertical = 2.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(onClick = { inputText += "**bold**" }) { Text("B", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                TextButton(onClick = { inputText += "__italic__" }) { Text("I", color = Color.White, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic, fontSize = 13.sp) }
                TextButton(onClick = { inputText += "~~strike~~" }) { Text("S", color = Color.White, textDecoration = androidx.compose.ui.text.style.TextDecoration.LineThrough, fontSize = 13.sp) }
                TextButton(onClick = { inputText += "`code`" }) { Text("`code`", color = AuroraCyan, fontSize = 11.sp) }
                TextButton(onClick = { inputText += "||spoiler||" }) { Text("||spoiler||", color = AuroraPurple, fontSize = 11.sp) }
            }

            // Bottom Composer Bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(DarkSurface)
                    .padding(horizontal = 8.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Attachments button
                IconButton(onClick = { showAttachmentsSheet = true }) {
                    Icon(Icons.Default.AttachFile, contentDescription = "Attachments", tint = Color.LightGray)
                }

                // Voice Recording trigger
                IconButton(onClick = { showVoiceRecorderDialog = true }) {
                    Icon(Icons.Default.Mic, contentDescription = "Record Voice", tint = DangerRed)
                }

                // Text Input
                OutlinedTextField(
                    value = inputText,
                    onValueChange = {
                        inputText = it
                        chatViewModel.onUserTyping(chatId, it.isNotBlank())
                    },
                    placeholder = {
                        Text(
                            text = if (chat?.isE2ee == true) "Message 🔒" else "Type a message...",
                            color = Color.Gray,
                            fontSize = 14.sp
                        )
                    },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("message_input_field"),
                    shape = RoundedCornerShape(20.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = DarkSurfaceVariant,
                        unfocusedContainerColor = DarkSurfaceVariant,
                        focusedBorderColor = IndigoPrimary,
                        unfocusedBorderColor = DarkBorder,
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    ),
                    maxLines = 4
                )

                Spacer(modifier = Modifier.width(4.dp))

                // Send button
                IconButton(
                    onClick = {
                        if (inputText.isNotBlank()) {
                            chatViewModel.onUserTyping(chatId, false)
                            if (editingMessage != null) {
                                chatViewModel.editMessage(editingMessage!!.id, inputText.trim())
                                editingMessage = null
                            } else {
                                chatViewModel.sendMessage(chatId, inputText.trim(), replyingToMessage)
                                replyingToMessage = null
                            }
                            inputText = ""
                        }
                    },
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(if (inputText.isNotBlank()) IndigoPrimary else Color(0xFF334155))
                        .testTag("send_message_button")
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.Send,
                        contentDescription = "Send",
                        tint = Color.White,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }

    // Message Actions Sheet
    selectedMessageForMenu?.let { msg ->
        ModalBottomSheet(
            onDismissRequest = { selectedMessageForMenu = null },
            containerColor = DarkSurface
        ) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                // Quick Emoji Bar
                Text("Quick React", style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                Spacer(modifier = Modifier.height(8.dp))
                QuickReactionPicker(
                    onSelectEmoji = { emoji ->
                        chatViewModel.toggleReaction(msg.id, emoji)
                        selectedMessageForMenu = null
                    }
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Actions List
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(onClick = {
                            replyingToMessage = msg
                            selectedMessageForMenu = null
                        })
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Reply, contentDescription = null, tint = IndigoLight)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("Reply", color = Color.White)
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(onClick = {
                            clipboardManager.setText(AnnotatedString(msg.content))
                            selectedMessageForMenu = null
                        })
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.ContentCopy, contentDescription = null, tint = AuroraCyan)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("Copy Text", color = Color.White)
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(onClick = {
                            chatViewModel.pinMessage(chatId, msg.id, !msg.isPinned)
                            selectedMessageForMenu = null
                        })
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.PushPin, contentDescription = null, tint = AuroraPurple)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(if (msg.isPinned) "Unpin Message" else "Pin Message", color = Color.White)
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(onClick = {
                            messageToForward = msg
                            showForwardDialog = true
                            selectedMessageForMenu = null
                        })
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Forward, contentDescription = null, tint = AuroraEmerald)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text("Forward Message", color = Color.White)
                }

                if (msg.senderId == currentUser?.id) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .combinedClickable(onClick = {
                                editingMessage = msg
                                inputText = msg.content
                                selectedMessageForMenu = null
                            })
                            .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Edit, contentDescription = null, tint = E2eeGold)
                        Spacer(modifier = Modifier.width(12.dp))
                        Text("Edit Message", color = Color.White)
                    }

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .combinedClickable(onClick = {
                                chatViewModel.deleteMessage(msg.id)
                                selectedMessageForMenu = null
                            })
                            .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = null, tint = DangerRed)
                        Spacer(modifier = Modifier.width(12.dp))
                        Text("Delete Message", color = DangerRed)
                    }
                } else {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .combinedClickable(onClick = {
                                chatViewModel.reportMessage(msg.id, "Flagged content")
                                selectedMessageForMenu = null
                            })
                            .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.Report, contentDescription = null, tint = DangerRed)
                        Spacer(modifier = Modifier.width(12.dp))
                        Text("Report to Staff", color = DangerRed)
                    }
                }
            }
        }
    }

    // Attachments Sheet (+ Image, + File, + Poll)
    if (showAttachmentsSheet) {
        ModalBottomSheet(
            onDismissRequest = { showAttachmentsSheet = false },
            containerColor = DarkSurface
        ) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Text("Share Attachment", style = MaterialTheme.typography.titleMedium, color = Color.White, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(14.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(onClick = {
                            showAttachmentsSheet = false
                            chatViewModel.sendFile(chatId, "secure_photo_${System.currentTimeMillis()}.png", "2.4 MB", isImage = true)
                        })
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier.size(40.dp).clip(CircleShape).background(AuroraEmerald),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Image, contentDescription = null, tint = Color.Black)
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text("Photo / Image", color = Color.White, fontWeight = FontWeight.SemiBold)
                        Text("Encrypted before upload", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(onClick = {
                            showAttachmentsSheet = false
                            chatViewModel.sendFile(chatId, "project_keys_backup.zip", "8.1 MB", isImage = false)
                        })
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier.size(40.dp).clip(CircleShape).background(IndigoPrimary),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.InsertDriveFile, contentDescription = null, tint = Color.White)
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text("Document / Archive", color = Color.White, fontWeight = FontWeight.SemiBold)
                        Text("Up to 25 MB", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .combinedClickable(onClick = {
                            showAttachmentsSheet = false
                            showCreatePollDialog = true
                        })
                        .padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier.size(40.dp).clip(CircleShape).background(AuroraPurple),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Poll, contentDescription = null, tint = Color.White)
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text("Create Anonymous Poll", color = Color.White, fontWeight = FontWeight.SemiBold)
                        Text("Live animated tallies & options", color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }

    // Voice Recorder Modal Dialog
    if (showVoiceRecorderDialog) {
        VoiceRecorderDialog(
            onDismiss = { showVoiceRecorderDialog = false },
            onSendVoice = { duration ->
                chatViewModel.sendVoice(chatId, duration)
            }
        )
    }

    // Create Poll Modal Dialog
    if (showCreatePollDialog) {
        CreatePollDialog(
            onDismiss = { showCreatePollDialog = false },
            onCreatePoll = { q, opts ->
                chatViewModel.createPoll(chatId, q, opts)
            }
        )
    }

    // Forward Modal Dialog
    if (showForwardDialog && messageToForward != null) {
        ForwardMessageDialog(
            chats = allChats,
            onDismiss = {
                showForwardDialog = false
                messageToForward = null
            },
            onSelectChat = { targetChatId ->
                chatViewModel.forwardMessage(messageToForward!!.id, targetChatId)
            }
        )
    }

    // E2EE Safety Code Dialog
    if (showSafetyCodeDialog) {
        E2eeSafetyCodeDialog(
            chatName = chat?.name ?: "Peer",
            safetyCode = chat?.safetyCode ?: "4821-9932-1084-5529",
            onDismiss = { showSafetyCodeDialog = false }
        )
    }
}
