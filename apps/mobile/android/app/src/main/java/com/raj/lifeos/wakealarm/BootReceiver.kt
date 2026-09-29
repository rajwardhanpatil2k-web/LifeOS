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
    val action = intent.action ?: return
    val restore = action == Intent.ACTION_BOOT_COMPLETED ||
      action == Intent.ACTION_MY_PACKAGE_REPLACED ||
      action == Intent.ACTION_TIME_CHANGED ||
      action == Intent.ACTION_TIMEZONE_CHANGED ||
      action == "android.intent.action.QUICKBOOT_POWERON"
    if (!restore) return
    AlarmScheduler.restoreAfterBoot(context)
    VoiceAgentScheduler.restore(context)
    TaskReminderScheduler.restore(context)
  }
}
