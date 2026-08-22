package com.example.efadro.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.sqlite.db.SupportSQLiteDatabase
import com.example.efadro.data.model.AuditLogItem
import com.example.efadro.data.model.Chat
import com.example.efadro.data.model.Message
import com.example.efadro.data.model.ReportItem
import com.example.efadro.data.model.ServerConfig
import com.example.efadro.data.model.User
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@Database(
    entities = [
        User::class,
        Chat::class,
        Message::class,
        ReportItem::class,
        AuditLogItem::class,
        ServerConfig::class
    ],
    version = 1,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun chatDao(): ChatDao
    abstract fun messageDao(): MessageDao
    abstract fun userDao(): UserDao
    abstract fun reportDao(): ReportDao
    abstract fun auditDao(): AuditDao
    abstract fun serverConfigDao(): ServerConfigDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context, scope: CoroutineScope): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "efadro.db"
                ).addCallback(object : Callback() {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        super.onCreate(db)
                        INSTANCE?.let { database ->
                            scope.launch(Dispatchers.IO) {
                                database.userDao().insertAll(PrepopulatedData.defaultUsers)
                                database.chatDao().insertAll(PrepopulatedData.defaultChats)
                                database.messageDao().insertAll(PrepopulatedData.defaultMessages)
                                database.reportDao().insertAll(PrepopulatedData.defaultReports)
                                database.auditDao().insertAll(PrepopulatedData.defaultAuditLogs)
                                database.serverConfigDao().setServerConfig(PrepopulatedData.defaultServerConfig)
                            }
                        }
                    }
                }).fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
