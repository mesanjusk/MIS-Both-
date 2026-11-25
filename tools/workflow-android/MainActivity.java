package in.sanjusk.workflow;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Parcelable;

public final class MainActivity extends Activity {
    private static final String WORKFLOW_URL = "https://dash.sanjusk.in/workflow-app";
    private static final String CUSTOM_TABS = "android.support.customtabs.extra.";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(WORKFLOW_URL));
        open.addCategory(Intent.CATEGORY_BROWSABLE);
        // The session extra selects a browser Custom Tab where supported.
        open.putExtra(CUSTOM_TABS + "SESSION", (Parcelable) null);
        open.putExtra(CUSTOM_TABS + "TOOLBAR_COLOR", 0xff1976b8);
        open.putExtra(CUSTOM_TABS + "TITLE_VISIBILITY", 1);

        try {
            startActivity(open);
            finish();
        } catch (ActivityNotFoundException error) {
            new AlertDialog.Builder(this)
                .setTitle("SK Workflow")
                .setMessage("Install or enable an Android web browser to open your workflow.")
                .setPositiveButton(android.R.string.ok, (dialog, which) -> finish())
                .setOnCancelListener(dialog -> finish())
                .show();
        }
    }
}
