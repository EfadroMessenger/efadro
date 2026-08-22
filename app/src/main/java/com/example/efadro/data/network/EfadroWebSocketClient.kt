package com.example.efadro.data.network

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

enum class WsConnectionStatus {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    AUTHENTICATED
}

class EfadroWebSocketClient(
    private val scope: CoroutineScope
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private var webSocket: WebSocket? = null
    private var reconnectJob: Job? = null
    private var currentUrl: String = ""
    private var currentToken: String? = null
    private var currentUserId: String? = null

    private val _connectionStatus = MutableStateFlow(WsConnectionStatus.DISCONNECTED)
    val connectionStatus: StateFlow<WsConnectionStatus> = _connectionStatus.asStateFlow()

    private val _events = MutableSharedFlow<WsEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<WsEvent> = _events.asSharedFlow()

    private val _pingLatencyMs = MutableStateFlow<Long?>(null)
    val pingLatencyMs: StateFlow<Long?> = _pingLatencyMs.asStateFlow()

    fun connect(wsUrl: String, token: String?, userId: String?) {
        currentUrl = wsUrl
        currentToken = token
        currentUserId = userId

        disconnect()

        _connectionStatus.value = WsConnectionStatus.CONNECTING
        Log.i("EfadroWebSocket", "Connecting to $wsUrl...")

        val request = Request.Builder()
            .url(wsUrl)
            .apply {
                token?.let { addHeader("Authorization", "Bearer $it") }
            }
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i("EfadroWebSocket", "WebSocket connected successfully!")
                _connectionStatus.value = WsConnectionStatus.CONNECTED

                // Send Auth handshake payload
                if (token != null || userId != null) {
                    val authPayload = WsEvent(
                        type = "AUTH",
                        userId = userId,
                        callPayload = token
                    )
                    sendEvent(authPayload)
                    _connectionStatus.value = WsConnectionStatus.AUTHENTICATED
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                scope.launch(Dispatchers.Default) {
                    try {
                        val event = json.decodeFromString<WsEvent>(text)
                        if (event.type == "PONG") {
                            val latency = System.currentTimeMillis() - event.timestamp
                            _pingLatencyMs.value = latency
                        } else {
                            _events.emit(event)
                        }
                    } catch (e: Exception) {
                        Log.e("EfadroWebSocket", "Failed to parse message: $text", e)
                    }
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.i("EfadroWebSocket", "WebSocket closing: $code / $reason")
                _connectionStatus.value = WsConnectionStatus.DISCONNECTED
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.i("EfadroWebSocket", "WebSocket closed: $code / $reason")
                _connectionStatus.value = WsConnectionStatus.DISCONNECTED
                scheduleReconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w("EfadroWebSocket", "WebSocket failure: ${t.message}")
                _connectionStatus.value = WsConnectionStatus.DISCONNECTED
                scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        if (reconnectJob?.isActive == true) return
        reconnectJob = scope.launch(Dispatchers.IO) {
            delay(5000)
            if (_connectionStatus.value == WsConnectionStatus.DISCONNECTED && currentUrl.isNotBlank()) {
                Log.i("EfadroWebSocket", "Attempting reconnection...")
                connect(currentUrl, currentToken, currentUserId)
            }
        }
    }

    fun sendEvent(event: WsEvent): Boolean {
        return try {
            val serialized = json.encodeToString(event)
            webSocket?.send(serialized) ?: false
        } catch (e: Exception) {
            Log.e("EfadroWebSocket", "Send failed: ${e.message}")
            false
        }
    }

    fun sendTyping(chatId: String, username: String, isTyping: Boolean) {
        sendEvent(
            WsEvent(
                type = "TYPING",
                chatId = chatId,
                username = username,
                isTyping = isTyping
            )
        )
    }

    fun sendReaction(chatId: String, messageId: String, emoji: String, userId: String) {
        sendEvent(
            WsEvent(
                type = "REACTION",
                chatId = chatId,
                messageId = messageId,
                emoji = emoji,
                userId = userId
            )
        )
    }

    fun sendPresence(userId: String, status: String) {
        sendEvent(
            WsEvent(
                type = "PRESENCE",
                userId = userId,
                presenceStatus = status
            )
        )
    }

    fun sendCallSignal(chatId: String, callType: String, payload: String) {
        sendEvent(
            WsEvent(
                type = "CALL_SIGNAL",
                chatId = chatId,
                callType = callType,
                callPayload = payload
            )
        )
    }

    fun ping() {
        sendEvent(
            WsEvent(
                type = "PING",
                timestamp = System.currentTimeMillis()
            )
        )
    }

    fun disconnect() {
        reconnectJob?.cancel()
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        _connectionStatus.value = WsConnectionStatus.DISCONNECTED
    }
}
