package com.base6a5340f43f8fd031c5921680.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

/**
 * Writes Axis model exports through Android's Storage Access Framework.
 * No network service or storage permissions are involved. An export is
 * reported as saved only after the selected document was written and closed.
 *
 * Also receives model files opened with Axis from another app ("Open with"):
 * the file is copied into the app's cache and reported to the page with a
 * "fileOpened" event ({ name, path } or { error }). The event is kept until
 * the page listens, so a file that started the app is not lost.
 */
@CapacitorPlugin(name = "AxisFiles")
public class AxisFilesPlugin extends Plugin {
    private static final String HANDLED = "axis.openedFileHandled";

    @Override
    public void load() {
        handleOpenIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handleOpenIntent(intent);
    }

    private void handleOpenIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        // Reopened from Recents, or already taken: never import it twice.
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;
        if (intent.getBooleanExtra(HANDLED, false)) return;
        intent.putExtra(HANDLED, true);
        Uri uri = intent.getData();
        if (uri == null) return;
        final String type = intent.getType();
        new Thread(() -> {
            JSObject data = new JSObject();
            try {
                String name = fileName(uri, type);
                File dir = new File(getContext().getCacheDir(), "opened");
                if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("No room to open the file.");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                File out = new File(dir, name);
                ContentResolver resolver = getContext().getContentResolver();
                try (InputStream input = resolver.openInputStream(uri); OutputStream output = new FileOutputStream(out)) {
                    if (input == null) throw new IOException("The file could not be opened.");
                    byte[] buffer = new byte[65536];
                    int read;
                    while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                }
                data.put("name", name);
                data.put("path", Uri.fromFile(out).toString());
            } catch (Exception error) {
                data.put("error", "The file could not be opened.");
            }
            getActivity().runOnUiThread(() -> notifyListeners("fileOpened", data, true));
        }).start();
    }

    // The file's own name. Some apps give a name without an extension; the
    // file type then supplies it, since Axis reads the format from the name.
    private String fileName(Uri uri, String intentType) {
        String name = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) name = cursor.getString(0);
            } catch (Exception ignored) {
                // Fall back to the address below.
            }
        }
        if (name == null || name.isEmpty()) name = uri.getLastPathSegment();
        if (name == null || name.isEmpty()) name = "model";
        name = name.replace('/', '_').replace('\\', '_');
        if (name.equals(".") || name.equals("..")) name = "model";
        if (name.lastIndexOf('.') <= 0) {
            String type = intentType != null ? intentType : getContext().getContentResolver().getType(uri);
            String ext = extensionFor(type);
            if (ext != null) name = name + "." + ext;
        }
        return name;
    }

    private static String extensionFor(String type) {
        if (type == null) return null;
        switch (type.toLowerCase(Locale.ROOT)) {
            case "model/obj":
            case "application/x-tgif":
                return "obj";
            case "model/stl":
            case "model/x.stl-binary":
            case "model/x.stl-ascii":
            case "application/sla":
            case "application/vnd.ms-pki.stl":
                return "stl";
            case "model/gltf-binary":
                return "glb";
            case "model/gltf+json":
                return "gltf";
            case "model/3mf":
            case "application/vnd.ms-package.3dmanufacturing-3dmodel+xml":
                return "3mf";
            default:
                return null;
        }
    }

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
