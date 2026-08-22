package com.example.efadro.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.example.efadro.data.model.AuditLogItem
import com.example.efadro.data.model.ReportItem
import com.example.efadro.data.model.ServerConfig
import com.example.efadro.data.model.User
import com.example.efadro.data.model.UserRole
import kotlinx.coroutines.flow.Flow

@Dao
interface UserDao {
    @Query("SELECT * FROM users ORDER BY username ASC")
    fun getAllUsers(): Flow<List<User>>

    @Query("SELECT * FROM users WHERE id = :id")
    fun getUserById(id: String): Flow<User?>

    @Query("SELECT * FROM users WHERE id = :id")
    suspend fun getUserByIdOnce(id: String): User?

    @Query("SELECT * FROM users WHERE username = :username LIMIT 1")
    suspend fun getUserByUsername(username: String): User?

    @Query("SELECT * FROM users WHERE username LIKE '%' || :query || '%' OR displayName LIKE '%' || :query || '%'")
    fun searchUsers(query: String): Flow<List<User>>

    @Query("SELECT * FROM users WHERE isBlocked = 1")
    fun getBlockedUsers(): Flow<List<User>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertUser(user: User)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(users: List<User>)

    @Update
    suspend fun updateUser(user: User)

    @Query("UPDATE users SET isBlocked = :blocked WHERE id = :userId")
    suspend fun setBlocked(userId: String, blocked: Boolean)

    @Query("UPDATE users SET isMuted = :muted WHERE id = :userId")
    suspend fun setMuted(userId: String, muted: Boolean)

    @Query("UPDATE users SET isBanned = :banned WHERE id = :userId")
    suspend fun setBanned(userId: String, banned: Boolean)

    @Query("UPDATE users SET role = :role WHERE id = :userId")
    suspend fun setRole(userId: String, role: UserRole)

    @Query("UPDATE users SET has2Fa = :has2Fa WHERE id = :userId")
    suspend fun set2Fa(userId: String, has2Fa: Boolean)
}

@Dao
interface ReportDao {
    @Query("SELECT * FROM reports ORDER BY timestamp DESC")
    fun getAllReports(): Flow<List<ReportItem>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReport(report: ReportItem)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(reports: List<ReportItem>)

    @Query("UPDATE reports SET status = :status WHERE id = :id")
    suspend fun updateReportStatus(id: String, status: String)

    @Query("DELETE FROM reports WHERE id = :id")
    suspend fun deleteReport(id: String)
}

@Dao
interface AuditDao {
    @Query("SELECT * FROM audit_logs ORDER BY timestamp DESC")
    fun getAllAuditLogs(): Flow<List<AuditLogItem>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAuditLog(log: AuditLogItem)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(logs: List<AuditLogItem>)
}

@Dao
interface ServerConfigDao {
    @Query("SELECT * FROM server_configs WHERE id = 1")
    fun getServerConfig(): Flow<ServerConfig?>

    @Query("SELECT * FROM server_configs WHERE id = 1")
    suspend fun getServerConfigOnce(): ServerConfig?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun setServerConfig(config: ServerConfig)
}
