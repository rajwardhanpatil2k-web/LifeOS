package com.raj.lifeos.wakealarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import com.raj.lifeos.R

// Foreground service so the ringing (and the process) survives Doze and an
// otherwise-killed app. The ringtone is played manually on STREAM_ALARM
// (rather than via the notification's sound) so it can loop indefinitely
// until the scan-to-dismiss screen in JS calls stopRinging().
class AlarmRingingService : Service() {
  companion object {
    const val CHANNEL_ID = "lifeos-wake-alarm"
    const val NOTIFICATION_ID = 4202
    const val ACTION_STOP = "com.raj.lifeos.wakealarm.STOP"

    @Volatile
    private var ringingFlag = false

    fun isRinging(): Boolean = ringingFlag

    fun stop(context: Context) {
      ringingFlag = false
      val intent = Intent(context, AlarmRingingService::class.java)
      intent.action = ACTION_STOP
      try {
        context.startService(intent)
      } catch (_: Exception) {
      }
    }
  }

  private var ringtone: Ringtone? = null
  private var vibrator: Vibrator? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val handler = Handler(Looper.getMainLooper())
  private var stopping = false
  private val ringtoneWatch = object : Runnable {
    override fun run() {
      if (!ringingFlag || stopping) return
      val playing = try {
        ringtone?.isPlaying == true
      } catch (_: Exception) {
        false
      }
      if (!playing) startRingtone()
      handler.postDelayed(this, 1500L)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopRinging()
      return START_NOT_STICKY
    }
    startRinging()
    return START_STICKY
  }

  private fun startRinging() {
    if (ringingFlag) return
    stopping = false
    ringingFlag = true

    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(
      PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
      "lifeos:wake-alarm"
    )
    try {
      wakeLock?.acquire(10 * 60 * 1000L)
    } catch (_: Exception) {
    }

    createChannel()
    try {
      val notification = buildNotification()
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (_: Exception) {
      // Still try to ring. Android 14 kills a service that never becomes
      // foreground, but the type above is what keeps this path alive.
    }
    startRingtone()
    handler.removeCallbacks(ringtoneWatch)
    handler.postDelayed(ringtoneWatch, 1500L)
    startVibration()
    handler.post { AlarmScheduler.launchWakeScreen(this) }
  }

  private fun startRingtone() {
    if (!ringingFlag || stopping) return
    try {
      if (ringtone?.isPlaying == true) return
    } catch (_: Exception) {
    }
    try { ringtone?.stop() } catch (_: Exception) {}
    ringtone = null
    try {
      val uri: Uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      val next = RingtoneManager.getRingtone(this, uri) ?: return
      next.audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        next.isLooping = true
      }
      next.play()
      ringtone = next
    } catch (_: Exception) {
    }
  }

  private fun startVibration() {
    val pattern = longArrayOf(0, 800, 400, 800, 400)
    try {
      vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
      } else {
        @Suppress("DEPRECATION")
        vibrator?.vibrate(pattern, 0)
      }
    } catch (_: Exception) {
    }
  }

  private fun stopRinging() {
    if (stopping) return
    stopping = true
    ringingFlag = false
    handler.removeCallbacksAndMessages(null)
    try { ringtone?.stop() } catch (_: Exception) {}
    ringtone = null
    try { vibrator?.cancel() } catch (_: Exception) {}
    vibrator = null
    try {
      wakeLock?.let { if (it.isHeld) it.release() }
    } catch (_: Exception) {
    }
    wakeLock = null
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        stopForeground(STOP_FOREGROUND_REMOVE)
      } else {
        @Suppress("DEPRECATION")
        stopForeground(true)
      }
    } catch (_: Exception) {
    }
    stopSelf()
  }

  override fun onDestroy() {
    stopRinging()
    super.onDestroy()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val channel = NotificationChannel(CHANNEL_ID, "Wake alarm", NotificationManager.IMPORTANCE_HIGH)
      channel.description = "The morning wake alarm that rings until you scan the wake code."
      channel.setSound(null, null) // ringtone is played manually so it can loop reliably
      channel.enableVibration(false) // vibration handled manually too
      channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      try {
        channel.setBypassDnd(true)
      } catch (_: Exception) {
      }
      manager.createNotificationChannel(channel)
    }
  }

  private fun immutableFlag(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_IMMUTABLE else 0

  private fun buildNotification(): Notification {
    val pendingIntent = PendingIntent.getActivity(
      this, 4203, AlarmScheduler.wakeScreenIntent(this), PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Wake up")
      .setContentText("Scan the wake code to silence the alarm.")
      .setSmallIcon(R.drawable.ic_stat_lifeos)
      .setColor(android.graphics.Color.parseColor("#D4AF6A"))
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setOngoing(true)
      .setAutoCancel(false)
      .setFullScreenIntent(pendingIntent, true)
      .setContentIntent(pendingIntent)
      .build()
  }
}
