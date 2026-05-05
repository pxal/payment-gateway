package com.alvian.gatewaylistener

import android.content.Context
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object DebugLog {
    private const val TAG = "GatewayListener"
    private const val PREFS = "gateway_listener_debug"
    private const val KEY_LINES = "lines"
    private const val MAX_LINES = 80

    fun add(context: Context, message: String) {
        val time = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
        val line = "$time $message"
        Log.d(TAG, line)

        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val lines = prefs
            .getString(KEY_LINES, "")
            .orEmpty()
            .lines()
            .filter { it.isNotBlank() }
            .plus(line)
            .takeLast(MAX_LINES)

        prefs.edit().putString(KEY_LINES, lines.joinToString("\n")).apply()
    }

    fun read(context: Context): String {
        return context
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_LINES, "")
            .orEmpty()
    }

    fun clear(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }
}
