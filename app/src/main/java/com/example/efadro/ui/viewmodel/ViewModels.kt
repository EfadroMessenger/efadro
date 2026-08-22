package com.example.efadro.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.efadro.data.model.AuditLogItem
import com.example.efadro.data.model.Chat
import com.example.efadro.data.model.Message
import com.example.efadro.data.model.ReportItem
import com.example.efadro.data.model.ServerConfig
import com.example.efadro.data.model.User
import com.example.efadro.data.model.UserRole
import com.example.efadro.data.network.ServerHealthResponse
import com.example.efadro.data.network.WsConnectionStatus
import com.example.efadro.data.repository.EfadroRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

// ----------------------------------------------------------------------------
// Auth ViewModel
// ----------------------------------------------------------------------------

class AuthViewModel(private val repository: EfadroRepository) : ViewModel() {
    val currentUser: StateFlow<User?> = repository.currentUser
    val isAuthenticated: StateFlow<Boolean> = repository.isAuthenticated

    val serverUrl: StateFlow<String> = repository.serverUrl
    val serverHealth: StateFlow<ServerHealthResponse?> = repository.serverHealth
    val serverPingMs: StateFlow<Long?> = repository.serverPingMs
    val connectionStatus: StateFlow<WsConnectionStatus> = repository.connectionStatus

    private val _serverPassword = MutableStateFlow("")
    val serverPassword: StateFlow<String> = _serverPassword.asStateFlow()

    private val _isGatePassed = MutableStateFlow(true)
    val isGatePassed: StateFlow<Boolean> = _isGatePassed.asStateFlow()

    private val _is2FaRequired = MutableStateFlow(false)
    val is2FaRequired: StateFlow<Boolean> = _is2FaRequired.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    fun updateServerUrl(url: String) {
        repository.setServerUrl(url)
    }

    fun testServerConnection() {
        viewModelScope.launch {
            _isLoading.value = true
            repository.checkServerStatus()
            _isLoading.value = false
        }
    }

    fun updateServerPassword(pass: String) {
        _serverPassword.value = pass
    }

    fun submitGate() {
        _isGatePassed.value = true
    }

    fun login(username: String, pass: String) {
        if (username.isBlank()) {
            _errorMessage.value = "Username cannot be empty"
            return
        }
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            val result = repository.login(username, pass)
            result.onFailure {
                _errorMessage.value = it.message ?: "Authentication failed"
            }
            _isLoading.value = false
        }
    }

    fun signup(username: String, displayName: String) {
        if (username.isBlank()) {
            _errorMessage.value = "Username cannot be empty"
            return
        }
        viewModelScope.launch {
            _isLoading.value = true
            _errorMessage.value = null
            val result = repository.signup(username, displayName)
            result.onFailure {
                _errorMessage.value = it.message ?: "Signup failed"
            }
            _isLoading.value = false
        }
    }

    fun switchUser(user: User) {
        viewModelScope.launch {
            repository.switchUser(user)
        }
    }

    fun logout() {
        repository.logout()
    }
}

// ----------------------------------------------------------------------------
// Chat ViewModel
// ----------------------------------------------------------------------------

class ChatViewModel(private val repository: EfadroRepository) : ViewModel() {
    val currentUser: StateFlow<User?> = repository.currentUser

    val allChats: StateFlow<List<Chat>> = repository.getAllChats()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val connectionStatus: StateFlow<WsConnectionStatus> = repository.connectionStatus
    val serverPingMs: StateFlow<Long?> = repository.serverPingMs
    val activeTypingMap: StateFlow<Map<String, String>> = repository.activeTypingMap

    private val _selectedChatId = MutableStateFlow<String?>(null)
    val selectedChatId: StateFlow<String?> = _selectedChatId.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _globalSearchResults = MutableStateFlow<List<Message>>(emptyList())
    val globalSearchResults: StateFlow<List<Message>> = _globalSearchResults.asStateFlow()

    private val _userSearchResults = MutableStateFlow<List<User>>(emptyList())
    val userSearchResults: StateFlow<List<User>> = _userSearchResults.asStateFlow()

    private val _inChatSearchQuery = MutableStateFlow("")
    val inChatSearchQuery: StateFlow<String> = _inChatSearchQuery.asStateFlow()

    fun setSelectedChat(chatId: String) {
        _selectedChatId.value = chatId
        viewModelScope.launch {
            repository.markChatRead(chatId)
        }
    }

