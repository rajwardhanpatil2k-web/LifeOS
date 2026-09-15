package com.raj.lifeos.taskalert

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

object TaskReminderScheduler {
  private const val PREFS = "task_reminder_prefs"
  private const val KEY_REMINDERS = "reminders"
  private const val KEY_OVERRIDES = "overrides"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_PAUSED_UNTIL = "paused_until"
  private const val REQUEST_BASE = 0x5B000000
  const val START_SNOOZE_MS = 5 * 60 * 1000L
  const val END_FOLLOWUP_MS = 15 * 60 * 1000L
  const val CALL_GAP_MS = 5 * 60 * 1000L
  const val QUEUE_RELEASE_MS = 5 * 60 * 1000L

  data class Reminder(
    val id: String,
    val title: String,
    val spokenText: String,
    val alertLevel: String,
    val at: Long,
    val phase: String,
    val durationMin: Int,
    val domain: String
  )

  fun pausedUntil(context: Context): Long =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_PAUSED_UNTIL, 0L)

  fun setPausedUntil(context: Context, untilMs: Long) {
    val now = System.currentTimeMillis()
    val until = if (untilMs > now) untilMs else 0L
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putLong(KEY_PAUSED_UNTIL, until)
      .apply()
    if (until <= 0L) return
    if (!TaskCallState.busy()) TaskAlertService.stop(context)
    TaskCallQueue.clear(context)
    cancelArmed(context)
    val kept = load(context).filter { it.at >= until && it.at > now + 1_000L }
    save(context, kept)
    val overrides = loadOverrides(context).filter { it.at >= until && it.at > now + 1_000L }
    saveOverrides(context, overrides)
    for (reminder in kept) arm(context, reminder)
  }

  fun setEnabled(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean(KEY_ENABLED, enabled)
      .apply()
    if (!enabled) cancelAll(context)
  }

  fun isEnabled(context: Context): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, true)

  fun replaceAll(context: Context, planned: List<Reminder>) {
    if (!isEnabled(context)) return
    TaskCallQueue.clear(context)
    cancelArmed(context)
    val now = System.currentTimeMillis()
    val pause = pausedUntil(context)
    val previous = load(context)
    val overrides = loadOverrides(context).filter { it.at > now + 1_000L && (pause <= now || it.at >= pause) }
    val plannedIds = planned.map { it.id }.toSet()
    val keptOverrides = overrides.filter { plannedIds.contains(it.id) }
    saveOverrides(context, keptOverrides)

    val merged = planned.map { reminder ->
      val override = keptOverrides.find { it.id == reminder.id && it.phase == reminder.phase }
      var at = reminder.at
      if (override != null && override.at > at) at = override.at
      val prev = previous.find { it.id == reminder.id && it.phase == reminder.phase }
      if (prev != null && prev.at > now + 1_000L && at > now + 1_000L) {
        val bothSoon = prev.at - now < 15 * 60 * 1000L && at - now < 15 * 60 * 1000L
        if (bothSoon) at = kotlin.math.min(prev.at, at)
      }
      reminder.copy(at = at)
    }.filter { it.at > now + 1_000L && (pause <= now || it.at >= pause) }

    save(context, merged)
    for (reminder in merged) arm(context, reminder)
  }

  fun schedule(context: Context, reminder: Reminder) {
    if (!isEnabled(context)) return
    if (reminder.id.isBlank() || reminder.title.isBlank()) return
    val now = System.currentTimeMillis()
    val pause = pausedUntil(context)
    if (reminder.at <= now + 1_000L) return
    if (pause > now && reminder.at < pause) return

    val reminders = load(context).filter { it.id != reminder.id || it.phase != reminder.phase }.toMutableList()
    reminders.add(reminder)
    save(context, reminders)
    arm(context, reminder)
  }

  fun nextFreeAt(context: Context, desiredAt: Long, excludeId: String = ""): Long {
    val occupied = load(context).filter { it.id != excludeId }.map { it.at }
    var at = desiredAt
    var moved = true
    while (moved) {
      moved = false
      for (other in occupied) {
        if (kotlin.math.abs(at - other) < CALL_GAP_MS) {
          at = other + CALL_GAP_MS
          moved = true
        }
      }
    }
    return at
  }

  fun snooze(context: Context, base: Reminder, delayMs: Long) {
    if (!isEnabled(context) || base.id.isBlank()) return
    val now = System.currentTimeMillis()
    val pause = pausedUntil(context)
    val desired = now + delayMs.coerceAtLeast(3_000L)
    val gated = if (pause > now) maxOf(desired, pause) else desired
    val at = nextFreeAt(context, gated, base.id)
    val reminder = base.copy(at = at)
    val overrides = loadOverrides(context).filter { it.id != reminder.id || it.phase != reminder.phase }.toMutableList()
    overrides.add(reminder)
    saveOverrides(context, overrides)
    val reminders = load(context).filter { it.id != reminder.id || it.phase != reminder.phase }.toMutableList()
    reminders.add(reminder)
    save(context, reminders)
    arm(context, reminder)
  }

  fun clearOverride(context: Context, id: String) {
    saveOverrides(context, loadOverrides(context).filter { it.id != id })
  }

  fun cancel(context: Context, id: String) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    for (existing in load(context).filter { it.id == id }) {
      am.cancel(operation(context, existing))
    }
    save(context, load(context).filter { it.id != id })
    saveOverrides(context, loadOverrides(context).filter { it.id != id })
  }

  fun cancelAll(context: Context) {
    cancelArmed(context)
    save(context, emptyList())
    saveOverrides(context, emptyList())
    TaskCallQueue.clear(context)
  }

  fun restore(context: Context) {
    if (!isEnabled(context)) return
    val now = System.currentTimeMillis()
    val pause = pausedUntil(context)
    val future = load(context).filter { it.at > now + 1_000L && (pause <= now || it.at >= pause) }
    save(context, future)
    for (reminder in future) arm(context, reminder)
    if (!TaskCallState.busy()) TaskCallQueue.parkAll(context, QUEUE_RELEASE_MS)
  }

  private fun cancelArmed(context: Context) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    for (reminder in load(context)) {
      am.cancel(operation(context, reminder))
    }
  }

  private fun arm(context: Context, reminder: Reminder) {
    val pause = pausedUntil(context)
    if (pause > System.currentTimeMillis() && reminder.at < pause) return
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val op = operation(context, reminder)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, reminder.at, op)
      } else {
        @Suppress("DEPRECATION")
        am.setExact(AlarmManager.RTC_WAKEUP, reminder.at, op)
      }
    } catch (_: SecurityException) {
      @Suppress("DEPRECATION")
      am.set(AlarmManager.RTC_WAKEUP, reminder.at, op)
    }
  }

  private fun operation(context: Context, reminder: Reminder): PendingIntent {
    val intent = Intent(context, TaskReminderReceiver::class.java)
    intent.putExtra(TaskCallIntents.EXTRA_ID, reminder.id)
    intent.putExtra(TaskCallIntents.EXTRA_TITLE, reminder.title)
    intent.putExtra(TaskCallIntents.EXTRA_TEXT, reminder.spokenText)
    intent.putExtra(TaskCallIntents.EXTRA_ALERT_LEVEL, reminder.alertLevel)
    intent.putExtra(TaskCallIntents.EXTRA_PHASE, reminder.phase)
    intent.putExtra(TaskCallIntents.EXTRA_DURATION, reminder.durationMin)
    intent.putExtra(TaskCallIntents.EXTRA_DOMAIN, reminder.domain)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getBroadcast(context, requestCode(reminder.id, reminder.phase), intent, flags)
  }

  private fun requestCode(id: String, phase: String): Int =
    REQUEST_BASE or ((id + ":" + phase).hashCode() and 0x00FFFFFF)

  private fun load(context: Context): List<Reminder> = loadList(context, KEY_REMINDERS)

  private fun save(context: Context, reminders: List<Reminder>) = saveList(context, KEY_REMINDERS, reminders)

  private fun loadOverrides(context: Context): List<Reminder> = loadList(context, KEY_OVERRIDES)

  private fun saveOverrides(context: Context, reminders: List<Reminder>) = saveList(context, KEY_OVERRIDES, reminders)

  private fun loadList(context: Context, key: String): List<Reminder> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(key, "[]") ?: "[]"
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).mapNotNull { i ->
        val obj = arr.optJSONObject(i) ?: return@mapNotNull null
        val id = obj.optString("id")
        val title = obj.optString("title")
        val spokenText = obj.optString("spokenText")
        val alertLevel = obj.optString("alertLevel", "normal")
        val at = obj.optLong("at", -1L)
        val phase = obj.optString("phase", TaskCallState.PHASE_START)
        val durationMin = obj.optInt("durationMin", 0)
        val domain = obj.optString("domain")
        if (id.isBlank() || title.isBlank() || at <= 0L) null
        else Reminder(id, title, spokenText, alertLevel, at, phase, durationMin, domain)
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun saveList(context: Context, key: String, reminders: List<Reminder>) {
    val arr = JSONArray()
    for (reminder in reminders) {
      val obj = JSONObject()
      obj.put("id", reminder.id)
      obj.put("title", reminder.title)
      obj.put("spokenText", reminder.spokenText)
      obj.put("alertLevel", reminder.alertLevel)
      obj.put("at", reminder.at)
      obj.put("phase", reminder.phase)
      obj.put("durationMin", reminder.durationMin)
      obj.put("domain", reminder.domain)
      arr.put(obj)
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(key, arr.toString())
      .apply()
  }
}
