package com.alvian.gatewaylistener

import android.content.Context

object AppConfig {
    private const val PREFS = "gateway_listener_settings"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_ANDROID_SECRET = "android_secret"
    private const val KEY_ALLOWED_PACKAGES = "allowed_packages"

    fun serverUrl(context: Context): String {
        return prefs(context).getString(KEY_SERVER_URL, AndroidDefaults.SERVER_URL).orEmpty().trimEnd('/')
    }

    fun androidSecret(context: Context): String {
        return prefs(context).getString(KEY_ANDROID_SECRET, AndroidDefaults.ANDROID_SECRET).orEmpty()
    }

    fun allowedPackages(context: Context): Set<String> {
        return prefs(context)
            .getString(KEY_ALLOWED_PACKAGES, AndroidDefaults.ALLOWED_PACKAGES)
            .orEmpty()
            .split(',')
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .toSet()
    }

    fun save(
        context: Context,
        serverUrl: String,
        androidSecret: String,
        allowedPackages: String
    ) {
        prefs(context).edit()
            .putString(KEY_SERVER_URL, serverUrl.trim().trimEnd('/'))
            .putString(KEY_ANDROID_SECRET, androidSecret.trim())
            .putString(KEY_ALLOWED_PACKAGES, allowedPackages.trim())
            .apply()
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
