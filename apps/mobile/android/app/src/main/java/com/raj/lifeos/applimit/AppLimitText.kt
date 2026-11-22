package com.raj.lifeos.applimit

import java.util.Locale

internal fun formatRemainingClock(ms: Long): String {
  val totalSec = ((ms + 999L) / 1000L).coerceAtLeast(0L)
  val h = totalSec / 3600L
  val m = (totalSec % 3600L) / 60L
  val s = totalSec % 60L
  return if (h > 0L) {
    String.format(Locale.US, "%d:%02d:%02d", h, m, s)
  } else {
    String.format(Locale.US, "%d:%02d", m, s)
  }
}

internal fun formatSpent(ms: Long): String {
  if (ms in 1..59999) return "<1m"
  val minutes = (ms / 60000L).toInt().coerceAtLeast(0)
  val h = minutes / 60
  val m = minutes % 60
  return when {
    h <= 0 -> "${m}m"
    m == 0 -> "${h}h"
    else -> "${h}h ${m}m"
  }
}
