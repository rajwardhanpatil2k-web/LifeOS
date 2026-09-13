package com.raj.lifeos.wakealarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync()
    try {
      AlarmScheduler.rescheduleFromReceiver(context)

      val serviceIntent = Intent(context, AlarmRingingService::class.java)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(serviceIntent)
        } else {
          context.startService(serviceIntent)
        }
      } catch (_: Exception) {
        try {
          context.startService(serviceIntent)
        } catch (_: Exception) {
        }
      }

      // Sound lives in the service. The scanner is a separate activity launch
      // — full-screen notification intents are skipped when the screen is on.
      AlarmScheduler.launchWakeScreen(context)
    } finally {
      pending.finish()
    }
  }
}
