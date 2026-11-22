package com.raj.lifeos

import android.content.Context
import android.media.AudioManager

// Cellular and WhatsApp-style calls set the audio mode. No phone-state
// permission is required. Task and wake alarms must not use the alarm stream
// while this is true — that stream plays over an active call.
object PhoneCalls {
  fun active(context: Context): Boolean {
    val manager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return false
    return when (manager.mode) {
      AudioManager.MODE_IN_CALL,
      AudioManager.MODE_IN_COMMUNICATION,
      AudioManager.MODE_RINGTONE -> true
      else -> false
    }
  }
}
