package com.raj.lifeos.wakealarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WakeAlarmModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "WakeAlarmModule"

  @ReactMethod
  fun scheduleDailyAlarm(hour: Double, minute: Double, promise: Promise) {
    try {
      val next = AlarmScheduler.schedule(reactApplicationContext, hour.toInt(), minute.toInt())
      promise.resolve(next.toDouble())
    } catch (e: Exception) {
      promise.reject("SCHEDULE_FAILED", e)
    }
  }

  @ReactMethod
  fun cancelAlarm(promise: Promise) {
    try {
      AlarmScheduler.cancel(reactApplicationContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("CANCEL_FAILED", e)
    }
  }

  @ReactMethod
  fun stopRinging(promise: Promise) {
    try {
      AlarmRingingService.stop(reactApplicationContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("STOP_FAILED", e)
    }
  }

  @ReactMethod
  fun isRinging(promise: Promise) {
    promise.resolve(AlarmRingingService.isRinging())
  }

  @ReactMethod
  fun canScheduleExactAlarms(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val am = reactApplicationContext.getSystemService(AlarmManager::class.java)
        promise.resolve(am?.canScheduleExactAlarms() ?: true)
      } else {
        promise.resolve(true)
      }
    } catch (e: Exception) {
      promise.reject("CHECK_FAILED", e)
    }
  }

  @ReactMethod
  fun openExactAlarmSettings(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
        intent.data = Uri.parse("package:" + reactApplicationContext.packageName)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        reactApplicationContext.startActivity(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OPEN_SETTINGS_FAILED", e)
    }
  }

  @ReactMethod
  fun ringNow(promise: Promise) {
    try {
      val serviceIntent = Intent(reactApplicationContext, AlarmRingingService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactApplicationContext.startForegroundService(serviceIntent)
      } else {
        reactApplicationContext.startService(serviceIntent)
      }
      AlarmScheduler.launchWakeScreen(reactApplicationContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("RING_FAILED", e)
    }
  }

  @ReactMethod
  fun canUseFullScreenIntent(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        val nm = reactApplicationContext.getSystemService(NotificationManager::class.java)
        promise.resolve(nm?.canUseFullScreenIntent() ?: true)
      } else {
        promise.resolve(true)
      }
    } catch (e: Exception) {
      promise.reject("CHECK_FAILED", e)
    }
  }

  @ReactMethod
  fun openFullScreenIntentSettings(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
        intent.data = Uri.parse("package:" + reactApplicationContext.packageName)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        reactApplicationContext.startActivity(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OPEN_SETTINGS_FAILED", e)
    }
  }

  @ReactMethod
  fun getNextAlarmAt(promise: Promise) {
    try {
      promise.resolve(AlarmScheduler.nextAlarmAtMillis(reactApplicationContext).toDouble())
    } catch (e: Exception) {
      promise.reject("NEXT_FAILED", e)
    }
  }

  @ReactMethod
  fun getAlarmInfo(promise: Promise) {
    try {
      val (hour, minute, enabled) = AlarmScheduler.readHourMinuteEnabled(reactApplicationContext)
      val map = Arguments.createMap()
      map.putInt("hour", hour)
      map.putInt("minute", minute)
      map.putBoolean("enabled", enabled)
      map.putDouble("nextAt", AlarmScheduler.nextAlarmAtMillis(reactApplicationContext).toDouble())
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("INFO_FAILED", e)
    }
  }

  @ReactMethod
  fun areNotificationsEnabled(promise: Promise) {
    try {
      promise.resolve(NotificationManagerCompat.from(reactApplicationContext).areNotificationsEnabled())
    } catch (e: Exception) {
      promise.reject("CHECK_FAILED", e)
    }
  }

  @ReactMethod
  fun isIgnoringBatteryOptimizations(promise: Promise) {
    try {
      val pm = reactApplicationContext.getSystemService(PowerManager::class.java)
      promise.resolve(pm?.isIgnoringBatteryOptimizations(reactApplicationContext.packageName) ?: true)
    } catch (e: Exception) {
      promise.reject("CHECK_FAILED", e)
    }
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimizations(promise: Promise) {
    try {
      val pm = reactApplicationContext.getSystemService(PowerManager::class.java)
      if (pm?.isIgnoringBatteryOptimizations(reactApplicationContext.packageName) == true) {
        promise.resolve(true)
        return
      }
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
      intent.data = Uri.parse("package:" + reactApplicationContext.packageName)
      intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OPEN_SETTINGS_FAILED", e)
    }
  }

  @ReactMethod
  fun openAppSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
      intent.data = Uri.parse("package:" + reactApplicationContext.packageName)
      intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OPEN_SETTINGS_FAILED", e)
    }
  }

  @ReactMethod
  fun openNotificationSettings(promise: Promise) {
    try {
      val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
      intent.putExtra(Settings.EXTRA_APP_PACKAGE, reactApplicationContext.packageName)
      intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
      reactApplicationContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("OPEN_SETTINGS_FAILED", e)
    }
  }
}
