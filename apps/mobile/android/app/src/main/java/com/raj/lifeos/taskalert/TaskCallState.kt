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
}
