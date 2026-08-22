package com.example.efadro.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

enum class UserRole {
    OWNER, ADMIN, MODERATOR, USER
}

enum class ChatType {
    DM, GROUP, SAVED
}

enum class MessageKind {
    TEXT, VOICE, IMAGE, FILE, POLL, SYSTEM, CALL_LOG
}

@Serializable
@Entity(tableName = "users")
data class User(
    @PrimaryKey val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val role: UserRole = UserRole.USER,
    val bio: String = "",
    val isOnline: Boolean = false,
    val lastSeenText: String = "recently",
    val isBlocked: Boolean = false,
    val isMuted: Boolean = false,
    val isBanned: Boolean = false,
    val has2Fa: Boolean = false,
    val e2eePublicKey: String = "pub_secp256r1_" + id.take(8),
    val memberSince: String = "Aug 2026"
)

@Serializable
@Entity(tableName = "chats")
data class Chat(
    @PrimaryKey val id: String,
    val name: String,
    val type: ChatType,
    val avatarUrl: String? = null,
    val peerUserId: String? = null,
    val isE2ee: Boolean = false,
    val isPinned: Boolean = false,
    val isMuted: Boolean = false,
    val isArchived: Boolean = false,
    val unreadCount: Int = 0,
    val unreadMentions: Int = 0,
    val lastMessageText: String = "",
    val lastMessageTime: Long = System.currentTimeMillis(),
    val lastSenderName: String = "",
    val inviteToken: String? = null,
    val safetyCode: String = "4821-9932-1084-5529",
    val description: String = "",
    val membersCount: Int = 2,
    val pinnedMessageId: String? = null
)

@Serializable
data class PollOption(
    val id: String,
    val text: String,
    val voteCount: Int = 0,
    val voterIds: List<String> = emptyList()
)

@Serializable
data class ReactionItem(
    val emoji: String,
    val count: Int,
    val userIds: List<String>
)

@Serializable
@Entity(tableName = "messages")
data class Message(
    @PrimaryKey val id: String,
    val chatId: String,
    val senderId: String,
    val senderName: String,
    val senderAvatar: String? = null,
    val content: String,
    val timestamp: Long = System.currentTimeMillis(),
    val isSent: Boolean = true,
    val isDelivered: Boolean = true,
    val isRead: Boolean = true,
    val isE2ee: Boolean = false,
    val replyToId: String? = null,
    val replyToText: String? = null,
    val replyToSender: String? = null,
    val isForwarded: Boolean = false,
    val forwardOrigin: String? = null,
    val isPinned: Boolean = false,
    val kind: MessageKind = MessageKind.TEXT,
    val voiceDurationSec: Int = 0,
    val fileName: String? = null,
    val fileSize: String? = null,
    val mediaUrl: String? = null,
    val pollQuestion: String? = null,
    val pollOptions: List<PollOption> = emptyList(),
    val reactions: List<ReactionItem> = emptyList(),
    val callDurationText: String? = null,
    val isVideoCall: Boolean = false,
    val isMissedCall: Boolean = false
)

@Serializable
@Entity(tableName = "reports")
data class ReportItem(
    @PrimaryKey val id: String,
    val messageId: String,
    val messageSnippet: String,
    val reporterUsername: String,
    val targetUsername: String,
    val reason: String,
    val timestamp: Long = System.currentTimeMillis(),
    val status: String = "PENDING" // PENDING, RESOLVED, DISMISSED
)

@Serializable
@Entity(tableName = "audit_logs")
data class AuditLogItem(
    @PrimaryKey val id: String,
    val actor: String,
    val action: String,
    val target: String,
    val detail: String,
    val timestamp: Long = System.currentTimeMillis()
)

@Serializable
@Entity(tableName = "server_configs")
data class ServerConfig(
    @PrimaryKey val id: Int = 1,
    val serverName: String = "Efadro Community",
    val serverUrl: String = "https://efadro.local:3000",
    val serverPassword: String = "",
    val turnstileEnabled: Boolean = false,
    val registrationEnabled: Boolean = true,
    val callsEnabled: Boolean = true,
    val maxFileSizeMb: Int = 25,
    val currentVersion: String = "1.8.1"
)
