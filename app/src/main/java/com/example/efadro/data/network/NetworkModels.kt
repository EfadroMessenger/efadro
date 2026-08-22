package com.example.efadro.data.network

import kotlinx.serialization.Serializable

@Serializable
data class ServerHealthResponse(
    val status: String = "ok",
    val serverName: String = "Efadro Community Server",
    val version: String = "1.8.1",
    val registrationOpen: Boolean = true,
    val requiresGatePassword: Boolean = false,
    val turnstileRequired: Boolean = false,
    val onlineUsers: Int = 1,
    val timestamp: Long = System.currentTimeMillis()
)

@Serializable
data class ApiAuthRequest(
    val username: String,
    val password: String? = null,
    val displayName: String? = null,
    val serverGatePassword: String? = null,
    val totpCode: String? = null,
    val e2eePublicKey: String? = null
)

@Serializable
data class ApiAuthResponse(
    val token: String? = null,
    val user: ApiUser? = null,
    val requires2Fa: Boolean = false,
    val error: String? = null
)

@Serializable
data class ApiUser(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val role: String = "USER",
    val bio: String = "",
    val isOnline: Boolean = true,
    val has2Fa: Boolean = false,
    val isBanned: Boolean = false,
    val isMuted: Boolean = false,
    val e2eePublicKey: String = "",
    val memberSince: String = "Aug 2026"
)

@Serializable
data class ApiChat(
    val id: String,
    val name: String,
    val type: String, // DM, GROUP, SAVED
    val avatarUrl: String? = null,
    val peerUserId: String? = null,
    val isE2ee: Boolean = false,
    val safetyCode: String = "4821-9932-1084-5529",
    val description: String = "",
    val membersCount: Int = 2,
    val pinnedMessageId: String? = null,
    val lastMessageText: String = "",
    val lastMessageTime: Long = System.currentTimeMillis(),
    val lastSenderName: String = ""
)

@Serializable
data class ApiMessage(
    val id: String,
    val chatId: String,
    val senderId: String,
    val senderName: String,
    val senderAvatar: String? = null,
    val content: String,
    val timestamp: Long = System.currentTimeMillis(),
    val isE2ee: Boolean = false,
    val replyToId: String? = null,
    val replyToText: String? = null,
    val replyToSender: String? = null,
    val isForwarded: Boolean = false,
    val forwardOrigin: String? = null,
    val isPinned: Boolean = false,
    val kind: String = "TEXT", // TEXT, VOICE, IMAGE, FILE, POLL, SYSTEM, CALL_LOG
    val voiceDurationSec: Int = 0,
    val fileName: String? = null,
    val fileSize: String? = null,
    val mediaUrl: String? = null,
    val pollQuestion: String? = null,
    val pollOptionsJson: String? = null,
    val reactionsJson: String? = null,
    val callDurationText: String? = null,
    val isVideoCall: Boolean = false,
    val isMissedCall: Boolean = false
)

@Serializable
data class ApiSendMessageRequest(
    val chatId: String,
    val content: String,
    val kind: String = "TEXT",
    val isE2ee: Boolean = false,
    val replyToId: String? = null,
    val replyToText: String? = null,
    val replyToSender: String? = null,
    val isForwarded: Boolean = false,
    val forwardOrigin: String? = null,
    val voiceDurationSec: Int = 0,
    val fileName: String? = null,
    val fileSize: String? = null,
    val mediaUrl: String? = null,
    val pollQuestion: String? = null,
    val pollOptions: List<String> = emptyList()
)

@Serializable
data class ApiCreateChatRequest(
    val name: String,
    val type: String, // DM, GROUP
    val peerUsername: String? = null,
    val description: String = "",
    val isE2ee: Boolean = false
)

@Serializable
data class ApiReportRequest(
    val messageId: String,
    val messageSnippet: String,
    val targetUsername: String,
    val reason: String
)

@Serializable
data class WsEvent(
    val type: String, // AUTH, MESSAGE, TYPING, REACTION, PRESENCE, CALL_SIGNAL, PING, PONG
    val chatId: String? = null,
    val userId: String? = null,
    val username: String? = null,
    val isTyping: Boolean? = null,
    val message: ApiMessage? = null,
    val emoji: String? = null,
    val messageId: String? = null,
    val presenceStatus: String? = null,
    val callType: String? = null,
    val callPayload: String? = null,
    val timestamp: Long = System.currentTimeMillis()
)
