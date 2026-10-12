package cn.shu.pocket.timetable;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;
import org.json.JSONTokener;

@CapacitorPlugin(name = "Backup")
public class BackupPlugin extends Plugin {
    private static final int MAX_BYTES = 6 * 1024 * 1024;
    private static final String STAGED_FILE_KEY = "_stagedBackup";
    private static final String AWAITING_PICKER_KEY = "awaitingPicker";
    private final AtomicBoolean saving = new AtomicBoolean(false);
    private volatile boolean awaitingPicker;
    private volatile String stagedFilename;

    @PluginMethod
    public void saveBackup(PluginCall call) {
        if (!saving.compareAndSet(false, true)) {
            call.reject("已有备份正在保存，请完成或取消后再试。", "BACKUP_BUSY");
            return;
        }

        try {
            String filename = call.getString("filename");
            String json = call.getString("json");
            if (!validFilename(filename)) {
                throw new IllegalArgumentException("备份文件名无效，请使用不含路径的 JSON 文件名。");
            }
            if (json == null || json.isEmpty() || json.length() > MAX_BYTES) {
                throw new IllegalArgumentException("备份内容为空或超过 6 MB。");
            }
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_BYTES) {
                throw new IllegalArgumentException("备份内容超过 6 MB。");
            }
            JSONTokener tokener = new JSONTokener(json);
            if (!(tokener.nextValue() instanceof JSONObject) || tokener.nextClean() != 0) {
                throw new IllegalArgumentException("备份内容不是有效的 JSON 对象。");
            }

            // Keep a large backup out of the Activity state Bundle while the picker is open.
            File stagedFile = File.createTempFile("backup-", ".json", getContext().getCacheDir());
            stagedFilename = stagedFile.getName();
            try (FileOutputStream output = new FileOutputStream(stagedFile)) {
                output.write(bytes);
            }
            call.getData().remove("json");
            call.getData().put(STAGED_FILE_KEY, stagedFilename);

            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            getBridge().executeOnMainThread(() -> {
                try {
                    awaitingPicker = true;
                    startActivityForResult(call, intent, "backupCreated");
                } catch (RuntimeException exception) {
                    cleanup();
                    call.reject("无法打开系统文件保存窗口。", "BACKUP_PICKER_FAILED", exception);
                }
            });
        } catch (Exception exception) {
            cleanup();
            call.reject("无法准备备份：" + exception.getMessage(), "BACKUP_INVALID", exception);
        }
    }

    @ActivityCallback
    private void backupCreated(PluginCall call, ActivityResult result) {
        awaitingPicker = false;
        if (call == null) {
            cleanup();
            return;
        }
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            cleanup();
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK) {
            cleanup();
            call.reject("系统文件保存窗口未返回有效结果。", "BACKUP_PICKER_FAILED");
            return;
        }
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (uri == null || !"content".equals(uri.getScheme())) {
            cleanup();
            call.reject("系统未提供可写入的备份文件。", "BACKUP_URI_INVALID");
            return;
        }

        // Document providers can perform slow I/O; avoid blocking the UI thread.
        getBridge().execute(() -> {
            try {
                File inputFile = stagedFile(call.getString(STAGED_FILE_KEY));
                long length = inputFile.length();
                if (!inputFile.isFile() || length <= 0 || length > MAX_BYTES) {
                    throw new IOException("临时备份已失效，请重新导出。");
                }
                try (
                    FileInputStream input = new FileInputStream(inputFile);
                    OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")
                ) {
                    if (output == null) {
                        throw new IOException("无法打开目标文件。");
                    }
                    byte[] buffer = new byte[8192];
                    int total = 0;
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        total += count;
                        if (total > MAX_BYTES) {
                            throw new IOException("备份内容超过 6 MB。");
                        }
                        output.write(buffer, 0, count);
                    }
                    output.flush();
                }
                JSObject response = new JSObject();
                response.put("cancelled", false);
                cleanup();
                call.resolve(response);
            } catch (Exception exception) {
                cleanup();
                call.reject("备份未保存：" + exception.getMessage(), "BACKUP_WRITE_FAILED", exception);
            }
        });
    }

    private static boolean validFilename(String filename) {
        return filename != null
            && !filename.isEmpty()
            && filename.length() <= 120
            && filename.equals(filename.trim())
            && !filename.startsWith(".")
            && filename.toLowerCase(Locale.ROOT).endsWith(".json")
            && filename.matches("[^\\p{Cntrl}\\\\/:*?\"<>|]+");
    }

    private File stagedFile(String filename) throws IOException {
        if (filename == null || !filename.matches("backup-[A-Za-z0-9-]+\\.json")) {
            throw new IOException("临时备份引用无效。");
        }
        return new File(getContext().getCacheDir(), filename);
    }

    private void cleanup() {
        awaitingPicker = false;
        String filename = stagedFilename;
        stagedFilename = null;
        if (filename != null) {
            try {
                stagedFile(filename).delete();
            } catch (IOException ignored) {
                // Only a plugin-owned temporary cache file is involved.
            }
        }
        saving.set(false);
    }

    @Override
    protected Bundle saveInstanceState() {
        // Once a result is delivered, the launcher cannot deliver it again on restoration.
        // Keep the live write guarded, but never restore a busy write with no pending picker.
        if (!saving.get() || !awaitingPicker) {
            return null;
        }
        Bundle state = new Bundle();
        state.putBoolean(AWAITING_PICKER_KEY, true);
        state.putString(STAGED_FILE_KEY, stagedFilename);
        return state;
    }

    @Override
    protected void restoreState(Bundle state) {
        stagedFilename = state.getString(STAGED_FILE_KEY);
        awaitingPicker = state.getBoolean(AWAITING_PICKER_KEY, false);
        saving.set(awaitingPicker);
    }
}
