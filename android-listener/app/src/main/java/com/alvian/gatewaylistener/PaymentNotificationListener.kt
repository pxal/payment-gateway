package com.alvian.gatewaylistener

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import kotlin.concurrent.thread

class PaymentNotificationListener : NotificationListenerService() {
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
}
