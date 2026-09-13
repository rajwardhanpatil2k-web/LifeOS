package com.raj.lifeos.taskalert

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object TaskCallQueue {
  private const val PREFS = "task_call_queue"
  private const val KEY = "queue"

  fun enqueue(context: Context, reminder: TaskReminderScheduler.Reminder) {
    if (reminder.id.isBlank()) return
    val next = load(context).filter { it.id != reminder.id }.toMutableList()
    next.add(reminder)
    save(context, next)
  }

  fun pop(context: Context): TaskReminderScheduler.Reminder? {
    val items = load(context)
    if (items.isEmpty()) return null
    val first = items.first()
    save(context, items.drop(1))
    return first
  }

  fun clear(context: Context) {
    save(context, emptyList())
  }

  fun releaseNext(context: Context) {
    val next = pop(context) ?: return
    val at = System.currentTimeMillis() + TaskReminderScheduler.QUEUE_RELEASE_MS
    TaskReminderScheduler.schedule(context, next.copy(at = at))
  }

  private fun load(context: Context): List<TaskReminderScheduler.Reminder> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]") ?: "[]"
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).mapNotNull { i ->
        val obj = arr.optJSONObject(i) ?: return@mapNotNull null
        val id = obj.optString("id")
        val title = obj.optString("title")
        if (id.isBlank() || title.isBlank()) null
        else TaskReminderScheduler.Reminder(
          id = id,
          title = title,
          spokenText = obj.optString("spokenText"),
          alertLevel = obj.optString("alertLevel", "normal"),
          at = obj.optLong("at", 0L),
          phase = obj.optString("phase", TaskCallState.PHASE_START),
          durationMin = obj.optInt("durationMin", 0),
          domain = obj.optString("domain")
        )
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun save(context: Context, items: List<TaskReminderScheduler.Reminder>) {
    val arr = JSONArray()
    for (item in items) {
      val obj = JSONObject()
      obj.put("id", item.id)
      obj.put("title", item.title)
      obj.put("spokenText", item.spokenText)
      obj.put("alertLevel", item.alertLevel)
      obj.put("at", item.at)
      obj.put("phase", item.phase)
      obj.put("durationMin", item.durationMin)
      obj.put("domain", item.domain)
      arr.put(obj)
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(KEY, arr.toString())
      .apply()
  }
}
