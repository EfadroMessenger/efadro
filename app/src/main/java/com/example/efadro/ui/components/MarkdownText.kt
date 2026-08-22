package com.example.efadro.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.efadro.ui.theme.AuroraCyan
import com.example.efadro.ui.theme.IndigoLight

@Composable
fun MarkdownText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Color.Unspecified,
    fontSize: Float = 14f
) {
    // Check if text has ||spoiler|| tags
    val hasSpoiler = text.contains("||")

    if (hasSpoiler) {
        var isRevealed by remember { mutableStateOf(false) }
        val parsed = parseMarkdownSpans(text.replace("||", ""))

        Box(
            modifier = modifier
                .clickable { isRevealed = !isRevealed }
                .padding(vertical = 2.dp)
        ) {
            Text(
                text = parsed,
                color = color,
                fontSize = fontSize.sp,
                modifier = if (!isRevealed) Modifier.blur(8.dp).background(Color(0x44000000), RoundedCornerShape(4.dp)) else Modifier
            )
            if (!isRevealed) {
                Text(
                    text = "🔒 Tap to reveal spoiler",
                    style = MaterialTheme.typography.labelSmall,
                    color = AuroraCyan,
                    modifier = Modifier
                        .background(Color(0xBB111827), RoundedCornerShape(4.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }
        }
    } else {
        val parsed = parseMarkdownSpans(text)
        Text(
            text = parsed,
            color = color,
            fontSize = fontSize.sp,
            modifier = modifier
        )
    }
}

private fun parseMarkdownSpans(raw: String) = buildAnnotatedString {
    var i = 0
    val len = raw.length

    while (i < len) {
        when {
            // Bold **text**
            raw.startsWith("**", i) -> {
                val end = raw.indexOf("**", i + 2)
                if (end != -1) {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                        append(raw.substring(i + 2, end))
                    }
                    i = end + 2
                } else {
                    append(raw[i])
                    i++
                }
            }
            // Italic __text__
            raw.startsWith("__", i) -> {
                val end = raw.indexOf("__", i + 2)
                if (end != -1) {
                    withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                        append(raw.substring(i + 2, end))
                    }
                    i = end + 2
                } else {
                    append(raw[i])
                    i++
                }
            }
            // Strike ~~text~~
            raw.startsWith("~~", i) -> {
                val end = raw.indexOf("~~", i + 2)
                if (end != -1) {
                    withStyle(SpanStyle(textDecoration = TextDecoration.LineThrough)) {
                        append(raw.substring(i + 2, end))
                    }
                    i = end + 2
                } else {
                    append(raw[i])
                    i++
                }
            }
            // Code block ```code```
            raw.startsWith("```", i) -> {
                val end = raw.indexOf("```", i + 3)
                if (end != -1) {
                    withStyle(
                        SpanStyle(
                            fontFamily = FontFamily.Monospace,
                            background = Color(0x33000000),
                            fontSize = 12.sp
                        )
                    ) {
                        append(raw.substring(i + 3, end).trim())
                    }
                    i = end + 3
                } else {
                    append(raw[i])
                    i++
                }
            }
            // Inline code `code`
            raw.startsWith("`", i) -> {
                val end = raw.indexOf("`", i + 1)
                if (end != -1) {
                    withStyle(
                        SpanStyle(
                            fontFamily = FontFamily.Monospace,
                            background = Color(0x33000000),
                            color = AuroraCyan
                        )
                    ) {
                        append(raw.substring(i + 1, end))
                    }
                    i = end + 1
                } else {
                    append(raw[i])
                    i++
                }
            }
            // @mentions
            raw[i] == '@' -> {
                var j = i + 1
                while (j < len && (raw[j].isLetterOrDigit() || raw[j] == '_')) {
                    j++
                }
                if (j > i + 1) {
                    withStyle(
                        SpanStyle(
                            fontWeight = FontWeight.Bold,
                            color = IndigoLight
                        )
                    ) {
                        append(raw.substring(i, j))
                    }
                    i = j
                } else {
                    append(raw[i])
                    i++
                }
            }
            else -> {
                append(raw[i])
                i++
            }
        }
    }
}
