package com.raj.lifeos.applimit

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import java.util.Calendar
import java.util.concurrent.Executors

internal const val NIGHT_QUIET_START_HOUR = 23
internal const val NIGHT_QUIET_END_HOUR = 7

internal data class DecideInput(
  val limits: List<AppLimit>,
  val usedMs: Map<String, Long>,
  val foreground: String?,
  val selfPackage: String,
  val blockShowingFor: String?,
  val nightQuiet: Boolean = false,
)

internal data class Decision(
  val overlayLabel: String?,
  val overlayRemainingMs: Long,
  val block: AppLimit?,
  val blockUsedMs: Long,
  val blockNight: Boolean,
  val dismissBlock: Boolean,
  val statusText: String,
)

// 11:00 PM through 6:59 AM, on the phone's local clock. At 7:00 AM the daily
// budget applies again.
internal fun isNightQuiet(calendar: Calendar): Boolean {
  val minutes = calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE)
  return minutes >= NIGHT_QUIET_START_HOUR * 60 || minutes < NIGHT_QUIET_END_HOUR * 60
}

// One foreground app, one daily budget. The accessibility service (or the
// fallback watcher) calls this about once a second and again on each app switch.
internal fun decide(input: DecideInput): Decision {
  val fg = input.foreground
  val limit = input.limits.find { it.packageName == fg }
  val used = if (limit != null) input.usedMs[limit.packageName] ?: 0L else 0L
  val remaining = if (limit != null) limit.limitMs - used else 0L
  val night = input.nightQuiet && limit != null && fg != input.selfPackage
  val over = limit != null && remaining <= 0L
  val under = limit != null && remaining > 0L && fg != input.selfPackage && !input.nightQuiet

  val showing = input.blockShowingFor
  val shown = input.limits.find { it.packageName == showing }
  val shownUsed = if (showing != null) input.usedMs[showing] ?: 0L else 0L
  val shownStillBlocked = shown != null && (input.nightQuiet || shownUsed >= shown.limitMs)
  val dismiss = showing != null && !shownStillBlocked
  val launch = (over || night) && limit != null && showing != limit.packageName

  val status = when {
    night && limit != null -> "${limit.label} is off until 7:00 AM"
    launch && limit != null -> "${limit.label} is blocked for today"
    showing != null && !dismiss && shown != null && input.nightQuiet -> "${shown.label} is off until 7:00 AM"
    showing != null && !dismiss && shown != null -> "${shown.label} is blocked for today"
    under && limit != null -> "${limit.label} · ${formatRemainingClock(remaining)} left"
    input.nightQuiet -> "Limited apps are off until 7:00 AM"
    else -> "App limits are on"
  }
  return Decision(
    overlayLabel = if (under && !launch && limit != null) limit.label else null,
    overlayRemainingMs = if (under && !launch) remaining else 0L,
    block = if (launch) limit else null,
    blockUsedMs = used,
    blockNight = night,
    dismissBlock = dismiss && !launch,
    statusText = status,
  )
}

