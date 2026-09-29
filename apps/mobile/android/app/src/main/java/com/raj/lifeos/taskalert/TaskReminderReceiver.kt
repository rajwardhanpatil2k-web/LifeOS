package com.raj.lifeos.taskalert

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.raj.lifeos.wakealarm.AlarmRingingService

class TaskReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync()
    try {
      val reminder = TaskReminderScheduler.Reminder(
        id = intent.getStringExtra(TaskCallIntents.EXTRA_ID).orEmpty(),
        title = intent.getStringExtra(TaskCallIntents.EXTRA_TITLE).orEmpty().ifBlank { "Task" },
        spokenText = intent.getStringExtra(TaskCallIntents.EXTRA_TEXT).orEmpty(),
        alertLevel = intent.getStringExtra(TaskCallIntents.EXTRA_ALERT_LEVEL) ?: "normal",
        at = 0L,
        phase = intent.getStringExtra(TaskCallIntents.EXTRA_PHASE) ?: TaskCallState.PHASE_START,
        durationMin = intent.getIntExtra(TaskCallIntents.EXTRA_DURATION, 0),
        domain = intent.getStringExtra(TaskCallIntents.EXTRA_DOMAIN).orEmpty()
      )

      if (AlarmRingingService.isRinging() || TaskCallState.busy()) {
        TaskCallQueue.enqueue(context, reminder)
        if (reminder.id.isNotBlank()) TaskReminderScheduler.consume(context, reminder.id, reminder.phase)
        return
      }

      val pause = TaskReminderScheduler.pausedUntil(context)
      if (pause > System.currentTimeMillis()) {
        if (reminder.id.isNotBlank()) {
          TaskReminderScheduler.schedule(context, reminder.copy(at = pause))
        }
        return
      }

      if (reminder.id.isNotBlank()) {
        TaskReminderScheduler.consume(context, reminder.id, reminder.phase)
      }

      val service = Intent(context, TaskAlertService::class.java)
      TaskCallIntents.copyExtras(intent, service)
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
      // Same second-chance as the wake alarm: some OEMs skip FGS / full-screen
      // intents while the app has been unused, but still allow an activity start
      // from an AlarmClock receiver.
      TaskCallIntents.launchScreen(
        context,
        reminder.id,
        reminder.phase,
        reminder.title,
        reminder.alertLevel,
        reminder.durationMin,
        reminder.domain
      )
    } finally {
      pending.finish()
    }
  }
}
