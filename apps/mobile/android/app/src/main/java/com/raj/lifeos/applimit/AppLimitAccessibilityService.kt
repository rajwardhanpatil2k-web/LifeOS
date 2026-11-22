package com.raj.lifeos.applimit

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

// Reads only the package name of the window that just opened. It does not
// read the screen, text, or passwords. That name is how Life OS knows a
// limited app came to the front before the usage stats catch up.
class AppLimitAccessibilityService : AccessibilityService() {
  override fun onServiceConnected() {
    super.onServiceConnected()
    AppLimitEnforcer.attach(this)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    val type = event.eventType
    if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
    AppLimitEnforcer.noteForeground(event.packageName?.toString())
    AppLimitEnforcer.requestScan(this)
  }

  override fun onInterrupt() {}

  override fun onDestroy() {
    AppLimitEnforcer.detach(this)
    super.onDestroy()
  }
}
