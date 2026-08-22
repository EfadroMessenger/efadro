package com.example.efadro.data.local

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

object PrepopulatedData {
    val defaultUsers = listOf(
        User(
            id = "usr_owner",
            username = "owner",
            displayName = "Server Owner 👑",
            role = UserRole.OWNER,
            bio = "Efadro server administrator and node maintainer",
            isOnline = true,
            has2Fa = true,
            memberSince = "Aug 2026"
        ),
        User(
            id = "usr_alice",
            username = "alice",
            displayName = "Alice Vance 🛡️",
            role = UserRole.ADMIN,
            bio = "Cryptography & Distributed Systems Lead",
            isOnline = true,
            memberSince = "Aug 2026"
        ),
        User(
            id = "usr_bob",
            username = "bob",
            displayName = "Bob Stone 🔨",
            role = UserRole.MODERATOR,
            bio = "Community manager & WebRTC tester",
            isOnline = true,
            memberSince = "Aug 2026"
        ),
        User(
            id = "usr_carol",
            username = "carol",
            displayName = "Carol Danvers",
            role = UserRole.USER,
            bio = "Security researcher & privacy advocate",
            isOnline = false,
            lastSeenText = "15m ago",
            memberSince = "Aug 2026"
        ),
        User(
            id = "usr_david",
            username = "david",
            displayName = "David Chen",
            role = UserRole.USER,
            bio = "Mobile client developer",
            isOnline = true,
            memberSince = "Aug 2026"
        )
    )

    val defaultChats = listOf(
        Chat(
            id = "chat_saved",
            name = "Saved Messages",
            type = ChatType.SAVED,
            isE2ee = true,
            isPinned = true,
            unreadCount = 0,
            lastMessageText = "🔐 My private backup seed phrase notes",
            lastMessageTime = System.currentTimeMillis() - 60000 * 5,
            lastSenderName = "You",
            description = "Your personal end-to-end encrypted cloud notepad"
        ),
        Chat(
            id = "chat_dev_group",
            name = "Efadro Core Devs 🚀",
            type = ChatType.GROUP,
            isPinned = true,
            unreadCount = 2,
            unreadMentions = 1,
            lastMessageText = "Alice: Don't forget to vote on the E2EE key rotation poll!",
            lastMessageTime = System.currentTimeMillis() - 60000 * 2,
            lastSenderName = "Alice",
            inviteToken = "efd_dev_invite_9832",
            description = "Official development & architecture channel for Efadro",
            membersCount = 5,
            pinnedMessageId = "msg_pinned_announcement"
        ),
        Chat(
            id = "chat_dm_alice",
            name = "Alice Vance 🛡️",
            type = ChatType.DM,
            peerUserId = "usr_alice",
            isE2ee = true,
            isPinned = false,
            unreadCount = 1,
            lastMessageText = "I verified your safety code: 4821-9932-1084-5529 🔒",
            lastMessageTime = System.currentTimeMillis() - 60000 * 12,
            lastSenderName = "Alice",
            safetyCode = "4821-9932-1084-5529"
        ),
        Chat(
            id = "chat_dm_bob",
            name = "Bob Stone 🔨",
            type = ChatType.DM,
            peerUserId = "usr_bob",
            isE2ee = true,
            isPinned = false,
            unreadCount = 0,
            lastMessageText = "📞 Voice call · 04:18",
            lastMessageTime = System.currentTimeMillis() - 60000 * 60,
            lastSenderName = "Bob",
            safetyCode = "7719-2041-8843-9102"
        ),
        Chat(
            id = "chat_announcements",
            name = "Efadro Community",
            type = ChatType.GROUP,
            isMuted = true,
            unreadCount = 0,
            lastMessageText = "Efadro 1.8.1 release is now live with stealth blocking!",
            lastMessageTime = System.currentTimeMillis() - 60000 * 180,
            lastSenderName = "System",
            membersCount = 128
        ),
        Chat(
            id = "chat_archived_legacy",
            name = "Legacy Server V1",
            type = ChatType.GROUP,
            isArchived = true,
            isMuted = true,
            unreadCount = 0,
            lastMessageText = "Migration completed to V2 protocol.",
            lastMessageTime = System.currentTimeMillis() - 86400000 * 3,
            lastSenderName = "System",
            membersCount = 12
        )
    )

