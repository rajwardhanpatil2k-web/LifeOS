package com.raj.lifeos.voice

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

// One-shot exact alarms that fire a short TTS cue at the same wall-clock
// as each task notification. AlarmManager does not survive reboot, so the
// cue list is persisted and restored from BootReceiver.
object VoiceAgentScheduler {
  private const val PREFS = "voice_agent_prefs"
  private const val KEY_CUES = "cues"
  private const val KEY_ENABLED = "enabled"
  private const val REQUEST_BASE = 0x5A000000

  fun setEnabled(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean(KEY_ENABLED, enabled)
      .apply()
    if (!enabled) cancelAll(context)
  }

  fun isEnabled(context: Context): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, true)

  fun schedule(context: Context, id: String, text: String, atMillis: Long) {
    if (!isEnabled(context)) return
    if (id.isBlank() || text.isBlank()) return
    val now = System.currentTimeMillis()
    if (atMillis <= now + 1_000L) return
    val cues = loadCues(context).filter { it.id != id }.toMutableList()
    cues.add(Cue(id, text, atMillis))
    saveCues(context, cues)
    arm(context, id, text, atMillis)
  }

  fun cancel(context: Context, id: String) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(operation(context, id, ""))
    saveCues(context, loadCues(context).filter { it.id != id })
  }

  fun cancelAll(context: Context) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    for (cue in loadCues(context)) {
      am.cancel(operation(context, cue.id, cue.text))
    }
    saveCues(context, emptyList())
  }

  fun restore(context: Context) {
    if (!isEnabled(context)) return
    val now = System.currentTimeMillis()
    val future = loadCues(context).filter { it.at > now + 1_000L }
    saveCues(context, future)
    for (cue in future) arm(context, cue.id, cue.text, cue.at)
  }

  private fun arm(context: Context, id: String, text: String, atMillis: Long) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val op = operation(context, id, text)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, op)
      } else {
        @Suppress("DEPRECATION")
        am.setExact(AlarmManager.RTC_WAKEUP, atMillis, op)
      }
    } catch (_: SecurityException) {
      @Suppress("DEPRECATION")
      am.set(AlarmManager.RTC_WAKEUP, atMillis, op)
    }
  }

  private fun operation(context: Context, id: String, text: String): PendingIntent {
    val intent = Intent(context, VoiceAgentReceiver::class.java)
    intent.putExtra(VoiceAgentService.EXTRA_ID, id)
    intent.putExtra(VoiceAgentService.EXTRA_TEXT, text)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_IMMUTABLE else 0
    return PendingIntent.getBroadcast(context, requestCode(id), intent, flags)
  }

  private fun requestCode(id: String): Int = REQUEST_BASE or (id.hashCode() and 0x00FFFFFF)

  private data class Cue(val id: String, val text: String, val at: Long)

  private fun loadCues(context: Context): List<Cue> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_CUES, "[]") ?: "[]"
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).mapNotNull { i ->
        val obj = arr.optJSONObject(i) ?: return@mapNotNull null
        val id = obj.optString("id")
        val text = obj.optString("text")
        val at = obj.optLong("at", -1L)
        if (id.isBlank() || text.isBlank() || at <= 0L) null else Cue(id, text, at)
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun saveCues(context: Context, cues: List<Cue>) {
    val arr = JSONArray()
    for (cue in cues) {
      val obj = JSONObject()
      obj.put("id", cue.id)
      obj.put("text", cue.text)
      obj.put("at", cue.at)
      arr.put(obj)
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(KEY_CUES, arr.toString())
      .apply()
  }
}
