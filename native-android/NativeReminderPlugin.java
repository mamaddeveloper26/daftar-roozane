package com.mamaddeveloper26.daftarroozane;

import android.Manifest;
import android.app.AlarmManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeReminder")
public class NativeReminderPlugin extends Plugin {
    // AlarmManager and synchronous preference commits must never run on the WebView UI thread.
    private static final ExecutorService WORKER = Executors.newSingleThreadExecutor(task -> {
        Thread thread = new Thread(task, "DiaryReminderWorker");
        thread.setDaemon(true);
        return thread;
    });
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void schedule(PluginCall call) {
        final Context context = getContext().getApplicationContext();
        final long at = call.getLong("at", 0L);
        final int id = call.getInt("id", 0);
        final String title = call.getString("title", "یادآوری دفترچه روزانه");
        final String body = call.getString("body", "زمان یادآوری این یادداشت رسیده است");
        final String noteId = call.getString("noteId", "");

        if (at <= System.currentTimeMillis() || id <= 0) {
            call.reject("زمان یا شناسه یادآوری معتبر نیست", "INVALID_REMINDER");
            return;
        }

        WORKER.execute(() -> {
            try {
                if (Build.VERSION.SDK_INT >= 33 &&
                    context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    rejectOnMain(call, "مجوز نمایش اعلان فعال نیست", "NOTIFICATION_PERMISSION", null);
                    return;
                }
                AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
                if (Build.VERSION.SDK_INT >= 31 && !manager.canScheduleExactAlarms()) {
                    rejectOnMain(call, "دسترسی آلارم دقیق فعال نیست", "EXACT_ALARM_PERMISSION", null);
                    return;
                }
                JSONObject item = new JSONObject();
                item.put("id", id);
                item.put("at", at);
                item.put("title", title);
                item.put("body", body);
                item.put("noteId", noteId);
                NativeReminderAlarms.saveAndArm(context, item);

                JSObject result = new JSObject();
                result.put("id", id);
                result.put("scheduledAt", at);
                result.put("scheduled", true);
                mainHandler.post(() -> call.resolve(result));
            } catch (Exception error) {
                rejectOnMain(call, "ثبت یادآوری در اندروید ناموفق بود: " + error.getMessage(), "SCHEDULE_FAILED", error);
            }
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        final int id = call.getInt("id", 0);
        if (id <= 0) {
            call.reject("شناسه یادآوری معتبر نیست");
            return;
        }
        final Context context = getContext().getApplicationContext();
        WORKER.execute(() -> {
            try {
                NativeReminderAlarms.cancel(context, id);
                JSObject result = new JSObject();
                result.put("id", id);
                result.put("cancelled", true);
                mainHandler.post(() -> call.resolve(result));
            } catch (Exception error) {
                rejectOnMain(call, "لغو یادآوری ناموفق بود: " + error.getMessage(), "CANCEL_FAILED", error);
            }
        });
    }

    private void rejectOnMain(PluginCall call, String message, String code, Exception error) {
        mainHandler.post(() -> {
            if (error == null) call.reject(message, code);
            else call.reject(message, code, error);
        });
    }
}