    val defaultMessages = listOf(
        // Saved messages
        Message(
            id = "msg_saved_1",
            chatId = "chat_saved",
            senderId = "usr_owner",
            senderName = "You",
            content = "Efadro Server Config backup:\n`EFADRO_DATA=/data/efadro.db`\n`PORT=3000`",
            timestamp = System.currentTimeMillis() - 60000 * 20,
            isE2ee = true
        ),
        Message(
            id = "msg_saved_2",
            chatId = "chat_saved",
            senderId = "usr_owner",
            senderName = "You",
            content = "||secret-backup-passphrase-alpha-tango|| (Click spoiler to reveal)",
            timestamp = System.currentTimeMillis() - 60000 * 5,
            isE2ee = true
        ),

        // Group Devs messages
        Message(
            id = "msg_pinned_announcement",
            chatId = "chat_dev_group",
            senderId = "usr_owner",
            senderName = "owner",
            content = "📌 **PINNED**: All direct messages are upgraded to ECDH P-256 AES-GCM-256 E2EE! Please verify fingerprints in settings.",
            timestamp = System.currentTimeMillis() - 60000 * 120,
            isPinned = true,
            reactions = listOf(
                ReactionItem("🔥", 4, listOf("usr_alice", "usr_bob", "usr_carol", "usr_david")),
                ReactionItem("👍", 3, listOf("usr_alice", "usr_bob", "usr_owner"))
            )
        ),
        Message(
            id = "msg_group_1",
            chatId = "chat_dev_group",
            senderId = "usr_bob",
            senderName = "Bob Stone",
            content = "Hey team, WebRTC DTLS-SRTP 1:1 voice and video calling is tested and working smoothly! 📹📞",
            timestamp = System.currentTimeMillis() - 60000 * 45,
            reactions = listOf(ReactionItem("❤️", 2, listOf("usr_alice", "usr_owner")))
        ),
        Message(
            id = "msg_group_2",
            chatId = "chat_dev_group",
            senderId = "usr_alice",
            senderName = "Alice Vance",
            content = "Here is the proposal poll for the key transfer expiration duration:",
            timestamp = System.currentTimeMillis() - 60000 * 30,
            kind = MessageKind.POLL,
            pollQuestion = "What should the E2EE device key-transfer request timeout be?",
            pollOptions = listOf(
                PollOption("opt_1", "5 Minutes", 1, listOf("usr_bob")),
                PollOption("opt_2", "10 Minutes (Default)", 3, listOf("usr_alice", "usr_david", "usr_owner")),
                PollOption("opt_3", "15 Minutes", 0, emptyList())
            )
        ),
        Message(
            id = "msg_group_3",
            chatId = "chat_dev_group",
            senderId = "usr_david",
            senderName = "David Chen",
            content = "@owner Voice message recordings are now sent as `audio/webm` with live waveform duration!",
            timestamp = System.currentTimeMillis() - 60000 * 10,
            replyToId = "msg_group_1",
            replyToText = "Hey team, WebRTC DTLS-SRTP 1:1 voice and video calling...",
            replyToSender = "Bob Stone"
        ),
        Message(
            id = "msg_group_4",
            chatId = "chat_dev_group",
            senderId = "usr_alice",
            senderName = "Alice Vance",
            content = "Alice: Don't forget to vote on the E2EE key rotation poll!",
            timestamp = System.currentTimeMillis() - 60000 * 2
        ),

        // DM Alice messages
        Message(
            id = "msg_alice_1",
            chatId = "chat_dm_alice",
            senderId = "usr_alice",
            senderName = "Alice Vance",
            content = "🔒 *Direct chat upgraded to End-to-End Encryption (Epoch 1)*",
            timestamp = System.currentTimeMillis() - 60000 * 90,
            kind = MessageKind.SYSTEM,
            isE2ee = true
        ),
        Message(
            id = "msg_alice_2",
            chatId = "chat_dm_alice",
            senderId = "usr_alice",
            senderName = "Alice Vance",
            content = "Hey! Here is a voice note update regarding the cryptographic audit.",
            timestamp = System.currentTimeMillis() - 60000 * 60,
            kind = MessageKind.VOICE,
            voiceDurationSec = 14,
            isE2ee = true,
            reactions = listOf(ReactionItem("👍", 1, listOf("usr_owner")))
        ),
        Message(
            id = "msg_alice_3",
            chatId = "chat_dm_alice",
            senderId = "usr_owner",
            senderName = "You",
            content = "Great! Everything matched our security parameters. Did you compare our safety code?",
            timestamp = System.currentTimeMillis() - 60000 * 30,
            isE2ee = true,
            isRead = true
        ),
        Message(
            id = "msg_alice_4",
            chatId = "chat_dm_alice",
            senderId = "usr_alice",
            senderName = "Alice Vance",
            content = "I verified your safety code: 4821-9932-1084-5529 🔒",
            timestamp = System.currentTimeMillis() - 60000 * 12,
            isE2ee = true,
            reactions = listOf(ReactionItem("❤️", 1, listOf("usr_owner")), ReactionItem("🔥", 1, listOf("usr_owner")))
        ),

        // DM Bob messages
        Message(
            id = "msg_bob_1",
            chatId = "chat_dm_bob",
            senderId = "usr_bob",
            senderName = "Bob Stone",
            content = "Let's test the audio call quality over WebRTC relay.",
            timestamp = System.currentTimeMillis() - 60000 * 75,
            isE2ee = true
        ),
        Message(
            id = "msg_bob_2",
            chatId = "chat_dm_bob",
            senderId = "usr_bob",
            senderName = "Bob Stone",
            content = "📞 Voice call",
            timestamp = System.currentTimeMillis() - 60000 * 60,
            kind = MessageKind.CALL_LOG,
            callDurationText = "04:18",
            isVideoCall = false
        )
    )

