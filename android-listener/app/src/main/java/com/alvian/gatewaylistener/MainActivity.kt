package com.alvian.gatewaylistener

import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlin.concurrent.thread

class MainActivity : Activity() {
    private lateinit var statusText: TextView
    private lateinit var serverUrlInput: EditText
    private lateinit var secretInput: EditText
    private lateinit var packagesInput: EditText
    private lateinit var debugText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
        }

        root.addView(title("Gateway Listener"))
        root.addView(description("Kirim notifikasi pembayaran Android ke payment gateway."))

        serverUrlInput = input("Server URL", AppConfig.serverUrl(this))
        secretInput = input("Android Secret", AppConfig.androidSecret(this))
        packagesInput = input(
            "Allowed Packages",
            AppConfig.allowedPackages(this).joinToString(",")
        )

        root.addView(serverUrlInput)
        root.addView(secretInput)
        root.addView(packagesInput)

        root.addView(button("Save Settings") {
            AppConfig.save(
                this,
                serverUrlInput.text.toString(),
                secretInput.text.toString(),
                packagesInput.text.toString()
            )
            statusText.text = "Settings saved."
        })

        root.addView(button("Open Notification Access") {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        })

        root.addView(button("Rebind Listener") {
            NotificationListenerService.requestRebind(
                ComponentName(this, PaymentNotificationListener::class.java)
            )
            DebugLog.add(this, "manual rebind requested")
            statusText.text = "Rebind requested."
            refreshDebugLog()
        })

        root.addView(button("Send Test Notification") {
            sendTest()
        })

        root.addView(button("Refresh Debug Log") {
            refreshDebugLog()
        })

        root.addView(button("Clear Debug Log") {
            DebugLog.clear(this)
            refreshDebugLog()
        })

        statusText = description("Ready.")
        root.addView(statusText)

        debugText = description("")
        root.addView(debugText)
        refreshDebugLog()

        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun sendTest() {
        statusText.text = "Sending test..."
        thread(name = "gateway-test-send") {
            val result = GatewayClient.sendNotification(
                this,
                "test.gateway",
                "Test Payment",
                "Pembayaran QRIS masuk Rp1.000",
                ""
            )

            runOnUiThread {
                statusText.text = result.fold(
                    onSuccess = { "Test sent: $it" },
                    onFailure = { "Test failed: ${it.message}" }
                )
                refreshDebugLog()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        refreshDebugLog()
    }

    private fun refreshDebugLog() {
        if (!::debugText.isInitialized) return
        val log = DebugLog.read(this)
        debugText.text = if (log.isBlank()) "Debug log kosong." else log
    }

    private fun title(text: String): TextView {
        return TextView(this).apply {
            this.text = text
            textSize = 24f
            setTextColor(0xFF111827.toInt())
            setPadding(0, 0, 0, 12)
        }
    }

    private fun description(text: String): TextView {
        return TextView(this).apply {
            this.text = text
            textSize = 14f
            setTextColor(0xFF475467.toInt())
            setPadding(0, 0, 0, 20)
        }
    }

    private fun input(hint: String, value: String): EditText {
        return EditText(this).apply {
            this.hint = hint
            setText(value)
            setSingleLine(false)
            minLines = 1
            setPadding(20, 12, 20, 12)
        }
    }

    private fun button(text: String, onClick: () -> Unit): Button {
        return Button(this).apply {
            this.text = text
            setAllCaps(false)
            setOnClickListener { _: View -> onClick() }
        }
    }
}
