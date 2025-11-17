package com.rourkelasteel.blastfurnace;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private SharedPreferences prefs;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        prefs = getSharedPreferences("BlastFurnaceApp", Context.MODE_PRIVATE);

        // Configure WebView for offline functionality
        setupWebView();
        
        // Load the application
        loadApplication();
        
        // Create JavaScript interface for Android communication
        webView.addJavascriptInterface(new WebAppInterface(this), "android");
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings webSettings = webView.getSettings();
        
        // Enable essential features
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setAppCacheEnabled(true);
        webSettings.setCacheMode(WebSettings.LOAD_DEFAULT);
        
        // File access permissions
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setAllowFileAccessFromFileURLs(true);
        webSettings.setAllowUniversalAccessFromFileURLs(true);
        
        // Performance settings
        webSettings.setRenderPriority(WebSettings.RenderPriority.HIGH);
        webSettings.setCacheMode(WebSettings.LOAD_CACHE_ELSE_NETWORK);
        
        // Set clients
        webView.setWebViewClient(new CustomWebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
    }

    private void loadApplication() {
        try {
            // Load HTML from assets
            String htmlData = readHtmlFromAssets();
            
            // Load with proper base URL for local resources
            webView.loadDataWithBaseURL(
                "file:///android_asset/", 
                htmlData, 
                "text/html", 
                "UTF-8", 
                null
            );
            
            // Restore any saved data
            restoreData();
            
        } catch (Exception e) {
            showError("Failed to load application: " + e.getMessage());
        }
    }

    private String readHtmlFromAssets() throws IOException {
        StringBuilder buf = new StringBuilder();
        try (InputStream json = getAssets().open("index.html");
             BufferedReader in = new BufferedReader(new InputStreamReader(json, "UTF-8"))) {
            String str;
            while ((str = in.readLine()) != null) {
                buf.append(str).append("\n");
            }
        }
        return buf.toString();
    }

    private void restoreData() {
        String savedData = prefs.getString("appData", null);
        if (savedData != null) {
            webView.post(() -> {
                String script = "if(typeof restoreFromAndroid === 'function') {" +
                    "restoreFromAndroid('" + savedData.replace("'", "\\'") + "');" +
                    "}";
                webView.evaluateJavascript(script, null);
            });
        }
    }

    private void saveData(String data) {
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString("appData", data);
        editor.apply();
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager connectivityManager = 
            (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo activeNetworkInfo = connectivityManager.getActiveNetworkInfo();
        return activeNetworkInfo != null && activeNetworkInfo.isConnected();
    }

    private void showError(String message) {
        new AlertDialog.Builder(this)
            .setTitle("Error")
            .setMessage(message)
            .setPositiveButton("OK", null)
            .show();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            new AlertDialog.Builder(this)
                .setTitle("Exit")
                .setMessage("Are you sure you want to exit?")
                .setPositiveButton("Yes", (dialog, which) -> finish())
                .setNegativeButton("No", null)
                .show();
        }
    }

    // JavaScript Interface for Android communication
    public class WebAppInterface {
        Context mContext;

        WebAppInterface(Context c) {
            mContext = c;
        }

        @JavascriptInterface
        public void saveData(String data) {
            saveData(data);
            Toast.makeText(mContext, "Data saved successfully", Toast.LENGTH_SHORT).show();
        }

        @JavascriptInterface
        public String getStoredData() {
            return prefs.getString("appData", null);
        }

        @JavascriptInterface
        public void showToast(String message) {
            Toast.makeText(mContext, message, Toast.LENGTH_SHORT).show();
        }

        @JavascriptInterface
        public boolean isOnline() {
            return isNetworkAvailable();
        }

        @JavascriptInterface
        public void exportData(String data) {
            // Implement file export functionality
            Toast.makeText(mContext, "Export feature coming soon", Toast.LENGTH_SHORT).show();
        }
    }

    // Custom WebView Client for better error handling
    private class CustomWebViewClient extends WebViewClient {
        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            super.onReceivedError(view, errorCode, description, failingUrl);
            showError("Loading error: " + description);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            // Page loaded successfully
        }
    }
}