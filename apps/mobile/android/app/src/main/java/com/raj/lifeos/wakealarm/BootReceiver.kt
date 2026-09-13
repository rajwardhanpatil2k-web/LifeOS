package com.raj.lifeos.wakealarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.raj.lifeos.voice.VoiceAgentScheduler
import com.raj.lifeos.taskalert.TaskReminderScheduler

// AlarmManager entries are wiped on reboot; this restores the wake alarm
// and any still-future spoken task cues.
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == "android.intent.action.QUICKBOOT_POWERON") {
      AlarmScheduler.rescheduleFromReceiver(context)
      VoiceAgentScheduler.restore(context)
      TaskReminderScheduler.restore(context)
    }
  }
}
