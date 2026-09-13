package com.raj.lifeos.wakealarm

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.raj.lifeos.voice.VoiceAgentModule
import com.raj.lifeos.taskalert.TaskReminderModule

class WakeAlarmPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(
      WakeAlarmModule(reactContext),
      VoiceAgentModule(reactContext),
      TaskReminderModule(reactContext)
    )
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
