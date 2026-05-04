package com.alvian.gatewaylistener

import android.content.Context
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.time.OffsetDateTime

object GatewayClient {
    fun sendNotification(
        context: Context,
        packageName: String,
        title: String,
        text: String,
        bigText: String
    ): Result<String> {
        return runCatching {
            val endpoint = "${AppConfig.serverUrl(context)}/api/android/notifications"
            val payload = JSONObject()
                .put("package_name", packageName)
                .put("title", title)
                .put("text", text)
                .put("big_text", bigText)
                .put("received_at", OffsetDateTime.now().toString())
                .toString()

            val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 10_000
                readTimeout = 10_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("X-Android-Secret", AppConfig.androidSecret(context))
            }

            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(payload)
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val response = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            connection.disconnect()

            if (status !in 200..299) {
                error("HTTP $status: $response")
            }

            response
        }
    }
}
