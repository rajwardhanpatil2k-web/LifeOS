package com.raj.lifeos.taskalert

import android.content.Context
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

// Bridge task-call side effects into JS. Auto-skip is a list so several missed
// tasks survive until each one is in the outbox. Dismiss tells the open screen
// to close without taking a second action.
object TaskCallEvents {
  const val EVENT_AUTO_SKIP = "TaskCallAutoSkip"
  const val EVENT_DISMISS = "TaskCallDismissed"
  private const val PREFS = "task_call_events"
  private const val KEY_LIST = "pending_auto_skips"
  private const val KEY_LEGACY = "pending_auto_skip"

  @Volatile
  var reactContext: ReactApplicationContext? = null

  fun queueAutoSkip(context: Context, itemId: String, phase: String, reason: String = "unanswered") {
    if (itemId.isBlank()) return
    val rows = load(context).filter { it.optString("itemId") != itemId }.toMutableList()
    rows.add(
      JSONObject()
        .put("itemId", itemId)
        .put("phase", phase)
        .put("reason", reason)
        .put("at", System.currentTimeMillis())
    )
    save(context, rows)
    emitAutoSkip(context, itemId, phase, reason)
  }

  fun peekPendingAutoSkips(context: Context): WritableArray {
    val array = Arguments.createArray()
    for (row in load(context)) {
      val itemId = row.optString("itemId")
      if (itemId.isBlank()) continue
      val map = Arguments.createMap()
      map.putString("itemId", itemId)
      map.putString("phase", row.optString("phase", TaskCallState.PHASE_START))
      map.putString("reason", row.optString("reason", "unanswered"))
      map.putDouble("at", row.optLong("at", 0L).toDouble())
      array.pushMap(map)
    }
    return array
  }

  fun ackAutoSkip(context: Context, itemId: String) {
    if (itemId.isBlank()) return
    save(context, load(context).filter { it.optString("itemId") != itemId })
  }

  fun emitDismiss(context: Context, itemId: String, phase: String, reason: String, minutes: Int = 0) {
    if (itemId.isBlank()) return
    val map = Arguments.createMap()
    map.putString("itemId", itemId)
    map.putString("phase", phase)
    map.putString("reason", reason)
    map.putInt("minutes", minutes)
    emit(context, EVENT_DISMISS, map)
  }

  fun emitAutoSkip(context: Context, itemId: String, phase: String, reason: String = "unanswered") {
    val map = Arguments.createMap()
    map.putString("itemId", itemId)
    map.putString("phase", phase)
    map.putString("reason", reason)
    emit(context, EVENT_AUTO_SKIP, map)
  }

  private fun load(context: Context): List<JSONObject> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_LIST, null)
    val rows = mutableListOf<JSONObject>()
    if (!raw.isNullOrBlank()) {
      try {
        val arr = JSONArray(raw)
        for (i in 0 until arr.length()) {
          val row = arr.optJSONObject(i) ?: continue
          if (row.optString("itemId").isNotBlank()) rows.add(row)
        }
      } catch (_: Exception) {
      }
    }
    val legacy = prefs.getString(KEY_LEGACY, null)
    if (!legacy.isNullOrBlank()) {
      try {
        val row = JSONObject(legacy)
        val itemId = row.optString("itemId")
        if (itemId.isNotBlank() && rows.none { it.optString("itemId") == itemId }) rows.add(row)
      } catch (_: Exception) {
      }
      save(context, rows)
    }
    return rows
  }

  private fun save(context: Context, rows: List<JSONObject>) {
    val arr = JSONArray()
    for (row in rows) arr.put(row)
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(KEY_LIST, arr.toString())
      .remove(KEY_LEGACY)
      .commit()
  }

  private fun emit(context: Context, event: String, map: WritableMap) {
    reactContext(context)?.let { ctx ->
      try {
        ctx
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(event, map)
      } catch (_: Exception) {
      }
    }
  }

  private fun reactContext(context: Context): ReactApplicationContext? {
    reactContext?.let { return it }
    val app = context.applicationContext
    if (app is ReactApplication) {
      try {
        return app.reactNativeHost.reactInstanceManager.currentReactContext as? ReactApplicationContext
      } catch (_: Exception) {
      }
    }
    return null
  }
}
