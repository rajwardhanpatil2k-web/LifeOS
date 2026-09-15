package com.raj.lifeos.taskalert

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
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
import com.raj.lifeos.wakealarm.AlarmRingingService

// Incoming task call: looping ringtone + vibration until the user answers,
// rejects, or the unanswered timeout snoozes it. TTS happens after Answer
// from the JS/native module so the ring is never cut off by speech.
class TaskAlertService : Service() {
  companion object {
    const val CHANNEL_ID = "lifeos-task-call"
    const val NOTIFICATION_ID = 5211
    const val ACTION_STOP = "com.raj.lifeos.taskalert.STOP"
    const val ACTION_SILENCE = "com.raj.lifeos.taskalert.SILENCE"
    const val ACTION_HIDE_NOTIFICATION = "com.raj.lifeos.taskalert.HIDE_NOTIFICATION"
    const val ACTION_SHOW_NOTIFICATION = "com.raj.lifeos.taskalert.SHOW_NOTIFICATION"
    const val UNANSWERED_MS = 60_000L

    fun stop(context: Context) {
      sendAction(context, ACTION_STOP)
    }

    fun silence(context: Context) {
      sendAction(context, ACTION_SILENCE)
    }

    fun hideNotification(context: Context) {
      sendAction(context, ACTION_HIDE_NOTIFICATION)
    }

    fun showNotification(context: Context) {
      sendAction(context, ACTION_SHOW_NOTIFICATION)
    }

    private fun sendAction(context: Context, action: String) {
      val intent = Intent(context, TaskAlertService::class.java)
      intent.action = action
      try {
        context.startService(intent)
      } catch (_: Exception) {
      }
    }
  }

  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var alertLevel = "normal"
  private var title = "Life OS"
  private var itemId = ""
  private var spokenText = ""
  private var phase = TaskCallState.PHASE_START
  private var durationMin = 0
  private var domain = ""
  private val handler = Handler(Looper.getMainLooper())
  private var unansweredRunnable: Runnable? = null
  private var ringtoneWatch: Runnable? = null
  private var finished = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      finishAlert(clearState = true, parkQueue = false)
      return START_NOT_STICKY
    }
    if (intent?.action == ACTION_SILENCE) {
      silenceAudio()
      return START_STICKY
    }
    if (intent?.action == ACTION_HIDE_NOTIFICATION) {
      if (TaskCallState.inSession) postSessionNotification()
      return START_STICKY
    }
    if (intent?.action == ACTION_SHOW_NOTIFICATION) {
      if (finished) return START_STICKY
      if (TaskCallState.ringing) postCallNotification()
      else postSessionNotification()
      return START_STICKY
    }
    if (AlarmRingingService.isRinging()) {
      stopSelf()
      return START_NOT_STICKY
    }

    val isNewCall = intent?.hasExtra(TaskCallIntents.EXTRA_ID) == true
    if (!isNewCall) {
      restoreFromState()
      if (itemId.isBlank()) {
        stopSelf()
        return START_NOT_STICKY
      }
      if (TaskCallState.inSession && !TaskCallState.ringing) {
        postSessionNotification()
        return START_STICKY
      }
    } else {
      val callIntent = intent!!
      val saved = TaskCallState.read(this)
      itemId = callIntent.getStringExtra(TaskCallIntents.EXTRA_ID).orEmpty().ifBlank { saved?.id.orEmpty() }
      alertLevel = callIntent.getStringExtra(TaskCallIntents.EXTRA_ALERT_LEVEL)
        ?: saved?.alertLevel
        ?: "normal"
      title = callIntent.getStringExtra(TaskCallIntents.EXTRA_TITLE)?.trim().orEmpty()
        .ifBlank { saved?.title }
        .orEmpty()
        .ifBlank { "Life OS reminder" }
      spokenText = callIntent.getStringExtra(TaskCallIntents.EXTRA_TEXT)?.trim().orEmpty()
        .ifBlank { saved?.spokenText.orEmpty() }
      phase = callIntent.getStringExtra(TaskCallIntents.EXTRA_PHASE)
        ?: saved?.phase
        ?: TaskCallState.PHASE_START
      durationMin = callIntent.getIntExtra(TaskCallIntents.EXTRA_DURATION, saved?.durationMin ?: 0)
      domain = callIntent.getStringExtra(TaskCallIntents.EXTRA_DOMAIN).orEmpty().ifBlank { saved?.domain.orEmpty() }
    }

    if (itemId.isBlank()) {
      stopSelf()
      return START_NOT_STICKY
    }

    TaskCallState.ringing = true
    TaskCallState.inSession = false
    TaskCallState.setActive(
      this,
      TaskCallState.ActiveCall(itemId, title, spokenText, alertLevel, phase, durationMin, domain)
    )

    acquireWakeLock()
    createChannel()
    postCallNotification()
    startRingtone()
    startVibration()
    if (isNewCall) {
      handler.post { TaskCallIntents.launchScreen(this, itemId, phase, title, alertLevel, durationMin, domain) }
    }
    scheduleUnansweredTimeout()
    return START_STICKY
  }

  private fun ringtoneUri(): Uri =
    RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE)
      ?: RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)

  private fun isPlayerPlaying(): Boolean =
    try { player?.isPlaying == true } catch (_: Exception) { false }

  private fun startRingtone() {
    if (finished || !TaskCallState.ringing) return
    if (isPlayerPlaying()) {
      armRingtoneWatch()
      return
    }
    stopRingtoneOnly()
    try {
      val mp = MediaPlayer()
      mp.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .setLegacyStreamType(AudioManager.STREAM_ALARM)
          .build()
      )
      mp.isLooping = true
      mp.setDataSource(this, ringtoneUri())
      mp.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK)
      mp.setOnErrorListener { _, _, _ ->
        handler.post {
          if (!finished && TaskCallState.ringing) startRingtone()
        }
        true
      }
      mp.setOnCompletionListener { media ->
        if (finished || !TaskCallState.ringing) return@setOnCompletionListener
        try {
          media.isLooping = true
          media.start()
        } catch (_: Exception) {
          startRingtone()
        }
      }
      mp.prepare()
      mp.start()
      player = mp
    } catch (_: Exception) {
      player = null
    }
    armRingtoneWatch()
  }

  private fun armRingtoneWatch() {
    ringtoneWatch?.let { handler.removeCallbacks(it) }
    ringtoneWatch = Runnable {
      if (finished || !TaskCallState.ringing) return@Runnable
      if (!isPlayerPlaying()) startRingtone()
      else handler.postDelayed(ringtoneWatch!!, 1200L)
    }
    handler.postDelayed(ringtoneWatch!!, 1200L)
  }

  private fun stopRingtoneOnly() {
    ringtoneWatch?.let { handler.removeCallbacks(it) }
    ringtoneWatch = null
    try { player?.stop() } catch (_: Exception) {}
    try { player?.release() } catch (_: Exception) {}
    player = null
  }

  private fun startVibration() {
    val pattern = longArrayOf(0, 500, 280, 500, 280, 800, 500)
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

  private fun scheduleUnansweredTimeout() {
    unansweredRunnable?.let { handler.removeCallbacks(it) }
    unansweredRunnable = Runnable { autoSnooze() }
    handler.postDelayed(unansweredRunnable!!, UNANSWERED_MS)
  }

  private fun autoSnooze() {
    if (finished) return
    if (itemId.isNotBlank()) {
      val delay = if (phase == TaskCallState.PHASE_END) {
        TaskReminderScheduler.END_FOLLOWUP_MS
      } else {
        TaskReminderScheduler.START_SNOOZE_MS
      }
      TaskReminderScheduler.snooze(
        this,
        TaskReminderScheduler.Reminder(
          itemId, title, spokenText, alertLevel, 0L, phase, durationMin, domain
        ),
        delay
      )
    }
    finishAlert(clearState = true, parkQueue = true)
  }

  private fun restoreFromState() {
    val saved = TaskCallState.read(this) ?: return
    itemId = saved.id
    title = saved.title.ifBlank { title }
    spokenText = saved.spokenText
    alertLevel = saved.alertLevel
    phase = saved.phase
    durationMin = saved.durationMin
    domain = saved.domain
  }

  private fun silenceAudio() {
    unansweredRunnable?.let { handler.removeCallbacks(it) }
    unansweredRunnable = null
    TaskCallState.ringing = false
    TaskCallState.inSession = true
    stopRingtoneOnly()
    try { vibrator?.cancel() } catch (_: Exception) {}
    postSessionNotification()
  }

  private fun finishAlert(clearState: Boolean, parkQueue: Boolean = false) {
    if (finished) return
    finished = true
    handler.removeCallbacksAndMessages(null)
    stopRingtoneOnly()
    try { vibrator?.cancel() } catch (_: Exception) {}
    vibrator = null
    try {
      wakeLock?.let { if (it.isHeld) it.release() }
    } catch (_: Exception) {}
    wakeLock = null
    TaskCallState.ringing = false
    if (parkQueue) TaskCallQueue.parkAll(this, TaskReminderScheduler.QUEUE_RELEASE_MS)
    else TaskCallQueue.releaseNext(this)
    if (clearState) TaskCallState.clear(this)
    else TaskCallState.inSession = false
    dismissCallNotification()
    stopSelf()
  }

  private fun postCallNotification() {
    startForegroundNotification(buildNotification(incoming = true))
  }

  private fun postSessionNotification() {
    startForegroundNotification(buildNotification(incoming = false))
  }

  private fun startForegroundNotification(notification: Notification) {
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (_: Exception) {
    }
  }

  private fun dismissCallNotification() {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        stopForeground(STOP_FOREGROUND_REMOVE)
      } else {
        @Suppress("DEPRECATION")
        stopForeground(true)
      }
    } catch (_: Exception) {
    }
    try {
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION_ID)
    } catch (_: Exception) {
    }
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(
      PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
      "lifeos:task-call"
    )
    try {
      wakeLock?.acquire(2 * 60 * 1000L)
    } catch (_: Exception) {
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(CHANNEL_ID, "Life OS · Task calls", NotificationManager.IMPORTANCE_HIGH)
    channel.description = "Incoming call when a scheduled task starts or ends"
    channel.enableVibration(true)
    channel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    channel.setSound(null, null)
    try { channel.setBypassDnd(true) } catch (_: Exception) {}
    manager.createNotificationChannel(channel)
  }

  private fun immutableFlag(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_IMMUTABLE else 0

  private fun actionIntent(action: String): PendingIntent {
    val intent = Intent(this, TaskCallActionReceiver::class.java).apply {
      this.action = action
      putExtra(TaskCallIntents.EXTRA_ID, itemId)
      putExtra(TaskCallIntents.EXTRA_TITLE, title)
      putExtra(TaskCallIntents.EXTRA_TEXT, spokenText)
      putExtra(TaskCallIntents.EXTRA_ALERT_LEVEL, alertLevel)
      putExtra(TaskCallIntents.EXTRA_PHASE, phase)
      putExtra(TaskCallIntents.EXTRA_DURATION, durationMin)
      putExtra(TaskCallIntents.EXTRA_DOMAIN, domain)
    }
    val request = if (action == TaskCallActionReceiver.ACTION_ANSWER) 5214 else 5215
    return PendingIntent.getBroadcast(
      this, request, intent, PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
    )
  }

  private fun buildNotification(incoming: Boolean): Notification {
    val openPending = PendingIntent.getActivity(
      this,
      5212,
      TaskCallIntents.screenIntent(
        this, itemId, phase, title, alertLevel, durationMin, domain,
        pickedUp = !incoming
      ),
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
    )
    val subtitle = if (!incoming) {
      "Call in progress — tap to return."
    } else if (phase == TaskCallState.PHASE_END) {
      "Time's up — answer if you finished, or reject to remind you in 15 minutes."
    } else {
      "Incoming task call — answer if you're ready, or reject to snooze 5 minutes."
    }

    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(subtitle)
      .setSmallIcon(R.drawable.ic_stat_lifeos)
      .setColor(android.graphics.Color.parseColor("#D4AF6A"))
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(openPending)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setPriority(NotificationCompat.PRIORITY_MAX)

    if (incoming) {
      builder
        .setFullScreenIntent(openPending, true)
        .addAction(0, "Reject", actionIntent(TaskCallActionReceiver.ACTION_REJECT))
        .addAction(0, "Answer", actionIntent(TaskCallActionReceiver.ACTION_ANSWER))
    }
    return builder.build()
  }

  override fun onDestroy() {
    ringtoneWatch?.let { handler.removeCallbacks(it) }
    try { player?.stop() } catch (_: Exception) {}
    try { player?.release() } catch (_: Exception) {}
    player = null
    super.onDestroy()
  }
}
