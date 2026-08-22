package com.example.efadro.data.network

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class EfadroApiClient(
    private var baseUrl: String = "https://efadro.network"
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(6, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private var authToken: String? = null

    fun setAuthToken(token: String?) {
        authToken = token
    }

    fun setBaseUrl(url: String) {
        baseUrl = url.trim().removeSuffix("/")
    }

    fun getBaseUrl(): String = baseUrl

    fun getWebSocketUrl(): String {
        val clean = baseUrl.removePrefix("http://").removePrefix("https://")
        val wsProtocol = if (baseUrl.startsWith("https://")) "wss://" else "ws://"
        return "$wsProtocol$clean/ws"
    }

    suspend fun checkHealth(): Result<Pair<ServerHealthResponse, Long>> = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()
        val url = "$baseUrl/api/health"
        try {
            val request = Request.Builder()
                .url(url)
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                val latency = System.currentTimeMillis() - startTime
                if (response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    val health = if (body.isNotBlank()) {
                        json.decodeFromString<ServerHealthResponse>(body)
                    } else {
                        ServerHealthResponse(
                            status = "ok",
                            serverName = "Efadro Active Node",
                            version = "1.8.1",
                            onlineUsers = 1
                        )
                    }
                    Result.success(Pair(health, latency))
                } else {
                    Result.failure(Exception("HTTP ${response.code}: ${response.message}"))
                }
            }
        } catch (e: Exception) {
            Log.w("EfadroApiClient", "Health check failed for $url: ${e.message}")
            Result.failure(e)
        }
    }

    suspend fun login(request: ApiAuthRequest): Result<ApiAuthResponse> = withContext(Dispatchers.IO) {
        val url = "$baseUrl/api/auth/login"
        try {
            val reqBody = json.encodeToString(request).toRequestBody(jsonMediaType)
            val httpRequest = Request.Builder()
                .url(url)
                .post(reqBody)
                .build()

            client.newCall(httpRequest).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (response.isSuccessful && body.isNotBlank()) {
                    val authRes = json.decodeFromString<ApiAuthResponse>(body)
                    if (authRes.token != null) {
                        authToken = authRes.token
                    }
                    Result.success(authRes)
                } else {
                    Result.failure(Exception("Login failed: ${response.code} $body"))
                }
            }
        } catch (e: Exception) {
            Log.w("EfadroApiClient", "Login network error: ${e.message}")
            Result.failure(e)
        }
    }

    suspend fun register(request: ApiAuthRequest): Result<ApiAuthResponse> = withContext(Dispatchers.IO) {
        val url = "$baseUrl/api/auth/register"
        try {
            val reqBody = json.encodeToString(request).toRequestBody(jsonMediaType)
            val httpRequest = Request.Builder()
                .url(url)
                .post(reqBody)
                .build()

            client.newCall(httpRequest).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (response.isSuccessful && body.isNotBlank()) {
                    val authRes = json.decodeFromString<ApiAuthResponse>(body)
                    if (authRes.token != null) {
                        authToken = authRes.token
                    }
                    Result.success(authRes)
                } else {
                    Result.failure(Exception("Registration error: ${response.code} $body"))
                }
            }
        } catch (e: Exception) {
            Log.w("EfadroApiClient", "Register network error: ${e.message}")
            Result.failure(e)
        }
    }

    suspend fun fetchChats(): Result<List<ApiChat>> = withContext(Dispatchers.IO) {
        val url = "$baseUrl/api/chats"
        try {
            val builder = Request.Builder().url(url).get()
            authToken?.let { builder.addHeader("Authorization", "Bearer $it") }

            client.newCall(builder.build()).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    val chats = json.decodeFromString<List<ApiChat>>(body)
                    Result.success(chats)
                } else {
                    Result.failure(Exception("HTTP ${response.code} fetching chats"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun createChat(req: ApiCreateChatRequest): Result<ApiChat> = withContext(Dispatchers.IO) {
        val url = "$baseUrl/api/chats"
        try {
            val reqBody = json.encodeToString(req).toRequestBody(jsonMediaType)
            val builder = Request.Builder().url(url).post(reqBody)
            authToken?.let { builder.addHeader("Authorization", "Bearer $it") }

            client.newCall(builder.build()).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    val chat = json.decodeFromString<ApiChat>(body)
                    Result.success(chat)
                } else {
                    Result.failure(Exception("HTTP ${response.code} creating chat"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun sendMessage(req: ApiSendMessageRequest): Result<ApiMessage> = withContext(Dispatchers.IO) {
        val url = "$baseUrl/api/chats/${req.chatId}/messages"
        try {
            val reqBody = json.encodeToString(req).toRequestBody(jsonMediaType)
            val builder = Request.Builder().url(url).post(reqBody)
            authToken?.let { builder.addHeader("Authorization", "Bearer $it") }

            client.newCall(builder.build()).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    val msg = json.decodeFromString<ApiMessage>(body)
                    Result.success(msg)
                } else {
                    Result.failure(Exception("HTTP ${response.code} sending message"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun fetchMessages(chatId: String): Result<List<ApiMessage>> = withContext(Dispatchers.IO) {
        val url = "$baseUrl/api/chats/$chatId/messages"
        try {
            val builder = Request.Builder().url(url).get()
            authToken?.let { builder.addHeader("Authorization", "Bearer $it") }

            client.newCall(builder.build()).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    val messages = json.decodeFromString<List<ApiMessage>>(body)
                    Result.success(messages)
                } else {
                    Result.failure(Exception("HTTP ${response.code} fetching messages"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun searchUsers(query: String): Result<List<ApiUser>> = withContext(Dispatchers.IO) {
        val url = "$baseUrl/api/users/search?q=$query"
        try {
            val builder = Request.Builder().url(url).get()
            authToken?.let { builder.addHeader("Authorization", "Bearer $it") }

            client.newCall(builder.build()).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    val users = json.decodeFromString<List<ApiUser>>(body)
                    Result.success(users)
                } else {
                    Result.failure(Exception("HTTP ${response.code} searching users"))
                }
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun submitReport(req: ApiReportRequest): Result<Boolean> = withContext(Dispatchers.IO) {
        val url = "$baseUrl/api/reports"
        try {
            val reqBody = json.encodeToString(req).toRequestBody(jsonMediaType)
            val builder = Request.Builder().url(url).post(reqBody)
            authToken?.let { builder.addHeader("Authorization", "Bearer $it") }

            client.newCall(builder.build()).execute().use { response ->
                Result.success(response.isSuccessful)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