    val defaultReports = listOf(
        ReportItem(
            id = "rep_1",
            messageId = "msg_flagged_demo",
            messageSnippet = "Suspicious unsolicited spam link detected",
            reporterUsername = "carol",
            targetUsername = "spambot99",
            reason = "Spam / Advertising",
            timestamp = System.currentTimeMillis() - 60000 * 25,
            status = "PENDING"
        )
    )

    val defaultAuditLogs = listOf(
        AuditLogItem(
            id = "aud_1",
            actor = "owner",
            action = "ROLE_UPDATE",
            target = "alice",
            detail = "Promoted to ADMIN",
            timestamp = System.currentTimeMillis() - 86400000
        ),
        AuditLogItem(
            id = "aud_2",
            actor = "alice",
            action = "SERVER_CONFIG",
            target = "Turnstile",
            detail = "Turnstile Captcha enabled",
            timestamp = System.currentTimeMillis() - 43200000
        ),
        AuditLogItem(
            id = "aud_3",
            actor = "owner",
            action = "ROTATE_JWT",
            target = "System",
            detail = "Server security key rotated",
            timestamp = System.currentTimeMillis() - 3600000
        )
    )

    val defaultServerConfig = ServerConfig(
        id = 1,
        serverName = "Efadro Community",
        serverUrl = "http://localhost:3000",
        serverPassword = "",
        turnstileEnabled = false,
        registrationEnabled = true,
        callsEnabled = true,
        maxFileSizeMb = 25,
        currentVersion = "1.8.1"
    )
}
