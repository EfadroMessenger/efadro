package com.example.efadro.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material.icons.filled.VolumeDown
import androidx.compose.material.icons.filled.VolumeUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.efadro.ui.theme.AuroraCyan
import com.example.efadro.ui.theme.AuroraEmerald
import com.example.efadro.ui.theme.DangerRed
import com.example.efadro.ui.theme.DarkBg
import com.example.efadro.ui.theme.E2eeGold
import com.example.efadro.ui.theme.IndigoPrimary
import com.example.efadro.ui.viewmodel.CallState
import com.example.efadro.ui.viewmodel.CallViewModel

@Composable
fun CallScreen(
    chatId: String,
    peerName: String,
    isVideo: Boolean,
    callViewModel: CallViewModel,
    onCallEnded: () -> Unit
) {
    val callState by callViewModel.callState.collectAsState()
    val isMicMuted by callViewModel.isMicMuted.collectAsState()
    val isCameraOn by callViewModel.isCameraOn.collectAsState()
    val isSpeakerOn by callViewModel.isSpeakerOn.collectAsState()
    val callSeconds by callViewModel.callSeconds.collectAsState()

    LaunchedEffect(chatId) {
        callViewModel.startCall(chatId, peerName, isVideo)
    }

    if (callState == CallState.ENDED) {
        LaunchedEffect(Unit) {
            onCallEnded()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBg)
    ) {
        // Video Preview / Camera simulation
        if (isVideo && isCameraOn) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFF0F172A)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "WebRTC Video Stream · P2P DTLS-SRTP",
                    color = Color.DarkGray,
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            // Local PiP Mirror
            Box(
                modifier = Modifier
                    .padding(top = 48.dp, end = 20.dp)
                    .width(100.dp)
                    .height(140.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF1E293B))
                    .border(2.dp, IndigoPrimary, RoundedCornerShape(12.dp))
                    .align(Alignment.TopEnd),
                contentAlignment = Alignment.Center
            ) {
                Text("You", color = Color.White, style = MaterialTheme.typography.labelSmall)
            }
        }

        // Call UI Overlay
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp, vertical = 54.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Header Info
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Lock, contentDescription = null, tint = E2eeGold, modifier = Modifier.size(14.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "End-to-End Encrypted WebRTC",
                        style = MaterialTheme.typography.labelSmall,
                        color = E2eeGold
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                Box(
                    modifier = Modifier
                        .size(90.dp)
                        .clip(CircleShape)
                        .background(IndigoPrimary),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = peerName.take(1).uppercase(),
                        color = Color.White,
                        fontSize = 36.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = peerName,
                    style = MaterialTheme.typography.displayMedium,
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(6.dp))

                Text(
                    text = when (callState) {
                        CallState.OUTGOING_RINGING -> "Ringing peer..."
                        CallState.CONNECTED -> String.format("%02d:%02d", callSeconds / 60, callSeconds % 60)
                        CallState.ENDED -> "Call Ended"
                        else -> "Connecting..."
                    },
                    style = MaterialTheme.typography.titleMedium,
                    color = if (callState == CallState.CONNECTED) AuroraEmerald else AuroraCyan,
                    fontWeight = FontWeight.SemiBold
                )
            }

            // Controls Bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(32.dp))
                    .background(Color(0xFF1E293B))
                    .padding(vertical = 14.dp, horizontal = 20.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Mic toggle
                IconButton(
                    onClick = { callViewModel.toggleMute() },
                    modifier = Modifier
                        .size(52.dp)
                        .clip(CircleShape)
                        .background(if (isMicMuted) DangerRed else Color(0xFF334155))
                ) {
                    Icon(
                        imageVector = if (isMicMuted) Icons.Default.MicOff else Icons.Default.Mic,
                        contentDescription = "Mute Mic",
                        tint = Color.White
                    )
                }

                // Camera toggle (video calls)
                if (isVideo) {
                    IconButton(
                        onClick = { callViewModel.toggleCamera() },
                        modifier = Modifier
                            .size(52.dp)
                            .clip(CircleShape)
                            .background(if (!isCameraOn) DangerRed else Color(0xFF334155))
                    ) {
                        Icon(
                            imageVector = if (!isCameraOn) Icons.Default.VideocamOff else Icons.Default.Videocam,
                            contentDescription = "Toggle Video",
                            tint = Color.White
                        )
                    }
                }

                // Speaker toggle
                IconButton(
                    onClick = { callViewModel.toggleSpeaker() },
                    modifier = Modifier
                        .size(52.dp)
                        .clip(CircleShape)
                        .background(if (isSpeakerOn) IndigoPrimary else Color(0xFF334155))
                ) {
                    Icon(
                        imageVector = if (isSpeakerOn) Icons.Default.VolumeUp else Icons.Default.VolumeDown,
                        contentDescription = "Speaker",
                        tint = Color.White
                    )
                }

                // Hang up button
                IconButton(
                    onClick = {
                        callViewModel.endCall()
                        onCallEnded()
                    },
                    modifier = Modifier
                        .size(52.dp)
                        .clip(CircleShape)
                        .background(DangerRed)
                        .testTag("hangup_button")
                ) {
                    Icon(
                        imageVector = Icons.Default.CallEnd,
                        contentDescription = "Hang Up",
                        tint = Color.White
                    )
                }
            }
        }
    }
}
