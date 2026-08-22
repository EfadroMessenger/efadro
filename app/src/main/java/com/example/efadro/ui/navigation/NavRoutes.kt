package com.example.efadro.ui.navigation

import kotlinx.serialization.Serializable

sealed interface Screen {
    @Serializable
    data object Auth : Screen

    @Serializable
    data object ChatList : Screen

    @Serializable
    data class ChatRoom(val chatId: String) : Screen

    @Serializable
    data class Call(val chatId: String, val peerName: String, val isVideo: Boolean) : Screen

    @Serializable
    data class GroupDetails(val chatId: String) : Screen

    @Serializable
    data class UserProfile(val userId: String) : Screen

    @Serializable
    data object Settings : Screen

    @Serializable
    data object StaffPanel : Screen

    @Serializable
    data object TwoFactorSetup : Screen

    @Serializable
    data class E2eeInfo(val chatId: String) : Screen
}
