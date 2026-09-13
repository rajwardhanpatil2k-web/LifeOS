package com.raj.lifeos.voice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class VoiceAgentReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync()
    try {
      val service = Intent(context, VoiceAgentService::class.java)
      service.putExtra(VoiceAgentService.EXTRA_ID, intent.getStringExtra(VoiceAgentService.EXTRA_ID))
      service.putExtra(VoiceAgentService.EXTRA_TEXT, intent.getStringExtra(VoiceAgentService.EXTRA_TEXT))
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(service)
        } else {
          context.startService(service)
        }
      } catch (_: Exception) {
        try {
          context.startService(service)
        } catch (_: Exception) {
        }
      }
    } finally {
      pending.finish()
    }
  }
}
