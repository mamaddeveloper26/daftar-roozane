package com.mamaddeveloper26.daftarroozane;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONObject;
import java.util.Map;

public final class NativeReminderAlarms {
    private static final String PREFS = "diary_native_reminders_v1";
    private NativeReminderAlarms() {}

    static void saveAndArm(Context context, JSONObject item) throws Exception {
        int id = item.getInt("id");
        long at = item.getLong("at");
        if (at <= System.currentTimeMillis()) throw new IllegalArgumentException("زمان یادآوری گذشته است");
        boolean saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString("alarm_" + id, item.toString()).commit();
        if (!saved) throw new IllegalStateException("ذخیره داخلی یادآوری انجام نشد");
        try {
            arm(context, item);
        } catch (Exception error) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("alarm_" + id).commit();
            throw error;
        }
    }

    static void arm(Context context, JSONObject item) throws Exception {
        int id = item.getInt("id");
        long at = item.getLong("at");
        if (at <= System.currentTimeMillis()) return;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (Build.VERSION.SDK_INT >= 31 && !manager.canScheduleExactAlarms())
            throw new SecurityException("اجازه آلارم دقیق صادر نشده است");
        Intent intent = new Intent(context, NativeReminderReceiver.class);
        intent.setAction(context.getPackageName() + ".DIARY_REMINDER");
        intent.putExtra("id", id);
        intent.putExtra("title", item.optString("title", "یادآوری دفترچه روزانه"));
        intent.putExtra("body", item.optString("body", "زمان یادآوری این یادداشت رسیده است"));
        intent.putExtra("noteId", item.optString("noteId", ""));
        PendingIntent pending = PendingIntent.getBroadcast(context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
    }

    static void cancel(Context context, int id) {
        Intent intent = new Intent(context, NativeReminderReceiver.class);
        intent.setAction(context.getPackageName() + ".DIARY_REMINDER");
        PendingIntent pending = PendingIntent.getBroadcast(context, id, intent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pending != null) {
            AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            manager.cancel(pending);
            pending.cancel();
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("alarm_" + id).commit();
    }

    static void restoreAll(Context context) {
        Map<String, ?> values = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getAll();
        for (Map.Entry<String, ?> entry : values.entrySet()) {
            if (!entry.getKey().startsWith("alarm_") || !(entry.getValue() instanceof String)) continue;
            try {
                JSONObject item = new JSONObject((String) entry.getValue());
                if (item.optLong("at", 0L) <= System.currentTimeMillis()) {
                    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(entry.getKey()).apply();
                } else {
                    arm(context, item);
                }
            } catch (Exception ignored) { }
        }
    }

    static void markDelivered(Context context, int id) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("alarm_" + id).apply();
    }
}
