package com.example.efadro

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.example.efadro.ui.navigation.Screen
import com.example.efadro.ui.screens.AuthScreen
import com.example.efadro.ui.screens.CallScreen
import com.example.efadro.ui.screens.ChatListScreen
import com.example.efadro.ui.screens.ChatRoomScreen
import com.example.efadro.ui.screens.GroupDetailsScreen
import com.example.efadro.ui.screens.SettingsScreen
import com.example.efadro.ui.screens.StaffPanelScreen
import com.example.efadro.ui.screens.TwoFactorSetupScreen
import com.example.efadro.ui.screens.UserProfileScreen
import com.example.efadro.ui.theme.DarkBg
import com.example.efadro.ui.theme.EfadroTheme
import com.example.efadro.ui.viewmodel.AdminViewModel
import com.example.efadro.ui.viewmodel.AuthViewModel
import com.example.efadro.ui.viewmodel.CallViewModel
import com.example.efadro.ui.viewmodel.ChatViewModel
import com.example.efadro.ui.viewmodel.EfadroViewModelFactory
import com.example.efadro.ui.viewmodel.SettingsViewModel

class MainActivity : ComponentActivity() {

    private val repository by lazy {
        (application as EfadroApplication).repository
    }

    private val viewModelFactory by lazy {
        EfadroViewModelFactory(repository)
    }

    private val authViewModel: AuthViewModel by viewModels { viewModelFactory }
    private val chatViewModel: ChatViewModel by viewModels { viewModelFactory }
    private val callViewModel: CallViewModel by viewModels { viewModelFactory }
    private val adminViewModel: AdminViewModel by viewModels { viewModelFactory }
    private val settingsViewModel: SettingsViewModel by viewModels { viewModelFactory }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            EfadroTheme(darkTheme = true) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = DarkBg
                ) {
                    EfadroAppNav(
                        authViewModel = authViewModel,
                        chatViewModel = chatViewModel,
                        callViewModel = callViewModel,
                        adminViewModel = adminViewModel,
                        settingsViewModel = settingsViewModel
                    )
                }
            }
        }
    }
}

@Composable
fun EfadroAppNav(
    authViewModel: AuthViewModel,
    chatViewModel: ChatViewModel,
    callViewModel: CallViewModel,
    adminViewModel: AdminViewModel,
    settingsViewModel: SettingsViewModel
) {
    val navController = rememberNavController()
    val isAuthenticated by authViewModel.isAuthenticated.collectAsState()

    val startDestination: Any = if (isAuthenticated) Screen.ChatList else Screen.Auth

    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable<Screen.Auth> {
            AuthScreen(
                authViewModel = authViewModel,
                onAuthSuccess = {
                    navController.navigate(Screen.ChatList) {
                        popUpTo(Screen.Auth) { inclusive = true }
                    }
                }
            )
        }

        composable<Screen.ChatList> {
            ChatListScreen(
                chatViewModel = chatViewModel,
                onNavigateToChat = { chatId ->
                    chatViewModel.setSelectedChat(chatId)
                    navController.navigate(Screen.ChatRoom(chatId))
                },
                onNavigateToSettings = {
                    navController.navigate(Screen.Settings)
                },
                onNavigateToStaff = {
                    navController.navigate(Screen.StaffPanel)
                }
            )
        }

        composable<Screen.ChatRoom> { backStackEntry ->
            val route = backStackEntry.toRoute<Screen.ChatRoom>()
            ChatRoomScreen(
                chatId = route.chatId,
                chatViewModel = chatViewModel,
                onBack = { navController.popBackStack() },
                onNavigateToCall = { chatId, peerName, isVideo ->
                    navController.navigate(Screen.Call(chatId, peerName, isVideo))
                },
                onNavigateToGroupDetails = { chatId ->
                    navController.navigate(Screen.GroupDetails(chatId))
                },
                onNavigateToUserProfile = { userId ->
                    navController.navigate(Screen.UserProfile(userId))
                }
            )
        }

        composable<Screen.Call> { backStackEntry ->
            val route = backStackEntry.toRoute<Screen.Call>()
            CallScreen(
                chatId = route.chatId,
                peerName = route.peerName,
                isVideo = route.isVideo,
                callViewModel = callViewModel,
                onCallEnded = {
                    navController.popBackStack()
                }
            )
        }

        composable<Screen.GroupDetails> { backStackEntry ->
            val route = backStackEntry.toRoute<Screen.GroupDetails>()
            GroupDetailsScreen(
                chatId = route.chatId,
                chatViewModel = chatViewModel,
                onBack = { navController.popBackStack() }
            )
        }

        composable<Screen.UserProfile> { backStackEntry ->
            val route = backStackEntry.toRoute<Screen.UserProfile>()
            UserProfileScreen(
                userId = route.userId,
                chatViewModel = chatViewModel,
                settingsViewModel = settingsViewModel,
                onBack = { navController.popBackStack() },
                onNavigateToChat = { chatId ->
                    chatViewModel.setSelectedChat(chatId)
                    navController.navigate(Screen.ChatRoom(chatId))
                }
            )
        }

        composable<Screen.Settings> {
            SettingsScreen(
                settingsViewModel = settingsViewModel,
                authViewModel = authViewModel,
                onBack = { navController.popBackStack() },
                onNavigateTo2FaSetup = {
                    navController.navigate(Screen.TwoFactorSetup)
                },
                onNavigateToStaff = {
                    navController.navigate(Screen.StaffPanel)
                },
                onLogout = {
                    navController.navigate(Screen.Auth) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable<Screen.StaffPanel> {
            StaffPanelScreen(
                adminViewModel = adminViewModel,
                onBack = { navController.popBackStack() }
            )
        }

        composable<Screen.TwoFactorSetup> {
            TwoFactorSetupScreen(
                settingsViewModel = settingsViewModel,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
