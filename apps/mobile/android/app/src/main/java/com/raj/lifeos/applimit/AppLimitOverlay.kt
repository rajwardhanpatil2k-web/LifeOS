package com.raj.lifeos.applimit

import android.content.Context
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.provider.Settings
import android.text.TextUtils
import android.view.Gravity
import android.view.WindowManager
import android.widget.TextView

// A small countdown drawn over the limited app. Touches pass through it,
// so the person can keep using the app until the daily time is gone.
internal object AppLimitOverlay {
  private var view: TextView? = null
  private var windowManager: WindowManager? = null
  private var accessibilityBacked = false
  private var lastText: String? = null

  fun show(context: Context, fromAccessibility: Boolean, label: String, remainingMs: Long): Boolean {
    if (!canDraw(context, fromAccessibility)) return false
    val text = "$label · ${formatRemainingClock(remainingMs)} left"
    val color = if (remainingMs <= 5 * 60 * 1000L) 0xFFD98B73.toInt() else 0xFFD4AF6A.toInt()
    val existing = view
    if (existing != null && accessibilityBacked == fromAccessibility) {
      if (lastText != text || existing.currentTextColor != color) {
        existing.text = text
        existing.setTextColor(color)
        lastText = text
        try {
          windowManager?.updateViewLayout(existing, existing.layoutParams)
        } catch (_: Exception) {
          hide()
          return false
        }
      }
      return true
    }
    hide()
    val wm = context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return false
    val chip = TextView(context).apply {
      this.text = text
      setTextColor(color)
      textSize = 13f
      setTypeface(typeface, Typeface.BOLD)
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
      val padH = dp(context, 14)
      val padV = dp(context, 8)
      setPadding(padH, padV, padH, padV)
      background = GradientDrawable().apply {
        setColor(0xF015181E.toInt())
        cornerRadius = dp(context, 20).toFloat()
      }
    }
    val type = if (fromAccessibility) {
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
    } else {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    }
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
      y = statusBarHeight(context) + dp(context, 8)
      width = WindowManager.LayoutParams.WRAP_CONTENT
    }
    chip.maxWidth = (context.resources.displayMetrics.widthPixels * 0.86f).toInt()
    return try {
      wm.addView(chip, params)
      view = chip
      windowManager = wm
      accessibilityBacked = fromAccessibility
      lastText = text
      true
    } catch (_: Exception) {
      false
    }
  }

  fun hide() {
    val chip = view ?: return
    try {
      windowManager?.removeView(chip)
    } catch (_: Exception) {
    }
    view = null
    windowManager = null
    lastText = null
  }

  private fun canDraw(context: Context, fromAccessibility: Boolean): Boolean {
    if (fromAccessibility) return true
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
  }

  private fun dp(context: Context, value: Int): Int {
    return (value * context.resources.displayMetrics.density).toInt()
  }

  private fun statusBarHeight(context: Context): Int {
    val id = context.resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (id > 0) context.resources.getDimensionPixelSize(id) else dp(context, 24)
  }
}
