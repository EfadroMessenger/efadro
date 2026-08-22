package com.example.efadro.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.example.efadro.data.model.Chat
import kotlinx.coroutines.flow.Flow

@Dao
interface ChatDao {
    @Query("SELECT * FROM chats ORDER BY isPinned DESC, lastMessageTime DESC")
    fun getAllChats(): Flow<List<Chat>>

    @Query("SELECT * FROM chats WHERE id = :chatId")
    fun getChatById(chatId: String): Flow<Chat?>

    @Query("SELECT * FROM chats WHERE id = :chatId")
    suspend fun getChatByIdOnce(chatId: String): Chat?

    @Query("SELECT * FROM chats WHERE name LIKE '%' || :query || '%' OR lastMessageText LIKE '%' || :query || '%'")
    fun searchChats(query: String): Flow<List<Chat>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertChat(chat: Chat)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(chats: List<Chat>)

    @Update
    suspend fun updateChat(chat: Chat)

    @Query("UPDATE chats SET isPinned = :pinned WHERE id = :chatId")
    suspend fun setPinned(chatId: String, pinned: Boolean)

    @Query("UPDATE chats SET isMuted = :muted WHERE id = :chatId")
    suspend fun setMuted(chatId: String, muted: Boolean)

    @Query("UPDATE chats SET isArchived = :archived WHERE id = :chatId")
    suspend fun setArchived(chatId: String, archived: Boolean)

    @Query("UPDATE chats SET unreadCount = 0, unreadMentions = 0 WHERE id = :chatId")
    suspend fun markChatRead(chatId: String)

    @Query("UPDATE chats SET pinnedMessageId = :messageId WHERE id = :chatId")
    suspend fun setPinnedMessage(chatId: String, messageId: String?)

    @Query("DELETE FROM chats WHERE id = :chatId")
    suspend fun deleteChat(chatId: String)
}
