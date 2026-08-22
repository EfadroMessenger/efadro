package com.example.efadro.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.efadro.ui.theme.AuroraEmerald
import com.example.efadro.ui.theme.IndigoPrimary

@Composable
fun VoicePlayer(
    durationSec: Int,
    isSentByMe: Boolean,
    modifier: Modifier = Modifier
) {
    var isPlaying by remember { mutableStateOf(false) }
    var currentProgress by remember { mutableFloatStateOf(0f) }
    val progressAnim = remember { Animatable(0f) }

    LaunchedEffect(isPlaying) {
        if (isPlaying) {
            progressAnim.snapTo(currentProgress)
            val remainingSec = ((1f - currentProgress) * durationSec).toInt()
            progressAnim.animateTo(
                targetValue = 1f,
                animationSpec = tween(
                    durationMillis = (remainingSec * 1000).coerceAtLeast(100),
                    easing = LinearEasing
                )
            ) {
                currentProgress = value
            }
            isPlaying = false
            currentProgress = 0f
        }
    }

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (isSentByMe) Color(0x33000000) else Color(0x22FFFFFF))
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(
            onClick = { isPlaying = !isPlaying },
            modifier = Modifier
                .size(36.dp)
                .background(if (isSentByMe) Color.White else IndigoPrimary, CircleShape)
        ) {
            Icon(
                imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                contentDescription = if (isPlaying) "Pause" else "Play",
                tint = if (isSentByMe) IndigoPrimary else Color.White,
                modifier = Modifier.size(20.dp)
            )
        }

        Spacer(modifier = Modifier.width(8.dp))

        Column(modifier = Modifier.weight(1f)) {
            // Simulated audio waveform visualization
            Row(
                modifier = Modifier.fillMaxWidth().height(18.dp),
                horizontalArrangement = Arrangement.spacedBy(2.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val barHeights = listOf(6, 12, 16, 8, 14, 18, 10, 15, 12, 8, 14, 18, 11, 7, 13, 16, 10, 6)
                barHeights.forEachIndexed { index, h ->
                    val fraction = index.toFloat() / barHeights.size
                    val isPast = fraction <= progressAnim.value
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(h.dp)
                            .clip(RoundedCornerShape(1.dp))
                            .background(
                                if (isPast) AuroraEmerald
                                else if (isSentByMe) Color.White.copy(alpha = 0.5f)
                                else Color.LightGray.copy(alpha = 0.5f)
                            )
                    )
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                val elapsedSec = (progressAnim.value * durationSec).toInt()
                Text(
                    text = String.format("%02d:%02d", elapsedSec / 60, elapsedSec % 60),
                    style = MaterialTheme.typography.labelSmall,
                    fontSize = 10.sp,
                    color = if (isSentByMe) Color.White.copy(alpha = 0.8f) else Color.LightGray
                )
                Text(
                    text = String.format("%02d:%02d", durationSec / 60, durationSec % 60),
                    style = MaterialTheme.typography.labelSmall,
                    fontSize = 10.sp,
                    color = if (isSentByMe) Color.White.copy(alpha = 0.8f) else Color.LightGray
                )
            }
        }
    }
}
