package com.raj.lifeos.taskalert

import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.LinkedHashSet
import java.util.Locale

class TaskReminderModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var listening = false
  private var promptTts: TextToSpeech? = null
  private var promptTtsReady = false
  private var pendingPrompt: String? = null
  private var speakPromise: Promise? = null

  override fun getName(): String = "TaskReminderModule"

  @ReactMethod
  fun setPausedUntil(untilMs: Double, promise: Promise) {
    try {
      TaskReminderScheduler.setPausedUntil(reactApplicationContext, untilMs.toLong())
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("TASK_REMINDER_PAUSE_FAILED", e)
    }
  }

  @ReactMethod
  fun setEnabled(enabled: Boolean, promise: Promise) {
    try {
      TaskReminderScheduler.setEnabled(reactApplicationContext, enabled)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("TASK_REMINDER_ENABLE_FAILED", e)
    }
  }

  @ReactMethod
  fun scheduleReminder(
    id: String,
    title: String,
    spokenText: String,
    alertLevel: String,
    atMillis: Double,
    promise: Promise
  ) {
    scheduleTaskCall(id, title, spokenText, alertLevel, atMillis, TaskCallState.PHASE_START, 0.0, "", promise)
  }

  @ReactMethod
  fun scheduleTaskCall(
    id: String,
    title: String,
    spokenText: String,
    alertLevel: String,
    atMillis: Double,
    phase: String,
    durationMin: Double,
    domain: String,
    promise: Promise
  ) {
    try {
      TaskReminderScheduler.schedule(
        reactApplicationContext,
        TaskReminderScheduler.Reminder(
          id,
          title,
          spokenText,
          alertLevel,
          atMillis.toLong(),
          phase.ifBlank { TaskCallState.PHASE_START },
          durationMin.toInt(),
          domain
        )
      )
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("TASK_REMINDER_SCHEDULE_FAILED", e)
    }
  }

  @ReactMethod
  fun replaceTaskCalls(reminders: ReadableArray, promise: Promise) {
    try {
      val list = mutableListOf<TaskReminderScheduler.Reminder>()
      for (i in 0 until reminders.size()) {
        val map = reminders.getMap(i) ?: continue
        val id = if (map.hasKey("id")) map.getString("id") else null
        val title = if (map.hasKey("title")) map.getString("title") else null
        if (id.isNullOrBlank() || title.isNullOrBlank()) continue
        list.add(
          TaskReminderScheduler.Reminder(
            id = id,
            title = title,
            spokenText = if (map.hasKey("spokenText")) map.getString("spokenText") ?: "" else "",
            alertLevel = if (map.hasKey("alertLevel")) map.getString("alertLevel") ?: "normal" else "normal",
            at = if (map.hasKey("at")) map.getDouble("at").toLong() else -1L,
            phase = if (map.hasKey("phase")) map.getString("phase") ?: TaskCallState.PHASE_START else TaskCallState.PHASE_START,
            durationMin = if (map.hasKey("durationMin")) map.getDouble("durationMin").toInt() else 0,
            domain = if (map.hasKey("domain")) map.getString("domain") ?: "" else ""
          )
        )
      }
      TaskReminderScheduler.replaceAll(reactApplicationContext, list)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("TASK_REMINDER_REPLACE_FAILED", e)
    }
  }

  @ReactMethod
  fun snoozeCall(
    id: String,
    title: String,
    spokenText: String,
    alertLevel: String,
    phase: String,
    durationMin: Double,
    domain: String,
    delayMs: Double,
    promise: Promise
  ) {
    try {
      TaskReminderScheduler.snooze(
        reactApplicationContext,
        TaskReminderScheduler.Reminder(
          id, title, spokenText, alertLevel, 0L, phase, durationMin.toInt(), domain
        ),
        delayMs.toLong()
      )
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("TASK_REMINDER_SNOOZE_FAILED", e)
    }
  }

  @ReactMethod
  fun clearOverride(id: String, promise: Promise) {
    try {
      TaskReminderScheduler.clearOverride(reactApplicationContext, id)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("TASK_REMINDER_CLEAR_FAILED", e)
    }
  }

  @ReactMethod
  fun cancelAll(promise: Promise) {
    try {
      TaskReminderScheduler.cancelAll(reactApplicationContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("TASK_REMINDER_CANCEL_FAILED", e)
    }
  }

  @ReactMethod
  fun alertNow(
    title: String,
    spokenText: String,
    alertLevel: String,
    promise: Promise
  ) {
    alertNowCall("preview", title, spokenText, alertLevel, TaskCallState.PHASE_START, 0.0, "", promise)
  }

  @ReactMethod
  fun alertNowCall(
    id: String,
    title: String,
    spokenText: String,
    alertLevel: String,
    phase: String,
    durationMin: Double,
    domain: String,
    promise: Promise
  ) {
    try {
      val service = Intent(reactApplicationContext, TaskAlertService::class.java)
      service.putExtra(TaskCallIntents.EXTRA_ID, id)
      service.putExtra(TaskCallIntents.EXTRA_TITLE, title)
      service.putExtra(TaskCallIntents.EXTRA_TEXT, spokenText)
      service.putExtra(TaskCallIntents.EXTRA_ALERT_LEVEL, alertLevel)
      service.putExtra(TaskCallIntents.EXTRA_PHASE, phase.ifBlank { TaskCallState.PHASE_START })
      service.putExtra(TaskCallIntents.EXTRA_DURATION, durationMin.toInt())
      service.putExtra(TaskCallIntents.EXTRA_DOMAIN, domain)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactApplicationContext.startForegroundService(service)
      } else {
        reactApplicationContext.startService(service)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("TASK_REMINDER_ALERT_FAILED", e)
    }
  }

  @ReactMethod
  fun setCallUiVisible(visible: Boolean, promise: Promise) {
    try {
      if (visible && TaskCallState.ringing) {
        TaskAlertService.showNotification(reactApplicationContext)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("TASK_CALL_UI_FAILED", e)
    }
  }

  @ReactMethod
  fun speakPrompt(text: String, promise: Promise) {
    mainHandler.post {
      try {
        pauseRecognizer()
        speakPromise?.resolve(true)
        speakPromise = promise
        pendingPrompt = text.trim()
        if (pendingPrompt.isNullOrBlank()) {
          speakPromise = null
          promise.resolve(true)
          return@post
        }
        armSpeakTimeout()
        if (promptTts == null) {
          promptTts = TextToSpeech(reactApplicationContext) { status ->
            if (status != TextToSpeech.SUCCESS) {
              promptTts = null
              promptTtsReady = false
              finishSpeak(false)
              return@TextToSpeech
            }
            val engine = promptTts ?: return@TextToSpeech
            try {
              engine.language = Locale.US
            } catch (_: Exception) {
              engine.language = Locale("en", "IN")
            }
            engine.setSpeechRate(0.92f)
            engine.setPitch(1.0f)
            engine.setAudioAttributes(
              AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            )
            engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
              override fun onStart(utteranceId: String?) {
                armSpeakTimeout()
              }
              override fun onDone(utteranceId: String?) {
                mainHandler.postDelayed({ finishSpeak(true) }, 450L)
              }
              @Deprecated("Deprecated in Java")
              override fun onError(utteranceId: String?) {
                mainHandler.post { finishSpeak(false) }
              }
              override fun onError(utteranceId: String?, errorCode: Int) {
                mainHandler.post { finishSpeak(false) }
              }
            })
            promptTtsReady = true
            speakPendingPrompt()
          }
        } else if (promptTtsReady) {
          speakPendingPrompt()
        }
      } catch (e: Exception) {
        speakPromise = null
        promise.reject("TASK_SPEAK_FAILED", e)
      }
    }
  }

  @ReactMethod
  fun cancelSpeak(promise: Promise) {
    mainHandler.post {
      pendingPrompt = null
      try { promptTts?.stop() } catch (_: Exception) {}
      finishSpeak(true)
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun silenceAlert(promise: Promise) {
    try {
      TaskAlertService.silence(reactApplicationContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("TASK_REMINDER_SILENCE_FAILED", e)
    }
  }

  @ReactMethod
  fun stopAlert(promise: Promise) {
    try {
      TaskAlertService.stop(reactApplicationContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("TASK_REMINDER_STOP_FAILED", e)
    }
  }

  @ReactMethod
  fun isRinging(promise: Promise) {
    promise.resolve(TaskCallState.ringing)
  }

  @ReactMethod
  fun getActiveCall(promise: Promise) {
    val call = TaskCallState.read(reactApplicationContext)
    if (call == null) {
      promise.resolve(null)
      return
    }
    val map = Arguments.createMap()
    map.putString("itemId", call.id)
    map.putString("title", call.title)
    map.putString("spokenText", call.spokenText)
    map.putString("alertLevel", call.alertLevel)
    map.putString("phase", call.phase)
    map.putInt("durationMin", call.durationMin)
    map.putString("domain", call.domain)
    map.putBoolean("ringing", TaskCallState.ringing)
    promise.resolve(map)
  }

  @ReactMethod
  fun startListening(promise: Promise) {
    mainHandler.post {
      try {
        pauseRecognizer()
        if (!SpeechRecognizer.isRecognitionAvailable(reactApplicationContext)) {
          promise.reject("SPEECH_UNAVAILABLE", "Speech recognition is not available on this device")
          return@post
        }
        val host = currentActivity ?: reactApplicationContext
        val engine = recognizer ?: SpeechRecognizer.createSpeechRecognizer(host)
        recognizer = engine
        engine.setRecognitionListener(object : RecognitionListener {
          override fun onReadyForSpeech(params: Bundle?) {
            emit("TaskCallSpeech", "ready", "")
          }
          override fun onBeginningOfSpeech() {}
          override fun onRmsChanged(rmsdB: Float) {}
          override fun onBufferReceived(buffer: ByteArray?) {}
          override fun onEndOfSpeech() {
            emit("TaskCallSpeech", "end", "")
          }
          override fun onError(error: Int) {
            listening = false
            emit("TaskCallSpeech", "error", error.toString())
          }
          override fun onResults(results: Bundle?) {
            listening = false
            val spoken = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: arrayListOf()
            emit("TaskCallSpeech", "result", spoken.firstOrNull().orEmpty(), spoken)
          }
          override fun onPartialResults(partialResults: Bundle?) {
            val spoken = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: arrayListOf()
            val first = spoken.firstOrNull().orEmpty()
            if (first.isNotBlank()) emit("TaskCallSpeech", "partial", first, spoken)
          }
          override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        try {
          val am = reactApplicationContext.getSystemService(android.content.Context.AUDIO_SERVICE) as AudioManager
          am.mode = AudioManager.MODE_NORMAL
        } catch (_: Exception) {}
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, Locale.US.toLanguageTag())
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, false)
        mainHandler.postDelayed({
          try {
            listening = true
            engine.startListening(intent)
            promise.resolve(true)
          } catch (e: Exception) {
            listening = false
            promise.reject("SPEECH_START_FAILED", e)
          }
        }, 220L)
        return@post
      } catch (e: Exception) {
        listening = false
        promise.reject("SPEECH_START_FAILED", e)
      }
    }
  }

  @ReactMethod
  fun stopListening(promise: Promise) {
    mainHandler.post {
      stopRecognizer()
      promise.resolve(true)
    }
  }

  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  private var speakTimeout: Runnable? = null

  private fun armSpeakTimeout() {
    speakTimeout?.let { mainHandler.removeCallbacks(it) }
    speakTimeout = Runnable { finishSpeak(true) }
    mainHandler.postDelayed(speakTimeout!!, 20_000L)
  }

  private fun speakPendingPrompt() {
    val text = pendingPrompt ?: return
    pendingPrompt = null
    val engine = promptTts ?: return finishSpeak(false)
    try { engine.stop() } catch (_: Exception) {}
    val utteranceId = "task-prompt-${System.currentTimeMillis()}"
    val params = Bundle()
    params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId)
    params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_ALARM)
    params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
    engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId)
  }

  private fun finishSpeak(ok: Boolean) {
    speakTimeout?.let { mainHandler.removeCallbacks(it) }
    speakTimeout = null
    pendingPrompt = null
    val promise = speakPromise
    speakPromise = null
    try { promise?.resolve(ok) } catch (_: Exception) {}
  }

  private fun pauseRecognizer() {
    listening = false
    try { recognizer?.stopListening() } catch (_: Exception) {}
    try { recognizer?.cancel() } catch (_: Exception) {}
  }

  private fun stopRecognizer() {
    pauseRecognizer()
    try { recognizer?.destroy() } catch (_: Exception) {}
    recognizer = null
  }

  private fun emit(event: String, type: String, text: String, alternatives: List<String> = emptyList()) {
    try {
      val map = Arguments.createMap()
      map.putString("type", type)
      map.putString("text", text)
      val rows = Arguments.createArray()
      val unique = LinkedHashSet<String>()
      if (text.isNotBlank()) unique.add(text)
      for (row in alternatives) if (row.isNotBlank()) unique.add(row)
      for (row in unique) rows.pushString(row)
      map.putArray("alternatives", rows)
      reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(event, map)
    } catch (_: Exception) {
    }
  }
}
