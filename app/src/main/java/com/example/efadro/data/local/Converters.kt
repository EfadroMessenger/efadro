package com.example.efadro.data.local

import androidx.room.TypeConverter
import com.example.efadro.data.model.ChatType
import com.example.efadro.data.model.MessageKind
import com.example.efadro.data.model.PollOption
import com.example.efadro.data.model.ReactionItem
import com.example.efadro.data.model.UserRole
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class Converters {
    private val json = Json { ignoreUnknownKeys = true }

    @TypeConverter
    fun fromUserRole(role: UserRole): String = role.name

    @TypeConverter
    fun toUserRole(value: String): UserRole = runCatching { UserRole.valueOf(value) }.getOrDefault(UserRole.USER)

    @TypeConverter
    fun fromChatType(type: ChatType): String = type.name

    @TypeConverter
    fun toChatType(value: String): ChatType = runCatching { ChatType.valueOf(value) }.getOrDefault(ChatType.DM)

    @TypeConverter
    fun fromMessageKind(kind: MessageKind): String = kind.name

    @TypeConverter
    fun toMessageKind(value: String): MessageKind = runCatching { MessageKind.valueOf(value) }.getOrDefault(MessageKind.TEXT)

    @TypeConverter
    fun fromPollOptionList(options: List<PollOption>): String = json.encodeToString(options)

    @TypeConverter
    fun toPollOptionList(value: String): List<PollOption> =
        if (value.isBlank()) emptyList()
        else runCatching { json.decodeFromString<List<PollOption>>(value) }.getOrDefault(emptyList())

    @TypeConverter
    fun fromReactionItemList(reactions: List<ReactionItem>): String = json.encodeToString(reactions)

    @TypeConverter
    fun toReactionItemList(value: String): List<ReactionItem> =
        if (value.isBlank()) emptyList()
        else runCatching { json.decodeFromString<List<ReactionItem>>(value) }.getOrDefault(emptyList())

    @TypeConverter
    fun fromStringList(strings: List<String>): String = json.encodeToString(strings)

    @TypeConverter
    fun toStringList(value: String): List<String> =
        if (value.isBlank()) emptyList()
        else runCatching { json.decodeFromString<List<String>>(value) }.getOrDefault(emptyList())
}
