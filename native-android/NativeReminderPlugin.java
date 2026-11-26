package com.mamaddeveloper26.daftarroozane;

import android.Manifest;
import android.app.AlarmManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "NativeReminder")
public class NativeReminderPlugin extends Plugin {
    @PluginMethod
    public void schedule(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 33 &&
                getContext().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                call.reject("مجوز نمایش اعلان فعال نیست", "NOTIFICATION_PERMISSION");
                return;
            }
            long at = call.getLong("at", 0L);
            int id = call.getInt("id", 0);
            String title = call.getString("title", "یادآوری دفترچه روزانه");
            String body = call.getString("body", "زمان یادآوری این یادداشت رسیده است");
            String noteId = call.getString("noteId", "");
            if (at <= System.currentTimeMillis() || id <= 0) {
                call.reject("زمان یا شناسه یادآوری معتبر نیست", "INVALID_REMINDER");
                return;
            }
            AlarmManager manager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            if (Build.VERSION.SDK_INT >= 31 && !manager.canScheduleExactAlarms()) {
                call.reject("دسترسی آلارم دقیق فعال نیست", "EXACT_ALARM_PERMISSION");
                return;
            }
            JSONObject item = new JSONObject();
            item.put("id", id);
            item.put("at", at);
            item.put("title", title);
            item.put("body", body);
            item.put("noteId", noteId);
            NativeReminderAlarms.saveAndArm(getContext(), item);
            JSObject result = new JSObject();
            result.put("id", id);
            result.put("scheduledAt", at);
            result.put("scheduled", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("ثبت یادآوری در اندروید ناموفق بود: " + error.getMessage(), "SCHEDULE_FAILED", error);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        try {
            int id = call.getInt("id", 0);
            if (id <= 0) { call.reject("شناسه یادآوری معتبر نیست"); return; }
            NativeReminderAlarms.cancel(getContext(), id);
            JSObject result = new JSObject();
            result.put("id", id);
            result.put("cancelled", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("لغو یادآوری ناموفق بود: " + error.getMessage(), "CANCEL_FAILED", error);
        }
    }
}
