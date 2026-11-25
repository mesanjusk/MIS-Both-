package in.sanjusk.workflow.mobile;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final String DOMAIN = "dash.sanjusk.in";
    private static final String WORKFLOW_URL = "https://" + DOMAIN + "/workflow-app";
    private static final int BLUE = 0xff1976b8;
    private WebView webView;
    private View loading;
    private View connectionError;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();

        FrameLayout screen = new FrameLayout(this);
        screen.setBackgroundColor(Color.WHITE);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setUserAgentString(settings.getUserAgentString() + " SKWorkflow/2.0");
        webView.setWebViewClient(new WorkflowClient());
        screen.addView(webView, new FrameLayout.LayoutParams(-1, -1));

        loading = new ProgressBar(this);
        screen.addView(loading, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));

        connectionError = createErrorPanel();
        screen.addView(connectionError, new FrameLayout.LayoutParams(-1, -1));
        setContentView(screen);
        webView.loadUrl(WORKFLOW_URL);
    }

    private void configureSystemBars() {
        Window window = getWindow();
        // System bar colors are available on every supported device. The APK
        // is compiled with the older platform stub bundled with its toolchain.
        try {
            window.addFlags(0x80000000); // FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS
            Window.class.getMethod("setStatusBarColor", int.class).invoke(window, BLUE);
            Window.class.getMethod("setNavigationBarColor", int.class).invoke(window, Color.BLACK);
        } catch (ReflectiveOperationException ignored) {
            // Retain the system theme if a device does not expose the methods.
        }
    }

    private View createErrorPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(Color.WHITE);
        panel.setVisibility(View.GONE);

        TextView message = new TextView(this);
        message.setText("Couldn’t connect to SK Workflow.");
        message.setTextColor(Color.DKGRAY);
        message.setTextSize(17);
        panel.addView(message);

        Button retry = new Button(this);
        retry.setText("Try again");
        retry.setOnClickListener(view -> {
            panel.setVisibility(View.GONE);
            loading.setVisibility(View.VISIBLE);
            webView.reload();
        });
        panel.addView(retry);
        return panel;
    }

    private final class WorkflowClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri target = Uri.parse(url);
            if ("https".equalsIgnoreCase(target.getScheme())
                    && DOMAIN.equalsIgnoreCase(target.getHost())
                    && (target.getPort() == -1 || target.getPort() == 443)
                    && target.getUserInfo() == null) {
                return false;
            }
            if ("https".equalsIgnoreCase(target.getScheme()) && target.getHost() != null) {
                Intent external = new Intent(Intent.ACTION_VIEW, target);
                external.addCategory(Intent.CATEGORY_BROWSABLE);
                try {
                    startActivity(external);
                } catch (ActivityNotFoundException ignored) {
                    Toast.makeText(MainActivity.this, "No browser can open this link.", Toast.LENGTH_SHORT).show();
                }
            }
            return true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            loading.setVisibility(View.GONE);
        }

        @Override
        public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
            loading.setVisibility(View.GONE);
            connectionError.setVisibility(View.VISIBLE);
        }
    }
}
