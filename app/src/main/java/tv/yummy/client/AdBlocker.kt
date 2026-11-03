package tv.yummy.client

import android.net.Uri
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream

/**
 * Network-level blocker for ad, tracking and pop-under requests made by the
 * embedded video players. Works like a hosts-file ad blocker: matching
 * sub-resource requests get an empty response instead of reaching the network.
 */
class AdBlocker(@Volatile var enabled: Boolean) {

    private val blockedHosts: HashSet<String> = hashSetOf(
        // Yandex ads / metrics
        "mc.yandex.ru", "mc.yandex.com", "mc.yandex.net", "an.yandex.ru", "yabs.yandex.ru",
        "adfox.ru", "ads.adfox.ru", "adfox.yandex.ru", "awaps.yandex.net", "yandexadexchange.net",
        "adfstat.yandex.ru", "appmetrica.yandex.ru", "banners.adfox.ru",
        // Google ads / analytics
        "googlesyndication.com", "doubleclick.net", "googleadservices.com", "google-analytics.com",
        "googletagmanager.com", "googletagservices.com", "adservice.google.com", "imasdk.googleapis.com",
        // VK / Mail.ru ads
        "ad.mail.ru", "ads.vk.com", "ads.vk.ru", "top-fwz1.mail.ru", "rs.mail.ru", "adx.vk.com",
        // RU ad networks & counters
        "adriver.ru", "betweendigital.com", "buzzoola.com", "otm-r.com", "hybrid.ai", "adhigh.net",
        "sape.ru", "relap.io", "mediametrics.ru", "tns-counter.ru", "adx.com.ru", "rtb.com.ru",
        "videonow.ru", "smi2.ru", "smi2.net", "yadro.ru", "counter.yadro.ru", "top100.ru",
        "directadvert.ru", "begun.ru", "moevideo.biz", "moevideo.net", "vidroll.ru", "adlook.me",
        "adwile.com", "astralab.ru", "segmento.ru", "soloway.ru", "digitalbox.ru", "unibots.in",
        "mytarget.ru", "target.my.com", "ad.adriver.ru", "ssp.adriver.ru", "cdn.adx.ws",
        // International ad / pop-under networks
        "adnxs.com", "criteo.com", "criteo.net", "admixer.net", "mgid.com", "marketgid.com",
        "adskeeper.co.uk", "adskeeper.com", "propellerads.com", "popads.net", "popcash.net",
        "onclickads.net", "exoclick.com", "juicyads.com", "adsterra.com", "trafficstars.com",
        "clickadu.com", "hilltopads.net", "a-ads.com", "rubiconproject.com", "pubmatic.com",
        "openx.net", "taboola.com", "outbrain.com", "zedo.com", "adform.net", "smartadserver.com",
        "spotxchange.com", "spotx.tv", "springserve.com", "teads.tv", "vidazoo.com", "aniview.com",
        "connatix.com", "primis.tech", "sync.1rx.io", "casalemedia.com", "adcolony.com",
        "scorecardresearch.com", "quantserve.com", "hotjar.com", "onesignal.com"
    )

    /** Hosts that must never be blocked: the site itself and its media CDNs. */
    private val safeSuffixes = arrayOf(
        "yani.tv", "yummyani.me", "yummy-anime.ru", "kodik-storage.com", "kodikres.com"
    )

    private val pathMarkers = arrayOf(
        "/vast", "vast.xml", "vast=", "/vpaid", "vpaid.js", "/adfox", "/prebid", "/popunder",
        "/advert", "/adserver", "/ads.js", "/ad.js", "/adv/", "/ads/", "/banners/"
    )

    fun check(uri: Uri, isMainFrame: Boolean): WebResourceResponse? {
        if (!enabled || isMainFrame) return null
        val scheme = uri.scheme ?: return null
        if (scheme != "http" && scheme != "https") return null
        val host = (uri.host ?: return null).lowercase()

        var h = host
        while (true) {
            if (blockedHosts.contains(h)) return empty(false)
            val dot = h.indexOf('.')
            if (dot < 0 || dot == h.lastIndexOf('.')) break
            h = h.substring(dot + 1)
        }
        if (blockedHosts.contains(h)) return empty(false)

        for (s in safeSuffixes) {
            if (host == s || host.endsWith(".$s")) return null
        }

        val tail = ((uri.encodedPath ?: "") + "?" + (uri.encodedQuery ?: "")).lowercase()
        for (m in pathMarkers) {
            if (tail.contains(m)) return empty(tail.contains("vast") || tail.contains("vpaid"))
        }
        return null
    }

    private fun empty(vast: Boolean): WebResourceResponse {
        return if (vast) {
            // A valid but empty VAST answer: players treat it as "no ad" and go straight to the video.
            val body = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><VAST version=\"3.0\"></VAST>"
            WebResourceResponse("application/xml", "utf-8", ByteArrayInputStream(body.toByteArray()))
        } else {
            WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
        }
    }
}