    fun getMessagesForChat(chatId: String) = repository.getMessagesForChat(chatId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun getChatById(chatId: String) = repository.getChatById(chatId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    fun onSearchQueryChange(query: String) {
        _searchQuery.value = query
        if (query.length >= 2) {
            viewModelScope.launch {
                repository.searchMessagesGlobal(query).collect {
                    _globalSearchResults.value = it
                }
            }
            viewModelScope.launch {
                repository.searchUsers(query).collect {
                    _userSearchResults.value = it
                }
            }
        } else {
            _globalSearchResults.value = emptyList()
            _userSearchResults.value = emptyList()
        }
    }

    fun onInChatSearchChange(query: String) {
        _inChatSearchQuery.value = query
    }

    fun onUserTyping(chatId: String, isTyping: Boolean) {
        repository.sendTypingState(chatId, isTyping)
    }

    fun sendMessage(chatId: String, content: String, replyTo: Message? = null) {
        if (content.isBlank()) return
        viewModelScope.launch {
            repository.sendMessage(chatId, content, replyTo)
        }
    }

    fun sendVoice(chatId: String, durationSec: Int) {
        viewModelScope.launch {
            repository.sendVoiceMessage(chatId, durationSec)
        }
    }

    fun sendFile(chatId: String, fileName: String, fileSize: String, isImage: Boolean = false) {
        viewModelScope.launch {
            repository.sendFileMessage(chatId, fileName, fileSize, isImage)
        }
    }

    fun createPoll(chatId: String, question: String, options: List<String>) {
        viewModelScope.launch {
            repository.createPoll(chatId, question, options)
        }
    }

    fun votePoll(messageId: String, optionId: String) {
        viewModelScope.launch {
            repository.voteInPoll(messageId, optionId)
        }
    }

    fun toggleReaction(messageId: String, emoji: String) {
        viewModelScope.launch {
            repository.toggleReaction(messageId, emoji)
        }
    }

    fun editMessage(messageId: String, newContent: String) {
        viewModelScope.launch {
            repository.editMessage(messageId, newContent)
        }
    }

    fun deleteMessage(messageId: String) {
        viewModelScope.launch {
            repository.deleteMessage(messageId)
        }
    }

    fun pinMessage(chatId: String, messageId: String, pin: Boolean) {
        viewModelScope.launch {
            repository.pinMessage(chatId, messageId, pin)
        }
    }

    fun forwardMessage(messageId: String, targetChatId: String) {
        viewModelScope.launch {
            repository.forwardMessage(messageId, targetChatId)
        }
    }

    fun reportMessage(messageId: String, reason: String) {
        viewModelScope.launch {
            repository.reportMessage(messageId, reason)
        }
    }

    fun togglePinChat(chatId: String, current: Boolean) {
        viewModelScope.launch { repository.togglePinChat(chatId, current) }
    }

    fun toggleMuteChat(chatId: String, current: Boolean) {
        viewModelScope.launch { repository.toggleMuteChat(chatId, current) }
    }

    fun toggleArchiveChat(chatId: String, current: Boolean) {
        viewModelScope.launch { repository.toggleArchiveChat(chatId, current) }
    }

    fun deleteChat(chatId: String) {
        viewModelScope.launch { repository.deleteChat(chatId) }
    }

    fun createDm(peerUser: User, onCreated: (String) -> Unit) {
        viewModelScope.launch {
            val chatId = repository.createDirectChat(peerUser)
            onCreated(chatId)
        }
    }

    fun createGroup(name: String, description: String, onCreated: (String) -> Unit) {
        viewModelScope.launch {
            val chatId = repository.createGroupChat(name, description)
            onCreated(chatId)
        }
    }

    fun rotateInviteLink(chatId: String) {
        viewModelScope.launch {
            repository.rotateInviteLink(chatId)
        }
    }
}

// ----------------------------------------------------------------------------
// Call ViewModel (1:1 WebRTC Voice & Video Calls)
// ----------------------------------------------------------------------------

enum class CallState {
    IDLE, OUTGOING_RINGING, INCOMING_RINGING, CONNECTED, ENDED
}

class CallViewModel(private val repository: EfadroRepository) : ViewModel() {
    private val _callState = MutableStateFlow(CallState.IDLE)
    val callState: StateFlow<CallState> = _callState.asStateFlow()

    private val _activeChatId = MutableStateFlow<String?>(null)
    val activeChatId: StateFlow<String?> = _activeChatId.asStateFlow()

    private val _peerName = MutableStateFlow("")
    val peerName: StateFlow<String> = _peerName.asStateFlow()

    private val _isVideo = MutableStateFlow(false)
    val isVideo: StateFlow<Boolean> = _isVideo.asStateFlow()

    private val _isMicMuted = MutableStateFlow(false)
    val isMicMuted: StateFlow<Boolean> = _isMicMuted.asStateFlow()

    private val _isCameraOn = MutableStateFlow(true)
    val isCameraOn: StateFlow<Boolean> = _isCameraOn.asStateFlow()

    private val _isSpeakerOn = MutableStateFlow(false)
    val isSpeakerOn: StateFlow<Boolean> = _isSpeakerOn.asStateFlow()

    private val _callSeconds = MutableStateFlow(0)
    val callSeconds: StateFlow<Int> = _callSeconds.asStateFlow()

    private var timerJob: Job? = null

    fun startCall(chatId: String, peer: String, video: Boolean) {
        _activeChatId.value = chatId
        _peerName.value = peer
        _isVideo.value = video
        _isMicMuted.value = false
        _isCameraOn.value = video
        _isSpeakerOn.value = video
        _callSeconds.value = 0
        _callState.value = CallState.OUTGOING_RINGING

        // Signal over WebSocket
        repository.webSocketClient.sendCallSignal(chatId, if (video) "VIDEO_CALL_OFFER" else "VOICE_CALL_OFFER", peer)

        viewModelScope.launch {
            delay(2000)
            if (_callState.value == CallState.OUTGOING_RINGING) {
                _callState.value = CallState.CONNECTED
                startTimer()
            }
        }
    }

    private fun startTimer() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            while (_callState.value == CallState.CONNECTED) {
                delay(1000)
                _callSeconds.value += 1
            }
        }
    }

