package com.raj.lifeos.taskalert

import android.content.Context
import org.json.JSONObject

// Last incoming task-call extras, so JS can reopen the screen after a cold
// start from the lock screen without a custom native-to-JS bridge.
object TaskCallState {
  private const val PREFS = "task_call_state"
  private const val KEY_ACTIVE = "active"
  const val PHASE_START = "start"
  const val PHASE_END = "end"

  @Volatile
  var ringing = false

  @Volatile
  var inSession = false

  data class ActiveCall(
    val id: String,
    val title: String,
    val spokenText: String,
    val alertLevel: String,
    val phase: String,
    val durationMin: Int,
    val domain: String
  )

  fun setActive(context: Context, call: ActiveCall) {
    val obj = JSONObject()
    obj.put("id", call.id)
    obj.put("title", call.title)
    obj.put("spokenText", call.spokenText)
    obj.put("alertLevel", call.alertLevel)
    obj.put("phase", call.phase)
    obj.put("durationMin", call.durationMin)
    obj.put("domain", call.domain)
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(KEY_ACTIVE, obj.toString())
      .apply()
  }

  fun clear(context: Context) {
    ringing = false
    inSession = false
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .remove(KEY_ACTIVE)
      .apply()
  }

  fun busy(): Boolean = ringing || inSession

  private const val KEY_RING_ATTEMPTS = "ring_attempts"

  fun ringAttemptKey(id: String, phase: String): String = "$id::$phase"

