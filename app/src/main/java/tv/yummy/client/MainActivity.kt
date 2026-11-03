package tv.yummy.client

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.speech.RecognizerIntent
import android.util.Log
import android.content.ComponentCallbacks2
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.File
import java.io.IOException

/**
 * The whole UI is a light web app (assets/web) rendered in one WebView.
 * It is served under https://old.yummyani.me/tvapp/ so that the site's
 * video players accept being embedded, exactly as on the website.
 * Every remote-control key is routed to JavaScript, so there is no cursor
 * and no reliance on WebView's own focus handling.
 */
class MainActivity : Activity() {

    companion object {
        private const val TAG = "YummyTV"
        const val HOST = "old.yummyani.me"
        const val APP_PATH = "/tvapp/"
        const val APP_URL = "https://$HOST${APP_PATH}index.html"
        private const val REQ_VOICE = 4242
    }

    private lateinit var web: WebView
    private lateinit var adBlocker: AdBlocker
    private var webDead = false
    private var repeatPending = false
    private var pageReady = false
    private var injectSupported = false
    private val prefs by lazy { getSharedPreferences("yummytv", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        adBlocker = AdBlocker(prefs.getBoolean("adblock", true))

        hideSystemUi()
        createWebView()
        trimDiskCacheInBackground()
    }

    private fun createWebView() {
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#0E0F14"))
        setContentView(web)
        webDead = false
        pageReady = false
        repeatPending = false
        setupWebView()
        web.loadUrl(APP_URL)
        web.requestFocus()
    }

    /** The WebView renderer was killed (low memory) or crashed: build a fresh one instead of crashing the app. */
    private fun recoverFromRendererLoss() {
        webDead = true
        try {
            (web.parent as? ViewGroup)?.removeView(web)
            web.destroy()
        } catch (e: Exception) {
            Log.w(TAG, "destroy after renderer loss", e)
        }
        web.postDelayed({ if (!isFinishing) createWebView() }, 300)
    }

    /** Chromium limits its own cache, but keep the total in check on small TV storage. */
    private fun trimDiskCacheInBackground() {
        Thread {
            try {
                val size = dirSize(cacheDir, 0)
                if (size > 300L * 1024 * 1024) {
                    runOnUiThread { if (!webDead) web.clearCache(true) }
                }
            } catch (e: Exception) {
                Log.w(TAG, "cache size check failed", e)
            }
        }.start()
    }

    private fun dirSize(f: File, depth: Int): Long {
        if (depth > 12) return 0
        if (f.isFile) return f.length()
        val children = f.listFiles() ?: return 0
        var total = 0L
        for (c in children) total += dirSize(c, depth + 1)
        return total
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.setSupportMultipleWindows(false)
        s.javaScriptCanOpenWindowsAutomatically = false
        s.cacheMode = WebSettings.LOAD_DEFAULT
        s.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        s.loadsImagesAutomatically = true
        s.textZoom = 100
        s.setSupportZoom(false)
        s.builtInZoomControls = false
        s.displayZoomControls = false
        s.allowFileAccess = false
        s.allowContentAccess = false
        if (Build.VERSION.SDK_INT >= 23) s.offscreenPreRaster = true
        if (Build.VERSION.SDK_INT >= 26) {
            s.safeBrowsingEnabled = false
            web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true)
        }
        // Look like regular Chrome: some players refuse to work in a WebView.
        s.userAgentString = s.userAgentString
            .replace("; wv", "")
            .replace(Regex("Version/[0-9.]+ "), "")

        web.isFocusable = true
        web.isFocusableInTouchMode = true
        web.isVerticalScrollBarEnabled = false
        web.isHorizontalScrollBarEnabled = false
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        val cookies = CookieManager.getInstance()
        cookies.setAcceptCookie(true)
        cookies.setAcceptThirdPartyCookies(web, true)

        web.addJavascriptInterface(Bridge(), "AndroidTV")

        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            try {
                val script = assets.open("web/inject.js").bufferedReader().use { it.readText() }
                WebViewCompat.addDocumentStartJavaScript(web, script, setOf("*"))
                injectSupported = true
            } catch (e: Exception) {
                Log.w(TAG, "Document start script unavailable", e)
            }
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler(APP_PATH, WebAssetsHandler())
            .build()

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val url = request.url
                if (isAppUrl(url)) return assetLoader.shouldInterceptRequest(url)
                return adBlocker.check(url, request.isForMainFrame)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Only the app itself may ever be the top-level page (blocks ad redirects / pop-unders).
                if (!request.isForMainFrame) return false
                return !isAppUrl(request.url)
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                return !isAppUrl(Uri.parse(url))
            }

