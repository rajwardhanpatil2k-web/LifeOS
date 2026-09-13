package com.raj.lifeos.wakealarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import com.raj.lifeos.MainActivity
import java.util.Calendar
import java.util.TimeZone

// setAlarmClock() is one-shot, so a "daily" alarm is really: fire today,
// then immediately arm tomorrow's occurrence from AlarmReceiver. Hour/minute
// are persisted so BootReceiver can restore the schedule after a reboot
// (AlarmManager entries don't survive one).
object AlarmScheduler {
  private const val PREFS = "wake_alarm_prefs"
  private const val KEY_HOUR = "hour"
  private const val KEY_MINUTE = "minute"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_NEXT_AT = "next_at"
  private const val REQUEST_CODE = 4201
  private const val IST = "Asia/Kolkata"
  // If JS remounts / Today refreshes a few seconds after the target minute,
  // treating that as "already passed" used to silently push the alarm to
  // tomorrow. A two-minute grace keeps tonight's ring.
  private const val JUST_PASSED_GRACE_MS = 120_000L
  const val WAKE_ALARM_URI = "lifeos://wake-alarm"

  private fun istCalendar(): Calendar = Calendar.getInstance(TimeZone.getTimeZone(IST))

  private fun persist(context: Context, hour: Int, minute: Int, enabled: Boolean, nextAt: Long = -1L) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putInt(KEY_HOUR, hour)
      .putInt(KEY_MINUTE, minute)
      .putBoolean(KEY_ENABLED, enabled)
      .putLong(KEY_NEXT_AT, nextAt)
      .apply()
  }

  private fun readNextAt(context: Context): Long =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_NEXT_AT, -1L)

  private fun readPersisted(context: Context): Triple<Int, Int, Boolean> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return Triple(
      prefs.getInt(KEY_HOUR, -1),
      prefs.getInt(KEY_MINUTE, -1),
      prefs.getBoolean(KEY_ENABLED, false)
    )
  }

  fun nextTriggerMillis(hour: Int, minute: Int, allowSoonIfJustPassed: Boolean = true): Long {
    val now = istCalendar()
    val trigger = istCalendar()
    trigger.set(Calendar.HOUR_OF_DAY, hour)
    trigger.set(Calendar.MINUTE, minute)
    trigger.set(Calendar.SECOND, 0)
    trigger.set(Calendar.MILLISECOND, 0)
    val delta = trigger.timeInMillis - now.timeInMillis
    if (delta >= 2_000L) return trigger.timeInMillis
    if (allowSoonIfJustPassed && delta >= -JUST_PASSED_GRACE_MS) {
      return now.timeInMillis + 3_000L
    }
    trigger.add(Calendar.DAY_OF_YEAR, 1)
    return trigger.timeInMillis
  }

  fun schedule(context: Context, hour: Int, minute: Int): Long {
    val now = System.currentTimeMillis()
    val (curHour, curMinute, enabled) = readPersisted(context)
    val existingNext = readNextAt(context)
    // JS remounts, Today refresh, and fetchSettings all call schedule again.
    // Recomputing "next occurrence" after the minute has passed used to
    // silently push tonight's alarm to tomorrow. Keep the armed fire time.
    if (enabled && curHour == hour && curMinute == minute && existingNext >= now + 2_000L) {
      armSystemAlarm(context, existingNext)
      return existingNext
    }
    val next = nextTriggerMillis(hour, minute, allowSoonIfJustPassed = true)
    persist(context, hour, minute, true, next)
    armSystemAlarm(context, next)
    return next
  }

  fun cancel(context: Context) {
    val (hour, minute, _) = readPersisted(context)
    persist(context, hour, minute, false, -1L)
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(operationPendingIntent(context))
    AlarmRingingService.stop(context)
  }

  // Called from AlarmReceiver (alarm just fired, arm tomorrow) and
  // BootReceiver (device just rebooted, restore whatever was scheduled).
  fun rescheduleFromReceiver(context: Context) {
    val (hour, minute, enabled) = readPersisted(context)
    if (enabled && hour in 0..23 && minute in 0..59) {
      // After a fire, never use the "just passed" grace or we'd ring again
      // three seconds later in a loop.
      val next = nextTriggerMillis(hour, minute, allowSoonIfJustPassed = false)
      persist(context, hour, minute, true, next)
      armSystemAlarm(context, next)
    }
  }

  fun nextAlarmAtMillis(context: Context): Long {
    val (hour, minute, enabled) = readPersisted(context)
    if (!enabled || hour !in 0..23 || minute !in 0..59) return -1L
    val existing = readNextAt(context)
    val now = System.currentTimeMillis()
    if (existing >= now + 2_000L) return existing
    return nextTriggerMillis(hour, minute, allowSoonIfJustPassed = false)
  }

  fun readHourMinuteEnabled(context: Context): Triple<Int, Int, Boolean> = readPersisted(context)

  private fun armSystemAlarm(context: Context, triggerAtMillis: Long) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val op = operationPendingIntent(context)
    try {
      am.setAlarmClock(
        AlarmManager.AlarmClockInfo(triggerAtMillis, showPendingIntent(context)),
        op
      )
    } catch (_: SecurityException) {
      // Exact-alarm toggle off: still try the Doze-friendly exact API.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, op)
      } else {
        @Suppress("DEPRECATION")
        am.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, op)
      }
    }
  }

  private fun immutableFlag(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_IMMUTABLE else 0

  private fun operationPendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java)
    return PendingIntent.getBroadcast(
      context, REQUEST_CODE, intent, PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
    )
  }

  // Shown if the user taps the little alarm-clock icon in the status bar.
  private fun showPendingIntent(context: Context): PendingIntent {
    return PendingIntent.getActivity(
      context, REQUEST_CODE, wakeScreenIntent(context), PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
    )
  }

  fun wakeScreenIntent(context: Context): Intent {
    val intent = Intent(context, MainActivity::class.java)
    intent.action = Intent.ACTION_VIEW
    intent.data = Uri.parse(WAKE_ALARM_URI)
    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or
      Intent.FLAG_ACTIVITY_CLEAR_TOP or
      Intent.FLAG_ACTIVITY_SINGLE_TOP or
      Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    return intent
  }

  // setAlarmClock receivers are allowed to start activities; full-screen
  // notification intents are not (screen already on, OEM, Android 14 FSI
  // toggle). Launching here is what actually opens the scanner.
  fun launchWakeScreen(context: Context) {
    try {
      context.startActivity(wakeScreenIntent(context))
    } catch (_: Exception) {
    }
  }
}
