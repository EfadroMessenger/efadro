package com.example.efadro.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Poll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.efadro.data.model.PollOption
import com.example.efadro.ui.theme.AuroraEmerald
import com.example.efadro.ui.theme.IndigoPrimary

@Composable
fun PollCard(
    question: String,
    options: List<PollOption>,
    currentUserId: String,
    onVote: (optionId: String) -> Unit,
    modifier: Modifier = Modifier
) {
    val totalVotes = options.sumOf { it.voteCount }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFF182234))
            .border(1.dp, Color(0xFF2E3D56), RoundedCornerShape(12.dp))
            .padding(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Default.Poll,
                contentDescription = null,
                tint = AuroraEmerald,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = "Anonymous Poll",
                style = MaterialTheme.typography.labelSmall,
                color = AuroraEmerald,
                fontWeight = FontWeight.SemiBold
            )
        }

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = question,
            style = MaterialTheme.typography.titleMedium,
            color = Color.White,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(10.dp))

        options.forEach { option ->
            val hasVoted = option.voterIds.contains(currentUserId)
            val percentage = if (totalVotes > 0) (option.voteCount.toFloat() / totalVotes) else 0f
            val animatedProgress by animateFloatAsState(targetValue = percentage, label = "pollProgress")

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 4.dp)
                    .height(44.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF0F172A))
                    .border(
                        1.dp,
                        if (hasVoted) IndigoPrimary else Color(0xFF334155),
                        RoundedCornerShape(8.dp)
                    )
                    .clickable { onVote(option.id) }
            ) {
                // Background percentage fill bar
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(animatedProgress)
                        .background(if (hasVoted) IndigoPrimary.copy(alpha = 0.35f) else Color(0x33475569))
                )

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .fillMaxHeight()
                        .padding(horizontal = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(18.dp)
                            .clip(CircleShape)
                            .border(1.5.dp, if (hasVoted) IndigoPrimary else Color.Gray, CircleShape)
                            .background(if (hasVoted) IndigoPrimary else Color.Transparent),
                        contentAlignment = Alignment.Center
                    ) {
                        if (hasVoted) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(12.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.width(8.dp))

                    Text(
                        text = option.text,
                        color = Color.White,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = if (hasVoted) FontWeight.Bold else FontWeight.Normal,
                        modifier = Modifier.weight(1f)
                    )

                    Text(
                        text = "${(percentage * 100).toInt()}%",
                        color = if (hasVoted) IndigoPrimary else Color(0xFF94A3B8),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = "$totalVotes ${if (totalVotes == 1) "vote" else "votes"} · Tap an option to vote or retract",
            style = MaterialTheme.typography.labelSmall,
            color = Color(0xFF64748B),
            fontSize = 11.sp
        )
    }
}
