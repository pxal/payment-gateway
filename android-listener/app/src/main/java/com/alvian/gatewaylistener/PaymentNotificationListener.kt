package com.alvian.gatewaylistener

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import kotlin.concurrent.thread

class PaymentNotificationListener : NotificationListenerService() {
    override fun onListenerConnected() {
        super.onListenerConnected()
        DebugLog.add(this, "listener connected")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        DebugLog.add(this, "listener disconnected; requesting rebind")
        requestRebind(ComponentName(this, PaymentNotificationListener::class.java))
    }

    override fun onDestroy() {
        DebugLog.add(this, "listener destroyed; requesting rebind")
        requestRebind(ComponentName(this, PaymentNotificationListener::class.java))
        super.onDestroy()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val allowedPackages = AppConfig.allowedPackages(this)
        val extras = sbn.notification.extras
        val title = extras.getString(Notification.EXTRA_TITLE).orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
        DebugLog.add(this, "received package=${sbn.packageName} title=$title text=$text")

        if (allowedPackages.isNotEmpty() && sbn.packageName !in allowedPackages) {
            DebugLog.add(this, "ignored package=${sbn.packageName}; allowed=${allowedPackages.joinToString(",")}")
            return
        }

        val combined = "$title $text $bigText"
        if (!combined.contains("Rp", ignoreCase = true) &&
            !combined.contains("IDR", ignoreCase = true)
        ) {
            DebugLog.add(this, "ignored no amount package=${sbn.packageName}")
            return
        }

        if (isDuplicate(sbn.packageName, title, text, bigText)) {
            DebugLog.add(this, "ignored duplicate package=${sbn.packageName} title=$title")
            return
        }

        DebugLog.add(this, "accepted package=${sbn.packageName}; sending to gateway")
        thread(name = "gateway-notification-send") {
            GatewayClient
                .sendNotification(this, sbn.packageName, title, text, bigText)
                .onFailure { error ->
                    DebugLog.add(this, "send failed: ${error.message}")
                    Log.e("GatewayListener", "Failed to send notification", error)
                }
        }
    }

    private fun isDuplicate(packageName: String, title: String, text: String, bigText: String): Boolean {
        val fingerprint = listOf(packageName, title, text, bigText)
            .joinToString("|")
            .lowercase()
        val now = System.currentTimeMillis()
        val prefs = getSharedPreferences("gateway_listener_dedup", Context.MODE_PRIVATE)
        val lastFingerprint = prefs.getString("fingerprint", "").orEmpty()
        val lastAt = prefs.getLong("at", 0L)
        val duplicate = fingerprint == lastFingerprint && now - lastAt < 30_000

        prefs.edit()
            .putString("fingerprint", fingerprint)
            .putLong("at", now)
            .apply()

        return duplicate
    }
}