    fun toggleMute() {
        _isMicMuted.value = !_isMicMuted.value
    }

    fun toggleCamera() {
        _isCameraOn.value = !_isCameraOn.value
    }

    fun toggleSpeaker() {
        _isSpeakerOn.value = !_isSpeakerOn.value
    }

    fun endCall() {
        val duration = _callSeconds.value
        val durationFormatted = String.format("%02d:%02d", duration / 60, duration % 60)
        val chatId = _activeChatId.value
        val isVideoCall = _isVideo.value

        timerJob?.cancel()
        _callState.value = CallState.ENDED

        if (chatId != null) {
            repository.webSocketClient.sendCallSignal(chatId, "CALL_HANGUP", "Duration: $durationFormatted")
            viewModelScope.launch {
                repository.logCall(chatId, durationFormatted, isVideoCall, duration == 0)
            }
        }
    }

    fun resetCall() {
        timerJob?.cancel()
        _callState.value = CallState.IDLE
        _callSeconds.value = 0
    }
}

// ----------------------------------------------------------------------------
// Admin / Staff ViewModel
// ----------------------------------------------------------------------------

class AdminViewModel(private val repository: EfadroRepository) : ViewModel() {
    val users: StateFlow<List<User>> = repository.getAllUsers()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val reports: StateFlow<List<ReportItem>> = repository.getAllReports()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val auditLogs: StateFlow<List<AuditLogItem>> = repository.getAllAuditLogs()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val serverConfig: StateFlow<ServerConfig?> = repository.getServerConfig()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    fun setRole(userId: String, role: UserRole) {
        viewModelScope.launch { repository.setUserRole(userId, role) }
    }

    fun setMuted(userId: String, muted: Boolean) {
        viewModelScope.launch { repository.setUserMuted(userId, muted) }
    }

    fun setBanned(userId: String, banned: Boolean) {
        viewModelScope.launch { repository.setUserBanned(userId, banned) }
    }

    fun resolveReport(reportId: String, status: String) {
        viewModelScope.launch { repository.resolveReport(reportId, status) }
    }

    fun updateConfig(config: ServerConfig) {
        viewModelScope.launch { repository.updateServerConfig(config) }
    }

    fun rotateJwtSecret() {
        viewModelScope.launch { repository.rotateSecret() }
    }
}

// ----------------------------------------------------------------------------
// Settings & Privacy ViewModel
// ----------------------------------------------------------------------------

class SettingsViewModel(private val repository: EfadroRepository) : ViewModel() {
    val currentUser: StateFlow<User?> = repository.currentUser
    val serverUrl: StateFlow<String> = repository.serverUrl
    val serverHealth: StateFlow<ServerHealthResponse?> = repository.serverHealth
    val serverPingMs: StateFlow<Long?> = repository.serverPingMs
    val connectionStatus: StateFlow<WsConnectionStatus> = repository.connectionStatus

    val blockedUsers: StateFlow<List<User>> = repository.getBlockedUsers()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun updateServerUrl(newUrl: String) {
        repository.setServerUrl(newUrl)
    }

    fun testConnection() {
        viewModelScope.launch {
            repository.checkServerStatus()
        }
    }

    fun updateProfile(displayName: String, bio: String) {
        viewModelScope.launch { repository.updateProfile(displayName, bio) }
    }

    fun toggle2Fa(enabled: Boolean) {
        viewModelScope.launch { repository.toggle2Fa(enabled) }
    }

    fun blockUser(userId: String) {
        viewModelScope.launch { repository.blockUser(userId) }
    }

    fun unblockUser(userId: String) {
        viewModelScope.launch { repository.unblockUser(userId) }
    }
}

// ----------------------------------------------------------------------------
// ViewModel Factory Provider
// ----------------------------------------------------------------------------

class EfadroViewModelFactory(private val repository: EfadroRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return when {
            modelClass.isAssignableFrom(AuthViewModel::class.java) -> AuthViewModel(repository) as T
            modelClass.isAssignableFrom(ChatViewModel::class.java) -> ChatViewModel(repository) as T
            modelClass.isAssignableFrom(CallViewModel::class.java) -> CallViewModel(repository) as T
            modelClass.isAssignableFrom(AdminViewModel::class.java) -> AdminViewModel(repository) as T
            modelClass.isAssignableFrom(SettingsViewModel::class.java) -> SettingsViewModel(repository) as T
            else -> throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
        }
    }
}
