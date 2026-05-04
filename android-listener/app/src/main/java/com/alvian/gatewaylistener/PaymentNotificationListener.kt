package com.alvian.gatewaylistener

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import kotlin.concurrent.thread

class PaymentNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val allowedPackages = AppConfig.allowedPackages(this)
        if (allowedPackages.isNotEmpty() && sbn.packageName !in allowedPackages) return

        val extras = sbn.notification.extras
        val title = extras.getString(Notification.EXTRA_TITLE).orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()

        val combined = "$title $text $bigText"
        if (!combined.contains("Rp", ignoreCase = true) &&
            !combined.contains("IDR", ignoreCase = true)
        ) {
            return
        }

        thread(name = "gateway-notification-send") {
            GatewayClient
                .sendNotification(this, sbn.packageName, title, text, bigText)
                .onFailure { error ->
                    Log.e("GatewayListener", "Failed to send notification", error)
                }
        }
    }
}
