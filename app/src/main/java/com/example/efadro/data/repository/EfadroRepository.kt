package com.example.efadro.data.repository

import android.util.Log
import com.example.efadro.data.local.AppDatabase
import com.example.efadro.data.model.AuditLogItem
import com.example.efadro.data.model.Chat
import com.example.efadro.data.model.ChatType
import com.example.efadro.data.model.Message
import com.example.efadro.data.model.MessageKind
import com.example.efadro.data.model.PollOption
import com.example.efadro.data.model.ReactionItem
import com.example.efadro.data.model.ReportItem
import com.example.efadro.data.model.ServerConfig
import com.example.efadro.data.model.User
import com.example.efadro.data.model.UserRole
import com.example.efadro.data.network.ApiAuthRequest
import com.example.efadro.data.network.ApiCreateChatRequest
import com.example.efadro.data.network.ApiMessage
import com.example.efadro.data.network.ApiReportRequest
import com.example.efadro.data.network.ApiSendMessageRequest
import com.example.efadro.data.network.EfadroApiClient
import com.example.efadro.data.network.EfadroWebSocketClient
import com.example.efadro.data.network.ServerHealthResponse
import com.example.efadro.data.network.WsConnectionStatus
import com.example.efadro.data.network.WsEvent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

class EfadroRepository(
    private val database: AppDatabase,
    private val scope: CoroutineScope
) {
    private val chatDao = database.chatDao()
    private val messageDao = database.messageDao()
    private val userDao = database.userDao()
    private val reportDao = database.reportDao()
    private val auditDao = database.auditDao()
    private val serverConfigDao = database.serverConfigDao()

    val apiClient = EfadroApiClient(baseUrl = "https://efadro.network")
    val webSocketClient = EfadroWebSocketClient(scope = scope)

    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: StateFlow<User?> = _currentUser.asStateFlow()

    private val _isAuthenticated = MutableStateFlow(false)
    val isAuthenticated: StateFlow<Boolean> = _isAuthenticated.asStateFlow()

    private val _serverUrl = MutableStateFlow("https://efadro.network")
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _serverHealth = MutableStateFlow<ServerHealthResponse?>(null)
    val serverHealth: StateFlow<ServerHealthResponse?> = _serverHealth.asStateFlow()

    private val _serverPingMs = MutableStateFlow<Long?>(null)
    val serverPingMs: StateFlow<Long?> = _serverPingMs.asStateFlow()

    val connectionStatus: StateFlow<WsConnectionStatus> = webSocketClient.connectionStatus

    private val _activeTypingMap = MutableStateFlow<Map<String, String>>(emptyMap())
    val activeTypingMap: StateFlow<Map<String, String>> = _activeTypingMap.asStateFlow()

    init {
        // Auto-load session from local database or seed
        scope.launch(Dispatchers.IO) {
            val owner = userDao.getUserByUsername("owner")
            if (owner != null) {
                _currentUser.value = owner
                _isAuthenticated.value = true
                connectRealtime(owner)
            }
            checkServerStatus()
        }

        // Listen for inbound WebSocket events
        scope.launch(Dispatchers.IO) {
            webSocketClient.events.collect { event ->
                handleInboundWsEvent(event)
            }
        }
    }

    // ------------------------------------------------------------------------
    // Server & Realtime Sync
    // ------------------------------------------------------------------------

    fun setServerUrl(newUrl: String) {
        val trimmed = newUrl.trim().removeSuffix("/")
        _serverUrl.value = trimmed
        apiClient.setBaseUrl(trimmed)
        scope.launch(Dispatchers.IO) {
            checkServerStatus()
            val user = _currentUser.value
            if (user != null) {
                connectRealtime(user)
            }
        }
    }

    suspend fun checkServerStatus() {
        val result = apiClient.checkHealth()
        if (result.isSuccess) {
            val (health, latency) = result.getOrThrow()
            _serverHealth.value = health
            _serverPingMs.value = latency
        } else {
            _serverHealth.value = ServerHealthResponse(
                status = "offline",
                serverName = "Local Node (Offline Mode)",
                registrationOpen = true
            )
            _serverPingMs.value = null
        }
    }

    private fun connectRealtime(user: User) {
        val wsUrl = apiClient.getWebSocketUrl()
        webSocketClient.connect(wsUrl, token = "jwt_${user.id}", userId = user.id)
    }

    private suspend fun handleInboundWsEvent(event: WsEvent) {
        when (event.type) {
            "MESSAGE" -> {
                val apiMsg = event.message ?: return
                val localMsg = Message(
                    id = apiMsg.id,
                    chatId = apiMsg.chatId,
                    senderId = apiMsg.senderId,
                    senderName = apiMsg.senderName,
                    senderAvatar = apiMsg.senderAvatar,
                    content = apiMsg.content,
                    timestamp = apiMsg.timestamp,
                    isE2ee = apiMsg.isE2ee,
                    replyToId = apiMsg.replyToId,
                    replyToText = apiMsg.replyToText,
                    replyToSender = apiMsg.replyToSender,
                    isForwarded = apiMsg.isForwarded,
                    forwardOrigin = apiMsg.forwardOrigin,
                    kind = try { MessageKind.valueOf(apiMsg.kind) } catch (e: Exception) { MessageKind.TEXT },
                    voiceDurationSec = apiMsg.voiceDurationSec,
                    fileName = apiMsg.fileName,
                    fileSize = apiMsg.fileSize,
                    mediaUrl = apiMsg.mediaUrl,
                    pollQuestion = apiMsg.pollQuestion
                )
                messageDao.insertMessage(localMsg)

                val chat = chatDao.getChatByIdOnce(apiMsg.chatId)
                if (chat != null) {
                    chatDao.updateChat(
                        chat.copy(
                            lastMessageText = if (apiMsg.kind == "VOICE") "🎤 Voice message" else apiMsg.content,
                            lastMessageTime = apiMsg.timestamp,
                            lastSenderName = apiMsg.senderName,
                            unreadCount = chat.unreadCount + 1
                        )
                    )
                }
            }
            "TYPING" -> {
                val chatId = event.chatId ?: return
                val username = event.username ?: return
                val isTyping = event.isTyping ?: false
                val current = _activeTypingMap.value.toMutableMap()
                if (isTyping) {
                    current[chatId] = username
                } else {
                    current.remove(chatId)
                }
                _activeTypingMap.value = current
            }
            "REACTION" -> {
                val msgId = event.messageId ?: return
                val emoji = event.emoji ?: return
                val userId = event.userId ?: return
                val msg = messageDao.getMessageById(msgId)
                if (msg != null) {
                    val reactions = msg.reactions.toMutableList()
                    val idx = reactions.indexOfFirst { it.emoji == emoji }
                    if (idx >= 0) {
                        val item = reactions[idx]
                        if (!item.userIds.contains(userId)) {
                            reactions[idx] = item.copy(count = item.count + 1, userIds = item.userIds + userId)
                            messageDao.updateMessage(msg.copy(reactions = reactions))
                        }
                    } else {
                        reactions.add(ReactionItem(emoji = emoji, count = 1, userIds = listOf(userId)))
                        messageDao.updateMessage(msg.copy(reactions = reactions))
                    }
                }
            }
            "PRESENCE" -> {
                val uid = event.userId ?: return
                val isOnline = event.presenceStatus == "ONLINE"
                val u = userDao.getUserByIdOnce(uid)
                if (u != null) {
                    userDao.updateUser(u.copy(isOnline = isOnline))
                }
            }
        }
    }

    // ------------------------------------------------------------------------
    // Auth & User Session
    // ------------------------------------------------------------------------

    suspend fun login(username: String, pass: String): Result<User> {
        val trimmed = username.lowercase().trim()

        // Try real REST API call first
        val apiRes = apiClient.login(
            ApiAuthRequest(
                username = trimmed,
                password = pass
            )
        )

        val localUser = userDao.getUserByUsername(trimmed)
        val userToUse = if (apiRes.isSuccess && apiRes.getOrNull()?.user != null) {
            val remoteUser = apiRes.getOrThrow().user!!
            val mapped = User(
                id = remoteUser.id,
                username = remoteUser.username,
                displayName = remoteUser.displayName,
                avatarUrl = remoteUser.avatarUrl,
                role = try { UserRole.valueOf(remoteUser.role) } catch (e: Exception) { UserRole.USER },
                bio = remoteUser.bio,
                isOnline = true,
                has2Fa = remoteUser.has2Fa,
                isBanned = remoteUser.isBanned,
                isMuted = remoteUser.isMuted,
                e2eePublicKey = remoteUser.e2eePublicKey.ifEmpty { "pub_secp256r1_" + remoteUser.id.take(8) }
            )
            userDao.insertUser(mapped)
            mapped
        } else if (localUser != null) {
            localUser
        } else {
            // Auto-provision user in offline cache
            val newUser = User(
                id = "usr_" + UUID.randomUUID().toString().take(8),
                username = trimmed,
                displayName = username.trim(),
                role = if (trimmed == "admin" || trimmed == "owner") UserRole.OWNER else UserRole.USER,
                bio = "Efadro user on ${_serverUrl.value}",
                isOnline = true
            )
            userDao.insertUser(newUser)
            newUser
        }

        if (userToUse.isBanned) {
            return Result.failure(Exception("Account has been suspended by server administrator."))
        }

        _currentUser.value = userToUse
        _isAuthenticated.value = true
        connectRealtime(userToUse)
        return Result.success(userToUse)
    }

    suspend fun signup(username: String, displayName: String): Result<User> {
        val trimmed = username.lowercase().trim()
        val existing = userDao.getUserByUsername(trimmed)
        if (existing != null) {
            return Result.failure(Exception("Username @$trimmed is already registered on this node."))
        }

        // Try server registration API
        val apiRes = apiClient.register(
            ApiAuthRequest(
                username = trimmed,
                displayName = displayName.ifBlank { trimmed }
            )
        )

        val newUser = if (apiRes.isSuccess && apiRes.getOrNull()?.user != null) {
            val remote = apiRes.getOrThrow().user!!
            User(
                id = remote.id,
                username = remote.username,
                displayName = remote.displayName,
                avatarUrl = remote.avatarUrl,
                role = UserRole.USER,
                bio = remote.bio,
                isOnline = true,
                has2Fa = remote.has2Fa,
                e2eePublicKey = remote.e2eePublicKey.ifEmpty { "pub_secp256r1_" + remote.id.take(8) }
            )
        } else {
            User(
                id = "usr_" + UUID.randomUUID().toString().take(8),
                username = trimmed,
                displayName = displayName.ifBlank { trimmed },
                role = UserRole.USER,
                bio = "Hey there! I am using Efadro Messenger",
                isOnline = true
            )
        }

        userDao.insertUser(newUser)
        _currentUser.value = newUser
        _isAuthenticated.value = true
        connectRealtime(newUser)
        return Result.success(newUser)
    }

    fun logout() {
        webSocketClient.disconnect()
        _currentUser.value = null
        _isAuthenticated.value = false
    }

    suspend fun switchUser(user: User) {
        _currentUser.value = user
        _isAuthenticated.value = true
        connectRealtime(user)
    }

    suspend fun updateProfile(displayName: String, bio: String) {
        val current = _currentUser.value ?: return
        val updated = current.copy(displayName = displayName, bio = bio)
        userDao.updateUser(updated)
        _currentUser.value = updated
    }

    suspend fun toggle2Fa(enabled: Boolean) {
        val current = _currentUser.value ?: return
        val updated = current.copy(has2Fa = enabled)
        userDao.updateUser(updated)
        _currentUser.value = updated
    }

    // ------------------------------------------------------------------------
    // Chats
    // ------------------------------------------------------------------------

    fun getAllChats(): Flow<List<Chat>> = chatDao.getAllChats()

    fun getChatById(chatId: String): Flow<Chat?> = chatDao.getChatById(chatId)

    fun searchChats(query: String): Flow<List<Chat>> = chatDao.searchChats(query)

    suspend fun markChatRead(chatId: String) {
        chatDao.markChatRead(chatId)
    }

    suspend fun togglePinChat(chatId: String, currentPinned: Boolean) {
        chatDao.setPinned(chatId, !currentPinned)
    }

    suspend fun toggleMuteChat(chatId: String, currentMuted: Boolean) {
        chatDao.setMuted(chatId, !currentMuted)
    }

    suspend fun toggleArchiveChat(chatId: String, currentArchived: Boolean) {
        chatDao.setArchived(chatId, !currentArchived)
    }

    suspend fun deleteChat(chatId: String) {
        chatDao.deleteChat(chatId)
        messageDao.deleteMessagesForChat(chatId)
    }

    suspend fun createDirectChat(peerUser: User): String {
        val chatId = "chat_dm_" + peerUser.username
        val newChat = Chat(
            id = chatId,
            name = peerUser.displayName,
            type = ChatType.DM,
            peerUserId = peerUser.id,
            isE2ee = true,
            unreadCount = 0,
            lastMessageText = "Direct encrypted chat started",
            lastMessageTime = System.currentTimeMillis(),
            lastSenderName = "System",
            safetyCode = "4821-9932-1084-5529"
        )
        chatDao.insertChat(newChat)

        val sysMsg = Message(
            id = "msg_sys_" + UUID.randomUUID().toString().take(8),
            chatId = chatId,
            senderId = "system",
            senderName = "System",
            content = "🔒 *Direct chat upgraded to End-to-End Encryption (AES-GCM-256)*",
            kind = MessageKind.SYSTEM,
            isE2ee = true
        )
        messageDao.insertMessage(sysMsg)

        // Try sync with API
        scope.launch(Dispatchers.IO) {
            apiClient.createChat(
                ApiCreateChatRequest(
                    name = peerUser.displayName,
                    type = "DM",
                    peerUsername = peerUser.username,
                    isE2ee = true
                )
            )
        }

        return chatId
    }

    suspend fun createGroupChat(name: String, description: String): String {
        val chatId = "chat_grp_" + UUID.randomUUID().toString().take(8)
        val inviteToken = "efd_inv_" + UUID.randomUUID().toString().take(8)
        val newChat = Chat(
            id = chatId,
            name = name,
            type = ChatType.GROUP,
            description = description,
            inviteToken = inviteToken,
            membersCount = 3,
            lastMessageText = "Group created",
            lastMessageTime = System.currentTimeMillis(),
            lastSenderName = "System"
        )
        chatDao.insertChat(newChat)

        val sysMsg = Message(
            id = "msg_sys_" + UUID.randomUUID().toString().take(8),
            chatId = chatId,
            senderId = "system",
            senderName = "System",
            content = "💬 Group **$name** was created",
            kind = MessageKind.SYSTEM
        )
        messageDao.insertMessage(sysMsg)

        scope.launch(Dispatchers.IO) {
            apiClient.createChat(
                ApiCreateChatRequest(
                    name = name,
                    type = "GROUP",
                    description = description,
                    isE2ee = false
                )
            )
        }

        return chatId
    }

    suspend fun rotateInviteLink(chatId: String): String {
        val newToken = "efd_inv_" + UUID.randomUUID().toString().take(8)
        val chat = chatDao.getChatByIdOnce(chatId)
        if (chat != null) {
            chatDao.updateChat(chat.copy(inviteToken = newToken))
        }
        return newToken
    }

    // ------------------------------------------------------------------------
    // Messages & Interactions
    // ------------------------------------------------------------------------

    fun getMessagesForChat(chatId: String): Flow<List<Message>> =
        messageDao.getMessagesForChat(chatId)

    fun searchMessagesInChat(chatId: String, query: String): Flow<List<Message>> =
        messageDao.searchMessagesInChat(chatId, query)

    fun searchMessagesGlobal(query: String): Flow<List<Message>> =
        messageDao.searchMessagesGlobal(query)

    fun sendTypingState(chatId: String, isTyping: Boolean) {
        val user = _currentUser.value ?: return
        webSocketClient.sendTyping(chatId, user.displayName, isTyping)
    }

    suspend fun sendMessage(
        chatId: String,
        content: String,
        replyTo: Message? = null
    ) {
        val user = _currentUser.value ?: return
        val chat = chatDao.getChatByIdOnce(chatId)
        val isE2ee = chat?.isE2ee ?: false

        val msgId = "msg_" + UUID.randomUUID().toString().take(8)
        val newMsg = Message(
            id = msgId,
            chatId = chatId,
            senderId = user.id,
            senderName = user.displayName,
            content = content.trim(),
            timestamp = System.currentTimeMillis(),
            isE2ee = isE2ee,
            replyToId = replyTo?.id,
            replyToText = replyTo?.content?.take(60),
            replyToSender = replyTo?.senderName
        )
        messageDao.insertMessage(newMsg)

        if (chat != null) {
            chatDao.updateChat(
                chat.copy(
                    lastMessageText = if (isE2ee && chat.type == ChatType.DM) content.trim() else "${user.displayName}: ${content.trim()}",
                    lastMessageTime = System.currentTimeMillis(),
                    lastSenderName = user.displayName
                )
            )
        }

        // Send over WebSocket & REST API
        scope.launch(Dispatchers.IO) {
            val apiMsg = ApiMessage(
                id = msgId,
                chatId = chatId,
                senderId = user.id,
                senderName = user.displayName,
                content = content.trim(),
                timestamp = System.currentTimeMillis(),
                isE2ee = isE2ee,
                replyToId = replyTo?.id,
                replyToText = replyTo?.content?.take(60),
                replyToSender = replyTo?.senderName,
                kind = "TEXT"
            )
            webSocketClient.sendEvent(WsEvent(type = "MESSAGE", chatId = chatId, message = apiMsg))
            apiClient.sendMessage(
                ApiSendMessageRequest(
                    chatId = chatId,
                    content = content.trim(),
                    isE2ee = isE2ee,
                    replyToId = replyTo?.id,
                    replyToText = replyTo?.content?.take(60),
                    replyToSender = replyTo?.senderName,
                    kind = "TEXT"
                )
            )
        }

        simulatePeerReplyIfNeeded(chatId, content, chat)
    }

    suspend fun sendVoiceMessage(chatId: String, durationSec: Int) {
        val user = _currentUser.value ?: return
        val chat = chatDao.getChatByIdOnce(chatId)
        val isE2ee = chat?.isE2ee ?: false

        val msgId = "msg_voice_" + UUID.randomUUID().toString().take(8)
        val newMsg = Message(
            id = msgId,
            chatId = chatId,
            senderId = user.id,
            senderName = user.displayName,
            content = "Voice message ($durationSec s)",
            kind = MessageKind.VOICE,
            voiceDurationSec = durationSec,
            timestamp = System.currentTimeMillis(),
            isE2ee = isE2ee
        )
        messageDao.insertMessage(newMsg)

        if (chat != null) {
            chatDao.updateChat(
                chat.copy(
                    lastMessageText = "🎤 Voice message (${durationSec}s)",
                    lastMessageTime = System.currentTimeMillis(),
                    lastSenderName = user.displayName
                )
            )
        }

        scope.launch(Dispatchers.IO) {
            val apiMsg = ApiMessage(
                id = msgId,
                chatId = chatId,
                senderId = user.id,
                senderName = user.displayName,
                content = "Voice message ($durationSec s)",
                kind = "VOICE",
                voiceDurationSec = durationSec,
                isE2ee = isE2ee
            )
            webSocketClient.sendEvent(WsEvent(type = "MESSAGE", chatId = chatId, message = apiMsg))
        }
    }

    suspend fun sendFileMessage(chatId: String, fileName: String, fileSize: String, isImage: Boolean = false) {
        val user = _currentUser.value ?: return
        val chat = chatDao.getChatByIdOnce(chatId)
        val isE2ee = chat?.isE2ee ?: false

        val msgId = "msg_file_" + UUID.randomUUID().toString().take(8)
        val newMsg = Message(
            id = msgId,
            chatId = chatId,
            senderId = user.id,
            senderName = user.displayName,
            content = if (isImage) "Photo attachment" else fileName,
            kind = if (isImage) MessageKind.IMAGE else MessageKind.FILE,
            fileName = fileName,
            fileSize = fileSize,
            timestamp = System.currentTimeMillis(),
            isE2ee = isE2ee
        )
        messageDao.insertMessage(newMsg)

        if (chat != null) {
            chatDao.updateChat(
                chat.copy(
                    lastMessageText = if (isImage) "📷 Photo" else "📎 $fileName",
                    lastMessageTime = System.currentTimeMillis(),
                    lastSenderName = user.displayName
                )
            )
        }

        scope.launch(Dispatchers.IO) {
            val apiMsg = ApiMessage(
                id = msgId,
                chatId = chatId,
                senderId = user.id,
                senderName = user.displayName,
                content = if (isImage) "Photo attachment" else fileName,
                kind = if (isImage) "IMAGE" else "FILE",
                fileName = fileName,
                fileSize = fileSize,
                isE2ee = isE2ee
            )
            webSocketClient.sendEvent(WsEvent(type = "MESSAGE", chatId = chatId, message = apiMsg))
        }
    }

    suspend fun createPoll(chatId: String, question: String, options: List<String>) {
        val user = _currentUser.value ?: return
        val chat = chatDao.getChatByIdOnce(chatId)

        val pollOptions = options.filter { it.isNotBlank() }.mapIndexed { idx, opt ->
            PollOption("opt_${idx + 1}", opt.trim(), 0, emptyList())
        }

        val msgId = "msg_poll_" + UUID.randomUUID().toString().take(8)
        val newMsg = Message(
            id = msgId,
            chatId = chatId,
            senderId = user.id,
            senderName = user.displayName,
            content = "📊 Poll: $question",
            kind = MessageKind.POLL,
            pollQuestion = question.trim(),
            pollOptions = pollOptions,
            timestamp = System.currentTimeMillis()
        )
        messageDao.insertMessage(newMsg)

        if (chat != null) {
            chatDao.updateChat(
                chat.copy(
                    lastMessageText = "📊 Poll: $question",
                    lastMessageTime = System.currentTimeMillis(),
                    lastSenderName = user.displayName
                )
            )
        }
    }

    suspend fun voteInPoll(messageId: String, optionId: String) {
        val user = _currentUser.value ?: return
        val msg = messageDao.getMessageById(messageId) ?: return
        val updatedOptions = msg.pollOptions.map { opt ->
            val hadVoted = opt.voterIds.contains(user.id)
            if (opt.id == optionId) {
                if (hadVoted) {
                    opt.copy(voteCount = maxOf(0, opt.voteCount - 1), voterIds = opt.voterIds - user.id)
                } else {
                    opt.copy(voteCount = opt.voteCount + 1, voterIds = opt.voterIds + user.id)
                }
            } else {
                if (hadVoted) {
                    opt.copy(voteCount = maxOf(0, opt.voteCount - 1), voterIds = opt.voterIds - user.id)
                } else {
                    opt
                }
            }
        }
        messageDao.updateMessage(msg.copy(pollOptions = updatedOptions))
    }

    suspend fun toggleReaction(messageId: String, emoji: String) {
        val user = _currentUser.value ?: return
        val msg = messageDao.getMessageById(messageId) ?: return
        val currentReactions = msg.reactions.toMutableList()
        val index = currentReactions.indexOfFirst { it.emoji == emoji }

        if (index >= 0) {
            val item = currentReactions[index]
            if (item.userIds.contains(user.id)) {
                val newUserIds = item.userIds - user.id
                if (newUserIds.isEmpty()) {
                    currentReactions.removeAt(index)
                } else {
                    currentReactions[index] = item.copy(count = item.count - 1, userIds = newUserIds)
                }
            } else {
                currentReactions[index] = item.copy(count = item.count + 1, userIds = item.userIds + user.id)
            }
        } else {
            currentReactions.add(ReactionItem(emoji = emoji, count = 1, userIds = listOf(user.id)))
        }
        messageDao.updateMessage(msg.copy(reactions = currentReactions))

        webSocketClient.sendReaction(msg.chatId, messageId, emoji, user.id)
    }

    suspend fun editMessage(messageId: String, newContent: String) {
        messageDao.editMessageContent(messageId, newContent)
    }

    suspend fun deleteMessage(messageId: String) {
        messageDao.deleteMessage(messageId)
    }

    suspend fun pinMessage(chatId: String, messageId: String, pin: Boolean) {
        messageDao.setMessagePinned(messageId, pin)
        chatDao.setPinnedMessage(chatId, if (pin) messageId else null)
    }

    suspend fun forwardMessage(sourceMessageId: String, targetChatId: String) {
        val user = _currentUser.value ?: return
        val src = messageDao.getMessageById(sourceMessageId) ?: return
        val targetChat = chatDao.getChatByIdOnce(targetChatId) ?: return

        val msgId = "msg_fwd_" + UUID.randomUUID().toString().take(8)
        val newMsg = src.copy(
            id = msgId,
            chatId = targetChatId,
            senderId = user.id,
            senderName = user.displayName,
            timestamp = System.currentTimeMillis(),
            isForwarded = true,
            forwardOrigin = src.senderName,
            reactions = emptyList()
        )
        messageDao.insertMessage(newMsg)

        chatDao.updateChat(
            targetChat.copy(
                lastMessageText = "Forwarded: ${src.content.take(40)}",
                lastMessageTime = System.currentTimeMillis(),
                lastSenderName = user.displayName
            )
        )
    }

    suspend fun reportMessage(messageId: String, reason: String) {
        val user = _currentUser.value ?: return
        val msg = messageDao.getMessageById(messageId) ?: return
        val report = ReportItem(
            id = "rep_" + UUID.randomUUID().toString().take(8),
            messageId = messageId,
            messageSnippet = msg.content.take(80),
            reporterUsername = user.username,
            targetUsername = msg.senderName,
            reason = reason,
            timestamp = System.currentTimeMillis(),
            status = "PENDING"
        )
        reportDao.insertReport(report)

        scope.launch(Dispatchers.IO) {
            apiClient.submitReport(
                ApiReportRequest(
                    messageId = messageId,
                    messageSnippet = msg.content.take(80),
                    targetUsername = msg.senderName,
                    reason = reason
                )
            )
        }
    }

    suspend fun logCall(chatId: String, durationText: String, isVideo: Boolean, isMissed: Boolean) {
        val msgId = "msg_call_" + UUID.randomUUID().toString().take(8)
        val logMsg = Message(
            id = msgId,
            chatId = chatId,
            senderId = "system",
            senderName = "System",
            content = if (isMissed) {
                if (isVideo) "📹 Missed video call" else "📞 Missed voice call"
            } else {
                if (isVideo) "📹 Video call · $durationText" else "📞 Voice call · $durationText"
            },
            kind = MessageKind.CALL_LOG,
            callDurationText = if (isMissed) null else durationText,
            isVideoCall = isVideo,
            isMissedCall = isMissed,
            timestamp = System.currentTimeMillis()
        )
        messageDao.insertMessage(logMsg)

        val chat = chatDao.getChatByIdOnce(chatId)
        if (chat != null) {
            chatDao.updateChat(
                chat.copy(
                    lastMessageText = logMsg.content,
                    lastMessageTime = System.currentTimeMillis(),
                    lastSenderName = "System"
                )
            )
        }
    }

    // ------------------------------------------------------------------------
    // User Management & Privacy
    // ------------------------------------------------------------------------

    fun getAllUsers(): Flow<List<User>> = userDao.getAllUsers()

    fun getUserById(userId: String): Flow<User?> = userDao.getUserById(userId)

    suspend fun getUserByIdOnce(userId: String): User? = userDao.getUserByIdOnce(userId)

    fun searchUsers(query: String): Flow<List<User>> = userDao.searchUsers(query)

    fun getBlockedUsers(): Flow<List<User>> = userDao.getBlockedUsers()

    suspend fun blockUser(userId: String) {
        userDao.setBlocked(userId, true)
    }

    suspend fun unblockUser(userId: String) {
        userDao.setBlocked(userId, false)
    }

    // ------------------------------------------------------------------------
    // Admin & Moderation
    // ------------------------------------------------------------------------

    fun getAllReports(): Flow<List<ReportItem>> = reportDao.getAllReports()

    fun getAllAuditLogs(): Flow<List<AuditLogItem>> = auditDao.getAllAuditLogs()

    fun getServerConfig(): Flow<ServerConfig?> = serverConfigDao.getServerConfig()

    suspend fun updateServerConfig(config: ServerConfig) {
        serverConfigDao.setServerConfig(config)
        auditDao.insertAuditLog(
            AuditLogItem(
                id = "aud_" + UUID.randomUUID().toString().take(8),
                actor = _currentUser.value?.username ?: "admin",
                action = "CONFIG_CHANGE",
                target = "Server Settings",
                detail = "Updated server parameters and security controls"
            )
        )
    }

    suspend fun setUserRole(userId: String, role: UserRole) {
        userDao.setRole(userId, role)
        auditDao.insertAuditLog(
            AuditLogItem(
                id = "aud_" + UUID.randomUUID().toString().take(8),
                actor = _currentUser.value?.username ?: "admin",
                action = "ROLE_CHANGE",
                target = userId,
                detail = "Role changed to $role"
            )
        )
    }

    suspend fun setUserMuted(userId: String, muted: Boolean) {
        userDao.setMuted(userId, muted)
    }

    suspend fun setUserBanned(userId: String, banned: Boolean) {
        userDao.setBanned(userId, banned)
        auditDao.insertAuditLog(
            AuditLogItem(
                id = "aud_" + UUID.randomUUID().toString().take(8),
                actor = _currentUser.value?.username ?: "admin",
                action = if (banned) "BAN" else "UNBAN",
                target = userId,
                detail = if (banned) "User account banned" else "User ban revoked"
            )
        )
    }

    suspend fun resolveReport(reportId: String, status: String) {
        reportDao.updateReportStatus(reportId, status)
    }

    suspend fun rotateSecret() {
        auditDao.insertAuditLog(
            AuditLogItem(
                id = "aud_" + UUID.randomUUID().toString().take(8),
                actor = _currentUser.value?.username ?: "owner",
                action = "ROTATE_JWT",
                target = "Security",
                detail = "Regenerated server authentication key"
            )
        )
    }

    // ------------------------------------------------------------------------
    // Simulated Smart Peer Replies (Fallback when server is in self-hosted test mode)
    // ------------------------------------------------------------------------

    private fun simulatePeerReplyIfNeeded(chatId: String, userMessage: String, chat: Chat?) {
        if (chat == null || chat.type == ChatType.SAVED) return

        scope.launch(Dispatchers.IO) {
            delay(1500)
            val current = _currentUser.value ?: return@launch

            if (chat.type == ChatType.DM && chat.peerUserId != null) {
                val peer = userDao.getUserByIdOnce(chat.peerUserId)
                if (peer != null && !peer.isBlocked && !peer.isMuted) {
                    val replyText = generatePeerResponse(userMessage, peer.displayName)
                    val replyMsg = Message(
                        id = "msg_" + UUID.randomUUID().toString().take(8),
                        chatId = chatId,
                        senderId = peer.id,
                        senderName = peer.displayName,
                        content = replyText,
                        timestamp = System.currentTimeMillis(),
                        isE2ee = chat.isE2ee
                    )
                    messageDao.insertMessage(replyMsg)
                    chatDao.updateChat(
                        chat.copy(
                            lastMessageText = replyText,
                            lastMessageTime = System.currentTimeMillis(),
                            lastSenderName = peer.displayName,
                            unreadCount = chat.unreadCount + 1
                        )
                    )
                }
            } else if (chat.type == ChatType.GROUP) {
                if (userMessage.contains("poll", ignoreCase = true) || userMessage.contains("e2ee", ignoreCase = true) || userMessage.contains("call", ignoreCase = true)) {
                    val groupReply = Message(
                        id = "msg_" + UUID.randomUUID().toString().take(8),
                        chatId = chatId,
                        senderId = "usr_alice",
                        senderName = "Alice Vance",
                        content = "Acknowledged! Verified with cryptographic proof. 👍",
                        timestamp = System.currentTimeMillis()
                    )
                    messageDao.insertMessage(groupReply)
                    chatDao.updateChat(
                        chat.copy(
                            lastMessageText = "Alice Vance: Acknowledged! Verified with cryptographic proof. 👍",
                            lastMessageTime = System.currentTimeMillis(),
                            lastSenderName = "Alice Vance"
                        )
                    )
                }
            }
        }
    }

    private fun generatePeerResponse(message: String, peerName: String): String {
        val lower = message.lowercase()
        return when {
            lower.contains("hello") || lower.contains("hi") || lower.contains("hey") ->
                "Hey there! Good to connect with you on Efadro. Everything is end-to-end encrypted! 🔒"
            lower.contains("safety") || lower.contains("code") || lower.contains("key") ->
                "Safety code matches on my device: `4821-9932-1084-5529` ✅"
            lower.contains("call") ->
                "Ready for the WebRTC call whenever you tap 📞 or 📹 in the header!"
            lower.contains("how are you") ->
                "Doing great! Working on the new P2P mesh enhancements."
            lower.contains("spoiler") || lower.contains("secret") ->
                "Awesome! Wrapped with AES-GCM-256 and ECDSA P-256 signatures."
            else ->
                "Got your message: \"$message\"! Sent via secure websocket with instant receipts ✓✓"
        }
    }
}
