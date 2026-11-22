package com.raj.lifeos.taskalert

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class TaskCallActionReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_ANSWER = "com.raj.lifeos.taskalert.ANSWER"
    const val ACTION_REJECT = "com.raj.lifeos.taskalert.REJECT"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra(TaskCallIntents.EXTRA_ID).orEmpty()
    val title = intent.getStringExtra(TaskCallIntents.EXTRA_TITLE).orEmpty().ifBlank { "Task" }
    val spokenText = intent.getStringExtra(TaskCallIntents.EXTRA_TEXT).orEmpty()
    val alertLevel = intent.getStringExtra(TaskCallIntents.EXTRA_ALERT_LEVEL) ?: "normal"
    val phase = intent.getStringExtra(TaskCallIntents.EXTRA_PHASE) ?: TaskCallState.PHASE_START
    val durationMin = intent.getIntExtra(TaskCallIntents.EXTRA_DURATION, 0)
    val domain = intent.getStringExtra(TaskCallIntents.EXTRA_DOMAIN).orEmpty()

    when (intent.action) {
      ACTION_ANSWER -> {
        TaskCallState.clearRingAttempts(context, id, phase)
        TaskAlertService.silence(context)
        TaskCallState.inSession = true
        TaskCallIntents.launchScreen(context, id, phase, title, alertLevel, durationMin, domain, pickedUp = true)
      }
      ACTION_REJECT -> {
        TaskCallState.clearRingAttempts(context, id, phase)
        TaskCallState.clearBurst(context, id, phase)
        TaskCallState.clearSilentFailures(context, id, phase)
        TaskAlertService.stop(context)
        TaskCallQueue.parkAll(context, TaskReminderScheduler.QUEUE_RELEASE_MS)
        if (id.isNotBlank()) {
          val end = phase == TaskCallState.PHASE_END
          val delay = if (end) TaskReminderScheduler.END_FOLLOWUP_MS else TaskReminderScheduler.START_SNOOZE_MS
          val minutes = if (end) 15 else 5
          TaskReminderScheduler.snooze(
            context,
            TaskReminderScheduler.Reminder(
              id, title, spokenText, alertLevel, 0L, phase, durationMin, domain
            ),
            delay,
            shiftNeighbors = true
          )
          TaskCallEvents.emitDismiss(context, id, phase, "reject", minutes)
        }
      }
    }
  }
}
