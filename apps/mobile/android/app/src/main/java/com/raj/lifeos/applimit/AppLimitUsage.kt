package com.raj.lifeos.applimit

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import android.os.Process
import android.provider.Settings
import java.util.Calendar

internal data class UsageSnapshot(
  val usedMs: Map<String, Long>,
  val foreground: String?,
)

internal object AppLimitUsage {
  // MOVE_TO_FOREGROUND / ACTIVITY_RESUMED, and MOVE_TO_BACKGROUND / ACTIVITY_PAUSED.
  // The newer names are aliases of these values, so matching both would count twice.
  private const val EVENT_FOREGROUND = 1
  private const val EVENT_BACKGROUND = 2

  fun hasUsageAccess(context: Context): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false
    val mode = try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      } else {
        // The string overload arrived in API 29. Older phones still expose the int op.
        // 43 is OP_GET_USAGE_STATS.
        val method = AppOpsManager::class.java.getMethod(
          "checkOpNoThrow",
          Int::class.javaPrimitiveType,
          Int::class.javaPrimitiveType,
          String::class.java
        )
        method.invoke(appOps, 43, Process.myUid(), context.packageName) as Int
      }
    } catch (_: Exception) {
      return false
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  fun isAccessibilityEnabled(context: Context): Boolean {
    val cr = context.contentResolver
    val master = Settings.Secure.getInt(cr, Settings.Secure.ACCESSIBILITY_ENABLED, 0) == 1
    if (!master) return false
    val enabled = Settings.Secure.getString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
    val component = android.content.ComponentName(context, AppLimitAccessibilityService::class.java)
    val full = component.flattenToString()
    val short = component.flattenToShortString()
    return enabled.split(':').any { it.equals(full, ignoreCase = true) || it.equals(short, ignoreCase = true) }
  }

  fun snapshot(context: Context, watch: Set<String>): UsageSnapshot {
    if (!hasUsageAccess(context) || watch.isEmpty()) return UsageSnapshot(emptyMap(), null)
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
      ?: return UsageSnapshot(emptyMap(), null)
    val start = startOfToday()
    val now = System.currentTimeMillis()
    val totals = HashMap<String, Long>()
    var current: String? = null
    var currentStart = start
    try {
      val events = usm.queryEvents(start, now)
      val event = UsageEvents.Event()
      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        val pkg = event.packageName ?: continue
        val at = event.timeStamp
        if (at < start || at > now + 1000L) continue
        when (event.eventType) {
          EVENT_FOREGROUND -> {
            if (current != null && current != pkg) addTime(totals, watch, current, currentStart, at, now - start)
            if (current != pkg) {
              current = pkg
              currentStart = at
            }
          }
          EVENT_BACKGROUND -> {
            if (current == pkg) {
              addTime(totals, watch, pkg, currentStart, at, now - start)
              current = null
            }
          }
        }
      }
    } catch (_: Exception) {
      current = null
    }
    if (current != null) addTime(totals, watch, current, currentStart, now, now - start)

    try {
      val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, now)
      if (stats != null) {
        for (stat in stats) {
          val pkg = stat.packageName ?: continue
          if (pkg !in watch) continue
          // Ignore a bucket that started before today so yesterday's time
          // cannot burn today's limit. Prefer whichever source is higher
          // once both are inside today.
          if (stat.firstTimeStamp < start - 60_000L) continue
          val seen = totals[pkg] ?: 0L
          if (stat.totalTimeInForeground > seen) totals[pkg] = stat.totalTimeInForeground.coerceAtMost(now - start)
        }
      }
    } catch (_: Exception) {
    }
    return UsageSnapshot(totals, current)
  }

  private fun addTime(
    totals: MutableMap<String, Long>,
    watch: Set<String>,
    pkg: String,
    from: Long,
    to: Long,
    cap: Long,
  ) {
    if (pkg !in watch || to <= from) return
    val next = ((totals[pkg] ?: 0L) + (to - from)).coerceAtMost(cap.coerceAtLeast(0L))
    totals[pkg] = next
  }

  private fun startOfToday(): Long {
    val cal = Calendar.getInstance()
    cal.set(Calendar.HOUR_OF_DAY, 0)
    cal.set(Calendar.MINUTE, 0)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    return cal.timeInMillis
  }
}