internal object AppLimitEnforcer {
  private val main = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "lifeos-app-limit").apply { isDaemon = true }
  }
  private val tick: Runnable = object : Runnable {
    override fun run() {
      if (!ticker) return
      val ctx = appContext ?: return
      requestScan(ctx)
      main.postDelayed(this, 1000L)
    }
  }

  private var ticker = false
  private var scanning = false
  private var dirty = false
  private var appContext: Context? = null
  private var lastLaunchAt = 0L
  private var lastLaunchPkg: String? = null

  @Volatile var accessibility: AccessibilityService? = null
  @Volatile private var hintedPackage: String? = null
  @Volatile private var hintedAt = 0L

  var onStatus: ((String) -> Unit)? = null

  fun noteForeground(packageName: String?) {
    if (packageName.isNullOrBlank()) return
    hintedPackage = packageName
    hintedAt = System.currentTimeMillis()
  }

  fun attach(service: AccessibilityService) {
    accessibility = service
    AppLimitMonitorService.stop(service)
    ensureTicker(service)
    requestScan(service)
  }

  fun detach(service: AccessibilityService) {
    if (accessibility === service) accessibility = null
    AppLimitOverlay.hide()
    val ctx = service.applicationContext
    if (AppLimitStore.load(ctx).isNotEmpty() && !AppLimitUsage.isAccessibilityEnabled(ctx)) {
      AppLimitMonitorService.start(ctx)
    } else if (AppLimitStore.load(ctx).isEmpty()) {
      onLimitsCleared(ctx)
    }
  }

  fun ensureTicker(context: Context) {
    appContext = context.applicationContext
    if (ticker) return
    ticker = true
    main.post(tick)
  }

  fun onLimitsCleared(context: Context) {
    ticker = false
    main.removeCallbacks(tick)
    AppLimitOverlay.hide()
    dismissBlock(context.applicationContext)
  }

  fun requestScan(context: Context) {
    val app = context.applicationContext
    main.post {
      appContext = app
      if (scanning) {
        dirty = true
        return@post
      }
      scanning = true
      worker.execute {
        val decision = try {
          buildDecision(app)
        } catch (_: Exception) {
          null
        }
        main.post {
          scanning = false
          if (decision != null) {
            try {
              apply(app, decision)
            } catch (_: Exception) {
            }
          }
          if (dirty) {
            dirty = false
            requestScan(app)
          }
        }
      }
    }
  }

  private fun buildDecision(context: Context): Decision {
    val limits = AppLimitStore.load(context)
    val nightQuiet = isNightQuiet(Calendar.getInstance())
    if (limits.isEmpty()) {
      return Decision(null, 0L, null, 0L, false, true, "App limits are on")
    }
    val now = System.currentTimeMillis()
    val hint = hintedPackage
    val hintFresh = !hint.isNullOrBlank() && now - hintedAt < 8_000L
    if (!AppLimitUsage.hasUsageAccess(context)) {
      if (!nightQuiet) {
        return Decision(null, 0L, null, 0L, false, false, "Allow usage access to count app time")
      }
      return decide(
        DecideInput(
          limits = limits,
          usedMs = emptyMap(),
          foreground = if (hintFresh) hint else null,
          selfPackage = context.packageName,
          blockShowingFor = AppBlockActivity.resumedPackage,
          nightQuiet = true,
        )
      )
    }
    val snapshot = AppLimitUsage.snapshot(context, limits.map { it.packageName }.toSet())
    // A fresh window event is the app they just opened. Usage events catch
    // up a moment later and then keep the countdown moving while they stay there.
    val foreground = if (hintFresh) hint else snapshot.foreground
    return decide(
      DecideInput(
        limits = limits,
        usedMs = snapshot.usedMs,
        foreground = foreground,
        selfPackage = context.packageName,
        blockShowingFor = AppBlockActivity.resumedPackage,
        nightQuiet = nightQuiet,
      )
    )
  }

  private fun apply(context: Context, decision: Decision) {
    val block = decision.block
    val suppressed = block != null &&
      block.packageName == AppBlockActivity.suppressPackage &&
      System.currentTimeMillis() < AppBlockActivity.suppressUntil
    if (block != null && !suppressed) launchBlock(context, block, decision.blockUsedMs, decision.blockNight)
    else if (decision.dismissBlock) dismissBlock(context)

    val a11y = accessibility
    if (decision.overlayLabel != null) {
      val host = a11y ?: context
      val shown = AppLimitOverlay.show(host, a11y != null, decision.overlayLabel, decision.overlayRemainingMs)
      if (!shown) AppLimitOverlay.hide()
    } else {
      AppLimitOverlay.hide()
    }
    try {
      onStatus?.invoke(decision.statusText)
    } catch (_: Exception) {
    }
  }

  private fun launchBlock(context: Context, limit: AppLimit, usedMs: Long, night: Boolean) {
    if (AppBlockActivity.resumedPackage == limit.packageName) return
    val now = System.currentTimeMillis()
    if (lastLaunchPkg == limit.packageName && now - lastLaunchAt < 1500L) return
    lastLaunchAt = now
    lastLaunchPkg = limit.packageName
    val intent = Intent(context, AppBlockActivity::class.java).apply {
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_CLEAR_TOP or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_NO_ANIMATION
      )
      putExtra(AppBlockActivity.EXTRA_PACKAGE, limit.packageName)
      putExtra(AppBlockActivity.EXTRA_LABEL, limit.label)
      putExtra(AppBlockActivity.EXTRA_LIMIT_MS, limit.limitMs)
      putExtra(AppBlockActivity.EXTRA_USED_MS, usedMs)
      putExtra(AppBlockActivity.EXTRA_NIGHT, night)
    }
    try {
      context.startActivity(intent)
    } catch (_: Exception) {
      try {
        accessibility?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
      } catch (_: Exception) {
      }
    }
  }

  private fun dismissBlock(context: Context) {
    if (AppBlockActivity.resumedPackage == null && !AppBlockActivity.alive) return
    val intent = Intent(context, AppBlockActivity::class.java).apply {
      action = AppBlockActivity.ACTION_DISMISS
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    try {
      context.startActivity(intent)
    } catch (_: Exception) {
    }
  }
}
