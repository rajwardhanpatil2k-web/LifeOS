package com.raj.lifeos.applimit

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.raj.lifeos.MainActivity
import com.raj.lifeos.R

// Fallback for when the accessibility service is off. Android can stop this
// kind of watcher after several hours, which is why the settings screen asks
// for App limits access when the block has to hold for the whole day.
class AppLimitMonitorService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val stop = intent?.action == ACTION_STOP
    val limits = try {
      AppLimitStore.load(this)
    } catch (_: Exception) {
      emptyList()
    }
    val handoff = try {
      AppLimitUsage.isAccessibilityEnabled(this)
    } catch (_: Exception) {
      false
    }
    val keep = !stop && limits.isNotEmpty() && !handoff
    try {
      startAsForeground("App limits are on")
    } catch (_: Exception) {
      running = false
      stopSelf()
      return START_NOT_STICKY
    }
    if (keep) {
      running = true
      AppLimitEnforcer.onStatus = { text -> updateNotification(text) }
      AppLimitEnforcer.ensureTicker(this)
      AppLimitEnforcer.requestScan(this)
      return START_STICKY
    }
    running = false
    AppLimitEnforcer.onStatus = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    if (limits.isEmpty()) AppLimitEnforcer.onLimitsCleared(this)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    if (AppLimitEnforcer.onStatus != null) AppLimitEnforcer.onStatus = null
    super.onDestroy()
  }

  private fun updateNotification(text: String) {
    if (!running || text == lastText) return
    lastText = text
    val manager = getSystemService(NotificationManager::class.java) ?: return
    manager.notify(NOTIFICATION_ID, buildNotification(text))
  }

  private fun startAsForeground(text: String) {
    lastText = text
    val notification = buildNotification(text)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(text: String): Notification {
    ensureChannel()
    val open = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val pending = PendingIntent.getActivity(
      this,
      77,
      open,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_lifeos)
      .setContentTitle("App limits")
      .setContentText(text)
      .setContentIntent(pending)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "App limits", NotificationManager.IMPORTANCE_LOW)
    channel.description = "Shows the time left on apps you limited."
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  companion object {
    private const val CHANNEL_ID = "lifeos-app-limits"
    private const val NOTIFICATION_ID = 5310
    private const val ACTION_STOP = "com.raj.lifeos.applimit.STOP"

    @Volatile var running = false
    private var lastText: String? = null

    fun sync(context: Context) {
      try {
        val app = context.applicationContext
        val limits = AppLimitStore.load(app)
        if (limits.isEmpty()) {
          stop(app)
          AppLimitEnforcer.onLimitsCleared(app)
          return
        }
        if (AppLimitUsage.isAccessibilityEnabled(app) || AppLimitEnforcer.accessibility != null) {
          if (running) stop(app)
          AppLimitEnforcer.ensureTicker(app)
          return
        }
        if (!running) start(app) else AppLimitEnforcer.ensureTicker(app)
      } catch (_: Exception) {
      }
    }

    fun start(context: Context) {
      val intent = Intent(context.applicationContext, AppLimitMonitorService::class.java)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.applicationContext.startForegroundService(intent)
        } else {
          context.applicationContext.startService(intent)
        }
      } catch (_: Exception) {
      }
    }

    fun stop(context: Context) {
      if (!running) return
      val intent = Intent(context.applicationContext, AppLimitMonitorService::class.java).setAction(ACTION_STOP)
      try {
        context.applicationContext.startService(intent)
      } catch (_: Exception) {
      }
    }
  }
}
