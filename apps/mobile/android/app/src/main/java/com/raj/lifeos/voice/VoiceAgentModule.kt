package com.raj.lifeos.voice

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class VoiceAgentModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "VoiceAgentModule"

  @ReactMethod
  fun setEnabled(enabled: Boolean, promise: Promise) {
    try {
      VoiceAgentScheduler.setEnabled(reactApplicationContext, enabled)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("VOICE_ENABLE_FAILED", e)
    }
  }

  @ReactMethod
  fun scheduleCue(id: String, text: String, atMillis: Double, promise: Promise) {
    try {
      VoiceAgentScheduler.schedule(reactApplicationContext, id, text, atMillis.toLong())
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("VOICE_SCHEDULE_FAILED", e)
    }
  }

  @ReactMethod
  fun cancelAll(promise: Promise) {
    try {
      VoiceAgentScheduler.cancelAll(reactApplicationContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("VOICE_CANCEL_FAILED", e)
    }
  }

  @ReactMethod
  fun speakNow(text: String, promise: Promise) {
    try {
      val service = Intent(reactApplicationContext, VoiceAgentService::class.java)
      service.putExtra(VoiceAgentService.EXTRA_ID, "preview")
      service.putExtra(VoiceAgentService.EXTRA_TEXT, text)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactApplicationContext.startForegroundService(service)
      } else {
        reactApplicationContext.startService(service)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("VOICE_SPEAK_FAILED", e)
    }
  }
}
