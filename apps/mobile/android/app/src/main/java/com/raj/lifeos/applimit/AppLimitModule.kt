package com.raj.lifeos.applimit

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import java.util.concurrent.Executors

class AppLimitModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val worker = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "lifeos-app-limit-bridge").apply { isDaemon = true }
  }

  override fun getName(): String = "AppLimitModule"

  @ReactMethod
  fun getState(promise: Promise) {
    val ctx = reactApplicationContext
    worker.execute {
      try {
        AppLimitMonitorService.sync(ctx)
        promise.resolve(stateMap(ctx))
      } catch (e: Exception) {
        promise.reject("APP_LIMIT_STATE_FAILED", e)
      }
    }
  }

  @ReactMethod
  fun setLimits(limits: ReadableArray, promise: Promise) {
    val ctx = reactApplicationContext
    val rows = ArrayList<Triple<String, String, Int>>(limits.size())
    for (i in 0 until limits.size()) {
      val map = limits.getMap(i)
      val pkg = if (map.hasKey("packageName")) map.getString("packageName") else null
      if (pkg.isNullOrBlank()) continue
      val label = if (map.hasKey("label")) map.getString("label") ?: "" else ""
      val minutes = if (map.hasKey("limitMinutes")) map.getDouble("limitMinutes").toInt() else 60
      rows.add(Triple(pkg, label, minutes))
    }
    worker.execute {
      try {
        val safe = rows.filter { !isProtected(ctx, it.first) }
        AppLimitStore.save(ctx, AppLimitStore.parse(ctx, safe))
        AppLimitMonitorService.sync(ctx)
        AppLimitEnforcer.requestScan(ctx)
        promise.resolve(stateMap(ctx))
      } catch (e: Exception) {
        promise.reject("APP_LIMIT_SAVE_FAILED", e)
      }
    }
  }

  @ReactMethod
  fun listApps(promise: Promise) {
    val ctx = reactApplicationContext
    worker.execute {
      try {
        val pm = ctx.packageManager
        val probe = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val resolved = if (Build.VERSION.SDK_INT >= 33) {
          pm.queryIntentActivities(probe, PackageManager.ResolveInfoFlags.of(0))
        } else {
          @Suppress("DEPRECATION")
          pm.queryIntentActivities(probe, 0)
        }
        val seen = HashSet<String>()
        val rows = resolved.mapNotNull { info ->
          val pkg = info.activityInfo?.packageName ?: return@mapNotNull null
          if (!seen.add(pkg) || isProtected(ctx, pkg)) return@mapNotNull null
          val label = info.loadLabel(pm).toString().trim().ifBlank { pkg }
          pkg to label
        }.sortedBy { it.second.lowercase() }
        val array = Arguments.createArray()
        for ((pkg, label) in rows) {
          val map = Arguments.createMap()
          map.putString("packageName", pkg)
          map.putString("label", label)
          array.pushMap(map)
        }
        promise.resolve(array)
      } catch (e: Exception) {
        promise.reject("APP_LIMIT_LIST_FAILED", e)
      }
    }
  }

  @ReactMethod
  fun openUsageAccess(promise: Promise) {
    open(promise, Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
  }

  @ReactMethod
  fun openOverlaySettings(promise: Promise) {
    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${reactApplicationContext.packageName}")
    )
    open(promise, intent)
  }

  @ReactMethod
  fun openAccessibilitySettings(promise: Promise) {
    open(promise, Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
  }

  private fun isProtected(ctx: Context, packageName: String): Boolean {
    if (packageName == ctx.packageName) return true
    if (packageName == "com.android.settings" || packageName == "com.android.systemui") return true
    return try {
      val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
      @Suppress("DEPRECATION")
      ctx.packageManager.queryIntentActivities(home, PackageManager.MATCH_DEFAULT_ONLY)
        .any { it.activityInfo?.packageName == packageName }
    } catch (_: Exception) {
      false
    }
  }

  private fun open(promise: Promise, intent: Intent) {
    try {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("APP_LIMIT_SETTINGS_FAILED", e)
    }
  }

  private fun stateMap(ctx: ReactApplicationContext): com.facebook.react.bridge.WritableMap {
    val limits = AppLimitStore.load(ctx)
    val snapshot = if (AppLimitUsage.hasUsageAccess(ctx) && limits.isNotEmpty()) {
      AppLimitUsage.snapshot(ctx, limits.map { it.packageName }.toSet())
    } else {
      UsageSnapshot(emptyMap(), null)
    }
    val usage = snapshot.usedMs
    val foreground = snapshot.foreground
    val array = Arguments.createArray()
    for (limit in limits) {
      val item = Arguments.createMap()
      item.putString("packageName", limit.packageName)
      item.putString("label", limit.label)
      item.putInt("limitMinutes", limit.limitMinutes)
      item.putDouble("usedMs", (usage[limit.packageName] ?: 0L).toDouble())
      array.pushMap(item)
    }
    val permissions = Arguments.createMap()
    permissions.putBoolean("usage", AppLimitUsage.hasUsageAccess(ctx))
    permissions.putBoolean("overlay", Settings.canDrawOverlays(ctx))
    permissions.putBoolean("accessibility", AppLimitUsage.isAccessibilityEnabled(ctx))
    val result = Arguments.createMap()
    result.putArray("limits", array)
    result.putMap("permissions", permissions)
    if (foreground.isNullOrBlank()) result.putNull("foreground") else result.putString("foreground", foreground)
    return result
  }
}
