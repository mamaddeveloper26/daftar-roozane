package com.mamaddeveloper26.daftarroozane;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;

public class NativeReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL = "diary-reminders-native-v1";

    @Override public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra("id", 0);
        if (id <= 0) return;
        NativeReminderAlarms.markDelivered(context, id);
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "یادآوری‌های دفترچه", NotificationManager.IMPORTANCE_HIGH);
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent content = launch == null ? null : PendingIntent.getActivity(context, id, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(intent.getStringExtra("title"))
            .setContentText(intent.getStringExtra("body"))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(intent.getStringExtra("body")))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER);
        if (content != null) builder.setContentIntent(content);
        manager.notify(id, builder.build());
    }
}
