package app.tbcrushcalc;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/** The app is a web page in the APK's assets; this shows it and opens Wowhead links in the browser. */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView web;
    private WebViewAssetLoader loader;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (debuggable || getIntent().getBooleanExtra("devtools", false)) WebView.setWebContentsDebuggingEnabled(true);

        // served from https://appassets.androidplatform.net so saved characters (localStorage) work
        loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web = makeWebView();
        setContentView(web);
        if (state != null) web.restoreState(state);
        else web.loadUrl("https://" + HOST + "/assets/game/index.html");
    }

    private WebView makeWebView() {
        WebView w = new WebView(this);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setTextZoom(100);
        s.setSupportMultipleWindows(false);
        w.setBackgroundColor(0xFF0B0907);
        w.setOverScrollMode(View.OVER_SCROLL_NEVER);
        w.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (ActivityNotFoundException e) {
                    // no browser: stay in the app
                }
                return true;
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // The page's process died (Android ran low on memory, or it crashed). Without this the
                // whole app would close; instead start a fresh page. Saved characters are in storage.
                Log.w("TBCrushCalc", "renderer gone, crashed=" + detail.didCrash() + ": reloading");
                if (view == web) {
                    web = makeWebView();
                    setContentView(web);
                    web.loadUrl("https://" + HOST + "/assets/game/index.html");
                }
                view.destroy();
                return true;
            }
        });
        return w;
    }

    @Override
    public void onBackPressed() {
        // the page decides: close a panel, go back to the Character screen, or leave
        web.evaluateJavascript("window.onBack ? String(window.onBack()) : 'none'", value -> {
            if (value == null || !value.contains("true")) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }
}
