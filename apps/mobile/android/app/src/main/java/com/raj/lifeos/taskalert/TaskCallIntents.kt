package com.raj.lifeos.taskalert

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.raj.lifeos.MainActivity

object TaskCallIntents {
  const val URI_PREFIX = "lifeos://task-call"
  const val EXTRA_ID = "id"
  const val EXTRA_TITLE = "title"
  const val EXTRA_TEXT = "text"
  const val EXTRA_ALERT_LEVEL = "alertLevel"
  const val EXTRA_PHASE = "phase"
  const val EXTRA_DURATION = "durationMin"
  const val EXTRA_DOMAIN = "domain"

  fun uri(
    id: String,
    phase: String,
    title: String,
    alertLevel: String,
    durationMin: Int,
    domain: String,
    pickedUp: Boolean = false
  ): Uri {
    val builder = Uri.parse(URI_PREFIX).buildUpon()
      .appendQueryParameter("itemId", id)
      .appendQueryParameter("phase", phase)
      .appendQueryParameter("title", title)
      .appendQueryParameter("alertLevel", alertLevel)
      .appendQueryParameter("durationMin", durationMin.toString())
      .appendQueryParameter("domain", domain)
    if (pickedUp) builder.appendQueryParameter("pickedUp", "1")
    return builder.build()
  }

  fun screenIntent(
    context: Context,
    id: String,
    phase: String,
    title: String,
    alertLevel: String,
    durationMin: Int,
    domain: String,
    pickedUp: Boolean = false
  ): Intent {
    val intent = Intent(context, MainActivity::class.java)
    intent.action = Intent.ACTION_VIEW
    intent.data = uri(id, phase, title, alertLevel, durationMin, domain, pickedUp)
    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or
      Intent.FLAG_ACTIVITY_CLEAR_TOP or
      Intent.FLAG_ACTIVITY_SINGLE_TOP or
      Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    return intent
  }

  fun launchScreen(
    context: Context,
    id: String,
    phase: String,
    title: String,
    alertLevel: String,
    durationMin: Int,
    domain: String,
    pickedUp: Boolean = false
  ) {
    try {
      context.startActivity(screenIntent(context, id, phase, title, alertLevel, durationMin, domain, pickedUp))
    } catch (_: Exception) {
    }
  }

  fun copyExtras(from: Intent, to: Intent) {
    to.putExtra(EXTRA_ID, from.getStringExtra(EXTRA_ID))
    to.putExtra(EXTRA_TITLE, from.getStringExtra(EXTRA_TITLE))
    to.putExtra(EXTRA_TEXT, from.getStringExtra(EXTRA_TEXT))
    to.putExtra(EXTRA_ALERT_LEVEL, from.getStringExtra(EXTRA_ALERT_LEVEL))
    to.putExtra(EXTRA_PHASE, from.getStringExtra(EXTRA_PHASE) ?: TaskCallState.PHASE_START)
    to.putExtra(EXTRA_DURATION, from.getIntExtra(EXTRA_DURATION, 0))
    to.putExtra(EXTRA_DOMAIN, from.getStringExtra(EXTRA_DOMAIN))
  }
}
