package com.raj.lifeos.applimit

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

internal data class AppLimit(
  val packageName: String,
  val label: String,
  val limitMinutes: Int,
) {
  val limitMs: Long get() = limitMinutes * 60_000L
}

internal object AppLimitStore {
  private const val PREFS = "lifeos_app_limits"
  private const val KEY = "limits"
  private const val MIN_MINUTES = 5
  private const val MAX_MINUTES = 12 * 60

  fun load(context: Context): List<AppLimit> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return emptyList()
    return try {
      parse(context, JSONArray(raw))
    } catch (_: Exception) {
      emptyList()
    }
  }

  fun save(context: Context, limits: List<AppLimit>) {
    val clean = LinkedHashMap<String, AppLimit>()
    for (limit in limits) {
      val safe = sanitize(context, limit.packageName, limit.label, limit.limitMinutes) ?: continue
      clean[safe.packageName] = safe
    }
    val array = JSONArray()
    for (limit in clean.values) {
      array.put(
        JSONObject()
          .put("packageName", limit.packageName)
          .put("label", limit.label)
          .put("limitMinutes", limit.limitMinutes)
      )
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, array.toString()).commit()
  }

  fun parse(context: Context, rows: List<Triple<String, String, Int>>): List<AppLimit> {
    val clean = LinkedHashMap<String, AppLimit>()
    for ((pkg, label, minutes) in rows) {
      val safe = sanitize(context, pkg, label, minutes) ?: continue
      clean[safe.packageName] = safe
    }
    return clean.values.toList()
  }

  private fun parse(context: Context, array: JSONArray): List<AppLimit> {
    val rows = ArrayList<Triple<String, String, Int>>(array.length())
    for (i in 0 until array.length()) {
      val obj = array.optJSONObject(i) ?: continue
      rows.add(
        Triple(
          obj.optString("packageName"),
          obj.optString("label"),
          obj.optInt("limitMinutes", 60)
        )
      )
    }
    return parse(context, rows)
  }

  private fun sanitize(context: Context, packageName: String, label: String, minutes: Int): AppLimit? {
    val pkg = packageName.trim()
    if (pkg.length !in 3..200 || pkg == context.packageName || !pkg.contains('.')) return null
    if (pkg.any { !(it.isLetterOrDigit() || it == '.' || it == '_') }) return null
    val safeMinutes = minutes.coerceIn(MIN_MINUTES, MAX_MINUTES)
    val safeLabel = label.trim().take(80).ifBlank { pkg }
    return AppLimit(pkg, safeLabel, safeMinutes)
  }
}
