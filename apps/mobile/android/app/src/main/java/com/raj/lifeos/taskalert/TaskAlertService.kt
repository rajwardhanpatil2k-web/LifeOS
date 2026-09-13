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
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.core.app.NotificationCompat
import com.raj.lifeos.R
import com.raj.lifeos.wakealarm.AlarmRingingService
import java.util.Locale

// Incoming task call: looping ringtone + vibration + spoken cue until the
// user answers, rejects, or the unanswered timeout snoozes it.
class TaskAlertService : Service(), TextToSpeech.OnInitListener {
  companion object {
    const val CHANNEL_ID = "lifeos-task-call"
    const val NOTIFICATION_ID = 5211
    const val ACTION_STOP = "com.raj.lifeos.taskalert.STOP"
    const val ACTION_HIDE_NOTIFICATION = "com.raj.lifeos.taskalert.HIDE_NOTIFICATION"
    const val ACTION_SHOW_NOTIFICATION = "com.raj.lifeos.taskalert.SHOW_NOTIFICATION"
    const val UNANSWERED_MS = 60_000L

    fun stop(context: Context) {
      sendAction(context, ACTION_STOP)
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

  private var ringtone: Ringtone? = null
  private var vibrator: Vibrator? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var tts: TextToSpeech? = null
  private var ttsReady = false
  private var pendingSpeech: String? = null
  private var alertLevel = "normal"
  private var title = "Life OS"
  private var itemId = ""
  private var spokenText = ""
  private var phase = TaskCallState.PHASE_START
  private var durationMin = 0
  private var domain = ""
  private val handler = Handler(Looper.getMainLooper())
  private var unansweredRunnable: Runnable? = null
  private var finished = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      finishAlert(clearState = true)
      return START_NOT_STICKY
    }
    if (intent?.action == ACTION_HIDE_NOTIFICATION) {
      dismissCallNotification()
      return START_STICKY
    }
    if (intent?.action == ACTION_SHOW_NOTIFICATION) {
      if (!finished && TaskCallState.ringing) postCallNotification()
      return START_STICKY
    }
    if (AlarmRingingService.isRinging()) {
      stopSelf()
      return START_NOT_STICKY
    }

    val saved = TaskCallState.read(this)
    itemId = intent?.getStringExtra(TaskCallIntents.EXTRA_ID).orEmpty().ifBlank { saved?.id.orEmpty() }
    alertLevel = intent?.getStringExtra(TaskCallIntents.EXTRA_ALERT_LEVEL)
      ?: saved?.alertLevel
      ?: "normal"
    title = intent?.getStringExtra(TaskCallIntents.EXTRA_TITLE)?.trim().orEmpty()
      .ifBlank { saved?.title }
      .orEmpty()
      .ifBlank { "Life OS reminder" }
    spokenText = intent?.getStringExtra(TaskCallIntents.EXTRA_TEXT)?.trim().orEmpty()
      .ifBlank { saved?.spokenText.orEmpty() }
    pendingSpeech = spokenText.ifBlank { null }
    phase = intent?.getStringExtra(TaskCallIntents.EXTRA_PHASE)
      ?: saved?.phase
      ?: TaskCallState.PHASE_START
    durationMin = intent?.getIntExtra(TaskCallIntents.EXTRA_DURATION, saved?.durationMin ?: 0) ?: 0
    domain = intent?.getStringExtra(TaskCallIntents.EXTRA_DOMAIN).orEmpty().ifBlank { saved?.domain.orEmpty() }
    if (itemId.isBlank()) {
      stopSelf()
      return START_NOT_STICKY
    }

    TaskCallState.ringing = true
    TaskCallState.setActive(
      this,
      TaskCallState.ActiveCall(itemId, title, spokenText, alertLevel, phase, durationMin, domain)
    )

    acquireWakeLock()
    createChannel()
    postCallNotification()
    startRingtone()
    startVibration()
    handler.post { TaskCallIntents.launchScreen(this, itemId, phase, title, alertLevel, durationMin, domain) }

    if (pendingSpeech != null) {
      if (tts == null) tts = TextToSpeech(applicationContext, this)
      else if (ttsReady) speakPending()
    }
    scheduleUnansweredTimeout()
    return START_STICKY
  }

  override fun onInit(status: Int) {
    if (status != TextToSpeech.SUCCESS) return
    val engine = tts ?: return
    try {
      engine.language = Locale("en", "IN")
    } catch (_: Exception) {
      engine.language = Locale.US
    }
    engine.setSpeechRate(0.90f)
    engine.setPitch(0.97f)
    engine.setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    )
    engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String?) {}
      override fun onDone(utteranceId: String?) {}
      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String?) {}
      override fun onError(utteranceId: String?, errorCode: Int) {}
    })
    ttsReady = true
    speakPending()
  }

  private fun speakPending() {
    val text = pendingSpeech ?: return
    pendingSpeech = null
    handler.postDelayed({
      val engine = tts ?: return@postDelayed
      val params = Bundle()
      val utteranceId = "task-call-${System.currentTimeMillis()}"
      params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId)
      engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId)
    }, 900L)
  }

  private fun startRingtone() {
    try {
      val uri: Uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE)
        ?: RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ringtone = RingtoneManager.getRingtone(this, uri)
      ringtone?.audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        ringtone?.isLooping = true
      }
      ringtone?.play()
    } catch (_: Exception) {
    }
  }

  private fun stopRingtoneOnly() {
    try { ringtone?.stop() } catch (_: Exception) {}
    ringtone = null
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
    finishAlert(clearState = true)
  }

  private fun finishAlert(clearState: Boolean) {
    if (finished) return
    finished = true
    handler.removeCallbacksAndMessages(null)
    stopRingtoneOnly()
    try { vibrator?.cancel() } catch (_: Exception) {}
    vibrator = null
    try { tts?.stop() } catch (_: Exception) {}
    try { tts?.shutdown() } catch (_: Exception) {}
    tts = null
    ttsReady = false
    pendingSpeech = null
    try {
      wakeLock?.let { if (it.isHeld) it.release() }
    } catch (_: Exception) {}
    wakeLock = null
    TaskCallState.ringing = false
    if (clearState) TaskCallState.clear(this)
    dismissCallNotification()
    TaskCallQueue.releaseNext(this)
    stopSelf()
  }

  private fun postCallNotification() {
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIFICATION_ID, buildNotification())
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

  private fun buildNotification(): Notification {
    val openPending = PendingIntent.getActivity(
      this,
      5212,
      TaskCallIntents.screenIntent(this, itemId, phase, title, alertLevel, durationMin, domain),
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
    )
    val subtitle = if (phase == TaskCallState.PHASE_END) {
      "Time's up — answer if you finished, or reject to remind you in 15 minutes."
    } else {
      "Incoming task call — answer if you're ready, or reject to snooze 5 minutes."
    }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(subtitle)
      .setSmallIcon(R.drawable.ic_stat_lifeos)
      .setColor(android.graphics.Color.parseColor("#D4AF6A"))
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setOngoing(true)
      .setAutoCancel(false)
      .setFullScreenIntent(openPending, true)
      .setContentIntent(openPending)
      .addAction(0, "Reject", actionIntent(TaskCallActionReceiver.ACTION_REJECT))
      .addAction(0, "Answer", actionIntent(TaskCallActionReceiver.ACTION_ANSWER))
      .build()
  }

  override fun onDestroy() {
    if (!finished) finishAlert(clearState = false)
    super.onDestroy()
  }
}
