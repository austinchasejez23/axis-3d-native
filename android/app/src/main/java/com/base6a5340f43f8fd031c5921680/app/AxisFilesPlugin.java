package com.base6a5340f43f8fd031c5921680.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;

/**
 * Writes Axis model exports through Android's Storage Access Framework.
 * No network service or storage permissions are involved. An export is
 * reported as saved only after the selected document was written and closed.
 */
@CapacitorPlugin(name = "AxisFiles")
public class AxisFilesPlugin extends Plugin {
    @PluginMethod
    public void saveFile(PluginCall call) {
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String data = call.getString("data");

        if (filename == null || filename.isEmpty() || data == null) {
            call.reject("Missing export filename or data.");
            return;
        }
        // This is a save-only plugin: filename is a suggestion, never a path
        // used directly by Axis. Android lets the user choose the destination.
        filename = filename.replace('/', '_').replace('\\', '_');
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "saveFileResult");
    }

    @ActivityCallback
    private void saveFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent intent = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || intent == null || intent.getData() == null) {
            call.reject("File saving was canceled.", "CANCELED");
            return;
        }

        Uri uri = intent.getData();
        String base64 = call.getString("data");
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w")) {
            if (output == null) throw new IOException("The selected document could not be opened.");
            // Decode in chunks to avoid a second giant allocation on top of
            // the WebView's export buffer. The JS encoder uses aligned blocks.
            final int CHUNK = 32768; // multiple of 4 base64 characters
            for (int i = 0; i < base64.length(); i += CHUNK) {
                int end = Math.min(base64.length(), i + CHUNK);
                byte[] bytes = Base64.decode(base64.substring(i, end), Base64.DEFAULT);
                output.write(bytes);
            }
            output.flush();
            JSObject response = new JSObject();
            response.put("saved", true);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Unable to write the selected document.", error);
        }
    }
}
