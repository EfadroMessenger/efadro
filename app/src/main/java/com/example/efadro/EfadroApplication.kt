package com.example.efadro

import android.app.Application
import com.example.efadro.data.local.AppDatabase
import com.example.efadro.data.repository.EfadroRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

class EfadroApplication : Application() {
    val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val database by lazy { AppDatabase.getDatabase(this, applicationScope) }

    val repository by lazy {
        EfadroRepository(
            database = database,
            scope = applicationScope
        )
    }
}