  fun ringAttempts(context: Context, id: String, phase: String): Int {
    if (id.isBlank()) return 0
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_RING_ATTEMPTS, "{}") ?: "{}"
    return try {
      val obj = org.json.JSONObject(raw)
      obj.optInt(ringAttemptKey(id, phase), 0)
    } catch (_: Exception) {
      0
    }
  }

  fun incrementRingAttempts(context: Context, id: String, phase: String): Int {
    if (id.isBlank()) return 0
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_RING_ATTEMPTS, "{}") ?: "{}"
    val obj = try {
      org.json.JSONObject(raw)
    } catch (_: Exception) {
      org.json.JSONObject()
    }
    val key = ringAttemptKey(id, phase)
    val next = obj.optInt(key, 0) + 1
    obj.put(key, next)
    prefs.edit().putString(KEY_RING_ATTEMPTS, obj.toString()).apply()
    return next
  }

  fun clearRingAttempts(context: Context, id: String, phase: String? = null) {
    if (id.isBlank()) return
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_RING_ATTEMPTS, "{}") ?: "{}"
    val obj = try {
      org.json.JSONObject(raw)
    } catch (_: Exception) {
      return
    }
    if (phase.isNullOrBlank()) {
      val remove = mutableListOf<String>()
      val keys = obj.keys()
      while (keys.hasNext()) {
        val key = keys.next()
        if (key.startsWith("$id::")) remove.add(key)
      }
      for (key in remove) obj.remove(key)
    } else {
      obj.remove(ringAttemptKey(id, phase))
    }
    prefs.edit().putString(KEY_RING_ATTEMPTS, obj.toString()).apply()
  }

  fun read(context: Context): ActiveCall? {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_ACTIVE, null)
      ?: return null
    return try {
      val obj = JSONObject(raw)
      val id = obj.optString("id")
      if (id.isBlank()) null
      else ActiveCall(
        id = id,
        title = obj.optString("title"),
        spokenText = obj.optString("spokenText"),
        alertLevel = obj.optString("alertLevel", "normal"),
        phase = obj.optString("phase", PHASE_START),
        durationMin = obj.optInt("durationMin", 0),
        domain = obj.optString("domain")
      )
    } catch (_: Exception) {
      null
    }
  }

  private const val KEY_BURST = "burst_token"
  private const val KEY_ALERTED = "alerted"
  private const val KEY_CONSUMED = "burst_consumed"
  private const val KEY_SCREEN = "screen_counted"
  private const val KEY_SILENT = "silent_failures"
  private const val KEY_GAVE_UP = "end_gave_up"
  private const val KEY_UI = "ui_visible"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun json(context: Context, key: String): org.json.JSONObject {
    val raw = prefs(context).getString(key, "{}") ?: "{}"
    return try {
      org.json.JSONObject(raw)
    } catch (_: Exception) {
      org.json.JSONObject()
    }
  }

  private fun writeJson(context: Context, key: String, obj: org.json.JSONObject) {
    prefs(context).edit().putString(key, obj.toString()).commit()
  }

  fun beginBurst(context: Context, id: String, phase: String) {
    if (id.isBlank()) return
    synchronized(this) {
      val key = ringAttemptKey(id, phase)
      val burst = json(context, KEY_BURST)
      burst.put(key, System.currentTimeMillis())
      val alerted = json(context, KEY_ALERTED)
      alerted.remove(key)
      val consumed = json(context, KEY_CONSUMED)
      consumed.remove(key)
      val screen = json(context, KEY_SCREEN)
      screen.remove(key)
      prefs(context).edit()
        .putString(KEY_BURST, burst.toString())
        .putString(KEY_ALERTED, alerted.toString())
        .putString(KEY_CONSUMED, consumed.toString())
        .putString(KEY_SCREEN, screen.toString())
        .putBoolean(KEY_UI, false)
        .commit()
    }
  }

  fun clearBurst(context: Context, id: String, phase: String) {
    if (id.isBlank()) return
    synchronized(this) {
      val key = ringAttemptKey(id, phase)
      val burst = json(context, KEY_BURST)
      burst.remove(key)
      val consumed = json(context, KEY_CONSUMED)
      consumed.put(key, System.currentTimeMillis())
      prefs(context).edit()
        .putString(KEY_BURST, burst.toString())
        .putString(KEY_CONSUMED, consumed.toString())
        .commit()
    }
  }

  // One ring can be closed by the service timer, the screen timer, or a
  // deadline alarm. The first caller owns it.
  fun claimUnanswered(context: Context, id: String, phase: String): Boolean {
    if (id.isBlank()) return false
    synchronized(this) {
      val key = ringAttemptKey(id, phase)
      val burst = json(context, KEY_BURST)
      if (burst.optLong(key, 0L) > 0L) {
        burst.remove(key)
        val consumed = json(context, KEY_CONSUMED)
        consumed.put(key, System.currentTimeMillis())
        prefs(context).edit()
          .putString(KEY_BURST, burst.toString())
          .putString(KEY_CONSUMED, consumed.toString())
          .commit()
        return true
      }
      val consumedAt = json(context, KEY_CONSUMED).optLong(key, 0L)
      if (consumedAt > 0L && System.currentTimeMillis() - consumedAt < 30_000L) return false
      val screen = json(context, KEY_SCREEN)
      if (screen.optBoolean(key, false)) return false
      screen.put(key, true)
      writeJson(context, KEY_SCREEN, screen)
      return true
    }
  }

  fun markAlerted(context: Context, id: String, phase: String) {
    if (id.isBlank()) return
    synchronized(this) {
      val obj = json(context, KEY_ALERTED)
      obj.put(ringAttemptKey(id, phase), true)
      writeJson(context, KEY_ALERTED, obj)
    }
  }

  fun wasAlerted(context: Context, id: String, phase: String): Boolean {
    if (id.isBlank()) return false
    return json(context, KEY_ALERTED).optBoolean(ringAttemptKey(id, phase), false)
  }

  fun setUiVisible(context: Context, visible: Boolean) {
    prefs(context).edit().putBoolean(KEY_UI, visible).commit()
  }

  fun uiVisible(context: Context): Boolean = prefs(context).getBoolean(KEY_UI, false)

  fun incrementSilentFailures(context: Context, id: String, phase: String): Int {
    if (id.isBlank()) return 0
    synchronized(this) {
      val obj = json(context, KEY_SILENT)
      val key = ringAttemptKey(id, phase)
      val next = obj.optInt(key, 0) + 1
      obj.put(key, next)
      writeJson(context, KEY_SILENT, obj)
      return next
    }
  }

  fun clearSilentFailures(context: Context, id: String, phase: String? = null) {
    if (id.isBlank()) return
    synchronized(this) {
      val obj = json(context, KEY_SILENT)
      if (phase.isNullOrBlank()) {
        val remove = mutableListOf<String>()
        val keys = obj.keys()
        while (keys.hasNext()) {
          val key = keys.next()
          if (key.startsWith("$id::")) remove.add(key)
        }
        for (key in remove) obj.remove(key)
      } else {
        obj.remove(ringAttemptKey(id, phase))
      }
      writeJson(context, KEY_SILENT, obj)
    }
  }

  fun markEndGaveUp(context: Context, id: String) {
    if (id.isBlank()) return
    synchronized(this) {
      val obj = json(context, KEY_GAVE_UP)
      obj.put(id, System.currentTimeMillis())
      writeJson(context, KEY_GAVE_UP, obj)
    }
  }

  fun clearEndGaveUp(context: Context, id: String) {
    if (id.isBlank()) return
    synchronized(this) {
      val obj = json(context, KEY_GAVE_UP)
      obj.remove(id)
      writeJson(context, KEY_GAVE_UP, obj)
    }
  }

  fun endGaveUpIds(context: Context): List<String> {
    val obj = json(context, KEY_GAVE_UP)
    val ids = mutableListOf<String>()
    val keys = obj.keys()
    while (keys.hasNext()) ids.add(keys.next())
    return ids
  }
}
