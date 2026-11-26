import { registerPlugin } from "@capacitor/core";

// Native Android AlarmManager bridge. Scheduling and cancellation complete
// inside the Android process; no LocalNotifications JS promise chain is used.
const NativeReminder = registerPlugin("NativeReminder");
window.NativeReminder = NativeReminder;
