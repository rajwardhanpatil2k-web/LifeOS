package com.raj.lifeos.voice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import androidx.core.app.NotificationCompat
import com.raj.lifeos.R
import com.raj.lifeos.wakealarm.AlarmRingingService
import java.util.Locale

// Short-lived foreground service: init on-device TTS, speak one human cue,
// then go away. Waits a beat so the OS notification ping lands first.
class VoiceAgentService : Service(), TextToSpeech.OnInitListener {
  companion object {
    const val EXTRA_TEXT = "text"
    const val EXTRA_ID = "id"
    const val CHANNEL_ID = "lifeos-voice-agent"
    const val NOTIFICATION_ID = 5210
    private const val UTTERANCE_ID = "lifeos-voice-cue"
  }

  private var tts: TextToSpeech? = null
  private var pendingText: String? = null
  private var ready = false
  private var wakeLock: PowerManager.WakeLock? = null
  private val handler = Handler(Looper.getMainLooper())
  private val stopRunnable = Runnable { stopSpeaking() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (AlarmRingingService.isRinging() || com.raj.lifeos.taskalert.TaskCallState.busy()) {
      stopSelf()
      return START_NOT_STICKY
    }

    val text = intent?.getStringExtra(EXTRA_TEXT)?.trim().orEmpty()
    if (text.isEmpty()) {
      stopSelf()
      return START_NOT_STICKY
    }

    acquireWakeLock()
    ensureForeground()
    pendingText = text

    if (tts == null) {
      tts = TextToSpeech(applicationContext, this)
    } else if (ready) {
      speakWhenReady()
    }
    return START_NOT_STICKY
  }

  override fun onInit(status: Int) {
    if (status != TextToSpeech.SUCCESS) {
      stopSpeaking()
      return
    }
    val engine = tts ?: return
    try {
      engine.language = Locale("en", "IN")
    } catch (_: Exception) {
      engine.language = Locale.US
    }
    pickVoice(engine)?.let { engine.voice = it }
    engine.setSpeechRate(0.90f)
    engine.setPitch(0.97f)
    engine.setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANT)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    )
    engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String?) {}
      override fun onDone(utteranceId: String?) {
        handler.post {
          handler.removeCallbacks(stopRunnable)
          handler.postDelayed({
            if (tts?.isSpeaking != true) stopSpeaking()
          }, 500L)
        }
      }
      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String?) {
        handler.post { stopSpeaking() }
      }
      override fun onError(utteranceId: String?, errorCode: Int) {
        handler.post { stopSpeaking() }
      }
    })
    ready = true
    speakWhenReady()
  }

  private fun speakWhenReady() {
    val text = pendingText ?: return
    pendingText = null
    // Let the task notification sound land, then talk over the quiet after it.
    handler.removeCallbacks(stopRunnable)
    handler.postDelayed({
      val engine = tts
      if (engine == null || AlarmRingingService.isRinging() || com.raj.lifeos.taskalert.TaskCallState.busy()) {
        stopSpeaking()
        return@postDelayed
      }
      val params = Bundle()
      val utteranceId = "$UTTERANCE_ID-${System.currentTimeMillis()}"
      params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId)
      val mode = if (engine.isSpeaking) TextToSpeech.QUEUE_ADD else TextToSpeech.QUEUE_FLUSH
      engine.speak(text, mode, params, utteranceId)
      handler.removeCallbacks(stopRunnable)
      handler.postDelayed(stopRunnable, 45_000L)
    }, 700L)
  }

  private fun pickVoice(engine: TextToSpeech): Voice? {
    val voices = try {
      engine.voices
    } catch (_: Exception) {
      null
    } ?: return null
    return voices
      .filter { it.locale.language.equals("en", ignoreCase = true) }
      .maxByOrNull { voice ->
        var score = 0
        val country = voice.locale.country
        if (country.equals("IN", true)) score += 6
        else if (country.equals("GB", true)) score += 3
        else if (country.equals("US", true)) score += 1
        val name = voice.name.lowercase()
        if (name.contains("neural") || name.contains("wavenet") || name.contains("natural") || name.contains("studio")) {
          score += 8
        }
        if (name.contains("en-in-x-ena") || name.contains("female") || name.contains("-f-") || name.contains("fem")) {
          score += 2
        }
        if (voice.quality >= Voice.QUALITY_VERY_HIGH) score += 5
        else if (voice.quality >= Voice.QUALITY_HIGH) score += 3
        if (!voice.isNetworkConnectionRequired) score += 3
        score
      }
  }

  private fun ensureForeground() {
    createChannel()
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Life OS")
      .setContentText("Speaking your next task.")
      .setSmallIcon(R.drawable.ic_stat_lifeos)
      .setColor(android.graphics.Color.parseColor("#D4AF6A"))
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setSilent(true)
      .setOngoing(true)
      .build()
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (_: Exception) {
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(CHANNEL_ID, "Life OS · Voice", NotificationManager.IMPORTANCE_LOW)
    channel.description = "Spoken task reminders"
    channel.setSound(null, null)
    channel.enableVibration(false)
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lifeos:voice-agent")
    try {
      wakeLock?.acquire(50_000L)
    } catch (_: Exception) {
    }
  }

  private fun stopSpeaking() {
    handler.removeCallbacks(stopRunnable)
    try {
      tts?.stop()
    } catch (_: Exception) {
    }
    try {
      tts?.shutdown()
    } catch (_: Exception) {
    }
    tts = null
    ready = false
    pendingText = null
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
    handler.removeCallbacksAndMessages(null)
    try {
      tts?.stop()
      tts?.shutdown()
    } catch (_: Exception) {
    }
    tts = null
    super.onDestroy()
  }
}
