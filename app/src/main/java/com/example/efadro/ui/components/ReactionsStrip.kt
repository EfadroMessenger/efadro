package com.example.efadro.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.efadro.data.model.ReactionItem
import com.example.efadro.ui.theme.IndigoPrimary

val QuickEmojis = listOf("👍", "❤️", "😂", "🔥", "😮", "😢")

@Composable
fun QuickReactionPicker(
    onSelectEmoji: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(Color(0xFF1E293B))
            .border(1.dp, Color(0xFF334155), CircleShape)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        QuickEmojis.forEach { emoji ->
            Text(
                text = emoji,
                fontSize = 20.sp,
                modifier = Modifier
                    .clip(CircleShape)
                    .clickable { onSelectEmoji(emoji) }
                    .padding(4.dp)
            )
        }
    }
}

@Composable
fun ReactionChipsRow(
    reactions: List<ReactionItem>,
    currentUserId: String,
    onToggleReaction: (emoji: String) -> Unit,
    modifier: Modifier = Modifier
) {
    if (reactions.isEmpty()) return

    Row(
        modifier = modifier.padding(top = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        reactions.forEach { item ->
            val hasReacted = item.userIds.contains(currentUserId)
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (hasReacted) IndigoPrimary.copy(alpha = 0.25f) else Color(0x33000000))
                    .border(
                        1.dp,
                        if (hasReacted) IndigoPrimary else Color(0x44FFFFFF),
                        RoundedCornerShape(12.dp)
                    )
                    .clickable { onToggleReaction(item.emoji) }
                    .padding(horizontal = 6.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = item.emoji, fontSize = 12.sp)
                if (item.count > 1) {
                    Spacer(modifier = Modifier.width(3.dp))
                    Text(
                        text = item.count.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (hasReacted) IndigoPrimary else Color.LightGray
                    )
                }
            }
        }
    }
}
