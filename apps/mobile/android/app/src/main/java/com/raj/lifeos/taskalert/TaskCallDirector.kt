package com.raj.lifeos.taskalert

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import com.raj.lifeos.R

// What happens when a ring ends with nobody answering. Shared by the service
// timer, the on-screen backup timer, and the deadline alarm so only one of
// them can count the attempt.
object TaskCallDirector {
  private const val SILENT_RETRY_MS = 60_000L
  private const val SILENT_BACKOFF_MS = 30 * 60 * 1000L
  private const val MAX_SILENT = 3
  private const val SILENT_NOTICE_ID = 5216

  fun unanswered(context: Context, reminder: TaskReminderScheduler.Reminder, alerted: Boolean): Boolean {
    if (reminder.id.isBlank()) return false
    if (!TaskCallState.claimUnanswered(context, reminder.id, reminder.phase)) return false
    val heard = alerted || TaskCallState.wasAlerted(context, reminder.id, reminder.phase) || TaskCallState.uiVisible(context)
    if (!heard) {
      val failures = TaskCallState.incrementSilentFailures(context, reminder.id, reminder.phase)
      if (failures >= MAX_SILENT) {
        TaskCallState.clearSilentFailures(context, reminder.id, reminder.phase)
        TaskReminderScheduler.armExact(
          context,
          reminder,
          System.currentTimeMillis() + SILENT_BACKOFF_MS,
          "snooze"
        )
        showSilentNotice(context, reminder)
        TaskCallEvents.emitDismiss(context, reminder.id, reminder.phase, "silent", 30)
      } else {
        TaskReminderScheduler.armExact(
          context,
          reminder,
          System.currentTimeMillis() + SILENT_RETRY_MS,
          "burst"
        )
        TaskCallEvents.emitDismiss(context, reminder.id, reminder.phase, "timeout", 0)
      }
      return true
    }

    TaskCallState.clearSilentFailures(context, reminder.id, reminder.phase)
    val attempts = TaskCallState.incrementRingAttempts(context, reminder.id, reminder.phase)
    if (attempts >= TaskAlertService.MAX_RING_ATTEMPTS) {
      TaskCallState.clearRingAttempts(context, reminder.id, reminder.phase)
      if (reminder.phase == TaskCallState.PHASE_END) {
        TaskReminderScheduler.cancelPhase(context, reminder.id, reminder.phase)
        TaskCallState.markEndGaveUp(context, reminder.id)
        TaskCallEvents.emitDismiss(context, reminder.id, reminder.phase, "end-gave-up", 0)
      } else {
        TaskReminderScheduler.cancel(context, reminder.id)
        TaskCallEvents.queueAutoSkip(context, reminder.id, reminder.phase, "unanswered")
        TaskCallEvents.emitDismiss(context, reminder.id, reminder.phase, "skipped", 0)
      }
      return true
    }

    TaskReminderScheduler.armExact(
      context,
      reminder,
      System.currentTimeMillis() + TaskAlertService.RING_RETRY_GAP_MS,
      "burst"
    )
    TaskCallEvents.emitDismiss(context, reminder.id, reminder.phase, "timeout", 0)
    return true
  }

  private fun showSilentNotice(context: Context, reminder: TaskReminderScheduler.Reminder) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        TaskAlertService.CHANNEL_ID,
        "Life OS · Task calls",
        NotificationManager.IMPORTANCE_HIGH
      )
      channel.description = "Incoming call when a scheduled task starts or ends"
      channel.setSound(null, null)
      manager.createNotificationChannel(channel)
    }
    val open = PendingIntent.getActivity(
      context,
      5216,
      TaskCallIntents.screenIntent(
        context,
        reminder.id,
        reminder.phase,
        reminder.title,
        reminder.alertLevel,
        reminder.durationMin,
        reminder.domain
      ),
      PendingIntent.FLAG_UPDATE_CURRENT or
        (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_IMMUTABLE else 0)
    )
    val notification = NotificationCompat.Builder(context, TaskAlertService.CHANNEL_ID)
      .setContentTitle(reminder.title.ifBlank { "Life OS" })
      .setContentText("The call couldn't ring. It will try again later.")
      .setSmallIcon(R.drawable.ic_stat_lifeos)
      .setColor(android.graphics.Color.parseColor("#D4AF6A"))
      .setAutoCancel(true)
      .setContentIntent(open)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .build()
    try {
      manager.notify(SILENT_NOTICE_ID, notification)
    } catch (_: Exception) {
    }
  }
}