            override fun onPageFinished(view: WebView, url: String) {
                if (isAppUrl(Uri.parse(url))) pageReady = true
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                Log.w(TAG, "WebView renderer gone, crashed=" + detail.didCrash())
                if (view === web) recoverFromRendererLoss()
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun getDefaultVideoPoster(): Bitmap {
                // Hide the grey "play" placeholder WebView draws before a video starts.
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
            }

            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                if (BuildConfig.DEBUG) Log.d(TAG, "${consoleMessage.sourceId()}:${consoleMessage.lineNumber()} ${consoleMessage.message()}")
                return true
            }

            override fun onJsAlert(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
                result.cancel(); return true
            }

            override fun onJsConfirm(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
                result.cancel(); return true
            }

            override fun onJsPrompt(view: WebView, url: String?, message: String?, defaultValue: String?, result: JsPromptResult): Boolean {
                result.cancel(); return true
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                request.deny()
            }
        }
    }

    private fun isAppUrl(u: Uri): Boolean =
        u.host == HOST && (u.path ?: "").startsWith(APP_PATH)

    /** Serves files from assets/web for https://old.yummyani.me/tvapp/... */
    private inner class WebAssetsHandler : WebViewAssetLoader.PathHandler {
        override fun handle(path: String): WebResourceResponse? {
            val clean = path.substringBefore('?').ifEmpty { "index.html" }
            if (clean.contains("..")) return null
            return try {
                val stream = assets.open("web/$clean")
                val mime = when (clean.substringAfterLast('.', "")) {
                    "html" -> "text/html"
                    "js" -> "application/javascript"
                    "css" -> "text/css"
                    "svg" -> "image/svg+xml"
                    "png" -> "image/png"
                    "json" -> "application/json"
                    else -> "application/octet-stream"
                }
                WebResourceResponse(mime, "utf-8", stream)
            } catch (e: IOException) {
                null
            }
        }
    }

    // ---------------------------------------------------------------- keys

    private fun keyName(code: Int): String? = when (code) {
        KeyEvent.KEYCODE_DPAD_UP -> "up"
        KeyEvent.KEYCODE_DPAD_DOWN -> "down"
        KeyEvent.KEYCODE_DPAD_LEFT -> "left"
        KeyEvent.KEYCODE_DPAD_RIGHT -> "right"
        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER,
        KeyEvent.KEYCODE_BUTTON_A -> "ok"
        KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE, KeyEvent.KEYCODE_BUTTON_B -> "back"
        KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_SETTINGS, KeyEvent.KEYCODE_BUTTON_Y -> "menu"
        KeyEvent.KEYCODE_INFO, KeyEvent.KEYCODE_GUIDE -> "info"
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_HEADSETHOOK -> "playpause"
        KeyEvent.KEYCODE_MEDIA_PLAY -> "play"
        KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_MEDIA_STOP -> "pause"
        KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "ff"
        KeyEvent.KEYCODE_MEDIA_REWIND -> "rew"
        KeyEvent.KEYCODE_MEDIA_NEXT, KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_PAGE_DOWN -> "next"
        KeyEvent.KEYCODE_MEDIA_PREVIOUS, KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_PAGE_UP -> "prev"
        KeyEvent.KEYCODE_SEARCH, KeyEvent.KEYCODE_VOICE_ASSIST, KeyEvent.KEYCODE_ASSIST -> "search"
        KeyEvent.KEYCODE_DEL -> "del"
        KeyEvent.KEYCODE_SPACE -> "space"
        else -> null
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val code = event.keyCode
        var name = keyName(code)
        if (name == null && code >= KeyEvent.KEYCODE_0 && code <= KeyEvent.KEYCODE_9) {
            name = "digit" + (code - KeyEvent.KEYCODE_0)
        }
        if (name == null) {
            val ch = event.unicodeChar
            if (event.action == KeyEvent.ACTION_DOWN && ch > 32 && !Character.isISOControl(ch)) {
                sendJs("window.tvKey&&tvKey('char',0," + JSONObject.quote(String(Character.toChars(ch))) + ")")
                return true
            }
            // Volume, Home, power etc. stay with the system.
            return super.dispatchKeyEvent(event)
        }

        if (event.action == KeyEvent.ACTION_DOWN) {
            if (name == "back" && !pageReady) {
                finish(); return true
            }
            val rep = event.repeatCount
            if (rep > 0) {
                // Holding a key: drop repeats while the previous one is still being handled,
                // so a slow TV never builds up a queue of moves that "keep going" after release.
                if (repeatPending || webDead) return true
                repeatPending = true
                web.evaluateJavascript("window.tvKey&&tvKey('$name',$rep)") { repeatPending = false }
            } else {
                repeatPending = false
                sendJs("window.tvKey&&tvKey('$name',0)")
            }
        } else if (event.action == KeyEvent.ACTION_UP) {
            sendJs("window.tvKeyUp&&tvKeyUp('$name')")
        }
        return true
    }

    private fun sendJs(code: String) {
        if (webDead) return
        try {
            web.evaluateJavascript(code, null)
        } catch (e: Exception) {
            Log.w(TAG, "evaluateJavascript failed", e)
        }
    }

    // ---------------------------------------------------------------- bridge

    inner class Bridge {
        @JavascriptInterface
        fun exit() {
            runOnUiThread { finish() }
        }

        @JavascriptInterface
        fun isAdblock(): Boolean = adBlocker.enabled

        @JavascriptInterface
        fun setAdblock(on: Boolean) {
            adBlocker.enabled = on
            prefs.edit().putBoolean("adblock", on).apply()
        }

        @JavascriptInterface
        fun keepScreenOn(on: Boolean) {
            runOnUiThread {
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }

        @JavascriptInterface
        fun voiceSearch() {
            runOnUiThread {
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU")
                    putExtra(RecognizerIntent.EXTRA_PROMPT, "Название аниме")
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                }
                try {
                    @Suppress("DEPRECATION")
                    startActivityForResult(intent, REQ_VOICE)
                } catch (e: ActivityNotFoundException) {
                    sendJs("window.tvVoice&&tvVoice(null)")
                } catch (e: SecurityException) {
                    sendJs("window.tvVoice&&tvVoice(null)")
                }
            }
        }

        @JavascriptInterface
        fun clearCache() {
            runOnUiThread { if (!webDead) web.clearCache(true) }
        }

        @JavascriptInterface
        fun info(): String = JSONObject()
            .put("version", BuildConfig.VERSION_NAME)
            .put("inject", injectSupported)
            .put("sdk", Build.VERSION.SDK_INT)
            .put("model", Build.MANUFACTURER + " " + Build.MODEL)
            .put("webview", webViewVersion())
            .toString()
    }

    private fun webViewVersion(): String = try {
        WebViewCompat.getCurrentWebViewPackage(this)?.versionName ?: "?"
    } catch (e: Exception) {
        "?"
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_VOICE) {
            val text = if (resultCode == RESULT_OK)
                data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
            else null
            sendJs("window.tvVoice&&tvVoice(" + (if (text != null) JSONObject.quote(text) else "null") + ")")
        }
    }

    // ---------------------------------------------------------------- lifecycle

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    override fun onResume() {
        super.onResume()
        if (!webDead) {
            web.onResume()
            web.resumeTimers()
        }
        sendJs("window.tvLifecycle&&tvLifecycle('resume')")
    }

    override fun onPause() {
        sendJs("window.tvLifecycle&&tvLifecycle('pause')")
        if (!webDead) web.onPause()
        super.onPause()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
            sendJs("window.tvLowMemory&&tvLowMemory()")
        }
    }

    override fun onLowMemory() {
        super.onLowMemory()
        sendJs("window.tvLowMemory&&tvLowMemory()")
    }

    override fun onDestroy() {
        if (!webDead) {
            try {
                web.stopLoading()
                web.destroy()
            } catch (e: Exception) {
                Log.w(TAG, "destroy", e)
            }
        }
        super.onDestroy()
    }
}
