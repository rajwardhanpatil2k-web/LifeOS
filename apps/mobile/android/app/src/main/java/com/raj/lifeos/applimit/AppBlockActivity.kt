package com.raj.lifeos.applimit

import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.widget.LinearLayout
import android.widget.TextView

class AppBlockActivity : Activity() {
  private var leaving = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    alive = true
    if (intent?.action == ACTION_DISMISS) {
      finish()
      return
    }
    if (Build.VERSION.SDK_INT >= 33) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(0) { goHome() }
    }
    bind(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    if (intent.action == ACTION_DISMISS) {
      resumedPackage = null
      finish()
      return
    }
    bind(intent)
  }

  override fun onResume() {
    super.onResume()
    alive = true
    if (intent?.action == ACTION_DISMISS) return
    resumedPackage = intent?.getStringExtra(EXTRA_PACKAGE)
  }

  override fun onPause() {
    if (resumedPackage == intent?.getStringExtra(EXTRA_PACKAGE)) resumedPackage = null
    super.onPause()
  }

  override fun onDestroy() {
    resumedPackage = null
    alive = false
    super.onDestroy()
  }

  @Deprecated("Replaced by OnBackInvokedCallback on API 33+, still used below that.")
  override fun onBackPressed() {
    goHome()
  }

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP) {
      goHome()
      return true
    }
    return super.dispatchKeyEvent(event)
  }

  private fun bind(source: Intent?) {
    val label = source?.getStringExtra(EXTRA_LABEL)?.ifBlank { "This app" } ?: "This app"
    val limitMs = source?.getLongExtra(EXTRA_LIMIT_MS, 0L) ?: 0L
    val usedMs = source?.getLongExtra(EXTRA_USED_MS, limitMs) ?: limitMs
    val night = source?.getBooleanExtra(EXTRA_NIGHT, false) == true
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setBackgroundColor(0xFF0A0B0D.toInt())
      val pad = dp(28)
      setPadding(pad, dp(72), pad, pad)
    }
    fun fullWidth() = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    root.addView(labelView("LIFE OS", 12f, 0xFFD4AF6A.toInt(), true), fullWidth())
    root.addView(space(18))
    root.addView(labelView("$label is blocked", 28f, 0xFFF2F4F7.toInt(), true), fullWidth())
    root.addView(space(14))
    root.addView(
      labelView(
        if (night) {
          "$label stays closed from 11:00 PM to 7:00 AM, even when today's time is still left. It opens again at 7:00 AM."
        } else {
          "You can use $label for ${formatSpent(limitMs)} each day. Today's time is used up (${formatSpent(usedMs)}). It starts again at midnight."
        },
        16f,
        0xFF8D95A3.toInt(),
        false
      ).apply { setLineSpacing(dp(4).toFloat(), 1f) },
      fullWidth()
    )
    root.addView(space(28))
    val button = TextView(this).apply {
      text = "Close"
      setTextColor(0xFF1A1508.toInt())
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      setTypeface(typeface, Typeface.BOLD)
      gravity = Gravity.CENTER
      val h = dp(18)
      setPadding(h, dp(14), h, dp(14))
      background = GradientDrawable().apply {
        setColor(0xFFD4AF6A.toInt())
        cornerRadius = dp(12).toFloat()
      }
      setOnClickListener { goHome() }
    }
    root.addView(button, fullWidth())
    setContentView(root)
  }

  private fun labelView(text: String, sizeSp: Float, color: Int, bold: Boolean): TextView {
    return TextView(this).apply {
      this.text = text
      setTextColor(color)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
      if (bold) setTypeface(typeface, Typeface.BOLD)
      gravity = Gravity.CENTER_HORIZONTAL
    }
  }

  private fun space(value: Int): android.view.View {
    return android.view.View(this).apply {
      layoutParams = LinearLayout.LayoutParams(1, dp(value))
    }
  }

  private fun goHome() {
    if (leaving) return
    leaving = true
    suppressPackage = intent?.getStringExtra(EXTRA_PACKAGE)
    suppressUntil = System.currentTimeMillis() + 2500L
    resumedPackage = null
    try {
      val home = Intent(Intent.ACTION_MAIN)
        .addCategory(Intent.CATEGORY_HOME)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      startActivity(home)
    } catch (_: Exception) {
    }
    finish()
  }

  private fun dp(value: Int): Int {
    return (value * resources.displayMetrics.density).toInt()
  }

  companion object {
    const val ACTION_DISMISS = "com.raj.lifeos.applimit.DISMISS"
    const val EXTRA_PACKAGE = "packageName"
    const val EXTRA_LABEL = "label"
    const val EXTRA_LIMIT_MS = "limitMs"
    const val EXTRA_USED_MS = "usedMs"
    const val EXTRA_NIGHT = "night"

    @Volatile var resumedPackage: String? = null
    @Volatile var alive = false
    @Volatile var suppressPackage: String? = null
    @Volatile var suppressUntil = 0L
  }
}
