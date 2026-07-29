import { Platform } from "react-native";

/**
 * Plays a clean chime/pop sound whenever a new order or notification arrives.
 */
export async function playNotificationSound() {
  try {
    if (Platform.OS === "web") {
      // 🎹 Web: Use Web Audio API synthesis for zero latency and zero download dependencies
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();

      const playNote = (time: number, freq: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, time);

        // Quick attack and quick decay
        gain.gain.setValueAtTime(0.08, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.start(time);
        osc.stop(time + duration);
      };

      const now = ctx.currentTime;
      // High double chime pop
      playNote(now, 587.33, 0.12); // D5
      playNote(now + 0.06, 880, 0.22); // A5
    } else {
      // 📱 Native Android/iOS: Use expo-av with a small pre-fetched audio sound
      const { Audio } = require("expo-av");
      const { sound } = await Audio.Sound.createAsync(
        { uri: "https://www.soundjay.com/buttons/sounds/button-3.mp3" },
        { shouldPlay: true, volume: 0.8 }
      );

      // Auto unload from memory to prevent leaks
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    }
  } catch (err) {
    console.warn("[SoundHelper] Failed to play sound:", err);
  }
}
